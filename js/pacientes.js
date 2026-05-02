// ═══════════════════════════════════════════
// PACIENTES — Fichas y historial clínico
// ═══════════════════════════════════════════
function toggleFormPac() {
  formPacVisible=!formPacVisible;
  document.getElementById('form-pac').className='form-card'+(formPacVisible?' visible':'');
  document.getElementById('btn-nuevo-pac').className='btn-primary'+(formPacVisible?' active':'');
  document.getElementById('btn-nuevo-pac').textContent=formPacVisible?'✕ Cerrar':'+ Nueva historia clínica';
  if(!formPacVisible){['p-nombre','p-tel','p-dni','p-mail','p-notas'].forEach(function(id){document.getElementById(id).value='';});}
}

function guardarPaciente() {
  var nombre = document.getElementById('p-nombre').value.trim();
  var tel    = document.getElementById('p-tel').value.trim();
  var dni    = document.getElementById('p-dni').value.trim();
  var err    = document.getElementById('p-err');
  limpiarError(err);

  var errNombre = validarTextoObligatorio(nombre, 'El nombre');
  if (errNombre) { mostrarErrorValidacion(err, errNombre); return; }
  var errTel = validarTelefono(tel);
  if (errTel)    { mostrarErrorValidacion(err, errTel); return; }
  var errDni = validarDNI(dni);
  if (errDni)    { mostrarErrorValidacion(err, errDni); return; }

  var mail  = (document.getElementById('p-mail').value || '').trim().toLowerCase();
  var notas = document.getElementById('p-notas').value.trim();

  var btn=document.getElementById('btn-save-pac');
  btn.disabled=true;btn.textContent='Guardando…';

  var nuevoId = siguienteIdPaciente();
  db.ref('pacientes').push({
    pacienteId: nuevoId,
    nombre: nombre,
    telefono: tel,
    dni: dni,
    email: mail,
    notas: notas
  }).then(function(){
    btn.disabled=false; btn.textContent='Guardar historia clínica'; toggleFormPac();
  }).catch(function(e){
    btn.disabled=false; btn.textContent='Guardar historia clínica'; manejarErrorFirebase(e,'Guardar paciente',err);
  });
}

function filtrarFichas(query) {
  var q = (query || '').toLowerCase().trim();
  var keys = Object.keys(pacientesData);
  if (q) {
    keys = keys.filter(function(k) {
      var p = pacientesData[k];
      return (p.nombre||'').toLowerCase().includes(q) ||
             (p.telefono||'').includes(q) ||
             (p.dni||'').includes(q) ||
             (p.email||'').toLowerCase().includes(q);
    });
  }
  var lista = document.getElementById('lista-pacientes');
  if (!keys.length) {
    lista.innerHTML = '<div class="empty"><div class="empty-icon">🔍</div>No se encontraron pacientes</div>';
    return;
  }
  keys.sort(function(a,b){ return (pacientesData[a].nombre||'').localeCompare(pacientesData[b].nombre||''); });
  lista.innerHTML = keys.map(function(key) {
    var p = pacientesData[key];
    var hc = p.historial ? Object.keys(p.historial).length : 0;
    var idBadge = p.pacienteId ? '<span style="font-size:10px;font-weight:700;color:var(--gold-dark);background:#FDF8EE;border:1px solid var(--gold);border-radius:20px;padding:2px 8px;margin-left:6px">#'+sanitize(p.pacienteId)+'</span>' : '';
    return '<div class="pac-card" id="pac-card-'+key+'" onclick="abrirFichaKey(\''+key+'\')">' +
      '<div class="pac-card-top"><div>' +
        '<div class="pac-card-name">'+sanitize(p.nombre)+idBadge+'</div>' +
        '<div class="pac-card-sub">'+(p.telefono?'📞 '+sanitize(p.telefono):'')+(p.dni?' · 🪪 '+sanitize(p.dni):'')+(p.email?' · ✉ '+sanitize(p.email):'')+'</div>' +
      '</div><div style="display:flex;align-items:center">' +
        '<span class="pac-card-count">'+hc+' visita'+(hc!==1?'s':'')+'</span>' +
        '<span class="chevron">›</span>' +
      '</div></div></div>';
  }).join('');
}

function renderPacientes() {
  var q = (document.getElementById('buscador-fichas') ? document.getElementById('buscador-fichas').value || '' : '');
  filtrarFichas(q);
}

function abrirFichaKey(key) {
  if (!pacientesData[key]) return;
  fichaActualKey=key;
  var p=pacientesData[key];
  document.getElementById('fd-nombre').textContent=p.nombre;
  var idEl = document.getElementById('fd-id');
  if (p.pacienteId) { idEl.textContent='#'+p.pacienteId; idEl.style.display='inline-block'; }
  else { idEl.style.display='none'; }
  document.getElementById('fd-tel').textContent=p.telefono?'📞 '+p.telefono:'';
  document.getElementById('fd-dni').textContent=p.dni?'🪪 DNI '+p.dni:'';
  document.getElementById('fd-mail').textContent=p.email?'✉ '+p.email:'';
  document.getElementById('fd-notas').textContent=p.notas||'';
  document.getElementById('fichas-lista').style.display='none';
  document.getElementById('ficha-detalle').style.display='block';
  renderHistorial();
  renderTratPac();
  showPanel('fichas');
}

function cerrarFicha() {
  fichaActualKey=null;
  document.getElementById('fichas-lista').style.display='block';
  document.getElementById('ficha-detalle').style.display='none';
  if(formHistVisible) toggleFormHist();
}

// ── HISTORIAL ──
function toggleFormHist() {
  formHistVisible=!formHistVisible;
  document.getElementById('form-hist').className='form-card'+(formHistVisible?' visible':'');
  document.getElementById('btn-nuevo-hist').className='btn-primary'+(formHistVisible?' active':'');
  document.getElementById('btn-nuevo-hist').textContent=formHistVisible?'✕ Cerrar':'+ Agregar';
  if(!formHistVisible){['h-fecha','h-trat','h-prod','h-nota'].forEach(function(id){document.getElementById(id).value='';});}
}

function guardarHistorial() {
  var fecha=document.getElementById('h-fecha').value;
  var trat=document.getElementById('h-trat').value.trim();
  var err=document.getElementById('h-err');
  if(!fecha||!trat){err.textContent='Completá fecha y tratamiento.';err.className='err visible';return;}
  err.className='err';
  var btn=document.getElementById('btn-save-hist');
  btn.disabled=true;btn.textContent='Guardando…';
  db.ref('pacientes/'+fichaActualKey+'/historial').push({
    fecha:fecha,tratamiento:trat,
    productos:document.getElementById('h-prod').value.trim(),
    notas:document.getElementById('h-nota').value.trim(),
    auto:false
  }).then(function(){
    btn.disabled=false;btn.textContent='Guardar entrada';
    toggleFormHist();
    db.ref('pacientes/'+fichaActualKey).once('value',function(snap){pacientesData[fichaActualKey]=snap.val();renderHistorial();});
  }).catch(function(){btn.disabled=false;btn.textContent='Guardar entrada';err.textContent='Error.';err.className='err visible';});
}

function eliminarHistorial(hkey) {
  if (!confirmarAccionCritica('entrada del historial', 'Esta entrada quedará oculta pero no se perderá')) return;
  softDelete(db.ref('pacientes/'+fichaActualKey+'/historial/'+hkey), 'Eliminado por usuario')
    .then(function(){
      db.ref('pacientes/'+fichaActualKey).once('value',function(snap){
        pacientesData[fichaActualKey]=snap.val(); renderHistorial(); renderPacientes();
      });
    })
    .catch(function(e){ manejarErrorFirebase(e, 'Eliminar historial'); });
}

function renderHistorial() {
  var p=pacientesData[fichaActualKey];
  var hist=p&&p.historial?p.historial:{};
  var keys=Object.keys(hist)
    .filter(function(k){ return !hist[k].eliminado; }) // ocultar soft-deleted
    .sort(function(a,b){return hist[b].fecha.localeCompare(hist[a].fecha);});
  if(!keys.length){document.getElementById('lista-historial').innerHTML='<div class="empty"><div class="empty-icon">📋</div>Sin entradas aún</div>';return;}
  document.getElementById('lista-historial').innerHTML=keys.map(function(k){
    var h=hist[k];
    var pf=parseFecha(h.fecha);
    return '<div class="historial-item">' +
      '<div class="hist-fecha">'+pf.d+' '+MESES[pf.m]+' '+pf.y+(h.auto?'<span class="auto-badge">automático</span>':'')+'</div>' +
      '<div class="hist-trat">'+sanitize(h.tratamiento)+'</div>' +
      (h.productos?'<div class="hist-prod">🧴 '+sanitize(h.productos)+'</div>':'') +
      (h.notas?'<div class="hist-nota">'+sanitize(h.notas)+'</div>':'') +
      '<div class="hist-actions"><button class="act-btn btn-del" onclick="eliminarHistorial(\''+k+'\')">Eliminar</button></div>' +
    '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════
// ── TRATAMIENTOS POR PACIENTE ──
// ═══════════════════════════════════════════════════════

var formTratPacVisible = false;

// ── Migración automática ──────────────────────────────
// Si un paciente tiene `tratamiento` (string legacy) y no tiene `tratamientos`,
// lo convierte al nuevo formato sin tocar el dato original.
function migrarTratamientoLegacy(pacId) {
  var p = pacientesData[pacId];
  if (!p) return;
  // Solo migrar si existe `tratamiento` string Y no existe `tratamientos`
  if (p.tratamiento && typeof p.tratamiento === 'string' && !p.tratamientos) {
    var nuevoTrat = { nombre: p.tratamiento, fecha: '', precio: '', notas: '' };
    db.ref('pacientes/' + pacId + '/tratamientos').push(nuevoTrat)
      .then(function() {
        // Marcar campo legacy como migrado (NO lo borramos para compatibilidad)
        db.ref('pacientes/' + pacId + '/tratamientoMigrado').set(true);
        // Actualizar estado local
        if (!pacientesData[pacId].tratamientos) pacientesData[pacId].tratamientos = {};
        renderTratPac();
      });
  }
}

function toggleFormTratPac(editKey) {
  var esEdicion = !!editKey;
  formTratPacVisible = esEdicion ? true : !formTratPacVisible;

  var form = document.getElementById('form-trat-pac');
  var btn  = document.getElementById('btn-nuevo-trat-pac');
  form.className = 'form-card form-trat-pac' + (formTratPacVisible ? ' visible' : '');
  btn.className  = 'btn-primary' + (formTratPacVisible ? ' active' : '');
  btn.textContent = formTratPacVisible ? '✕ Cerrar' : '+ Agregar';
  document.getElementById('form-trat-pac-titulo').textContent = esEdicion ? 'Editar tratamiento' : 'Nuevo tratamiento';
  document.getElementById('btn-save-trat-pac').textContent = esEdicion ? 'Guardar cambios' : 'Guardar tratamiento';
  document.getElementById('tp-edit-key').value = editKey || '';

  if (!formTratPacVisible || !esEdicion) {
    ['tp-nombre','tp-fecha','tp-precio','tp-notas'].forEach(function(id){
      document.getElementById(id).value='';
    });
    document.getElementById('tp-edit-key').value = '';
    document.getElementById('tp-err').className = 'err';
  }
}

function editarTratPac(tratId) {
  var p = pacientesData[fichaActualKey];
  if (!p || !p.tratamientos || !p.tratamientos[tratId]) return;
  var t = p.tratamientos[tratId];
  document.getElementById('tp-nombre').value  = t.nombre  || '';
  document.getElementById('tp-fecha').value   = t.fecha   || '';
  document.getElementById('tp-precio').value  = t.precio  || '';
  document.getElementById('tp-notas').value   = t.notas   || '';
  toggleFormTratPac(tratId);
  document.getElementById('form-trat-pac').scrollIntoView({ behavior:'smooth', block:'nearest' });
}

function guardarTratPac() {
  var nombre = document.getElementById('tp-nombre').value.trim();
  var err    = document.getElementById('tp-err');
  err.className = 'err';

  if (!nombre) {
    err.textContent = 'El nombre del tratamiento es obligatorio.';
    err.className   = 'err visible';
    return;
  }

  var editKey = document.getElementById('tp-edit-key').value;
  var datos   = {
    nombre:  nombre,
    fecha:   document.getElementById('tp-fecha').value   || '',
    precio:  parseFloat(document.getElementById('tp-precio').value) || 0,
    notas:   document.getElementById('tp-notas').value.trim() || ''
  };

  var btn = document.getElementById('btn-save-trat-pac');
  btn.disabled = true;
  btn.textContent = 'Guardando…';

  var ref = editKey
    ? db.ref('pacientes/' + fichaActualKey + '/tratamientos/' + editKey).update(datos)
    : db.ref('pacientes/' + fichaActualKey + '/tratamientos').push(datos);

  ref.then(function() {
    btn.disabled = false;
    btn.textContent = editKey ? 'Guardar cambios' : 'Guardar tratamiento';
    // Refrescar datos locales
    db.ref('pacientes/' + fichaActualKey).once('value', function(snap) {
      pacientesData[fichaActualKey] = snap.val();
      renderTratPac();
      toggleFormTratPac(); // cerrar form
    });
  }).catch(function(e) {
    btn.disabled = false;
    btn.textContent = editKey ? 'Guardar cambios' : 'Guardar tratamiento';
    err.textContent = 'Error al guardar: ' + e.message;
    err.className   = 'err visible';
  });
}

function eliminarTratPac(tratId) {
  var p = pacientesData[fichaActualKey];
  var nombre = (p && p.tratamientos && p.tratamientos[tratId]) ? p.tratamientos[tratId].nombre : 'tratamiento';
  if (!confirmarAccionCritica('tratamiento', nombre)) return;
  softDelete(db.ref('pacientes/' + fichaActualKey + '/tratamientos/' + tratId), 'Eliminado por usuario')
    .then(function() {
      db.ref('pacientes/' + fichaActualKey).once('value', function(snap) {
        pacientesData[fichaActualKey] = snap.val();
        renderTratPac();
      });
    })
    .catch(function(e){ manejarErrorFirebase(e, 'Eliminar tratamiento paciente'); });
}

function renderTratPac() {
  var lista = document.getElementById('lista-trat-pac');
  if (!lista) return;

  var p = pacientesData[fichaActualKey];
  if (!p) return;

  // ── Migración automática de datos legacy ─────────────
  // Si tiene `tratamiento` string y no tiene `tratamientos`, migrar
  if (p.tratamiento && typeof p.tratamiento === 'string' && !p.tratamientos && !p.tratamientoMigrado) {
    migrarTratamientoLegacy(fichaActualKey);
    lista.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div>Migrando datos…</div>';
    return;
  }

  var trats = p.tratamientos || {};
  var keys = Object.keys(trats)
    .filter(function(k){ return !trats[k].eliminado; }); // ocultar soft-deleted

  if (!keys.length) {
    lista.innerHTML = '<div class="empty"><div class="empty-icon">💊</div>Sin tratamientos asociados — usá "+ Agregar"</div>';
    return;
  }

  // Ordenar por fecha descendente, sin fecha al final
  keys.sort(function(a,b) {
    var fa = trats[a].fecha || '0000';
    var fb = trats[b].fecha || '0000';
    return fb.localeCompare(fa);
  });

  lista.innerHTML = keys.map(function(k) {
    var t   = trats[k];
    var pf  = t.fecha ? parseFecha(t.fecha) : null;
    var fechaTxt = pf ? pf.d + '/' + String(pf.m+1).padStart(2,'0') + '/' + pf.y : '';
    var precioTxt = t.precio ? '$' + parseFloat(t.precio).toLocaleString('es-AR') : '';

    return '<div class="trat-pac-item">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
        '<div style="flex:1;min-width:0">' +
          '<div class="trat-pac-nombre">'+sanitize(t.nombre)+'</div>' +
          (fechaTxt || precioTxt ? '<div class="trat-pac-meta">' +
            (fechaTxt ? '📅 '+sanitize(fechaTxt)+'&nbsp;&nbsp;' : '') +
            (precioTxt ? '<span class="trat-pac-precio">'+sanitize(precioTxt)+'</span>' : '') +
          '</div>' : '') +
          (t.notas ? '<div class="trat-pac-notas">'+sanitize(t.notas)+'</div>' : '') +
        '</div>' +
      '</div>' +
      '<div class="trat-pac-actions">' +
        '<button class="act-btn btn-ficha" onclick="editarTratPac(\''+k+'\')">Editar</button>' +
        '<button class="act-btn btn-del"   onclick="eliminarTratPac(\''+k+'\')">Eliminar</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

// ═══════════════════════════════════════════════════════
// ── PAGO ANTICIPADO (en form de Nuevo turno) ──
// ═══════════════════════════════════════════════════════
function setPagoAnt(tipo) {
  pagoAntTipo = tipo;
  document.getElementById('pa-no').className      = 'pago-tipo-btn' + (tipo==='no'?' sel':'');
  document.getElementById('pa-parcial').className = 'pago-tipo-btn' + (tipo==='parcial'?' sel':'');
  document.getElementById('pa-total').className   = 'pago-tipo-btn' + (tipo==='total'?' sel':'');
  document.getElementById('pago-ant-detalle').style.display = (tipo==='no') ? 'none' : 'block';
  // Si es total, autocompletar el monto con el precio
  if (tipo === 'total' && precioActualTurno > 0) {
    document.getElementById('pa-monto').value = precioActualTurno;
  } else if (tipo === 'parcial') {
    document.getElementById('pa-monto').value = '';
  }
}

function setPagoAntMet(m) {
  pagoAntMetodo = m;
  var ids = { efectivo:'pa-met-ef', transferencia:'pa-met-tr', tarjeta:'pa-met-ta', mercadopago:'pa-met-mp', qr:'pa-met-qr' };
  Object.keys(ids).forEach(function(k){
    var el = document.getElementById(ids[k]);
    if (el) el.className = 'toggle-btn' + (m===k?' sel':'');
  });
}

function onTratSelected() {
  var key = document.getElementById('t-trat-sel').value;
  var libre = document.getElementById('t-trat-libre-wrap');
  var precioBox = document.getElementById('t-precio-auto');
  if (key === '__libre__') {
    libre.style.display = 'block';
    precioBox.className = 'precio-auto';
    precioActualTurno = 0;
  } else if (key && tratamientosData[key]) {
    libre.style.display = 'none';
    var tr = tratamientosData[key];
    precioActualTurno = parseFloat(tr.precio) || 0;
    document.getElementById('t-precio-valor').textContent = '$' + precioActualTurno.toLocaleString('es-AR');
    precioBox.className = 'precio-auto visible';
    // Si ya hay tipo "total" elegido, actualizar monto
    if (pagoAntTipo === 'total') document.getElementById('pa-monto').value = precioActualTurno;
  } else {
    libre.style.display = 'none';
    precioBox.className = 'precio-auto';
    precioActualTurno = 0;
  }
}

function poblarSelectTratamientos() {
  ['t-trat-sel','ed-trat-sel'].forEach(function(id){
    var sel = document.getElementById(id);
    if (!sel) return;
    var prevValue = sel.value;
    var keys = Object.keys(tratamientosData).sort(function(a,b){
      var A = tratamientosData[a], B = tratamientosData[b];
      var ca = (A.categoria||'').localeCompare(B.categoria||'');
      return ca !== 0 ? ca : (A.nombre||'').localeCompare(B.nombre||'');
    });
    var html = '<option value="">— Elegí un tratamiento —</option>';
    var catActual = '';
    keys.forEach(function(k){
      var t = tratamientosData[k];
      if (t.categoria !== catActual) {
        if (catActual) html += '</optgroup>';
        catActual = t.categoria || 'Otros';
        html += '<optgroup label="'+catActual+'">';
      }
      html += '<option value="'+k+'">'+t.nombre+' · $'+(parseFloat(t.precio)||0).toLocaleString('es-AR')+'</option>';
    });
    if (catActual) html += '</optgroup>';
    html += '<option value="__libre__">— Otro / personalizado —</option>';
    sel.innerHTML = html;
    if (prevValue) sel.value = prevValue;
  });
}

// ═══════════════════════════════════════════════════════
// ── PRECIOS / TRATAMIENTOS (CRUD) ──
// ═══════════════════════════════════════════════════════