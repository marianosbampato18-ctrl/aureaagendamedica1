// ═══════════════════════════════════════════
// MODALES — Edición de turno y pagos
// ═══════════════════════════════════════════

var edListaTratamientos = []; // lista temporal de tratamientos en el modal de edición

function abrirModalEdit(turnoKey) {
  turnoEditKey = turnoKey;
  var t = turnosData[turnoKey];
  if (!t) return;
  var pacEdit = t.pacienteKey && pacientesData[t.pacienteKey];
  var idEdit = (pacEdit && pacEdit.pacienteId) ? '  #'+pacEdit.pacienteId : '';
  document.getElementById('edit-pac-sub').textContent = (t.paciente||'') + idEdit + ' · ' + (t.tratamiento||'');

  // Tab paciente
  if (t.pacienteKey && pacientesData[t.pacienteKey]) {
    var p = pacientesData[t.pacienteKey];
    document.getElementById('ed-pac-nombre').value = p.nombre || t.paciente || '';
    document.getElementById('ed-pac-tel').value    = p.telefono || t.telefono || '';
    document.getElementById('ed-pac-dni').value    = p.dni || t.dni || '';
    document.getElementById('ed-pac-mail').value   = p.email || '';
    document.getElementById('ed-pac-notas').value  = p.notas || '';
  } else {
    document.getElementById('ed-pac-nombre').value = t.paciente || '';
    document.getElementById('ed-pac-tel').value    = t.telefono || '';
    document.getElementById('ed-pac-dni').value    = t.dni || '';
    document.getElementById('ed-pac-mail').value   = '';
    document.getElementById('ed-pac-notas').value  = '';
  }
  document.getElementById('ed-pac-err').className = 'err';

  // Tab turno — cargar tratamientos existentes en la lista
  poblarSelectTratamientos();
  document.getElementById('ed-trat-sel').value = '';
  document.getElementById('ed-trat-libre-wrap').style.display = 'none';
  document.getElementById('ed-precio-auto').className = 'precio-auto';

  // Cargar tratamientos previos del turno
  edListaTratamientos = [];
  if (t.tratamientos && Array.isArray(t.tratamientos) && t.tratamientos.length) {
    edListaTratamientos = t.tratamientos.map(function(tr) {
      return { nombre: tr.nombre || '', precio: parseFloat(tr.precio) || 0, key: tr.key || '__libre__' };
    });
  } else if (t.tratamiento) {
    // backward compat: turno viejo con string tratamiento
    edListaTratamientos = [{ nombre: t.tratamiento, precio: parseFloat(t.precio) || 0, key: t.tratamientoKey || '__libre__' }];
  }
  edRenderListaTrats();

  document.getElementById('ed-precio-edit').value = parseFloat(t.precio) || '';
  document.getElementById('ed-fecha').value = t.fecha || '';
  if (t.hora) {
    var partes = t.hora.split(':');
    document.getElementById('ed-hh').value = partes[0] || '';
    document.getElementById('ed-mm').value = partes[1] || '';
  } else {
    document.getElementById('ed-hh').value = '';
    document.getElementById('ed-mm').value = '';
  }
  document.getElementById('ed-notas').value = t.notas || '';
  document.getElementById('ed-turno-err').className = 'err';

  // Tab pagos
  renderEditPagos();

  setEditTab('paciente');
  document.getElementById('modal-edit').className = 'modal-overlay visible';
}

function cerrarModalEdit() {
  document.getElementById('modal-edit').className = 'modal-overlay';
  turnoEditKey = null;
}

function setEditTab(tab) {
  editTabActual = tab;
  ['paciente','turno','pagos'].forEach(function(x){
    document.getElementById('etab-'+x).className = 'edit-tab' + (x===tab?' sel':'');
    document.getElementById('esec-'+x).className = 'edit-section' + (x===tab?' active':'');
  });
  if (tab === 'pagos') renderEditPagos();
}

function onEdTratSelected() {
  var key = document.getElementById('ed-trat-sel').value;
  var libre = document.getElementById('ed-trat-libre-wrap');
  var precioBox = document.getElementById('ed-precio-auto');
  if (key === '__libre__') {
    libre.style.display = 'block';
    precioBox.className = 'precio-auto';
  } else if (key && tratamientosData[key]) {
    libre.style.display = 'none';
    var tr = tratamientosData[key];
    var pr = parseFloat(tr.precio) || 0;
    document.getElementById('ed-precio-valor').textContent = '$' + pr.toLocaleString('es-AR');
    precioBox.className = 'precio-auto visible';
  } else {
    libre.style.display = 'none';
    precioBox.className = 'precio-auto';
  }
}

function edAgregarTratamiento() {
  var err = document.getElementById('ed-turno-err');
  var selKey = document.getElementById('ed-trat-sel').value;
  var nombre = '', precio = 0, key = '';
  if (selKey === '__libre__') {
    nombre = (document.getElementById('ed-trat-libre').value || '').trim();
    if (!nombre) { err.textContent='Ingresá el nombre del tratamiento.'; err.className='err visible'; return; }
    precio = 0;
    key = '__libre__';
  } else if (selKey && tratamientosData[selKey]) {
    var tr = tratamientosData[selKey];
    nombre = tr.nombre; precio = parseFloat(tr.precio) || 0; key = selKey;
  } else {
    err.textContent='Seleccioná un tratamiento antes de agregar.'; err.className='err visible'; return;
  }
  err.className = 'err';
  edListaTratamientos.push({ nombre: nombre, precio: precio, key: key });
  document.getElementById('ed-trat-sel').value = '';
  document.getElementById('ed-trat-libre-wrap').style.display = 'none';
  document.getElementById('ed-precio-auto').className = 'precio-auto';
  edRenderListaTrats();
}

function edEliminarTratamiento(idx) {
  edListaTratamientos.splice(idx, 1);
  edRenderListaTrats();
}

function edRenderListaTrats() {
  var lista = document.getElementById('ed-lista-trats');
  var totalEl = document.getElementById('ed-total-display');
  if (!lista) return;
  if (!edListaTratamientos.length) {
    lista.innerHTML = '';
    if (totalEl) totalEl.style.display = 'none';
    return;
  }
  var total = edListaTratamientos.reduce(function(s, t) { return s + t.precio; }, 0);
  lista.innerHTML = edListaTratamientos.map(function(t, i) {
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--ivory);border:1px solid var(--border);border-radius:10px;margin-bottom:6px">' +
      '<div><div style="font-size:14px;font-weight:600;color:var(--brown)">' + sanitize(t.nombre) + '</div>' +
      (t.precio > 0 ? '<div style="font-size:12px;color:var(--gold-dark)">$' + t.precio.toLocaleString('es-AR') + '</div>' : '') + '</div>' +
      '<button type="button" onclick="edEliminarTratamiento(' + i + ')" style="background:none;border:none;font-size:16px;color:var(--brown-soft);cursor:pointer;padding:4px 8px">✕</button>' +
    '</div>';
  }).join('');
  if (totalEl) {
    totalEl.textContent = edListaTratamientos.length > 1 ? 'Total: $' + total.toLocaleString('es-AR') : '';
    totalEl.style.display = edListaTratamientos.length > 1 ? 'block' : 'none';
  }
  // Actualizar precio editable con el total
  document.getElementById('ed-precio-edit').value = total || '';
}

function guardarEdicionPaciente() {
  if (!turnoEditKey) return;
  var t = turnosData[turnoEditKey];
  var nombre = document.getElementById('ed-pac-nombre').value.trim();
  var tel    = document.getElementById('ed-pac-tel').value.trim();
  var dni    = document.getElementById('ed-pac-dni').value.trim();
  var mail   = (document.getElementById('ed-pac-mail').value || '').trim().toLowerCase();
  var notas  = document.getElementById('ed-pac-notas').value.trim();
  var err    = document.getElementById('ed-pac-err');
  if (!nombre) { err.textContent='El nombre es obligatorio.'; err.className='err visible'; return; }
  err.className = 'err';

  // Actualizar ficha del paciente (si existe) y datos en el turno
  var promesas = [
    db.ref('turnos/'+turnoEditKey).update({ paciente: nombre, telefono: tel, dni: dni })
  ];
  if (t.pacienteKey) {
    promesas.push(db.ref('pacientes/'+t.pacienteKey).update({
      nombre: nombre, telefono: tel, dni: dni, email: mail, notas: notas
    }));
  }
  Promise.all(promesas).then(function(){
    document.getElementById('edit-pac-sub').textContent = nombre + ' · ' + (t.tratamiento||'');
    alert('Datos del paciente guardados.');
  }).catch(function(){
    err.textContent='Error al guardar.'; err.className='err visible';
  });
}

function guardarEdicionTurno() {
  if (!turnoEditKey) return;
  var err = document.getElementById('ed-turno-err');

  if (!edListaTratamientos.length) {
    err.textContent='Agregá al menos un tratamiento.'; err.className='err visible'; return;
  }

  var tratamientosArray = edListaTratamientos.slice();
  // Nombre principal: todos los tratamientos unidos
  var trat = tratamientosArray.map(function(t) { return t.nombre; }).join(' + ');
  // Clave del primer tratamiento del catálogo (para compatibilidad)
  var tratKey = '';
  for (var i = 0; i < tratamientosArray.length; i++) {
    if (tratamientosArray[i].key && tratamientosArray[i].key !== '__libre__') { tratKey = tratamientosArray[i].key; break; }
  }

  var precio = parseFloat(document.getElementById('ed-precio-edit').value) || 0;
  var fecha  = document.getElementById('ed-fecha').value;
  var hh     = document.getElementById('ed-hh').value;
  var mm     = document.getElementById('ed-mm').value;
  var hora   = (hh && mm) ? hh+':'+mm : '';
  var notas  = document.getElementById('ed-notas').value.trim();
  if (!fecha || !hora) { err.textContent='Completá fecha y hora.'; err.className='err visible'; return; }
  err.className = 'err';
  db.ref('turnos/'+turnoEditKey).update({
    tratamiento:  trat,
    tratamientos: tratamientosArray,  // FIX #3: actualiza el array para consistency
    tratamientoKey: tratKey,
    precio:       precio,
    fecha:        fecha,
    hora:         hora,
    notas:        notas
  }).then(function(){
    // Si hay venta asociada, actualizar montoTotal
    var v = buscarVentaDeTurno(turnoEditKey);
    if (v && precio > 0) {
      var pagado = totalPagadoTurno(turnoEditKey);
      db.ref('ventas/'+v.key).update({
        montoTotal: precio,
        descripcion: trat,
        estado: pagado >= precio ? 'pagada' : 'pendiente'
      });
    }
    alert('Datos del turno guardados.');
    // Sincronizar con Google Calendar
    var turnoActualizado = turnosData[turnoEditKey] || {};
    var datosGcal = Object.assign({}, turnoActualizado, {
      tratamiento: trat, precio: precio, fecha: fecha, hora: hora, notas: notas
    });
    try {
      if (datosGcal.gcalEventId) {
        gcalActualizarEvento(turnoEditKey, datosGcal);
      } else {
        gcalCrearEvento(turnoEditKey, datosGcal);
      }
    } catch(e) {}
  }).catch(function(){
    err.textContent='Error al guardar.'; err.className='err visible';
  });
}

function renderEditPagos() {
  if (!turnoEditKey) return;
  var t = turnosData[turnoEditKey];
  var precio = parseFloat(t && t.precio) || 0;
  var v = buscarVentaDeTurno(turnoEditKey);
  if (v && v.venta.montoTotal) precio = parseFloat(v.venta.montoTotal);
  var pagos = pagosDeTurno(turnoEditKey);
  var pagado = pagos.reduce(function(s,p){ return s + (parseFloat(p.monto)||0); }, 0);
  var resta = Math.max(precio - pagado, 0);
  document.getElementById('ep-total').textContent  = '$' + precio.toLocaleString('es-AR');
  document.getElementById('ep-pagado').textContent = '$' + pagado.toLocaleString('es-AR');
  document.getElementById('ep-resta').textContent  = '$' + resta.toLocaleString('es-AR');

  var lista = document.getElementById('ep-pagos-lista');
  if (!pagos.length) {
    lista.innerHTML = '<div class="empty" style="padding:18px 0"><div class="empty-icon">💰</div>Sin pagos registrados</div>';
  } else {
    lista.innerHTML = pagos.map(function(p){
      return '<div class="pago-registrado">' +
        '<div><div class="pago-registrado-info">'+iconoMetodo(p.metodo)+' '+nombreMetodo(p.metodo)+(p.anticipado?' · <span style="color:var(--gold-dark);font-weight:700">Anticipado</span>':'')+'</div>' +
        '<div class="pago-registrado-meta">'+(p.fecha||'')+'</div></div>' +
        '<div style="display:flex;align-items:center;gap:8px"><div class="pago-registrado-monto">$'+p.monto.toLocaleString('es-AR')+'</div>' +
        '<button class="pago-eliminar" onclick="eliminarPagoTurno(\''+p._key+'\')">✕</button></div>' +
      '</div>';
    }).join('');
  }
  document.getElementById('ep-nuevo-monto').value = resta > 0 ? resta : '';
}

function agregarPagoTurno() {
  if (!turnoEditKey) return;
  var t = turnosData[turnoEditKey];
  var monto = parseFloat(document.getElementById('ep-nuevo-monto').value) || 0;
  var metodo = document.getElementById('ep-nuevo-metodo').value;
  var err = document.getElementById('ep-err');
  if (monto <= 0) { err.textContent='Ingresá un monto válido.'; err.className='err visible'; return; }
  err.className = 'err';
  var hoy = new Date().toISOString().split('T')[0];
  var precio = parseFloat(t.precio) || 0;
  var v = buscarVentaDeTurno(turnoEditKey);
  if (v && v.venta.montoTotal) precio = parseFloat(v.venta.montoTotal);

  var promesaVentaId;
  if (v) {
    promesaVentaId = Promise.resolve(v.key);
  } else {
    promesaVentaId = db.ref('ventas').push({
      pacienteId: t.pacienteKey || '', turnoId: turnoEditKey,
      descripcion: t.tratamiento, montoTotal: precio || monto,
      estado: 'pendiente', fecha: hoy
    }).then(function(r){ return r.key; });
  }

  promesaVentaId.then(function(ventaId) {
    return db.ref('pagos').push({
      ventaId: ventaId, turnoId: turnoEditKey, pacienteId: t.pacienteKey || '',
      metodo: metodo, monto: monto, estado: 'confirmado', fecha: hoy
    }).then(function(){ return ventaId; });
  }).then(function(ventaId){
    var pagado = totalPagadoTurno(turnoEditKey) + monto;
    var precioFinal = (ventasData[ventaId] && ventasData[ventaId].montoTotal) || precio || monto;
    db.ref('ventas/'+ventaId).update({
      estado: pagado >= precioFinal ? 'pagada' : 'pendiente'
    });
    document.getElementById('ep-nuevo-monto').value = '';
    setTimeout(renderEditPagos, 250);
  }).catch(function(){
    err.textContent='Error al registrar pago.'; err.className='err visible';
  });
}

function eliminarPagoTurno(pagoKey) {
  var p = pagosData[pagoKey];
  var detalle = p ? (p.metodo||'pago') + ' $' + (p.monto||0).toLocaleString('es-AR') : 'pago';
  if (!confirmarAccionCritica('pago', detalle)) return;
  softDelete(db.ref('pagos/'+pagoKey), 'Eliminado desde edición de turno')
    .then(function(){ setTimeout(renderEditPagos, 250); })
    .catch(function(e){ manejarErrorFirebase(e, 'Eliminar pago turno'); });
}

// ══════════════════════════════════════════════════════════