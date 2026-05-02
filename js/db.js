// ═══════════════════════════════════════════
// DB — Firebase listeners
// Fix #3: listeners con .off() + detenerListeners()
// Fix #6: debounce en renders
// Fix #7: onChild* en vez de onValue (turnos/pacientes)
// ═══════════════════════════════════════════

var _activeListeners = []; // Fix #3: guardar referencias para .off()

// ── Debounce (Fix #6) ─────────────────────────────────────────
var _renderTimers = {};
function debouncedRender(fn, key) {
  if (_renderTimers[key]) clearTimeout(_renderTimers[key]);
  _renderTimers[key] = setTimeout(fn, 80);
}

// ── Detener todos los listeners (Fix #3) ──────────────────────
function detenerListeners() {
  _activeListeners.forEach(function(item) {
    try { item.ref.off(item.event, item.handler); } catch(e) {}
  });
  _activeListeners = [];
}

function _addListener(ref, event, handler) {
  ref.on(event, handler);
  _activeListeners.push({ ref: ref, event: event, handler: handler });
  return handler;
}

// ── Iniciar listeners ─────────────────────────────────────────
function iniciarListeners() {
  detenerListeners(); // siempre limpiar antes de registrar nuevos

  // Barra de conexión — se actualiza aunque la DB esté vacía
  db.ref('.info/connected').on('value', function(snap) {
    if (snap.val() === true) {
      // Dar 1.5s para que lleguen los datos iniciales; si no llegan (DB vacía) igual mostrar OK
      setTimeout(function() {
        var b = document.getElementById('sync-bar');
        if (b && b.className.indexOf('loading') !== -1) {
          setSyncBar('ok', '✦ Sincronizado');
        }
      }, 1500);
    } else {
      setSyncBar('error', '⚠ Sin conexión');
    }
  });

  // TURNOS — onChild* con query de fecha (Fix #7)
  var hace90 = new Date(); hace90.setDate(hace90.getDate()-90);
  var hace90str = hace90.toISOString().split('T')[0];
  var turnosRef = db.ref('turnos').orderByChild('fecha').startAt(hace90str);

  _addListener(turnosRef, 'child_added', function(snap) {
    turnosData[snap.key] = snap.val();
    setSyncBar('ok', '✦ Sincronizado');
    debouncedRender(renderTurnos, 'turnos');
  });
  _addListener(turnosRef, 'child_changed', function(snap) {
    turnosData[snap.key] = snap.val();
    debouncedRender(renderTurnos, 'turnos');
  });
  _addListener(turnosRef, 'child_removed', function(snap) {
    delete turnosData[snap.key];
    debouncedRender(renderTurnos, 'turnos');
  });

  // PACIENTES — onChild* (Fix #7)
  var pacRef = db.ref('pacientes');
  _addListener(pacRef, 'child_added', function(snap) {
    pacientesData[snap.key] = snap.val();
    document.getElementById('m-pac').textContent = Object.keys(pacientesData).length;
    debouncedRender(renderPacientes, 'pacientes');
  });
  _addListener(pacRef, 'child_changed', function(snap) {
    pacientesData[snap.key] = snap.val();
    debouncedRender(renderPacientes, 'pacientes');
    // Actualizar ficha abierta si coincide
    if (fichaActualKey === snap.key) {
      var p = snap.val();
      if (document.getElementById('fd-nombre')) document.getElementById('fd-nombre').textContent = p.nombre||'';
    }
  });
  _addListener(pacRef, 'child_removed', function(snap) {
    delete pacientesData[snap.key];
    document.getElementById('m-pac').textContent = Object.keys(pacientesData).length;
    debouncedRender(renderPacientes, 'pacientes');
  });

  // VENTAS/PAGOS/CIERRES — onValue (colecciones más pequeñas)
  var ventasRef = db.ref('ventas');
  _addListener(ventasRef, 'value', function(snap) {
    ventasData = snap.val() || {};
    debouncedRender(renderCaja, 'caja');
    debouncedRender(renderTurnos, 'turnos');
  });

  var pagosRef = db.ref('pagos');
  _addListener(pagosRef, 'value', function(snap) {
    pagosData = snap.val() || {};
    debouncedRender(renderCaja, 'caja');
    debouncedRender(renderTurnos, 'turnos');
  });

  var cierresRef = db.ref('cierres');
  _addListener(cierresRef, 'value', function(snap) {
    cierresData = snap.val() || {};
    debouncedRender(renderCaja, 'caja');
  });

  // TRATAMIENTOS — once + child*
  db.ref('tratamientos').once('value', function(snap) {
    var fbData = snap.val();
    if (fbData) tratamientosData = fbData;
    renderPrecios();
    poblarSelectTratamientos();
  });
  var tratRef = db.ref('tratamientos');
  _addListener(tratRef, 'child_added',   function(snap) { tratamientosData[snap.key]=snap.val(); poblarSelectTratamientos(); debouncedRender(renderPrecios,'precios'); });
  _addListener(tratRef, 'child_changed', function(snap) { tratamientosData[snap.key]=snap.val(); poblarSelectTratamientos(); debouncedRender(renderPrecios,'precios'); });
  _addListener(tratRef, 'child_removed', function(snap) { delete tratamientosData[snap.key];     poblarSelectTratamientos(); debouncedRender(renderPrecios,'precios'); });
}

// ── SEED ──────────────────────────────────────────────────────
function tratamientosSeed() {
  return [
    { nombre: '1 Jeringa',   categoria: 'Rellenos', precio: 180000, duracion: 45 },
    { nombre: '½ Jeringa',   categoria: 'Rellenos', precio: 105000, duracion: 30 },
    { nombre: 'Espiculados x4',  categoria: 'Hilos', precio: 270000, duracion: 60 },
    { nombre: 'Espiculados x8',  categoria: 'Hilos', precio: 480000, duracion: 90 },
    { nombre: 'Lisos x10',       categoria: 'Hilos', precio: 260000, duracion: 60 },
    { nombre: 'Toxina Superior (X / DYSP / BTX)', categoria: 'Toxina', precio: 220000, duracion: 30 },
    { nombre: 'Toxina por Zona',    categoria: 'Toxina', precio: 105000, duracion: 20 },
    { nombre: 'Toxina por Unidad',  categoria: 'Toxina', precio:  15000, duracion: 15 },
    { nombre: 'Bruxismo',           categoria: 'Toxina', precio: 220000, duracion: 30 },
    { nombre: 'Toxina Full',        categoria: 'Toxina', precio: 450000, duracion: 60 },
    { nombre: 'Enzimas x3',      categoria: 'Enzimas', precio: 270000, duracion: 45 },
    { nombre: 'Enzimas x4',      categoria: 'Enzimas', precio: 330000, duracion: 60 },
    { nombre: 'Hialuronidasa',   categoria: 'Enzimas', precio: 110000, duracion: 30 },
    { nombre: 'Long Lasting',          categoria: 'SkinQuality', precio: 440000, duracion: 45 },
    { nombre: 'NCTF (3ml)',            categoria: 'SkinQuality', precio: 360000, duracion: 45 },
    { nombre: 'HarmonyCa (Promo)',     categoria: 'SkinQuality', precio: 340000, duracion: 45 },
    { nombre: 'Plasma',                categoria: 'SkinQuality', precio: 120000, duracion: 60 },
    { nombre: 'Profhilo',              categoria: 'SkinQuality', precio: 440000, duracion: 45 },
    { nombre: 'Cellbooster',           categoria: 'SkinQuality', precio: 200000, duracion: 45 },
    { nombre: 'Radiesse',              categoria: 'Bioestimuladores', precio: 370000, duracion: 60 },
    { nombre: 'Sculptra',              categoria: 'Bioestimuladores', precio: 440000, duracion: 60 },
    { nombre: 'Ellansé',               categoria: 'Bioestimuladores', precio: 400000, duracion: 60 },
    { nombre: 'Ellansé x2 jeringas',   categoria: 'Bioestimuladores', precio: 790000, duracion: 90 },
  ];
}

function cargarTratamientosPorDefecto() {
  if (!confirm('¿Cargar la lista por defecto?')) return;
  var seed = tratamientosSeed();
  var existentes = Object.keys(tratamientosData).map(function(k){ return (tratamientosData[k].nombre||'').toLowerCase(); });
  var promesas = seed
    .filter(function(t){ return existentes.indexOf(t.nombre.toLowerCase()) === -1; })
    .map(function(t){ return db.ref('tratamientos').push(t); });
  Promise.all(promesas).then(function(){ alert('Cargados ' + promesas.length + ' tratamientos.'); });
}

