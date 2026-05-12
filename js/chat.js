// ═══════════════════════════════════════════
// CHAT — Mensajería interna entre usuarios
// ═══════════════════════════════════════════

var chatAbierto    = false;
var chatData       = {};
var chatUltimoVisto = parseInt(localStorage.getItem('chat_ultimo_visto') || '0');

// ── Iniciar listener de Firebase ─────────────────────────────
function initChat() {
  var ref = db.ref('chat').orderByChild('ts').limitToLast(100);
  ref.on('child_added', function(snap) {
    chatData[snap.key] = snap.val();
    _chatActualizarBadge();
    if (chatAbierto) _chatRender();
  });
  ref.on('child_changed', function(snap) {
    chatData[snap.key] = snap.val();
    if (chatAbierto) _chatRender();
  });
}

// ── Abrir / cerrar ────────────────────────────────────────────
function toggleChat() {
  chatAbierto = !chatAbierto;
  var panel = document.getElementById('chat-panel');
  if (chatAbierto) {
    panel.classList.add('chat-open');
    _chatRender();
    chatMarcarLeido();
    setTimeout(function() {
      var input = document.getElementById('chat-input');
      if (input) input.focus();
      _chatScrollBottom();
    }, 100);
  } else {
    panel.classList.remove('chat-open');
  }
}

function chatMarcarLeido() {
  chatUltimoVisto = Date.now();
  localStorage.setItem('chat_ultimo_visto', chatUltimoVisto);
  _chatActualizarBadge();
}

// ── Badge de no leídos ────────────────────────────────────────
function _chatActualizarBadge() {
  var noLeidos = Object.values(chatData).filter(function(m) {
    return m.ts > chatUltimoVisto && m.de !== (usuarioActual && usuarioActual.email);
  }).length;
  var badge = document.getElementById('chat-badge');
  if (!badge) return;
  if (noLeidos > 0) {
    badge.textContent = noLeidos > 9 ? '9+' : noLeidos;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ── Enviar mensaje ────────────────────────────────────────────
function chatEnviar() {
  var input = document.getElementById('chat-input');
  if (!input) return;
  var texto = (input.value || '').trim();
  if (!texto || !usuarioActual) return;

  db.ref('chat').push({
    de:     usuarioActual.email,
    nombre: usuarioActual.nombre,
    texto:  texto,
    ts:     Date.now()
  });

  input.value = '';
  input.focus();
}

function chatKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    chatEnviar();
  }
}

// ── Render mensajes ───────────────────────────────────────────
function _chatRender() {
  var lista = document.getElementById('chat-lista');
  if (!lista) return;

  var mensajes = Object.values(chatData).sort(function(a,b){ return a.ts - b.ts; });

  if (!mensajes.length) {
    lista.innerHTML = '<div style="text-align:center;padding:32px 16px;color:rgba(255,255,255,.4);font-size:13px">Sin mensajes aún.<br/>¡Mandá el primero!</div>';
    return;
  }

  var yo = usuarioActual && usuarioActual.email;
  var html = '';
  var ultimaFecha = '';

  mensajes.forEach(function(m) {
    var esPropio = m.de === yo;
    var fecha = new Date(m.ts);
    var fechaStr = fecha.toLocaleDateString('es-AR', { day:'2-digit', month:'2-digit' });
    var horaStr  = fecha.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' });

    // Separador de fecha
    if (fechaStr !== ultimaFecha) {
      html += '<div style="text-align:center;margin:12px 0 8px">' +
        '<span style="font-size:10px;font-weight:600;color:rgba(255,255,255,.4);background:rgba(255,255,255,.08);padding:3px 10px;border-radius:20px;letter-spacing:.06em">' +
        fechaStr + '</span></div>';
      ultimaFecha = fechaStr;
    }

    html += '<div style="display:flex;flex-direction:column;align-items:'+(esPropio?'flex-end':'flex-start')+';margin-bottom:10px;padding:0 4px">';

    // Nombre del remitente (solo en mensajes ajenos)
    if (!esPropio) {
      html += '<div style="font-size:10px;font-weight:700;color:var(--gold-light);margin-bottom:3px;padding-left:4px;letter-spacing:.04em">' +
        sanitize(m.nombre || m.de) + '</div>';
    }

    html += '<div style="max-width:78%;background:' + (esPropio
        ? 'linear-gradient(135deg,var(--gold-dark),var(--gold))'
        : 'rgba(255,255,255,.1)') +
      ';border-radius:' + (esPropio ? '18px 18px 4px 18px' : '18px 18px 18px 4px') + ';' +
      'padding:10px 14px;word-break:break-word">';
    html += '<div style="font-size:14px;color:#fff;line-height:1.45">' + sanitize(m.texto) + '</div>';
    html += '<div style="font-size:10px;color:rgba(255,255,255,' + (esPropio ? '.65' : '.4') + ');margin-top:4px;text-align:right">' + horaStr + '</div>';
    html += '</div></div>';
  });

  lista.innerHTML = html;
  _chatScrollBottom();
}

function _chatScrollBottom() {
  var lista = document.getElementById('chat-lista');
  if (lista) lista.scrollTop = lista.scrollHeight;
}
