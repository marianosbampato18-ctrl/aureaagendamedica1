// ═══════════════════════════════════════════
// CAJA — Cobros, pagos, cierres de caja
// ═══════════════════════════════════════════
function buscarVentaDeTurno(turnoKey) {
  var encontrada = null;
  Object.keys(ventasData).forEach(function(k){
    if (ventasData[k].turnoId === turnoKey) encontrada = { key: k, venta: ventasData[k] };
  });
  return encontrada;
}

function pagosDeTurno(turnoKey) {
  var v = buscarVentaDeTurno(turnoKey);
  if (!v) return [];
  return Object.keys(pagosData)
    .filter(function(pk){
      var pg = pagosData[pk];
      return pg.ventaId === v.key && pg.estado === 'confirmado' && !pg.eliminado;
    })
    .map(function(pk){ return Object.assign({_key:pk}, pagosData[pk]); });
}

function totalPagadoTurno(turnoKey) {
  return pagosDeTurno(turnoKey).reduce(function(s,p){ return s + (parseFloat(p.monto)||0); }, 0);
}

function abrirModalCobro(turnoKey) {
  turnoCobroKey = turnoKey;
  var t = turnosData[turnoKey];
  filasCobroPago = [];
  document.getElementById('cobro-pac-sub').textContent = (t.paciente||'') + ' · ' + t.tratamiento;

  var precioTotal = parseFloat(t.precio) || 0;
  var v = buscarVentaDeTurno(turnoKey);
  if (v && v.venta.montoTotal) precioTotal = parseFloat(v.venta.montoTotal);

  var pagosPrev = pagosDeTurno(turnoKey);
  var pagado = pagosPrev.reduce(function(s,p){ return s + p.monto; }, 0);
  var resta = Math.max(precioTotal - pagado, 0);

  document.getElementById('cobro-total').textContent  = '$' + precioTotal.toLocaleString('es-AR');
  document.getElementById('cobro-pagado').textContent = '$' + pagado.toLocaleString('es-AR');
  document.getElementById('cobro-resta').textContent  = '$' + resta.toLocaleString('es-AR');

  // Mostrar pagos previos (anticipados) si existen
  var prevDiv = document.getElementById('cobro-pagos-previos');
  if (pagosPrev.length) {
    prevDiv.innerHTML = '<div style="font-size:11px;font-weight:700;color:var(--gold-dark);letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px">Pagos previos (anticipados)</div>' +
      pagosPrev.map(function(p){
        return '<div class="pago-registrado">' +
          '<div><div class="pago-registrado-info">'+iconoMetodo(p.metodo)+' '+nombreMetodo(p.metodo)+'</div>' +
          '<div class="pago-registrado-meta">'+(p.fecha||'')+'</div></div>' +
          '<div class="pago-registrado-monto">$'+p.monto.toLocaleString('es-AR')+'</div>' +
        '</div>';
      }).join('');
  } else {
    prevDiv.innerHTML = '';
  }

  document.getElementById('cobro-err').className = 'err';
  document.getElementById('cobro-pagos-lista').innerHTML = '';

  // Si hay deuda, sugerir cobrar el resto. Si no hay deuda, no agregar fila (ya está pagado).
  if (resta > 0) {
    filasCobroPago.push({ monto: resta, metodo: 'efectivo' });
    var idx = 0;
    var div = document.createElement('div');
    div.className = 'pago-row';
    div.id = 'fila-pago-'+idx;
    div.innerHTML =
      '<select onchange="filasCobroPago['+idx+'].metodo=this.value" style="flex:.9;padding:12px 8px;font-size:14px;border:1px solid var(--border);border-radius:12px;background:var(--ivory);color:var(--brown);font-family:inherit;outline:none;-webkit-appearance:none">' +
      '<option value="efectivo">💵 Efectivo</option><option value="transferencia">📲 Transfer.</option><option value="tarjeta">💳 Tarjeta</option><option value="mercadopago">💸 Merc. Pago</option><option value="qr">📱 QR</option>' +
      '</select>' +
      '<input type="number" value="'+resta+'" inputmode="numeric" style="flex:1;padding:12px 14px;font-size:16px;border:1px solid var(--border);border-radius:12px;background:var(--ivory);color:var(--brown);font-family:inherit;outline:none" oninput="filasCobroPago['+idx+'].monto=this.value;actualizarTotalesCobro()"/>' +
      '<button class="del-pago" onclick="eliminarFilaPago('+idx+')">✕</button>';
    document.getElementById('cobro-pagos-lista').appendChild(div);
  }

  document.getElementById('modal-cobro').className = 'modal-overlay visible';
}

function cancelarModalCobro() {
  document.getElementById('modal-cobro').className = 'modal-overlay';
  turnoCobroKey = null;
}

function cerrarModalCobro() {
  // "Marcar realizado sin cobro" → no crea pagos pero marca como completado
  if (!turnoCobroKey) return;
  var t = turnosData[turnoCobroKey];
  if (!confirm('¿Marcar como realizado sin registrar cobro?')) return;
  db.ref('modal-cobro');
  document.getElementById('modal-cobro').className = 'modal-overlay';
  db.ref('turnos/'+turnoCobroKey).update({ estado: 'completado' });
  if (t && t.pacienteKey) {
    db.ref('pacientes/'+t.pacienteKey+'/historial').push({
      fecha: t.fecha, tratamiento: t.tratamiento, productos: '', notas: t.notas||'', auto: true
    });
  }
  turnoCobroKey = null;
}

function iconoMetodo(m){
  return ({efectivo:'💵',transferencia:'📲',tarjeta:'💳',mercadopago:'💸',qr:'📱'})[m] || '💰';
}
function nombreMetodo(m){
  return ({efectivo:'Efectivo',transferencia:'Transferencia',tarjeta:'Tarjeta',mercadopago:'Mercado Pago',qr:'QR'})[m] || m;
}

function agregarFilaPago() {
  var idx = filasCobroPago.length;
  filasCobroPago.push({ monto: '', metodo: 'efectivo' });
  var lista = document.getElementById('cobro-pagos-lista');
  var div = document.createElement('div');
  div.className = 'pago-row';
  div.id = 'fila-pago-' + idx;
  div.innerHTML =
    '<select onchange="filasCobroPago['+idx+'].metodo=this.value" style="flex:.9;padding:12px 8px;font-size:14px;border:1px solid var(--border);border-radius:12px;background:var(--ivory);color:var(--brown);font-family:inherit;outline:none;-webkit-appearance:none">' +
    '<option value="efectivo">💵 Efectivo</option>' +
    '<option value="transferencia">📲 Transfer.</option>' +
    '<option value="tarjeta">💳 Tarjeta</option>' +
    '<option value="mercadopago">💸 Merc. Pago</option>' +
    '<option value="qr">📱 QR</option>' +
    '</select>' +
    '<input type="number" placeholder="Monto $" inputmode="numeric" style="flex:1;padding:12px 14px;font-size:16px;border:1px solid var(--border);border-radius:12px;background:var(--ivory);color:var(--brown);font-family:inherit;outline:none" oninput="filasCobroPago['+idx+'].monto=this.value;actualizarTotalesCobro()"/>' +
    '<button class="del-pago" onclick="eliminarFilaPago('+idx+')">✕</button>';
  lista.appendChild(div);
}

function eliminarFilaPago(idx) {
  filasCobroPago[idx] = null;
  var el = document.getElementById('fila-pago-'+idx);
  if (el) el.remove();
  actualizarTotalesCobro();
}

function actualizarTotalesCobro() {
  if (!turnoCobroKey) return;
  var t = turnosData[turnoCobroKey];
  var precioTotal = parseFloat(t && t.precio) || 0;
  var v = buscarVentaDeTurno(turnoCobroKey);
  if (v && v.venta.montoTotal) precioTotal = parseFloat(v.venta.montoTotal);
  var pagado = totalPagadoTurno(turnoCobroKey);
  var nuevos = filasCobroPago.reduce(function(s,f){ return s + (f && parseFloat(f.monto)||0); }, 0);
  var resta = Math.max(precioTotal - pagado - nuevos, 0);
  document.getElementById('cobro-resta').textContent = '$' + resta.toLocaleString('es-AR');
}

function confirmarCobro() {
  var t = turnosData[turnoCobroKey];
  var pagosValidos = filasCobroPago.filter(function(f){ return f && parseFloat(f.monto) > 0; });
  if (!pagosValidos.length) {
    var _precioChk = parseFloat(t.precio) || 0;
    var _vChk = buscarVentaDeTurno(turnoCobroKey);
    if (_vChk && _vChk.venta.montoTotal) _precioChk = parseFloat(_vChk.venta.montoTotal);
    var _pagadoChk = totalPagadoTurno(turnoCobroKey);
    if (_pagadoChk >= _precioChk && _precioChk > 0) {
      // Turno ya saldado: marcar como completado sin exigir nuevo pago
      db.ref('turnos/'+turnoCobroKey).update({ estado: 'completado' });
      if (t && t.pacienteKey) {
        db.ref('pacientes/'+t.pacienteKey+'/historial').push({
          fecha: t.fecha, tratamiento: t.tratamiento, productos: '', notas: t.notas||'', auto: true
        });
      }
      document.getElementById('modal-cobro').className = 'modal-overlay';
      turnoCobroKey = null;
      return;
    }
    document.getElementById('cobro-err').textContent='Ingresá al menos un monto.';
    document.getElementById('cobro-err').className='err visible';
    return;
  }
  var montoTotalNuevo = pagosValidos.reduce(function(s,f){ return s + parseFloat(f.monto); }, 0);
  var hoy = new Date().toISOString().split('T')[0];
  var precioTotal = parseFloat(t.precio) || 0;
  var v = buscarVentaDeTurno(turnoCobroKey);

  // Si ya hay venta para este turno, sumar pagos ahí. Si no, crear venta.
  var promesaVentaId;
  if (v) {
    promesaVentaId = Promise.resolve(v.key);
  } else {
    if (!precioTotal) precioTotal = totalPagadoTurno(turnoCobroKey) + montoTotalNuevo;
    promesaVentaId = db.ref('ventas').push({
      pacienteId: t.pacienteKey || '', turnoId: turnoCobroKey,
      descripcion: t.tratamiento, montoTotal: precioTotal,
      estado: 'pendiente', fecha: hoy
    }).then(function(r){ return r.key; });
  }

  promesaVentaId.then(function(ventaId) {
    var promesas = pagosValidos.map(function(f) {
      return db.ref('pagos').push({
        ventaId: ventaId, turnoId: turnoCobroKey, pacienteId: t.pacienteKey || '',
        metodo: f.metodo, monto: parseFloat(f.monto),
        estado: 'confirmado', fecha: hoy
      });
    });
    return Promise.all(promesas).then(function(){ return ventaId; });
  }).then(function(ventaId) {
    // Re-evaluar estado de la venta
    var totalAhora = totalPagadoTurno(turnoCobroKey) + montoTotalNuevo;
    var precioFinal = (ventasData[ventaId] && ventasData[ventaId].montoTotal) || precioTotal;
    var nuevoEstado = totalAhora >= precioFinal ? 'pagada' : 'pendiente';
    db.ref('ventas/'+ventaId).update({ estado: nuevoEstado });
    db.ref('turnos/'+turnoCobroKey).update({ estado: 'completado' });
    if (t && t.pacienteKey) {
      db.ref('pacientes/'+t.pacienteKey+'/historial').push({
        fecha: t.fecha, tratamiento: t.tratamiento, productos: '', notas: t.notas||'', auto: true
      });
    }
    document.getElementById('modal-cobro').className = 'modal-overlay';
    turnoCobroKey = null;
  });
}

// ── CAJA ──
function setFiltroCaja(f) {
  filtroCaja = f;
  ['dia','semana','mes'].forEach(function(x){
    document.getElementById('filtro-'+x).className = 'toggle-btn' + (x===f?' sel':'');
  });
  renderCaja();
}

function toggleCobroManual() {
  formCobroManualVisible = !formCobroManualVisible;
  document.getElementById('form-cobro-manual').className = 'form-card' + (formCobroManualVisible?' visible':'');
  document.getElementById('btn-cobro-manual').className  = 'btn-primary' + (formCobroManualVisible?' active':'');
  document.getElementById('btn-cobro-manual').textContent = formCobroManualVisible ? '✕ Cerrar' : '+ Cobro';
  if (!formCobroManualVisible) {
    cmPacienteKey = null;
    document.getElementById('cm-suggestions').className = 'suggestions';
    document.getElementById('cm-ficha-cargada').className = 'ficha-cargada';
  }
}

function buscarPacienteCM(query) {
  var box = document.getElementById('cm-suggestions');
  cmPacienteKey = null;
  document.getElementById('cm-ficha-cargada').className = 'ficha-cargada';
  if (!query || query.length < 1) { box.className = 'suggestions'; return; }
  var keys = Object.keys(pacientesData).filter(function(k) {
    return pacientesData[k].nombre.toLowerCase().indexOf(query.toLowerCase()) !== -1;
  }).slice(0, 8);
  if (!keys.length) { box.className = 'suggestions'; return; }
  box.innerHTML = keys.map(function(k) {
    var p = pacientesData[k];
    return '<div class="suggestion-item" onclick="seleccionarPacienteCM(\''+k+'\')">' +
      '<div class="suggestion-name">'+p.nombre+'</div>' +
      '<div class="suggestion-sub">'+(p.telefono||'')+(p.dni?' · DNI '+p.dni:'')+'</div>' +
    '</div>';
  }).join('');
  box.className = 'suggestions visible';
}

function seleccionarPacienteCM(key) {
  cmPacienteKey = key;
  var p = pacientesData[key];
  document.getElementById('cm-pac').value = p.nombre;
  document.getElementById('cm-suggestions').className = 'suggestions';
  document.getElementById('cm-fc-nombre').textContent = p.nombre;
  document.getElementById('cm-fc-data').textContent = (p.telefono ? '📞 '+p.telefono : '') + (p.dni ? '  ·  🪪 DNI '+p.dni : '');
  document.getElementById('cm-ficha-cargada').className = 'ficha-cargada visible';
}

function setCMMetodo(m) {
  cmMetodo = m;
  ['efectivo','transferencia','tarjeta','mercadopago','qr'].forEach(function(x){
    var ids = { efectivo:'cm-ef', transferencia:'cm-tr', tarjeta:'cm-ta', mercadopago:'cm-mp', qr:'cm-qr' };
    var el = document.getElementById(ids[x]);
    if (el) el.className = 'toggle-btn' + (m===x?' sel':'');
  });
}

function guardarCobroManual() {
  var desc  = document.getElementById('cm-desc').value.trim();
  var err   = document.getElementById('cm-err');
  limpiarError(err);

  var errDesc = validarTextoObligatorio(desc, 'La descripción');
  if (errDesc) { mostrarErrorValidacion(err, errDesc); return; }
  var errMonto = validarMonto(document.getElementById('cm-monto').value, 'El monto');
  if (errMonto) { mostrarErrorValidacion(err, errMonto); return; }
  var monto = parseFloat(document.getElementById('cm-monto').value);
  if (monto === 0) { mostrarErrorValidacion(err, 'El monto debe ser mayor a $0.'); return; }

  var _btnCM = document.getElementById('btn-save-cm');
  if (_btnCM) { _btnCM.disabled=true; _btnCM.textContent='Guardando…'; }
  var hoy = new Date().toISOString().split('T')[0];
  var nombreEscrito = document.getElementById('cm-pac').value.trim();
  db.ref('pagos').push({
    ventaId: '',
    pacienteId: cmPacienteKey || '',
    pacienteNombre: cmPacienteKey ? '' : nombreEscrito,
    descripcion: desc,
    metodo: cmMetodo, monto: monto,
    estado: 'confirmado', fecha: hoy, manual: true
  }).then(function() {
    if (_btnCM) { _btnCM.disabled=false; _btnCM.textContent='Guardar cobro'; }
    ['cm-pac','cm-desc','cm-monto'].forEach(function(id){ document.getElementById(id).value=''; });
    cmPacienteKey = null;
    document.getElementById('cm-ficha-cargada').className = 'ficha-cargada';
    document.getElementById('cm-suggestions').className = 'suggestions';
    toggleCobroManual();
  }).catch(function(e){
    if (_btnCM) { _btnCM.disabled=false; _btnCM.textContent='Guardar cobro'; }
    manejarErrorFirebase(e, 'Cobro manual', err);
  });
}

function cerrarCaja() {
  if (!requiereAdmin()) return;
  var hoy = new Date().toISOString().split('T')[0];

  // ── GUARD: no doble cierre del mismo día ─────────────────
  var cierreHoy = null;
  Object.keys(cierresData).forEach(function(k) {
    if (cierresData[k].fecha === hoy) cierreHoy = { key: k, cierre: cierresData[k] };
  });

  // ── Detectar cierre incompleto (Fix #15) ─────────────────
  // Si hay un cierre de hoy con estado 'en_curso', significa que
  // se guardó el cierre pero falló el batch de cierreId en los pagos.
  // Lo completamos automáticamente.
  if (cierreHoy && cierreHoy.cierre.estado === 'en_curso') {
    var cierreId = cierreHoy.key;
    var updates = {};
    Object.keys(pagosData).forEach(function(k) {
      var p = pagosData[k];
      if (p.fecha === hoy && p.estado === 'confirmado' && !p.cierreId) {
        updates['pagos/' + k + '/cierreId'] = cierreId;
      }
    });
    if (Object.keys(updates).length) {
      db.ref().update(updates).then(function() {
        db.ref('cierres/' + cierreId + '/estado').set('completado');
        alert('Cierre incompleto detectado y recuperado correctamente.');
      });
    } else {
      db.ref('cierres/' + cierreId + '/estado').set('completado');
    }
    return;
  }

  if (cierreHoy && cierreHoy.cierre.estado !== 'en_curso') {
    alert('La caja de hoy ya fue cerrada. Podés ver el historial abajo.');
    return;
  }

  // ── Pagos pendientes de cierre ────────────────────────────
  var pagosHoy = Object.keys(pagosData).filter(function(k) {
    var p = pagosData[k];
    return p.fecha === hoy && p.estado === 'confirmado' && !p.cierreId;
  });

  if (!pagosHoy.length) {
    alert('No hay movimientos pendientes de cierre para hoy.');
    return;
  }

  var totales = { total:0, efectivo:0, transferencia:0, tarjeta:0, mercadopago:0, qr:0 };
  pagosHoy.forEach(function(k) {
    var p = pagosData[k];
    totales.total        += parseFloat(p.monto) || 0;
    totales[p.metodo]     = (totales[p.metodo] || 0) + (parseFloat(p.monto) || 0);
  });

  if (!confirm('¿Cerrar caja del día con $' + totales.total.toLocaleString('es-AR') + ' (' + pagosHoy.length + ' movimientos)?')) return;

  // ── Paso 1: guardar cierre con estado 'en_curso' ──────────
  // Si la conexión se corta aquí, al próximo login se detecta
  // el estado 'en_curso' y se completa automáticamente.
  db.ref('cierres').push({
    fecha:           hoy,
    total:           totales.total,
    efectivo:        totales.efectivo        || 0,
    transferencia:   totales.transferencia   || 0,
    tarjeta:         totales.tarjeta         || 0,
    mercadopago:     totales.mercadopago     || 0,
    qr:              totales.qr              || 0,
    cantMovimientos: pagosHoy.length,
    timestamp:       Date.now(),
    estado:          'en_curso'   // ← marcador de atomicidad
  }).then(function(ref) {
    var cierreId = ref.key;

    // ── Paso 2: marcar pagos con cierreId (batch) ────────────
    var updates = {};
    pagosHoy.forEach(function(k) {
      updates['pagos/' + k + '/cierreId'] = cierreId;
    });
    return db.ref().update(updates).then(function() {
      // ── Paso 3: marcar cierre como completado ────────────
      return db.ref('cierres/' + cierreId + '/estado').set('completado');
    });
  }).catch(function(e) {
    alert('Error al cerrar la caja: ' + e.message +
      '\nSi el problema persiste, recargá la página — el sistema recuperará el cierre automáticamente.');
  });
}

// Calcula solo los pagos del día que AÚN NO fueron incluidos en un cierre.
// Es lo que se muestra en el botón "Cerrar caja".
function calcularPendienteCierre() {
  var hoy = new Date().toISOString().split('T')[0];
  var totales = { total:0, efectivo:0, transferencia:0, tarjeta:0, mercadopago:0, qr:0 };
  Object.keys(pagosData).forEach(function(k) {
    var p = pagosData[k];
    if (p.fecha === hoy && p.estado === 'confirmado' && !p.cierreId) {
      totales.total        += parseFloat(p.monto) || 0;
      totales[p.metodo]     = (totales[p.metodo] || 0) + (parseFloat(p.monto) || 0);
    }
  });
  return totales;
}

function calcularTotalesPeriodo(periodo) {
  var hoy = new Date();
  var totales = { total:0, efectivo:0, transferencia:0, tarjeta:0, mercadopago:0, qr:0 };
  Object.keys(pagosData).forEach(function(k) {
    var p = pagosData[k];
    if (p.estado !== 'confirmado') return;
    var fp = new Date(p.fecha + 'T00:00:00');
    var incluir = false;
    if (periodo === 'dia') incluir = p.fecha === hoy.toISOString().split('T')[0];
    else if (periodo === 'semana') {
      var diff = (hoy - fp) / (1000*60*60*24);
      incluir = diff >= 0 && diff < 7;
    } else if (periodo === 'mes') {
      incluir = fp.getMonth() === hoy.getMonth() && fp.getFullYear() === hoy.getFullYear();
    }
    if (incluir) {
      totales.total += p.monto;
      totales[p.metodo] = (totales[p.metodo]||0) + p.monto;
    }
  });
  return totales;
}

function renderCaja() {
  var t = calcularTotalesPeriodo(filtroCaja);
  var labels = { dia:'Hoy', semana:'Esta semana', mes:'Este mes' };
  var hoyFmt = new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'});
  document.getElementById('caja-periodo-label').textContent = labels[filtroCaja];
  document.getElementById('caja-fecha-hoy').textContent = hoyFmt;
  document.getElementById('caja-total-dia').textContent  = '$' + t.total.toLocaleString('es-AR');
  document.getElementById('caja-efectivo').textContent   = '$' + (t.efectivo||0).toLocaleString('es-AR');
  document.getElementById('caja-transferencia').textContent = '$' + (t.transferencia||0).toLocaleString('es-AR');
  document.getElementById('caja-tarjeta').textContent    = '$' + (t.tarjeta||0).toLocaleString('es-AR');
  document.getElementById('caja-mercadopago').textContent = '$' + (t.mercadopago||0).toLocaleString('es-AR');
  document.getElementById('caja-qr').textContent         = '$' + (t.qr||0).toLocaleString('es-AR');
  // El botón "Cerrar caja" muestra solo lo pendiente (no cerrado aún)
  var pendiente = calcularPendienteCierre();
  var yaCerradoHoy = Object.keys(cierresData).some(function(k) {
    return cierresData[k].fecha === new Date().toISOString().split('T')[0];
  });
  var cierreEl = document.getElementById('cierre-total');
  var btnCierre = document.getElementById('btn-cerrar-caja');
  if (cierreEl) cierreEl.textContent = '$' + pendiente.total.toLocaleString('es-AR');
  if (btnCierre) {
    if (yaCerradoHoy) {
      btnCierre.textContent = '✓ Caja cerrada hoy';
      btnCierre.disabled = true;
      btnCierre.style.opacity = '.5';
    } else {
      btnCierre.textContent = 'Cerrar caja';
      btnCierre.disabled = false;
      btnCierre.style.opacity = '';
    }
  }

  // Lista cobros del período
  var cobros = Object.keys(pagosData).filter(function(k){
    var p = pagosData[k]; if (p.estado !== 'confirmado') return false;
    var hoy = new Date(); var fp = new Date(p.fecha+'T00:00:00');
    if (filtroCaja==='dia')    return p.fecha === hoy.toISOString().split('T')[0];
    if (filtroCaja==='semana') return (hoy-fp)/(1000*60*60*24) >= 0 && (hoy-fp)/(1000*60*60*24) < 7;
    if (filtroCaja==='mes')    return fp.getMonth()===hoy.getMonth() && fp.getFullYear()===hoy.getFullYear();
  }).sort(function(a,b){ return pagosData[b].fecha.localeCompare(pagosData[a].fecha); });

  var iconos = { efectivo:'💵', transferencia:'📲', tarjeta:'💳', mercadopago:'💸', qr:'📱' };
  var listaCobros = document.getElementById('lista-cobros-periodo');
  if (!cobros.length) { listaCobros.innerHTML = '<div class="empty"><div class="empty-icon">💰</div>Sin cobros en este período</div>'; }
  else {
    listaCobros.innerHTML = cobros.map(function(k){
      var p = pagosData[k];
      var pf = parseFecha(p.fecha);
      // Resolver nombre del paciente y descripción del servicio
      var nombrePaciente = '';
      var descServicio = '';
      if (p.pacienteId && pacientesData[p.pacienteId]) {
        nombrePaciente = pacientesData[p.pacienteId].nombre;
      } else if (p.pacienteNombre) {
        nombrePaciente = p.pacienteNombre;
      }
      if (p.turnoId && turnosData[p.turnoId]) {
        descServicio = turnosData[p.turnoId].tratamiento || '';
        if (!nombrePaciente) nombrePaciente = turnosData[p.turnoId].paciente || '';
      } else if (p.ventaId && ventasData[p.ventaId]) {
        descServicio = ventasData[p.ventaId].descripcion || '';
      }
      if (!descServicio && p.descripcion) descServicio = p.descripcion;
      if (!nombrePaciente) nombrePaciente = p.manual ? 'Cobro manual' : 'Sin paciente';

      var tagAnt = p.anticipado ? '<span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:#FFF8E6;color:#9A7020;border:1px solid #E8C96A;margin-left:6px;text-transform:uppercase">Anticipado</span>' : '';
      var tagManual = p.manual ? '<span style="display:inline-block;font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;background:#F5EFE4;color:var(--gold-dark);border:1px solid rgba(184,154,106,.3);margin-left:6px;text-transform:uppercase">Manual</span>' : '';

      return '<div class="deuda-pac-card" style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="deuda-pac-nombre">'+nombrePaciente+tagAnt+tagManual+'</div>' +
          (descServicio?'<div style="font-size:12px;color:var(--brown-mid);margin-top:3px">'+descServicio+'</div>':'') +
          '<div style="font-size:11px;color:var(--brown-soft);margin-top:5px;font-weight:600">'+(iconos[p.metodo]||'💰')+' '+nombreMetodo(p.metodo)+' · '+pf.d+'/'+String(pf.m+1).padStart(2,'0')+'/'+pf.y+'</div>' +
        '</div>' +
        '<div style="font-size:17px;font-weight:800;color:var(--brown);white-space:nowrap">$'+p.monto.toLocaleString('es-AR')+'</div>' +
      '</div>';
    }).join('');
  }

  // Cierres anteriores
  var claves = Object.keys(cierresData).sort(function(a,b){ return cierresData[b].timestamp - cierresData[a].timestamp; });
  var listaCierres = document.getElementById('lista-cierres');
  if (!claves.length) { listaCierres.innerHTML = '<div class="empty"><div class="empty-icon">✦</div>Sin cierres registrados</div>'; }
  else {
    listaCierres.innerHTML = claves.slice(0,10).map(function(k){
      var c = cierresData[k];
      var pf = parseFecha(c.fecha);
      var movTxt = c.cantMovimientos ? ' · ' + c.cantMovimientos + ' mov.' : '';
      return '<div class="deuda-pac-card">' +
        '<div style="display:flex;justify-content:space-between;align-items:center">' +
          '<div><div class="deuda-pac-nombre">Cierre '+pf.d+'/'+String(pf.m+1).padStart(2,'0')+'/'+pf.y+movTxt+'</div>' +
          '<div style="font-size:12px;color:var(--brown-soft);margin-top:2px">💵 $'+(c.efectivo||0).toLocaleString('es-AR')+'  📲 $'+(c.transferencia||0).toLocaleString('es-AR')+'  💳 $'+(c.tarjeta||0).toLocaleString('es-AR')+(c.mercadopago?'  💸 $'+c.mercadopago.toLocaleString('es-AR'):'')+(c.qr?'  📱 $'+c.qr.toLocaleString('es-AR'):'')+'</div></div>' +
          '<div style="font-size:17px;font-weight:800;color:var(--brown)">$'+c.total.toLocaleString('es-AR')+'</div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  // Deudas
  var deudas = [];
  Object.keys(ventasData).forEach(function(vk) {
    var v = ventasData[vk];
    if (v.estado === 'pagada') return;
    var pagado = Object.keys(pagosData).reduce(function(s,pk){
      var pg = pagosData[pk];
      return pg.ventaId===vk && pg.estado==='confirmado' ? s+pg.monto : s;
    },0);
    var resta = v.montoTotal - pagado;
    if (resta > 0) deudas.push({ pacienteId:v.pacienteId, desc:v.descripcion, resta:resta });
  });
  var listaDeudas = document.getElementById('lista-deudas');
  if (!deudas.length) { listaDeudas.innerHTML='<div class="empty"><div class="empty-icon">✦</div>Sin deudas pendientes</div>'; }
  else {
    listaDeudas.innerHTML = deudas.map(function(d){
      var pac = pacientesData[d.pacienteId];
      return '<div class="deuda-pac-card"><div style="display:flex;justify-content:space-between;align-items:center">' +
        '<div><div class="deuda-pac-nombre">'+(pac?pac.nombre:'Paciente')+'</div><div style="font-size:12px;color:var(--brown-soft);margin-top:2px">'+d.desc+'</div></div>' +
        '<div class="deuda-pac-monto">$'+d.resta.toLocaleString('es-AR')+'</div>' +
      '</div></div>';
    }).join('');
  }
}

// ── PRIMERA VEZ TOGGLE ──
function setPV(val) {
  pvSeleccion = val;
  pacienteSeleccionadoKey = null;
  document.getElementById('pv-si').className = 'toggle-btn' + (val === true  ? ' sel' : '');
  document.getElementById('pv-no').className = 'toggle-btn' + (val === false ? ' sel' : '');
  document.getElementById('campos-nuevopac').style.display    = val === true  ? 'block' : 'none';
  document.getElementById('campos-pacexistente').style.display = val === false ? 'block' : 'none';
  document.getElementById('ficha-cargada').className = 'ficha-cargada';
  if (val === false) document.getElementById('t-pac-buscar').value = '';
}

// ── AUTOCOMPLETE ──
function buscarPaciente(query) {
  var box = document.getElementById('suggestions');
  pacienteSeleccionadoKey = null;
  document.getElementById('ficha-cargada').className = 'ficha-cargada';
  if (!query || query.length < 2) { box.className = 'suggestions'; return; }
  var keys = Object.keys(pacientesData).filter(function(k) {
    return pacientesData[k].nombre.toLowerCase().indexOf(query.toLowerCase()) !== -1;
  });
  if (!keys.length) { box.className = 'suggestions'; return; }
  box.innerHTML = keys.map(function(k) {
    var p = pacientesData[k];
    var histCount = p.historial ? Object.keys(p.historial).length : 0;
    return '<div class="suggestion-item" onclick="seleccionarPaciente(\''+k+'\')">' +
      '<div class="suggestion-name">'+p.nombre+'</div>' +
      '<div class="suggestion-sub">'+(p.telefono||'')+(p.dni?' · DNI '+p.dni:'')+'&nbsp;&nbsp;'+histCount+' visita'+(histCount!==1?'s':'')+'</div>' +
    '</div>';
  }).join('');
  box.className = 'suggestions visible';
}

function seleccionarPaciente(key) {
  pacienteSeleccionadoKey = key;
  var p = pacientesData[key];
  var histCount = p.historial ? Object.keys(p.historial).length : 0;
  document.getElementById('t-pac-buscar').value = p.nombre;
  document.getElementById('suggestions').className = 'suggestions';
  document.getElementById('fc-nombre').textContent = p.nombre;
  document.getElementById('fc-data').textContent = (p.telefono ? '📞 '+p.telefono : '') + (p.dni ? '  ·  🪪 DNI '+p.dni : '');
  document.getElementById('fc-hist').textContent = histCount + ' visita'+(histCount!==1?'s anteriores':'anterior');
  document.getElementById('ficha-cargada').className = 'ficha-cargada visible';
}

// ── GUARDAR TURNO ──
function toggleFormTurno() {
  formTurnoVisible = !formTurnoVisible;
  document.getElementById('form-turno').className = 'form-card' + (formTurnoVisible ? ' visible' : '');
  document.getElementById('btn-nuevo-turno').className   = 'btn-primary' + (formTurnoVisible ? ' active' : '');
  document.getElementById('btn-nuevo-turno').textContent = formTurnoVisible ? '✕ Cerrar' : '+ Nuevo turno';
  if (!formTurnoVisible) limpiarFormTurno();
}

function limpiarFormTurno() {
  ['t-pac-nuevo','t-tel','t-dni','t-mail','t-pac-buscar','t-trat','t-fecha','t-notas','pa-monto'].forEach(function(id){
    var el = document.getElementById(id); if(el) el.value = '';
  });
  document.getElementById('t-hh').value = '';
  document.getElementById('t-mm').value = '';
  document.getElementById('t-trat-sel').value = '';
  document.getElementById('t-trat-libre-wrap').style.display = 'none';
  document.getElementById('t-precio-auto').className = 'precio-auto';
  precioActualTurno = 0;
  document.getElementById('t-err').className = 'err';
  document.getElementById('campos-nuevopac').style.display     = 'none';
  document.getElementById('campos-pacexistente').style.display = 'none';
  document.getElementById('ficha-cargada').className = 'ficha-cargada';
  document.getElementById('suggestions').className   = 'suggestions';
  pvSeleccion = null; pacienteSeleccionadoKey = null;
  document.getElementById('pv-si').className = 'toggle-btn';
  document.getElementById('pv-no').className = 'toggle-btn';
  // Reset pago anticipado
  setPagoAnt('no');
  setPagoAntMet('efectivo');
}
