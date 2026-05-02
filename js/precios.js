// ═══════════════════════════════════════════
// PRECIOS — Tratamientos y lista de precios
// ═══════════════════════════════════════════
function toggleFormTrat() {
  formTratVisible = !formTratVisible;
  if (!formTratVisible) tratEditKey = null;
  document.getElementById('form-trat').className = 'form-card' + (formTratVisible?' visible':'');
  document.getElementById('btn-nuevo-trat').className = 'btn-primary' + (formTratVisible?' active':'');
  document.getElementById('btn-nuevo-trat').textContent = formTratVisible ? '✕ Cerrar' : '+ Tratamiento';
  if (!formTratVisible) limpiarFormTrat();
}

function limpiarFormTrat() {
  ['tr-nombre','tr-precio','tr-duracion'].forEach(function(id){ document.getElementById(id).value=''; });
  document.getElementById('tr-err').className = 'err';
  document.getElementById('form-trat-title').textContent = 'Nuevo tratamiento';
  setTratCat('Rellenos');
  tratEditKey = null;
}

function setTratCat(c) {
  // Compatibilidad con valores legacy (guardados con espacio o categorías eliminadas)
  var mapLegacy = { 'Skin Quality': 'SkinQuality', 'Facial': 'Rellenos', 'Inyectables': 'Rellenos', 'Corporal': 'Otros' };
  if (mapLegacy[c]) c = mapLegacy[c];
  formTratCat = c;
  ['Rellenos','Hilos','Toxina','Enzimas','SkinQuality','Bioestimuladores','Otros'].forEach(function(x){
    var el = document.getElementById('trc-'+x);
    if (el) el.className = 'toggle-btn' + (x===c?' sel':'');
  });
}

function guardarTratamiento() {
  var nombre = document.getElementById('tr-nombre').value.trim();
  var precio = parseFloat(document.getElementById('tr-precio').value) || 0;
  var dur    = parseInt(document.getElementById('tr-duracion').value, 10) || 0;
  var err    = document.getElementById('tr-err');
  if (!nombre) { err.textContent='Ingresá el nombre.'; err.className='err visible'; return; }
  if (precio <= 0) { err.textContent='Ingresá un precio válido.'; err.className='err visible'; return; }
  err.className = 'err';
  var btn = document.getElementById('btn-save-trat');
  btn.disabled=true; btn.textContent='Guardando…';
  var data = { nombre: nombre, categoria: formTratCat, precio: precio, duracion: dur };
  var promesa = tratEditKey
    ? db.ref('tratamientos/'+tratEditKey).update(data)
    : db.ref('tratamientos').push(data);
  promesa.then(function(){
    btn.disabled=false; btn.textContent='Guardar tratamiento';
    toggleFormTrat();
  }).catch(function(){
    btn.disabled=false; btn.textContent='Guardar tratamiento';
    err.textContent='Error al guardar.'; err.className='err visible';
  });
}

function editarTratamiento(key) {
  var t = tratamientosData[key];
  if (!t) return;
  tratEditKey = key;
  document.getElementById('tr-nombre').value   = t.nombre || '';
  document.getElementById('tr-precio').value   = t.precio || '';
  document.getElementById('tr-duracion').value = t.duracion || '';
  setTratCat(t.categoria || 'Rellenos');
  document.getElementById('form-trat-title').textContent = 'Editar tratamiento';
  if (!formTratVisible) toggleFormTrat();
  document.getElementById('form-trat').scrollIntoView({behavior:'smooth', block:'center'});
}

function eliminarTratamiento(key) {
  var t = tratamientosData[key];
  var nombre = t ? t.nombre : 'tratamiento';
  if (!confirmarAccionCritica('tratamiento del catálogo', nombre)) return;
  softDelete(db.ref('tratamientos/'+key), 'Eliminado del catálogo')
    .catch(function(e){ manejarErrorFirebase(e, 'Eliminar tratamiento catálogo'); });
}

function setFiltroCatPrecios(c) {
  filtroCatPrecios = c;
  document.querySelectorAll('#cat-filter-precios .cat-pill').forEach(function(el){
    el.className = 'cat-pill' + (el.textContent.trim().toLowerCase() === (c==='todas'?'todas':c).toLowerCase() ? ' sel' : '');
  });
  renderPrecios();
}

function renderPrecios() {
  var lista = document.getElementById('lista-precios');
  if (!lista) return;
  var keys = Object.keys(tratamientosData)
    .filter(function(k){ return !tratamientosData[k].eliminado; }); // ocultar soft-deleted
  if (!keys.length) {
    lista.innerHTML = '<div class="empty"><div class="empty-icon">💎</div>Sin tratamientos cargados.<br><span style="font-size:12px">Usá el botón de abajo para cargar la lista de Áurea Clinic.</span></div>';
    return;
  }

  // Orden de categorías y columna donde aparecen
  var ORDEN_CAT = [
    { cat: 'Rellenos',         icon: '◇', titulo: 'Rellenos / Ácido Hialurónico', col: 0 },
    { cat: 'Hilos',            icon: '≠', titulo: 'Hilos',                         col: 0 },
    { cat: 'Toxina',           icon: '⬡', titulo: 'Toxina Botulínica',             col: 0 },
    { cat: 'Enzimas',          icon: '✦', titulo: 'Enzimas y Correctivos',         col: 0 },
    { cat: 'SkinQuality',      icon: '○', titulo: 'Skin Quality / Bioestimulación',col: 1 },
    { cat: 'Bioestimuladores', icon: '◈', titulo: 'Bioestimuladores',              col: 1 },
    { cat: 'Facial',           icon: '✧', titulo: 'Facial',                        col: 1 },
    { cat: 'Inyectables',      icon: '◇', titulo: 'Inyectables',                   col: 0 },
    { cat: 'Corporal',         icon: '⬡', titulo: 'Corporal',                      col: 1 },
    { cat: 'Otros',            icon: '·', titulo: 'Otros tratamientos',            col: 1 },
  ];

  // Agrupar por categoría
  // Mapeo de categorías legacy para compatibilidad con datos viejos
  var catLegacyMap = { 'Skin Quality': 'SkinQuality', 'Facial': 'Rellenos', 'Inyectables': 'Rellenos', 'Corporal': 'Otros' };
  var grupos = {};
  keys.forEach(function(k) {
    var t = tratamientosData[k];
    var cat = t.categoria || 'Otros';
    if (catLegacyMap[cat]) cat = catLegacyMap[cat];
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push({ key: k, t: t });
  });
  // Ordenar items dentro de cada grupo por nombre
  Object.keys(grupos).forEach(function(cat) {
    grupos[cat].sort(function(a,b){ return (a.t.nombre||'').localeCompare(b.t.nombre||''); });
  });

  // Determinar categorías presentes, mantener orden
  var catsPresentes = ORDEN_CAT.filter(function(c){ return grupos[c.cat] && grupos[c.cat].length; });
  // Categorías no en ORDEN_CAT
  Object.keys(grupos).forEach(function(cat){
    if (!ORDEN_CAT.find(function(c){ return c.cat===cat; })) {
      catsPresentes.push({ cat: cat, icon: '·', titulo: cat, col: 1 });
    }
  });

  var col0 = '', col1 = '';

  catsPresentes.forEach(function(cfg) {
    var items = grupos[cfg.cat];
    var secHTML = '<div class="precio-section">' +
      '<div class="precio-section-header">' +
        '<div class="precio-section-icon">'+cfg.icon+'</div>' +
        '<div class="precio-section-title">'+cfg.titulo+'</div>' +
      '</div>';

    items.forEach(function(item) {
      var precio = parseFloat(item.t.precio) || 0;
      var cuotas = Math.round(precio * 1.4);
      secHTML += '<div class="precio-item">' +
        '<div>' +
          '<div class="precio-item-name">'+item.t.nombre+'</div>' +
          (item.t.duracion ? '<div style="font-size:10px;color:var(--brown-soft);margin-top:2px">⏱ '+item.t.duracion+' min</div>' : '') +
          '<div class="precio-item-actions">' +
            '<button class="act-btn btn-ficha" onclick="editarTratamiento(\''+item.key+'\')" style="font-size:11px;padding:4px 10px">Editar</button>' +
            '<button class="act-btn btn-del"   onclick="eliminarTratamiento(\''+item.key+'\')" style="font-size:11px;padding:4px 10px">Eliminar</button>' +
          '</div>' +
        '</div>' +
        '<div class="precio-item-prices">' +
          (precio > 0 ? '<div class="precio-cash">$'+precio.toLocaleString('es-AR')+'<span class="precio-cash-label">Efectivo</span></div>' : '<div class="precio-cash" style="color:var(--brown-soft)">—</div>') +
          (precio > 0 ? '<div class="precio-cuotas">$'+cuotas.toLocaleString('es-AR')+'<span class="precio-cuotas-label">3 cuotas s/i</span></div>' : '') +
        '</div>' +
      '</div>';
    });

    secHTML += '</div>';
    if (cfg.col === 0) col0 += secHTML;
    else               col1 += secHTML;
  });

  lista.innerHTML =
    '<div class="precios-columns">' +
      '<div class="precios-col">' + (col0 || '') + '</div>' +
      '<div class="precios-col">' + (col1 || '') + '</div>' +
    '</div>' +
    '<div class="precio-footer-note">' +
      '<div class="precio-footer-item">' +
        '<span class="precio-footer-label">Efectivo</span>' +
        '<span class="precio-footer-value">Los valores indicados<br>corresponden a efectivo</span>' +
      '</div>' +
      '<div class="precio-footer-sep"></div>' +
      '<div class="precio-footer-item" style="text-align:right">' +
        '<span class="precio-footer-label">Tarjeta de crédito</span>' +
        '<span class="precio-footer-value">Hasta 3 cuotas<br>sin interés</span>' +
      '</div>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════
// ── MODAL EDICIÓN DE TURNO ──
// ═══════════════════════════════════════════════════════