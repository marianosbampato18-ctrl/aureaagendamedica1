// ═══════════════════════════════════════════
// GCAL — Integración Google Calendar
// Sincronización unidireccional: Sistema → Google Calendar
// ═══════════════════════════════════════════

var GCAL_CLIENT_ID = '898433681770-fbifom7fkjs21dms4dmsajkqn5p2kp8q.apps.googleusercontent.com';
var GCAL_SCOPE     = 'https://www.googleapis.com/auth/calendar.events';
var GCAL_API       = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

var _gcalToken       = null;
var _gcalTokenClient = null;
var _gcalConectado   = false;

// ── Inicialización ────────────────────────────────────────
function gcalInit() {
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(gcalInit, 500); // esperar a que cargue la librería
    return;
  }
  _gcalTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GCAL_CLIENT_ID,
    scope:     GCAL_SCOPE,
    callback:  function(response) {
      if (response.error) {
        console.warn('GCal auth error:', response.error);
        _gcalActualizarUI(false);
        return;
      }
      _gcalToken     = response.access_token;
      _gcalConectado = true;
      _gcalActualizarUI(true);
      localStorage.setItem('gcal_connected', '1');
    }
  });

  // Reconectar automáticamente si ya estaba conectado
  if (localStorage.getItem('gcal_connected') === '1') {
    _gcalTokenClient.requestAccessToken({ prompt: '' });
  }
}

// ── Conectar / desconectar ─────────────────────────────────
function gcalConectar() {
  if (!_gcalTokenClient) { gcalInit(); setTimeout(gcalConectar, 600); return; }
  if (_gcalConectado) {
    if (!confirm('¿Desconectar Google Calendar?')) return;
    gcalDesconectar();
  } else {
    _gcalTokenClient.requestAccessToken({ prompt: 'consent' });
  }
}

function gcalDesconectar() {
  if (_gcalToken) {
    try { google.accounts.oauth2.revoke(_gcalToken, function(){}); } catch(e) {}
  }
  _gcalToken     = null;
  _gcalConectado = false;
  localStorage.removeItem('gcal_connected');
  _gcalActualizarUI(false);
}

// ── UI del botón ───────────────────────────────────────────
function _gcalActualizarUI(conectado) {
  var btn = document.getElementById('gcal-btn');
  if (!btn) return;
  if (conectado) {
    btn.innerHTML = '<span style="font-size:13px">📅</span> Google Calendar <span style="color:#4CAF50;font-weight:700">✓</span>';
    btn.title = 'Google Calendar conectado · clic para desconectar';
  } else {
    btn.innerHTML = '<span style="font-size:13px">📅</span> Conectar Google Calendar';
    btn.title = 'Conectar con Google Calendar';
  }
}

// ── Construir evento desde turno ───────────────────────────
function _gcalEventoDesde(turno) {
  var fecha = turno.fecha || new Date().toISOString().split('T')[0];
  var hora  = turno.hora  || '09:00';
  var partes = hora.split(':');
  var hh = parseInt(partes[0]) || 9;
  var mm = parseInt(partes[1]) || 0;
  var hhFin = hh + 1 > 23 ? 23 : hh + 1;

  var pad = function(n){ return String(n).padStart(2,'0'); };
  var inicio = fecha + 'T' + pad(hh) + ':' + pad(mm) + ':00';
  var fin    = fecha + 'T' + pad(hhFin) + ':' + pad(mm) + ':00';

  var titulo = (turno.paciente || 'Paciente') + ' — ' + (turno.tratamiento || 'Consulta');

  var desc = [];
  if (turno.telefono) desc.push('📞 ' + turno.telefono);
  if (turno.dni)      desc.push('DNI: ' + turno.dni);
  if (turno.notas)    desc.push('📝 ' + turno.notas);

  return {
    summary:     titulo,
    description: desc.join('\n'),
    start: { dateTime: inicio, timeZone: 'America/Argentina/Buenos_Aires' },
    end:   { dateTime: fin,    timeZone: 'America/Argentina/Buenos_Aires' }
  };
}

// ── Crear evento en Google Calendar ───────────────────────
function gcalCrearEvento(turnoKey, turno) {
  if (!_gcalConectado || !_gcalToken) return;
  fetch(GCAL_API, {
    method:  'POST',
    headers: {
      'Authorization': 'Bearer ' + _gcalToken,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(_gcalEventoDesde(turno))
  })
  .then(function(r){ return r.json(); })
  .then(function(data){
    if (data.id && db) {
      db.ref('turnos/' + turnoKey + '/gcalEventId').set(data.id);
    }
  })
  .catch(function(e){ console.warn('GCal crear:', e); });
}

// ── Actualizar evento existente ────────────────────────────
function gcalActualizarEvento(turnoKey, turno) {
  if (!_gcalConectado || !_gcalToken || !turno.gcalEventId) return;
  fetch(GCAL_API + '/' + turno.gcalEventId, {
    method:  'PUT',
    headers: {
      'Authorization': 'Bearer ' + _gcalToken,
      'Content-Type':  'application/json'
    },
    body: JSON.stringify(_gcalEventoDesde(turno))
  })
  .catch(function(e){ console.warn('GCal actualizar:', e); });
}

// ── Eliminar evento (turno cancelado) ─────────────────────
function gcalEliminarEvento(turnoKey, turno) {
  if (!_gcalConectado || !_gcalToken || !turno.gcalEventId) return;
  fetch(GCAL_API + '/' + turno.gcalEventId, {
    method:  'DELETE',
    headers: { 'Authorization': 'Bearer ' + _gcalToken }
  })
  .catch(function(e){ console.warn('GCal eliminar:', e); });
}

// ── Auto-init cuando carga el DOM ─────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', gcalInit);
} else {
  gcalInit();
}
