// ═══════════════════════════════════════════
// MENU — Hamburguesa premium responsive
//
// Render dinámico de items, drawer en mobile y dropdown en desktop.
// Mantiene la lógica original: cada click llama a showPanel(key) — las
// claves internas (agenda, cal, fichas, caja, precios) NO se tocan.
//
// Para agregar un nuevo item, sumar UN objeto a MENU_ITEMS abajo.
// ═══════════════════════════════════════════

var MENU_ITEMS = [
  { key: 'agenda',  label: 'Lista',              icon: '📅' },
  { key: 'cal',     label: 'Calendario',         icon: '🗓' },
  { key: 'fichas',  label: 'Historias Clínicas', icon: '👤' },
  { key: 'caja',    label: 'Caja',               icon: '💰' },
  { key: 'precios', label: 'Precios',            icon: '💎' }
];

var _menuInitialized = false;

function _menuEls() {
  return {
    btn:     document.getElementById('menu-toggle'),
    panel:   document.getElementById('menu-panel'),
    overlay: document.getElementById('menu-overlay'),
    list:    document.getElementById('menu-list'),
    close:   document.getElementById('menu-close'),
    user:    document.getElementById('menu-footer-user')
  };
}

function _renderMenuItems() {
  var els = _menuEls();
  if (!els.list) return;
  els.list.innerHTML = '';
  MENU_ITEMS.forEach(function(it) {
    var li = document.createElement('li');
    li.setAttribute('role', 'none');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'menu-item';
    btn.id = 'menu-item-' + it.key;
    btn.setAttribute('role', 'menuitem');
    btn.setAttribute('data-key', it.key);
    btn.innerHTML =
      '<span class="menu-item-icon" aria-hidden="true">' + it.icon + '</span>' +
      '<span class="menu-item-label">' + it.label + '</span>';
    btn.addEventListener('click', function() {
      try { showPanel(it.key); } catch(e) {}
      closeMenu();
    });
    li.appendChild(btn);
    els.list.appendChild(li);
  });
}

function _syncActiveItem() {
  // Detectar el panel activo mirando los .panel.active del DOM, así no
  // dependemos de un estado paralelo.
  var activeKey = null;
  MENU_ITEMS.forEach(function(it) {
    var p = document.getElementById('panel-' + it.key);
    if (p && p.classList.contains('active')) activeKey = it.key;
  });
  MENU_ITEMS.forEach(function(it) {
    var el = document.getElementById('menu-item-' + it.key);
    if (!el) return;
    if (it.key === activeKey) el.classList.add('active');
    else el.classList.remove('active');
  });
}

function openMenu() {
  var els = _menuEls();
  if (!els.panel || !els.overlay) return;
  _syncActiveItem();
  // Refrescar usuario en el footer
  if (els.user && typeof usuarioActual !== 'undefined' && usuarioActual) {
    var nombre = usuarioActual.nombre || '';
    var rol    = usuarioActual.rol ? ' · ' + usuarioActual.rol : '';
    els.user.textContent = nombre + rol;
  }
  els.panel.classList.add('visible');
  els.overlay.classList.add('visible');
  els.panel.setAttribute('aria-hidden', 'false');
  els.overlay.setAttribute('aria-hidden', 'false');
  if (els.btn) {
    els.btn.classList.add('is-open');
    els.btn.setAttribute('aria-expanded', 'true');
    els.btn.setAttribute('aria-label', 'Cerrar menú');
  }
  document.body.classList.add('menu-open');
}

function closeMenu() {
  var els = _menuEls();
  if (!els.panel || !els.overlay) return;
  els.panel.classList.remove('visible');
  els.overlay.classList.remove('visible');
  els.panel.setAttribute('aria-hidden', 'true');
  els.overlay.setAttribute('aria-hidden', 'true');
  if (els.btn) {
    els.btn.classList.remove('is-open');
    els.btn.setAttribute('aria-expanded', 'false');
    els.btn.setAttribute('aria-label', 'Abrir menú');
  }
  document.body.classList.remove('menu-open');
}

function toggleMenu() {
  var p = document.getElementById('menu-panel');
  if (!p) return;
  if (p.classList.contains('visible')) closeMenu();
  else openMenu();
}

function initMenu() {
  if (_menuInitialized) return;
  var els = _menuEls();
  if (!els.btn || !els.panel || !els.overlay || !els.list) return;

  _renderMenuItems();
  _syncActiveItem();

  els.btn.addEventListener('click', function(e) {
    e.stopPropagation();
    toggleMenu();
  });
  if (els.close) els.close.addEventListener('click', closeMenu);
  els.overlay.addEventListener('click', closeMenu);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && els.panel.classList.contains('visible')) closeMenu();
  });

  // Mantener el item activo en sync cuando otra parte del código llama
  // showPanel() (por ej., el calendario que vuelve a la lista).
  if (typeof showPanel === 'function' && !showPanel.__menuPatched) {
    var _orig = showPanel;
    window.showPanel = function(p) {
      var r = _orig.apply(this, arguments);
      try { _syncActiveItem(); } catch(e) {}
      return r;
    };
    window.showPanel.__menuPatched = true;
  }

  _menuInitialized = true;
}

// Auto-init: el botón vive dentro de #app-screen, que arranca con
// display:none. Inicializamos cuando el DOM ya tiene los nodos
// (al final del orden de scripts).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMenu);
} else {
  initMenu();
}
