// ═══════════════════════════════════════════
// CHAT — Mensajería interna entre usuarios
// ═══════════════════════════════════════════

var chatAbierto    = false;
var chatData       = {};
var chatUltimoVisto = parseInt(localStorage.getItem('chat_ultimo_visto') || '0');

// ── Sonido de notificación (Web Audio API) ────────────────────
// Campanita cálida de dos tonos — tipo notificación suave
function _chatSonido() {
  try {
    var ctx = new (window.AudioContext || window.webkitAudioContext)();

    function nota(freq, inicio, duracion, volumen) {
      var osc   = ctx.createOscillator();
      var gain  = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + inicio);

      // Ataque suave + caída exponencial (tipo campana)
      gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
      gain.gain.linearRampToValueAtTime(volumen, ctx.currentTime + inicio + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracion);

      osc.start(ctx.currentTime + inicio);
      osc.stop(ctx.currentTime + inicio + duracion);
    }

    // Dos notas: Mi5 → Sol#5 — intervalo de tercera mayor, cálido y positivo
    nota(659, 0,    0.6, 0.18);   // Mi5  — primer toque
    nota(830, 0.14, 0.7, 0.13);   // Sol#5 — segundo toque, más suave

    // Cierra el contexto cuando termina para liberar recursos
    setTimeout(function() { try { ctx.close(); } catch(e) {} }, 1200);
  } catch(e) {
    // Silencioso si el browser no soporta AudioContext
  }
}

// ── Limpiar mensajes con más de 24h ──────────────────────────
function _chatLimpiarViejos() {
  var corte = Date.now() - 24 * 60 * 60 * 1000;
  db.ref('chat').orderByChild('ts').endAt(corte).once('value', function(snap) {
    if (!snap.exists()) return;
    var updates = {};
    snap.forEach(function(child) { updates[child.key] = null; });
    db.ref('chat').update(updates);
  });
}

// ── Iniciar listener de Firebase ─────────────────────────────
var _chatIniciado = false;  // evita sonido en la carga inicial

function initChat() {
  _chatLimpiarViejos();

  // Esperar un poco antes de activar sonidos para no sonar al cargar mensajes viejos
  setTimeout(function() { _chatIniciado = true; }, 1500);

  var ref = db.ref('chat').orderByChild('ts').limitToLast(100);
  ref.on('child_added', function(snap) {
    chatData[snap.key] = snap.val();
    _chatActualizarBadge();
    if (chatAbierto) _chatRender();
    // Sonido solo si: ya cargó, el chat está minimizado y el mensaje es de otro
    var m = snap.val();
    if (_chatIniciado && !chatAbierto && m.de !== (usuarioActual && usuarioActual.email)) {
      _chatSonido();
    }
  });
  ref.on('child_changed', function(snap) {
    chatData[snap.key] = snap.val();
    if (chatAbierto) _chatRender();
  });
  ref.on('child_removed', function(snap) {
    delete chatData[snap.key];
    _chatActualizarBadge();
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
