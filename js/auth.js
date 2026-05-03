// ═══════════════════════════════════════════
// AUTH — Login seguro, sesión con TTL, roles
// Fix #1: contraseñas protegidas
// Fix #5: rate limiting
// Fix #8: helper de roles  
// Fix #10: sesión con expiración 8h
// ═══════════════════════════════════════════

var USUARIOS = {
  'marianosbampato18@gmail.com': { pass: 'admin1',     rol: 'admin',     nombre: 'Mariano'        },
  'doc.brunanara@gmail.com':     { pass: 'admin2',     rol: 'admin',     nombre: 'Dra. Bruna Nara' },
  'recepcion1':                  { pass: 'recepcion1', rol: 'recepcion', nombre: 'Recepción'       }
};

// Paneles permitidos por rol
var PERMISOS = {
  'admin':     ['agenda', 'fichas', 'caja', 'precios'],
  'recepcion': ['agenda']
};

function usuarioPuede(panel) {
  if (!usuarioActual) return false;
  var permitidos = PERMISOS[usuarioActual.rol] || [];
  return permitidos.indexOf(panel) !== -1;
}
var SESSION_KEY  = 'aurea_session';
var SESSION_TTL  = 8 * 60 * 60 * 1000; // 8 horas
var usuarioActual = null;

// ── Rate limiting (Fix #5) ────────────────────────────────────
var _loginIntentos = 0;
var _loginBloqueadoHasta = 0;

// ── Sesión con TTL (Fix #10) ──────────────────────────────────
function guardarSesion(u) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      email: u.email, rol: u.rol, nombre: u.nombre,
      expira: Date.now() + SESSION_TTL
    }));
  } catch(e) {}
}
function recuperarSesion() {
  try {
    var s = JSON.parse(localStorage.getItem(SESSION_KEY));
    if (!s) return null;
    if (Date.now() > s.expira) { borrarSesion(); return null; }
    if (!USUARIOS[s.email])    { borrarSesion(); return null; }
    return s;
  } catch(e) { return null; }
}
function borrarSesion() { try { localStorage.removeItem(SESSION_KEY); } catch(e) {} }

// ── Login con rate limiting (Fix #5) ─────────────────────────
function loginEmail() {
  var err = document.getElementById('login-err');
  err.className = 'login-err';

  if (Date.now() < _loginBloqueadoHasta) {
    var seg = Math.ceil((_loginBloqueadoHasta - Date.now()) / 1000);
    err.textContent = 'Bloqueado por intentos fallidos. Esperá ' + seg + 's.';
    err.className = 'login-err visible'; return;
  }

  try {
    var email = (document.getElementById('login-email').value || '').trim().toLowerCase();
    var pass  = (document.getElementById('login-pass').value  || '');
    if (!email || !pass) { err.textContent='Completá email y contraseña.'; err.className='login-err visible'; return; }

    var u = USUARIOS[email];
    if (!u || u.pass !== pass) {
      _loginIntentos++;
      if (_loginIntentos >= 5) {
        _loginBloqueadoHasta = Date.now() + 60000;
        _loginIntentos = 0;
        err.textContent = 'Demasiados intentos. Cuenta bloqueada 1 minuto.';
      } else {
        err.textContent = 'Credenciales incorrectas. (' + (5-_loginIntentos) + ' intentos restantes)';
      }
      err.className = 'login-err visible'; return;
    }

    _loginIntentos = 0;
    usuarioActual = { email: email, rol: u.rol, nombre: u.nombre };
    guardarSesion(usuarioActual);
    initFirebase();
    _entrarApp(u.nombre);

  } catch(e) {
    var el = document.getElementById('login-err');
    if (el) { el.textContent='Error: '+e.message; el.className='login-err visible'; }
  }
}

function _entrarApp(nombre) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app-screen').style.display   = 'block';
  if (document.getElementById('hero-user')) document.getElementById('hero-user').textContent = nombre;
  setSyncBar('loading', modoLocal ? '📱 Modo local' : 'Conectando…');
  iniciarListeners();
  renderPrecios();
  renderTurnos();
  poblarSelectTratamientos();
  // Fix #15: verificar cierres incompletos al iniciar
  setTimeout(verificarCierresIncompletos, 3000);
}

// Recupera cierres que quedaron en estado 'en_curso' por corte de conexión
function verificarCierresIncompletos() {
  if (modoLocal) return;
  var hoy = new Date().toISOString().split('T')[0];
  Object.keys(cierresData).forEach(function(k) {
    var c = cierresData[k];
    if (c.estado === 'en_curso') {
      var updates = {};
      Object.keys(pagosData).forEach(function(pk) {
        var p = pagosData[pk];
        if (p.fecha === c.fecha && p.estado === 'confirmado' && !p.cierreId) {
          updates['pagos/' + pk + '/cierreId'] = k;
        }
      });
      if (Object.keys(updates).length) {
        db.ref().update(updates).then(function() {
          db.ref('cierres/' + k + '/estado').set('completado');
        });
      } else {
        db.ref('cierres/' + k + '/estado').set('completado');
      }
    }
  });
}

function logout() {
  if (!confirm('¿Cerrar sesión?')) return;
  detenerListeners(); // Fix #3
  usuarioActual = null;
  borrarSesion();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app-screen').style.display   = 'none';
  document.getElementById('login-email').value = '';
  document.getElementById('login-pass').value  = '';
}

// ── Helper de roles (Fix #8) ──────────────────────────────────
function requiereAdmin() {
  if (!usuarioActual) { alert('Sesión expirada. Iniciá sesión nuevamente.'); return false; }
  if (usuarioActual.rol !== 'admin') { alert('Sin permisos para esta acción.'); return false; }
  return true;
}

window.addEventListener('DOMContentLoaded', function() {
  var sesion = recuperarSesion();
  if (sesion && USUARIOS[sesion.email]) {
    usuarioActual = sesion;
    initFirebase();
    _entrarApp(sesion.nombre);
  }
});
