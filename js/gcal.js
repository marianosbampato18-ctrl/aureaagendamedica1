// ═══════════════════════════════════════════
// GCAL — Integración Google Calendar
// Sincronización robusta: Sistema → Google Calendar (Dra. Bruna)
// ═══════════════════════════════════════════

var GCAL_CLIENT_ID = '597964526769-fva6hh7emdv234dkgt67jdtcvtp910du.apps.googleusercontent.com';
var GCAL_SCOPE     = 'https://www.googleapis.com/auth/calendar.events';
var GCAL_API       = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
var GCAL_HINT      = 'doc.brunanara@gmail.com';

var _gcalToken       = null;
var _gcalTokenClient = null;
var _gcalConectado   = false;
var _gcalPendientes  = []; // callbacks esperando token

// ── Inicialización ────────────────────────────────────────
function gcalInit() {
  if (typeof google === 'undefined' || !google.accounts) {
    setTimeout(gcalInit, 500);
    return;
  }
  _gcalTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GCAL_CLIENT_ID,
    scope:     GCAL_SCOPE,
    hint:      GCAL_HINT,
    callback:  function(response) {
      if (response.error) {
        console.warn('GCal auth error:', response.error);
        _gcalToken = null;
        _gcalConectado = false;
        _gcalActualizarUI('desconectado');
        return;
      }
      _gcalToken     = response.access_token;
      _gcalConectado = true;
      _gcalActualizarUI('conectado');
      // Ejecutar todo lo que estaba esperando el token
      var cbs = _gcalPendientes.splice(0);
      cbs.forEach(function(cb){ try { cb(); } catch(e){} });
    }
  });
  _gcalActualizarUI('desconectado');
}

// ── Asegurar token válido antes de cada llamada ────────────
function _gcalEnsureToken(callback) {
  if (_gcalConectado && _gcalToken) {
    callback();
    return;
  }
  if (!_gcalTokenClient) return;
  _gcalPendientes.push(callback);
  // Intento silencioso primero, si falla el usuario verá el botón desconectado
  _gcalTokenClient.requestAccessToken({ prompt: '' });
}

// ── Manejar error 401 (token expirado) ────────────────────
function _gcalHandleError(data) {
  if (data && data.error) {
    console.warn('GCal API error:', data.error.message);
    if (data.error.code === 401) {
      _gcalToken = null;
      _gcalConectado = false;
      _gcalActualizarUI('desconectado');
    }
    return true;
  }
  return false;
}

// ── Conectar / desconectar ─────────────────────────────────
function gcalConectar() {
  if (!_gcalTokenClient) { gcalInit(); setTimeout(gcalConectar, 600); return; }
  if (_gcalConectado) {
    if (!confirm('¿Desconectar Google Calendar?')) return;
    gcalDesconectar();
  } else {
    _gcalActualizarUI('conectando');
    _gcalTokenClient.requestAccessToken({ prompt: 'select_account' });
  }
}

function gcalDesconectar() {
  if (_gcalToken) {
    try { google.accounts.oauth2.revoke(_gcalToken, function(){}); } catch(e) {}
  }
  _gcalToken = null;
  _gcalConectado = false;
  _gcalActualizarUI('desconectado');
}

// ── UI del botón ───────────────────────────────────────────
function _gcalActualizarUI(estado) {
  var btn = document.getElementById('gcal-btn');
  if (!btn) return;
  if (estado === 'conectado') {
    btn.innerHTML = '<span style="font-size:13px">📅</span> Google Calendar <span style="color:#4CAF50;font-weight:700">✓</span>';
    btn.title = 'Conectado como Dra. Bruna · clic para desconectar';
    btn.style.opacity = '1';
  } else if (estado === 'conectando') {
    btn.innerHTML = '<span style="font-size:13px">📅</span> Conectando...';
    btn.style.opacity = '0.7';
  } else {
    btn.innerHTML = '<span style="font-size:13px">📅</span> Conectar Google Calendar';
    btn.title = 'Conectar con cuenta de la Dra. Bruna para sincronizar turnos';
    btn.style.opacity = '1';
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
  if (turno.precio)   desc.push('💰 $' + Number(turno.precio).toLocaleString('es-AR'));
  if (turno.notas)    desc.push('📝 ' + turno.notas);
  return {
    summary:     titulo,
    description: desc.join('\n'),
    start: { dateTime: inicio, timeZone: 'America/Argentina/Buenos_Aires' },
    end:   { dateTime: fin,    timeZone: 'America/Argentina/Buenos_Aires' }
  };
}

// ── Crear evento ───────────────────────────────────────────
function gcalCrearEvento(turnoKey, turno) {
  _gcalEnsureToken(function() {
    fetch(GCAL_API, {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + _gcalToken, 'Content-Type': 'application/json' },
      body:    JSON.stringify(_gcalEventoDesde(turno))
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      if (_gcalHandleError(data)) return;
      if (data.id && db) {
        db.ref('turnos/' + turnoKey + '/gcalEventId').set(data.id);
      }
    })
    .catch(function(e){ console.warn('GCal crear:', e); });
  });
}

// ── Actualizar evento (o crear si no existe) ───────────────
function gcalActualizarEvento(turnoKey, turno) {
  if (!turno.gcalEventId) {
    gcalCrearEvento(turnoKey, turno);
    return;
  }
  _gcalEnsureToken(function() {
    fetch(GCAL_API + '/' + turno.gcalEventId, {
      method:  'PUT',
      headers: { 'Authorization': 'Bearer ' + _gcalToken, 'Content-Type': 'application/json' },
      body:    JSON.stringify(_gcalEventoDesde(turno))
    })
    .then(function(r){ return r.json(); })
    .then(function(data){ _gcalHandleError(data); })
    .catch(function(e){ console.warn('GCal actualizar:', e); });
  });
}

// ── Eliminar evento ────────────────────────────────────────
function gcalEliminarEvento(turnoKey, turno) {
  if (!turno.gcalEventId) return;
  _gcalEnsureToken(function() {
    fetch(GCAL_API + '/' + turno.gcalEventId, {
      method:  'DELETE',
      headers: { 'Authorization': 'Bearer ' + _gcalToken }
    })
    .catch(function(e){ console.warn('GCal eliminar:', e); });
  });
}

// ── Auto-init ─────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', gcalInit);
} else {
  gcalInit();
}
