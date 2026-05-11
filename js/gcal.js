// ═══════════════════════════════════════════
// GCAL — Sincronización Google Calendar vía Apps Script
// Backend permanente con credenciales de la Dra. Bruna
// Usa GET para evitar problemas de CORS — funciona desde cualquier dispositivo
// ═══════════════════════════════════════════

var GCAL_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbw_O5yjcKRh1n0cepHmI3pH1RUWo0MGnMoYSooUzH17tm6wd1ZuY2ORBmGifqbVYV_7/exec';

// ── Construir payload desde turno ─────────────────────────
function _gcalPayload(turno) {
  var fecha = turno.fecha || new Date().toISOString().split('T')[0];
  var hora  = turno.hora  || '09:00';
  var partes = hora.split(':');
  var hh = parseInt(partes[0]) || 9;
  var mm = parseInt(partes[1]) || 0;
  var hhFin = hh + 1 > 23 ? 23 : hh + 1;
  var pad = function(n){ return String(n).padStart(2,'0'); };
  var inicio = fecha + 'T' + pad(hh) + ':' + pad(mm) + ':00-03:00';
  var fin    = fecha + 'T' + pad(hhFin) + ':' + pad(mm) + ':00-03:00';
  var titulo = (turno.paciente || 'Paciente') + ' — ' + (turno.tratamiento || 'Consulta');
  var desc = [];
  if (turno.telefono) desc.push('📞 ' + turno.telefono);
  if (turno.dni)      desc.push('DNI: ' + turno.dni);
  if (turno.precio)   desc.push('💰 $' + Number(turno.precio).toLocaleString('es-AR'));
  if (turno.notas)    desc.push('📝 ' + turno.notas);
  return {
    titulo:      titulo,
    inicio:      inicio,
    fin:         fin,
    descripcion: desc.join('\n')
  };
}

// ── Llamada GET al backend (sin CORS issues) ───────────────
function _gcalGet(data, onSuccess) {
  var url = GCAL_SCRIPT_URL + '?d=' + encodeURIComponent(JSON.stringify(data));
  fetch(url)
    .then(function(r){ return r.json(); })
    .then(function(resp){
      if (onSuccess) onSuccess(resp);
    })
    .catch(function(e){ console.warn('GCal sync error:', e); });
}

// ── Crear evento ───────────────────────────────────────────
function gcalCrearEvento(turnoKey, turno) {
  var payload = _gcalPayload(turno);
  payload.action = 'create';
  _gcalGet(payload, function(resp) {
    if (resp && resp.id && db) {
      db.ref('turnos/' + turnoKey + '/gcalEventId').set(resp.id);
    }
  });
}

// ── Actualizar evento (o crear si no existe) ───────────────
function gcalActualizarEvento(turnoKey, turno) {
  if (!turno.gcalEventId) {
    gcalCrearEvento(turnoKey, turno);
    return;
  }
  var payload = _gcalPayload(turno);
  payload.action = 'update';
  payload.id     = turno.gcalEventId;
  _gcalGet(payload, null);
}

// ── Eliminar evento ────────────────────────────────────────
function gcalEliminarEvento(turnoKey, turno) {
  if (!turno.gcalEventId) return;
  _gcalGet({ action: 'delete', id: turno.gcalEventId }, null);
}

// ── Stubs de compatibilidad (botón eliminado) ──────────────
function gcalConectar()    {}
function gcalDesconectar() {}
function gcalInit()        {}
