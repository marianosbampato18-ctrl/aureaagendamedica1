// ═══════════════════════════════════════════
// UI — Helpers de interfaz
// Fix #2: sanitize() contra XSS
// Fix #13: limpiar timer calendario al cambiar panel
// ═══════════════════════════════════════════

// Fix #2: sanitizar todo dato que venga de Firebase antes de insertar en innerHTML
function sanitize(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\//g, '&#47;');
}

function showPanel(panel) {
  ['agenda','cal','fichas','caja','precios'].forEach(function(p) {
    var panEl = document.getElementById('panel-'+p);
    var tabEl = document.getElementById('tab-'+p);
    if (panEl) panEl.className = 'panel' + (p === panel ? ' active' : '');
    if (tabEl) tabEl.className = 'nav-tab'  + (p === panel ? ' active' : '');
  });
  var cont = document.querySelector('.container');
  if (cont) cont.classList.toggle('cal-visible', panel === 'cal');
  // Fix #13: limpiar timer del calendario cuando no está activo
  if (panel !== 'cal' && typeof calNowTimer !== 'undefined' && calNowTimer) {
    clearInterval(calNowTimer);
    calNowTimer = null;
  }
  if (panel === 'cal')     renderCal();
  if (panel === 'caja')    renderCaja();
  if (panel === 'precios') renderPrecios();
}

function setSyncBar(cls, txt) {
  var b = document.getElementById('sync-bar');
  if (b) { b.className = 'sync-bar ' + cls; b.textContent = txt; }
}
