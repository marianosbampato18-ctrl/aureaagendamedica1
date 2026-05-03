// ═══════════════════════════════════════════
// TURNOS — CRUD y render de turnos
//
// FASE 3 — Estados del turno (backward compat):
//   proximo    → turno agendado, sin iniciar
//   in_progress → en atención ahora mismo  [NUEVO]
//   completado  → atención finalizada y cobrada (o sin cobro)
//   cancelado   → cancelado
//
// Los turnos viejos con solo 'proximo'/'completado'/'cancelado'
// siguen funcionando sin ningún cambio.
// ═══════════════════════════════════════════

// ── Múltiples tratamientos (formulario nuevo turno) ──────────────
function agregarTratamientoForm() {
  var err = document.getElementById('t-err');
  var tratSelKey = document.getElementById('t-trat-sel').value;
  var nombre = '', precio = 0, key = '';
  if (tratSelKey === '__libre__') {
    nombre = (document.getElementById('t-trat').value || '').trim();
    precio = precioActualTurno || 0;
    key = '__libre__';
    if (!nombre) { mostrarErrorValidacion(err, 'Ingresá el nombre del tratamiento libre.'); return; }
  } else if (tratSelKey && tratamientosData[tratSelKey]) {
    var tr = tratamientosData[tratSelKey];
    nombre = tr.nombre; precio = parseFloat(tr.precio) || 0; key = tratSelKey;
  } else {
    mostrarErrorValidacion(err, 'Seleccioná un tratamiento del listado antes de agregar.'); return;
  }
  limpiarError(err);
  listaTratamientosForm.push({ nombre: nombre, precio: precio, key: key });
  document.getElementById('t-trat-sel').value = '';
  document.getElementById('t-trat-libre-wrap').style.display = 'none';
  document.getElementById('t-precio-auto').className = 'precio-auto';
  precioActualTurno = 0;
  renderListaTratsForm();
}

function eliminarTratForm(idx) {
  listaTratamientosForm.splice(idx, 1);
  renderListaTratsForm();
}

function renderListaTratsForm() {
  var lista = document.getElementById('lista-trats-form');
  var totalEl = document.getElementById('t-total-display');
  if (!lista) return;
  if (!listaTratamientosForm.length) {
    lista.innerHTML = '';
    if (totalEl) totalEl.style.display = 'none';
    precioActualTurno = 0;
    return;
  }
  var total = listaTratamientosForm.reduce(function(s, t) { return s + t.precio; }, 0);
  lista.innerHTML = listaTratamientosForm.map(function(t, i) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--ivory);border:1px solid var(--border);border-radius:10px;margin-bottom:6px">' +
      '<div><div style="font-size:14px;font-weight:600;color:var(--brown)">' + sanitize(t.nombre) + '</div>' +
      (t.precio > 0 ? '<div style="font-size:12px;color:var(--gold-dark)">$' + t.precio.toLocaleString('es-AR') + '</div>' : '') + '</div>' +
      '<button type="button" onclick="eliminarTratForm(' + i + ')" style="background:none;border:none;font-size:16px;color:var(--brown-soft);cursor:pointer;padding:4px 8px">✕</button>' +
    '</div>';
  }).join('');
  if (totalEl) {
    totalEl.textContent = listaTratamientosForm.length > 1 ? 'Total: $' + total.toLocaleString('es-AR') : '';
    totalEl.style.display = listaTratamientosForm.length > 1 ? 'block' : 'none';
  }
  precioActualTurno = total;
  if (pagoAntTipo === 'total' && document.getElementById('pa-monto')) {
    document.getElementById('pa-monto').value = total;
  }
}

// ── GUARDAR TURNO ─────────────────────────────────────────────────
function guardarTurno() {
  var fecha = document.getElementById('t-fecha').value;
  var hh    = document.getElementById('t-hh').value;
  var mm    = document.getElementById('t-mm').value;
  var hora  = (hh && mm) ? hh+':'+mm : '';
  var err   = document.getElementById('t-err');
  limpiarError(err);

  if (!listaTratamientosForm.length) { mostrarErrorValidacion(err, 'Agregá al menos un tratamiento.'); return; }
  var trat   = listaTratamientosForm.map(function(t){ return t.nombre; }).join(' + ');
  var precio = listaTratamientosForm.reduce(function(s, t){ return s + t.precio; }, 0);

  var errFecha = validarFecha(fecha);
  if (errFecha) { mostrarErrorValidacion(err, errFecha); return; }
  var errHora = validarHora(hh, mm);
  if (errHora)  { mostrarErrorValidacion(err, errHora);  return; }

  if (pvSeleccion === null) { mostrarErrorValidacion(err, 'Indicá si es primera vez o ya fue antes.'); return; }
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

  // Verificar solapamiento — incluye turnos 'proximo' e 'in_progress'
  var turnoExistente = Object.keys(turnosData).find(function(k) {
    var t = turnosData[k];
    return t.fecha === fecha && t.hora === hora &&
      (t.estado === 'proximo' || t.estado === 'in_progress') && !t.eliminado;
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

  var promesaFicha = Promise.resolve(pacienteSeleccionadoKey);
  if (pvSeleccion === true) {
    promesaFicha = db.ref('pacientes').push({
      pacienteId: siguienteIdPaciente(),
      nombre: nomPac, telefono: telPac, dni: dniPac, email: mailPac, notas: ''
    }).then(function(ref){ return ref.key; });
  }

  promesaFicha.then(function(pacKey) {
    return db.ref('turnos').push({
      paciente:     nomPac,
      pacienteKey:  pacKey,
      tratamiento:  trat,
      tratamientos: listaTratamientosForm.slice(),
      precio:       precio,
      telefono:     telPac,
      dni:          dniPac,
      primeraVez:   pvSeleccion,
      fecha:        fecha,
      hora:         hora,
      notas:        notas,
      estado:       'proximo'   // estado inicial siempre 'proximo'
    }).then(function(turnoRef){ return { turnoKey: turnoRef.key, pacKey: pacKey }; });
  }).then(function(refs) {
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
  }).then(function(refs) {
    btn.disabled=false; btn.textContent='Guardar turno';
    toggleFormTurno();
    // Sincronizar con Google Calendar
    if (refs && refs.turnoKey) {
      try { gcalCrearEvento(refs.turnoKey, {
        paciente: nomPac, tratamiento: trat, telefono: telPac,
        dni: dniPac, fecha: fecha, hora: hora, notas: notas
      }); } catch(e) {}
    }
  }).catch(function(e) {
    btn.disabled=false; btn.textContent='Guardar turno';
    err.textContent='Error al guardar: '+(e&&e.message||'')+'. Verificá internet.'; err.className='err visible';
  });
}

// ── ESTADO TURNO ──────────────────────────────────────────────────

// Helper: verifica si el historial del paciente ya tiene una entrada
// para este turno (evita duplicados si se llama varias veces).
// Usa el campo turnoId que se agrega a partir de esta versión.
function _historialYaRegistrado(pacKey, turnoKey) {
  var historial = pacientesData[pacKey] && pacientesData[pacKey].historial || {};
  return Object.keys(historial).some(function(hk) {
    return historial[hk].turnoId === turnoKey;
  });
}

// Cambia el estado de un turno.
// Para pasar a 'completado' desde la UI se usa SIEMPRE abrirModalCobro()
// (que llama a confirmarCobro / cerrarModalCobro).
// cambiarEstado() se usa para: proximo→in_progress, cualquier→cancelado.
function cambiarEstado(key, estado) {
  var t = turnosData[key];
  if (!t) return;
  db.ref('turnos/'+key).update({ estado: estado });
  // Eliminar de Google Calendar si se cancela
  if (estado === 'cancelado') {
    try { gcalEliminarEvento(key, t); } catch(e) {}
  }

  // Historial solo al completar, con guard anti-duplicado
  if (estado === 'completado' && t.pacienteKey) {
    if (!_historialYaRegistrado(t.pacienteKey, key)) {
      db.ref('pacientes/'+t.pacienteKey+'/historial').push({
        fecha:        t.fecha,
        tratamiento:  t.tratamiento,
        productos:    '',
        notas:        t.notas || '',
        auto:         true,
        turnoId:      key    // campo nuevo: permite detectar duplicados
      });
    }
  }
}

// FASE 3: Iniciar atención — cambia el estado a 'in_progress'
// Aparece como botón "▶ Iniciar atención" en turnos con estado 'proximo'.
function iniciarAtencion(key) {
  var t = turnosData[key];
  if (!t) return;
  if (t.estado !== 'proximo') return; // guard defensivo
  db.ref('turnos/'+key).update({
    estado:      'in_progress',
    iniciadoEn:  new Date().toISOString()  // timestamp de inicio de atención
  });
}

function eliminarTurno(key) {
  if (!requiereAdmin()) return;
  var t = turnosData[key];
  var detalle = t ? (t.paciente||'Turno') + ' · ' + (t.fecha||'') + ' ' + (t.hora||'') : 'Turno';
  if (!confirmarAccionCritica('turno', detalle)) return;
  softDelete(db.ref('turnos/'+key), 'Eliminado por usuario')
    .catch(function(e){ manejarErrorFirebase(e, 'Eliminar turno'); });
}

// ── RENDER TURNOS ─────────────────────────────────────────────────
function parseFecha(f) {
  if(!f||typeof f!=='string') return {y:0,m:0,d:0};
  var p=f.split('-'); return {y:+p[0],m:+p[1]-1,d:+p[2]};
}

function cardTurnoHTML(key, t) {
  var p = parseFecha(t.fecha);

  // ── Badge de estado (Fase 3: agrega in_progress) ──────────────
  var badgeCls, badgeTxt;
  if (t.estado === 'in_progress') {
    badgeCls = 'badge badge-in_progress';
    badgeTxt = '▶ En atención';
  } else if (t.estado === 'completado') {
    badgeCls = 'badge badge-completado';
    badgeTxt = 'Realizado';
  } else if (t.estado === 'cancelado') {
    badgeCls = 'badge badge-cancelado';
    badgeTxt = 'Cancelado';
  } else {
    // 'proximo' y cualquier valor legacy
    badgeCls = 'badge badge-proximo';
    badgeTxt = 'Próximo';
  }

  // ── Estado de pago ─────────────────────────────────────────────
  var precio = parseFloat(t.precio) || 0;
  var v = buscarVentaDeTurno(key);
  if (v && v.venta.montoTotal) precio = parseFloat(v.venta.montoTotal);
  var pagado = totalPagadoTurno(key);
  var resta  = Math.max(precio - pagado, 0);
  var pagoBadge = '';
  if (precio > 0) {
    if (pagado === 0)
      pagoBadge = '<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;background:#FDF0EE;color:#A03020;border:1px solid #F0C0B8;text-transform:uppercase">Sin pagar</span>';
    else if (pagado >= precio)
      pagoBadge = '<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;background:#EAF3E6;color:#3D6B10;border:1px solid #C8E0B0;text-transform:uppercase">Pagado</span>';
    else
      pagoBadge = '<span style="display:inline-block;margin-left:6px;font-size:9px;font-weight:700;padding:3px 8px;border-radius:20px;background:#FFF8E6;color:#9A7020;border:1px solid #E8C96A;text-transform:uppercase">Seña $'+pagado.toLocaleString('es-AR')+'</span>';
  }

  // ── Botones de acción según estado (Fase 4: UX contextual) ─────
  var acc = '';

  if (t.estado === 'proximo') {
    // Turno próximo: puede iniciarse o cancelarse
    acc += '<button class="act-btn btn-iniciar" onclick="iniciarAtencion(\''+key+'\')" title="Marcar que el paciente ya está siendo atendido">▶ Iniciar atención</button>';
    acc += '<button class="act-btn btn-ok" onclick="abrirModalCobro(\''+key+'\')" title="Finalizar sin pasar por in_progress">✓ Finalizar y cobrar</button>';
    acc += '<button class="act-btn btn-cancel" onclick="cambiarEstado(\''+key+'\',\'cancelado\')">Cancelar</button>';
  } else if (t.estado === 'in_progress') {
    // En atención: solo puede finalizarse o cancelarse — no iniciar de nuevo
    acc += '<button class="act-btn btn-ok" onclick="abrirModalCobro(\''+key+'\')" style="background:#2855B0;border-color:#2855B0;color:#fff" title="Registrar cobro y cerrar este turno">✓ Finalizar y cobrar</button>';
    acc += '<button class="act-btn btn-cancel" onclick="cambiarEstado(\''+key+'\',\'cancelado\')">Cancelar</button>';
  }

  // Editar siempre disponible
  acc += '<button class="act-btn btn-ficha" onclick="abrirModalEdit(\''+key+'\')">✏ Editar</button>';

  // Cobrar saldo pendiente en turnos ya completados
  if (t.estado === 'completado' && resta > 0) {
    acc += '<button class="act-btn btn-ok" onclick="abrirModalCobro(\''+key+'\')">💰 Cobrar saldo</button>';
  }

  // Historia clínica siempre disponible si hay paciente
  if (t.pacienteKey) {
    acc += '<button class="act-btn btn-ficha" title="Ver historia clínica" onclick="abrirFichaKey(\''+t.pacienteKey+'\')">Ver H.C.</button>';
  }

  // Eliminar (solo admins — validado dentro de la función)
  acc += '<button class="act-btn btn-del" onclick="eliminarTurno(\''+key+'\')">Eliminar</button>';

  // ── Precio + deuda ─────────────────────────────────────────────
  var lineaPrecio = '';
  if (precio > 0) {
    lineaPrecio = '<div class="card-meta" style="margin-top:3px">💎 $'+precio.toLocaleString('es-AR')+(resta>0&&pagado>0?' · adeuda $'+resta.toLocaleString('es-AR'):'')+'</div>';
  }

  // ── ID del paciente ────────────────────────────────────────────
  var pac = t.pacienteKey && pacientesData[t.pacienteKey];
  var idBadge = (pac && pac.pacienteId)
    ? '<span style="font-size:9px;font-weight:700;color:var(--gold-dark);background:#FDF8EE;border:1px solid var(--gold);border-radius:20px;padding:2px 7px;margin-left:6px;vertical-align:middle">#'+pac.pacienteId+'</span>'
    : '';

  // ── Tratamientos: lista o texto simple (backward compat) ───────
  var tratsHtml = '';
  if (t.tratamientos && t.tratamientos.length) {
    tratsHtml = t.tratamientos.map(function(tr){ return '<div class="trat-nombre" style="margin-top:2px">'+sanitize(tr.nombre)+'</div>'; }).join('');
    tratsHtml = tratsHtml.replace('</div>', pagoBadge + '</div>');
  } else {
    tratsHtml = '<div class="trat-nombre">'+sanitize(t.tratamiento)+pagoBadge+'</div>';
  }

  // ── Indicador "En atención ahora" ─────────────────────────────
  var enAtencionBanner = '';
  if (t.estado === 'in_progress') {
    enAtencionBanner = '<div style="display:inline-flex;align-items:center;gap:5px;margin-top:6px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#E8F0FB;color:#2855B0;border:1px solid #9BB5E8;text-transform:uppercase">● En atención ahora</div>';
  }

  return '<div class="card '+t.estado+'">' +
    '<div class="date-block"><div class="date-day">'+p.d+'</div><div class="date-mon">'+MESES[p.m]+'</div></div>' +
    '<div class="card-body"><div class="card-top"><div>' +
      (t.paciente?'<div class="pac-nombre">'+sanitize(t.paciente)+idBadge+'</div>':'') +
      tratsHtml +
    '</div><span class="'+badgeCls+'">'+badgeTxt+'</span></div>' +
    '<div class="card-meta">◷ '+t.hora+' hs'+(t.telefono?'  ·  📞 '+sanitize(t.telefono):'')+'</div>' +
    (t.dni?'<div class="card-meta" style="margin-top:3px">🪪 DNI '+t.dni+'</div>':'') +
    lineaPrecio +
    enAtencionBanner +
    (t.primeraVez===true?'<div style="display:inline-block;margin-top:6px;font-size:10px;font-weight:700;padding:3px 10px;border-radius:20px;background:#FFF8E6;color:#9A7020;border:1px solid #E8C96A;text-transform:uppercase">✦ Primera vez</div>':'') +
    (t.notas?'<div class="card-notas">'+sanitize(t.notas)+'</div>':'') +
    '<div class="card-actions">'+acc+'</div></div></div>';
}

function renderTurnos() {
  var enAtencion = [], proximos = [], completados = [], cancelados = [];

  Object.keys(turnosData).forEach(function(key){
    var t = Object.assign({}, turnosData[key], { _key: key });
    if (t.eliminado) return;
    if      (t.estado === 'in_progress') enAtencion.push(t);
    else if (t.estado === 'proximo')     proximos.push(t);
    else if (t.estado === 'completado')  completados.push(t);
    else                                 cancelados.push(t);
  });

  function sortPorFechaHora(a, b) {
    return ((a.fecha||'')+' '+(a.hora||'')).localeCompare((b.fecha||'')+' '+(b.hora||''));
  }
  // En atención: más reciente primero (iniciaron antes = más urgente)
  enAtencion.sort(sortPorFechaHora);
  proximos.sort(sortPorFechaHora);
  completados.sort(sortPorFechaHora);
  cancelados.sort(sortPorFechaHora);

  // Contadores (en atención cuenta como "próximo" para el badge del menú)
  document.getElementById('m-total').textContent = enAtencion.length + proximos.length + completados.length + cancelados.length;
  document.getElementById('m-prox').textContent  = enAtencion.length + proximos.length;

  var allProximos = enAtencion.concat(proximos);

  // ── Sección "Próximos / En atención" ──
  var html = '<div class="section-label">Próximos turnos</div>';

  if (enAtencion.length) {
    html += '<div style="font-size:10px;font-weight:700;color:#2855B0;letter-spacing:.08em;text-transform:uppercase;margin:8px 0 6px;padding:0 2px">● En atención ahora</div>';
    html += enAtencion.map(function(t){ return cardTurnoHTML(t._key, t); }).join('');
    if (proximos.length) {
      html += '<div style="font-size:10px;font-weight:700;color:var(--brown-soft);letter-spacing:.08em;text-transform:uppercase;margin:16px 0 6px;padding:0 2px">A continuación</div>';
    }
  }

  if (allProximos.length === 0) {
    html += '<div class="empty"><div class="empty-icon">✦</div>No hay turnos próximos</div>';
  } else if (proximos.length) {
    html += proximos.map(function(t){ return cardTurnoHTML(t._key, t); }).join('');
  }

  if (completados.length) {
    html += '<div class="section-label" style="margin-top:20px">Realizados</div>';
    html += completados.map(function(t){ return cardTurnoHTML(t._key, t); }).join('');
  }
  if (cancelados.length) {
    html += '<div class="section-label" style="margin-top:20px">Cancelados</div>';
    html += cancelados.map(function(t){ return cardTurnoHTML(t._key, t); }).join('');
  }

  document.getElementById('lista-turnos').innerHTML = html;
}

// ── FICHAS ──
// (toggleFormTurno, limpiarFormTurno, setPV, buscarPaciente,
//  seleccionarPaciente definidos en caja.js por razones históricas)
