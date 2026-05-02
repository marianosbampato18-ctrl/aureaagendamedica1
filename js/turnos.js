// ═══════════════════════════════════════════
// TURNOS — CRUD y render de turnos
// ═══════════════════════════════════════════
function guardarTurno() {
  // Tratamiento: viene del select o del input libre
  var tratSelKey = document.getElementById('t-trat-sel').value;
  var trat = '';
  var precio = 0;
  if (tratSelKey === '__libre__') {
    trat = document.getElementById('t-trat').value.trim();
    precio = precioActualTurno || 0;
  } else if (tratSelKey) {
    var tr = tratamientosData[tratSelKey];
    if (tr) { trat = tr.nombre; precio = parseFloat(tr.precio)||0; }
  }
  var fecha = document.getElementById('t-fecha').value;
  var hh    = document.getElementById('t-hh').value;
  var mm    = document.getElementById('t-mm').value;
  var hora  = (hh && mm) ? hh+':'+mm : '';
  var err   = document.getElementById('t-err');
  limpiarError(err);

  // Validaciones mejoradas
  var errFecha = validarFecha(fecha);
  if (errFecha) { mostrarErrorValidacion(err, errFecha); return; }
  var errHora = validarHora(hh, mm);
  if (errHora)  { mostrarErrorValidacion(err, errHora);  return; }

  if (pvSeleccion === null) { mostrarErrorValidacion(err, 'Indicá si es primera vez o ya fue antes.'); return; }
  if (!trat)  { mostrarErrorValidacion(err, 'Seleccioná un tratamiento.'); return; }
  if (!fecha) { mostrarErrorValidacion(err, 'La fecha es obligatoria.'); return; }
  if (!hora)  { mostrarErrorValidacion(err, 'La hora es obligatoria.'); return; }

  var nomPac='', telPac='', dniPac='', mailPac='';

  if (pvSeleccion === true) {
    nomPac  = document.getElementById('t-pac-nuevo').value.trim();
    telPac  = document.getElementById('t-tel').value.trim();
    dniPac  = document.getElementById('t-dni').value.trim();
    mailPac = (document.getElementById('t-mail').value || '').trim().toLowerCase();
    if (!nomPac) { err.textContent='Ingresá el nombre del paciente.'; err.className='err visible'; return; }
  } else {
    if (!pacienteSeleccionadoKey) { err.textContent='Seleccioná un paciente de la lista.'; err.className='err visible'; return; }
    var pExist = pacientesData[pacienteSeleccionadoKey];
    nomPac = pExist.nombre; telPac = pExist.telefono||''; dniPac = pExist.dni||'';
  }

  // Validación pago anticipado
  var paMontoStr = document.getElementById('pa-monto').value;
  var paMonto = parseFloat(paMontoStr) || 0;
  if (pagoAntTipo === 'parcial' && paMonto <= 0) {
    err.textContent = 'Ingresá el monto de la seña parcial.'; err.className='err visible'; return;
  }
  if (pagoAntTipo === 'parcial' && paMonto >= precio && precio > 0) {
    err.textContent = 'El monto parcial no puede ser igual o mayor al total. Usá "Pago total".';
    err.className='err visible'; return;
  }
  if (pagoAntTipo === 'total' && precio <= 0) {
    err.textContent = 'No hay precio cargado para registrar pago total.'; err.className='err visible'; return;
  }

  // Verificar solapamiento
  var turnoExistente = Object.keys(turnosData).find(function(k) {
    var t = turnosData[k];
    return t.fecha === fecha && t.hora === hora && t.estado === 'proximo';
  });
  if (turnoExistente) {
    err.textContent = 'Ya hay un turno agendado el ' + fecha.split('-').reverse().join('/') + ' a las ' + hora + ' hs. Elegí otra hora.';
    err.className = 'err visible';
    return;
  }

  err.className = 'err';
  var btn = document.getElementById('btn-save-turno');
  btn.disabled=true; btn.textContent='Guardando…';

  var notas = document.getElementById('t-notas').value.trim();

  // Si es primera vez → crear ficha automática con ID único
  var promesaFicha = Promise.resolve(pacienteSeleccionadoKey);
  if (pvSeleccion === true) {
    promesaFicha = db.ref('contadores/ultimoPacienteId').transaction(function(actual) {
      return (actual || 0) + 1;
    }).then(function(result) {
      return db.ref('pacientes').push({
        pacienteId: result.snapshot.val(),
        nombre: nomPac, telefono: telPac, dni: dniPac, email: mailPac, notas: ''
      });
    }).then(function(ref){ return ref.key; });
  }

  promesaFicha.then(function(pacKey) {
    return db.ref('turnos').push({
      paciente: nomPac, pacienteKey: pacKey,
      tratamiento: trat, tratamientoKey: (tratSelKey && tratSelKey!=='__libre__') ? tratSelKey : '',
      precio: precio,
      telefono: telPac, dni: dniPac,
      primeraVez: pvSeleccion, fecha: fecha, hora: hora,
      notas: notas, estado: 'proximo'
    }).then(function(turnoRef){ return { turnoKey: turnoRef.key, pacKey: pacKey }; });
  }).then(function(refs) {
    // Pago anticipado: crear venta + pago
    if (pagoAntTipo === 'no') return refs;
    var hoy = new Date().toISOString().split('T')[0];
    var monto = pagoAntTipo === 'total' ? precio : paMonto;
    return db.ref('ventas').push({
      pacienteId: refs.pacKey || '', turnoId: refs.turnoKey,
      descripcion: trat, montoTotal: precio,
      estado: pagoAntTipo === 'total' ? 'pagada' : 'pendiente',
      fecha: hoy
    }).then(function(ventaRef){
      return db.ref('pagos').push({
        ventaId: ventaRef.key, turnoId: refs.turnoKey, pacienteId: refs.pacKey || '',
        metodo: pagoAntMetodo, monto: monto,
        estado: 'confirmado', fecha: hoy, anticipado: true
      });
    }).then(function(){ return refs; });
  }).then(function() {
    btn.disabled=false; btn.textContent='Guardar turno';
    toggleFormTurno();
  }).catch(function(e) {
    btn.disabled=false; btn.textContent='Guardar turno';
    err.textContent='Error al guardar: '+(e&&e.message||'')+'. Verificá internet.'; err.className='err visible';
  });
}

// ── ESTADO TURNO ──
function cambiarEstado(key, estado) {
  var t = turnosData[key];
  db.ref('turnos/'+key).update({ estado: estado });
  // Si se marca como Realizado → agregar al historial automáticamente
  if (estado === 'completado' && t && t.pacienteKey) {
    db.ref('pacientes/'+t.pacienteKey+'/historial').push({
      fecha: t.fecha,
      tratamiento: t.tratamiento,
      productos: '',
      notas: t.notas || '',
      auto: true
    });
  }
}

function eliminarTurno(key) {
  if (!requiereAdmin()) return;
  var t = turnosData[key];
  var detalle = t ? (t.paciente||'Turno') + ' · ' + (t.fecha||'') + ' ' + (t.hora||'') : 'Turno';
  if (!confirmarAccionCritica('turno', detalle)) return;
  softDelete(db.ref('turnos/'+key), 'Eliminado por usuario')
    .catch(function(e){ manejarErrorFirebase(e, 'Eliminar turno'); });
}

// ── RENDER TURNOS ──
function parseFecha(f) { if(!f||typeof f!=='string') return {y:0,m:0,d:0}; var p=f.split('-'); return {y:+p[0],m:+p[1]-1,d:+p[2]}; }

function cardTurnoHTML(key, t) {
  var p = parseFecha(t.fecha);
  var badgeCls = t.estado==='proximo'?'badge badge-proximo':t.estado==='completado'?'badge badge-completado':'badge badge-cancelado';
  var badgeTxt = t.estado==='proximo'?'Próximo':t.estado==='completado'?'Realizado':'Cancelado';

  // Estado de pago
  var precio = parseFloat(t.precio) || 0;
  var v = buscarVentaDeTurno(key);
  if (v && v.venta.montoTotal) precio = parseFloat(v.venta.montoTotal);
  var pagado = totalPagadoTurno(key);
  var resta = Math.max(precio - pagado, 0);
  var pagoBadge = '';
  if (precio > 0) {
    if (pagado === 0)        pagoBadge = '<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;background:#FDF0EE;color:#A03020;border:1px solid #F0C0B8;text-transform:uppercase">Sin pagar</span>';
    else if (pagado >= precio) pagoBadge = '<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;background:#EAF3E6;color:#3D6B10;border:1px solid #C8E0B0;text-transform:uppercase">Pagado</span>';
    else                       pagoBadge = '<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;background:#FFF8E6;color:#9A7020;border:1px solid #E8C96A;text-transform:uppercase">Seña $'+pagado.toLocaleString('es-AR')+'</span>';
  }

  var acc = '';
  if (t.estado==='proximo') {
    acc += '<button class="act-btn btn-ok" onclick="abrirModalCobro(\''+key+'\')">✓ Realizado</button>';
    acc += '<button class="act-btn btn-cancel" onclick="cambiarEstado(\''+key+'\',\'cancelado\')">Cancelar</button>';
  }
  acc += '<button class="act-btn btn-ficha" onclick="abrirModalEdit(\''+key+'\')">✏ Editar</button>';
  if (t.estado==='completado' && resta > 0) {
    acc += '<button class="act-btn btn-ok" onclick="abrirModalCobro(\''+key+'\')">💰 Cobrar saldo</button>';
  }
  if (t.pacienteKey) acc += '<button class="act-btn btn-ficha" title="Ver historia clínica" onclick="abrirFichaKey(\''+t.pacienteKey+'\')">Ver H.C.</button>';
  acc += '<button class="act-btn btn-del" onclick="eliminarTurno(\''+key+'\')">Eliminar</button>';

  var lineaPrecio = '';
  if (precio > 0) {
    lineaPrecio = '<div class="card-meta" style="margin-top:3px">💎 $'+precio.toLocaleString('es-AR')+(resta>0&&pagado>0?' · adeuda $'+resta.toLocaleString('es-AR'):'')+'</div>';
  }

  return '<div class="card '+t.estado+'">' +
    '<div class="date-block"><div class="date-day">'+p.d+'</div><div class="date-mon">'+MESES[p.m]+'</div></div>' +
    '<div class="card-body"><div class="card-top"><div>' +
      (t.paciente?'<div class="pac-nombre">'+sanitize(t.paciente)+'</div>':'') +
      '<div class="trat-nombre">'+sanitize(t.tratamiento)+pagoBadge+'</div>' +
    '</div><span class="'+badgeCls+'">'+badgeTxt+'</span></div>' +
    '<div class="card-meta">◷ '+t.hora+' hs'+(t.telefono?'  ·  📞 '+sanitize(t.telefono):'')+'</div>' +
    (t.dni?'<div class="card-meta" style="margin-top:3px">🪪 DNI '+t.dni+'</div>':'') +
    lineaPrecio +
    (t.primeraVez===true?'<div style="display:inline-block;margin-top:6px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#FFF8E6;color:#9A7020;border:1px solid #E8C96A;text-transform:uppercase">✦ Primera vez</div>':'') +
    (t.notas?'<div class="card-notas">'+sanitize(t.notas)+'</div>':'') +
    '<div class="card-actions">'+acc+'</div></div></div>';
}

function renderTurnos() {
  var proximos=[],completados=[],cancelados=[];
  Object.keys(turnosData).forEach(function(key){
    var t=Object.assign({},turnosData[key],{_key:key});
    if(t.eliminado) return; // soft delete — ocultar de la UI
    if(t.estado==='proximo') proximos.push(t);
    else if(t.estado==='completado') completados.push(t);
    else cancelados.push(t);
  });
  // Ordenar por fecha + hora (fecha primero, si igual fecha comparar hora)
  function sortPorFechaHora(a, b) {
    var fa = (a.fecha||'') + ' ' + (a.hora||'');
    var fb = (b.fecha||'') + ' ' + (b.hora||'');
    return fa.localeCompare(fb);
  }
  proximos.sort(sortPorFechaHora);
  completados.sort(sortPorFechaHora);
  cancelados.sort(sortPorFechaHora);
  document.getElementById('m-total').textContent=proximos.length+completados.length+cancelados.length;
  document.getElementById('m-prox').textContent=proximos.length;
  var html='<div class="section-label">Próximos turnos</div>';
  html+=proximos.length?proximos.map(function(t){return cardTurnoHTML(t._key,t);}).join(''):'<div class="empty"><div class="empty-icon">✦</div>No hay turnos próximos</div>';
  if(completados.length){html+='<div class="section-label" style="margin-top:20px">Realizados</div>';html+=completados.map(function(t){return cardTurnoHTML(t._key,t);}).join('');}
  if(cancelados.length){html+='<div class="section-label" style="margin-top:20px">Cancelados</div>';html+=cancelados.map(function(t){return cardTurnoHTML(t._key,t);}).join('');}
  document.getElementById('lista-turnos').innerHTML=html;
}

// ── FICHAS ──