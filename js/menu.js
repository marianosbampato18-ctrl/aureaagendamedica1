// ═══════════════════════════════════════════
// MENU — Navegación sidebar desktop
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

// Renderiza TODOS los ítems siempre — la visibilidad se maneja por rol
function _renderSidebarItems() {
  var els = _sidebarEls();
  if (!els.nav) return;
  els.nav.innerHTML = '';
  MENU_ITEMS.forEach(function(it) {
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
      _handleNavClick(it.key);
    });
    li.appendChild(btn);
    els.nav.appendChild(li);
  });
}

// Click en nav: admin navega directo, recepcion ve prompt de contraseña
function _handleNavClick(key) {
  if (!usuarioActual) return;
  // Si puede ver el panel, navegar normalmente
  if (typeof usuarioPuede === 'function' && usuarioPuede(key)) {
    try { showPanel(key); } catch(e) {}
    return;
  }
  // Si no puede, pedir contraseña de admin
  var pass = prompt('Esta sección requiere contraseña de administrador:');
  if (!pass) return;
  // Verificar si algún usuario admin tiene esa contraseña
  var esAdmin = Object.keys(USUARIOS).some(function(email) {
    return USUARIOS[email].rol === 'admin' && USUARIOS[email].pass === pass;
  });
  if (esAdmin) {
    try { _showPanelSinFiltro(key); } catch(e) {}
  } else {
    alert('Contraseña incorrecta.');
  }
}

// Aplica visibilidad de ítems según el rol del usuario actual
function _applyRoleVisibility() {
  MENU_ITEMS.forEach(function(it) {
    var el = document.getElementById('aurea-sidebar-item-' + it.key);
    if (!el) return;
    // Sin usuario o si puede ver: mostrar normal
    // Si no puede ver: mostrar pero con indicador de bloqueo
    if (usuarioActual && typeof usuarioPuede === 'function' && !usuarioPuede(it.key)) {
      el.style.opacity = '0.5';
      el.title = 'Requiere contraseña de administrador';
    } else {
      el.style.opacity = '';
      el.title = '';
    }
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

// showPanel sin filtro de permisos (solo para acceso con contraseña admin)
var _showPanelSinFiltro = null;

function initMenu() {
  if (_menuInitialized) return;
  var els = _sidebarEls();
  if (!els.nav) return;

  _renderSidebarItems();
  _refreshSidebarUser();
  _syncActiveItem();
  _applyRoleVisibility();

  // Guardar referencia al showPanel original antes de parcharlo
  if (typeof showPanel === 'function') {
    _showPanelSinFiltro = showPanel;
  }

  // Parchamos showPanel para mantener el sync del ítem activo
  if (typeof showPanel === 'function' && !showPanel.__menuPatched) {
    var _orig = showPanel;
    window.showPanel = function(p) {
      var r = _orig.apply(this, arguments);
      try { _syncActiveItem(); } catch(e) {}
      try { _refreshSidebarUser(); } catch(e) {}
      return r;
    };
    window.showPanel.__menuPatched = true;
    _showPanelSinFiltro = _orig; // apuntar al original, no al parche
  }

  // Aplicar visibilidad de rol después de cada login
  if (typeof _entrarApp === 'function' && !_entrarApp.__menuPatched) {
    var _origEntrar = _entrarApp;
    window._entrarApp = function() {
      var r = _origEntrar.apply(this, arguments);
      try { _applyRoleVisibility(); } catch(e) {}
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
