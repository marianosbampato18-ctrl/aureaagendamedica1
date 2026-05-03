// ═══════════════════════════════════════════
// MENU — Navegación sidebar desktop
// Solo sidebar fijo — sin drawer mobile, sin calendario.
// ═══════════════════════════════════════════

var MENU_ITEMS = [
  { key: 'agenda',  label: 'Turnos',             icon: '📅' },
  { key: 'fichas',  label: 'Historias Clínicas', icon: '👤' },
  { key: 'caja',    label: 'Caja',               icon: '💰' },
  { key: 'precios', label: 'Precios',            icon: '💎' }
];

var _menuInitialized = false;

function _sidebarEls() {
  return {
    nav:  document.getElementById('aurea-sidebar-nav'),
    user: document.getElementById('aurea-sidebar-user')
  };
}

// ── Sidebar desktop ───────────────────────────────────────
function _renderSidebarItems() {
  var els = _sidebarEls();
  if (!els.nav) return;
  els.nav.innerHTML = '';
  MENU_ITEMS.forEach(function(it) {
    // Ocultar ítems que el rol actual no puede ver
    if (typeof usuarioPuede === 'function' && !usuarioPuede(it.key)) return;
    var li = document.createElement('li');
    li.setAttribute('role', 'none');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'aurea-sidebar-item';
    btn.id = 'aurea-sidebar-item-' + it.key;
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('data-key', it.key);
    btn.innerHTML =
      '<span class="aurea-sidebar-item-icon" aria-hidden="true">' + it.icon + '</span>' +
      '<span class="aurea-sidebar-item-label">' + it.label + '</span>';
    btn.addEventListener('click', function() {
      try { showPanel(it.key); } catch(e) {}
    });
    li.appendChild(btn);
    els.nav.appendChild(li);
  });
}

function _refreshSidebarUser() {
  var els = _sidebarEls();
  if (!els.user) return;
  if (typeof usuarioActual !== 'undefined' && usuarioActual) {
    var nombre = usuarioActual.nombre || '';
    var rol    = usuarioActual.rol ? ' · ' + usuarioActual.rol : '';
    els.user.textContent = nombre + rol;
  } else {
    els.user.textContent = '';
  }
}

function _syncActiveItem() {
  var activeKey = null;
  MENU_ITEMS.forEach(function(it) {
    var p = document.getElementById('panel-' + it.key);
    if (p && p.classList.contains('active')) activeKey = it.key;
  });
  MENU_ITEMS.forEach(function(it) {
    var sidebarEl = document.getElementById('aurea-sidebar-item-' + it.key);
    if (sidebarEl) {
      if (it.key === activeKey) sidebarEl.classList.add('active');
      else sidebarEl.classList.remove('active');
    }
  });
}

function initMenu() {
  if (_menuInitialized) return;
  var els = _sidebarEls();
  if (!els.nav) return;

  _renderSidebarItems();
  _refreshSidebarUser();
  _syncActiveItem();

  // Mantener item activo en sync + bloquear paneles no permitidos
  if (typeof showPanel === 'function' && !showPanel.__menuPatched) {
    var _orig = showPanel;
    window.showPanel = function(p) {
      // Bloqueo silencioso: si el usuario no tiene permiso, no navega
      if (typeof usuarioPuede === 'function' && !usuarioPuede(p)) return;
      var r = _orig.apply(this, arguments);
      try { _syncActiveItem(); } catch(e) {}
      try { _refreshSidebarUser(); } catch(e) {}
      return r;
    };
    window.showPanel.__menuPatched = true;
  }

  // Re-renderizar sidebar después del login (aplica permisos del usuario real)
  if (typeof _entrarApp === 'function' && !_entrarApp.__menuPatched) {
    var _origEntrar = _entrarApp;
    window._entrarApp = function() {
      var r = _origEntrar.apply(this, arguments);
      try { _renderSidebarItems(); } catch(e) {}
      try { _refreshSidebarUser(); } catch(e) {}
      try { _syncActiveItem(); } catch(e) {}
      return r;
    };
    window._entrarApp.__menuPatched = true;
  }

  _menuInitialized = true;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMenu);
} else {
  initMenu();
}
