// ═══════════════════════════════════════════
// CALENDARIO — Vista de calendario tipo Apple
// ═══════════════════════════════════════════
// CALENDARIO — MOTOR COMPLETO
// ══════════════════════════════════════════════════════════

var CAL_HORA_INI  = 8;   // primera hora visible
var CAL_HORA_FIN  = 21;  // última hora visible
var CAL_PX_HORA   = 64;  // píxeles por hora
var calView       = 'dia';
var calBaseDate   = new Date();
var calDragState  = null;
var calResizeState= null;
var calNowTimer   = null;
var DIAS_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
var DIAS_SHORT = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var MESES_ES  = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];

// ── Helpers de fecha ──────────────────────────────────────
function calFechaStr(d) {
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,'0');
  var dd= String(d.getDate()).padStart(2,'0');
  return y+'-'+m+'-'+dd;
}
function calHoyStr() { return calFechaStr(new Date()); }
function calAddDays(d, n) { var x=new Date(d); x.setDate(x.getDate()+n); return x; }
function calLunesSemana(d) { var x=new Date(d); var dia=x.getDay(); x.setDate(x.getDate()-(dia===0?6:dia-1)); return x; }
function calPxFromTime(h, m) { return (h - CAL_HORA_INI) * CAL_PX_HORA + (m / 60) * CAL_PX_HORA; }
function calTimeFromPx(px)   { var tot = px / CAL_PX_HORA + CAL_HORA_INI; var h=Math.floor(tot); var m=Math.round((tot-h)*60); if(m>=60){h++;m=0;} return {h:h,m:m}; }
function calFmtTime(h, m)    { return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0'); }

// ── Helpers de categoría / ícono ─────────────────────────
function calCategoria(t) {
  var trat = (t.tratamiento||'').toLowerCase();
  var cat  = (t.categoria||'').toLowerCase();
  if (trat.includes('labios')||trat.includes('relleno')||cat.includes('rellenos')) return 'rellenos';
  if (trat.includes('hilo')||cat.includes('hilos'))  return 'hilos';
  if (trat.includes('toxina')||trat.includes('botox')||trat.includes('btx')||cat.includes('toxina')) return 'toxina';
  if (trat.includes('enzima')||trat.includes('hialuro')||cat.includes('enzimas')) return 'enzimas';
  if (trat.includes('skin')||trat.includes('nctf')||trat.includes('profhilo')||trat.includes('plasma')||trat.includes('harmonyca')||trat.includes('cellboost')||cat.includes('skin')) return 'skin';
  if (trat.includes('radiesse')||trat.includes('sculptra')||trat.includes('ellans')||cat.includes('bioest')) return 'bioest';
  if (trat.includes('consulta')) return 'consulta';
  return 'otros';
}
function calIcono(cat) {
  var map = {rellenos:'💉',hilos:'🧵',toxina:'✦',enzimas:'⬡',skin:'◈',bioest:'◇',consulta:'👤',otros:'·'};
  return map[cat]||'·';
}

// ── Navegación ────────────────────────────────────────────
function calNav(dir) {
  if (calView === 'mes') {
    calBaseDate = new Date(calBaseDate.getFullYear(), calBaseDate.getMonth() + dir, 1);
  } else if (calView === 'dia') {
    calBaseDate = calAddDays(calBaseDate, dir);
  } else {
    calBaseDate = calAddDays(calBaseDate, dir * 7);
  }
  renderCal();
}
function calGoToday() { calBaseDate = new Date(); renderCal(); }
function calSetView(v) {
  calView = v;
  ['dia','sem','mes'].forEach(function(x){
    var el = document.getElementById('cal-btn-'+x);
    if(el) el.className = 'cal-view-btn'+(v.substring(0,3)===x?' active':'');
  });
  var header  = document.getElementById('cal-header');
  var scroll  = document.getElementById('cal-scroll');
  var mesWrap = document.getElementById('cal-mes-wrap');
  if (v === 'mes') {
    if(header)  header.style.display  = 'none';
    if(scroll)  scroll.style.display  = 'none';
    if(mesWrap) mesWrap.className = 'cal-mes-wrap visible';
  } else {
    if(header)  header.style.display  = '';
    if(scroll)  scroll.style.display  = '';
    if(mesWrap) mesWrap.className = 'cal-mes-wrap';
  }
  renderCal();
}

// ── Render principal ──────────────────────────────────────
function renderCal() {
  var isMobile = window.innerWidth < 600;
  if (isMobile && calView === 'semana') calView = 'dia';
  if (calView === 'mes') { renderCalMes(); return; }

  var dias = calGetDias();
  var hoyStr = calHoyStr();
  var totalH = (CAL_HORA_FIN - CAL_HORA_INI) * CAL_PX_HORA;

  // Título
  var titulo = calView === 'dia'
    ? DIAS_ES[calBaseDate.getDay()] + ' ' + calBaseDate.getDate() + ' de ' + MESES_ES[calBaseDate.getMonth()] + ' ' + calBaseDate.getFullYear()
    : MESES_ES[dias[0].getMonth()] + ' ' + dias[0].getFullYear();
  document.getElementById('cal-title').textContent = titulo;

  // Cabecera días
  var headerDays = document.getElementById('cal-header-days');
  headerDays.innerHTML = dias.map(function(d) {
    var numClass = calFechaStr(d) === hoyStr ? 'cal-header-num today-num' : 'cal-header-num';
    return '<div class="cal-header-day"><div class="cal-header-weekday">'+DIAS_SHORT[d.getDay()]+'</div><div class="'+numClass+'">'+d.getDate()+'</div></div>';
  }).join('');

  // Gutter de horas
  var gutter = document.getElementById('cal-gutter');
  gutter.style.height = totalH + 'px';
  var gutterHtml = '';
  for (var h = CAL_HORA_INI; h <= CAL_HORA_FIN; h++) {
    var top = (h - CAL_HORA_INI) * CAL_PX_HORA;
    gutterHtml += '<div class="cal-hour-label" style="top:'+top+'px">'+String(h).padStart(2,'0')+'</div>';
  }
  gutter.innerHTML = gutterHtml;

  // Columnas de días
  var daysEl = document.getElementById('cal-days');
  daysEl.innerHTML = '';
  var grid = document.getElementById('cal-grid');
  grid.style.minHeight = totalH + 'px';

  dias.forEach(function(d) {
    var fechaStr = calFechaStr(d);
    var col = document.createElement('div');
    col.className = 'cal-day-col' + (fechaStr === hoyStr ? ' today-col' : '');
    col.style.height = totalH + 'px';
    col.dataset.fecha = fechaStr;

    // Líneas de hora
    var linesHtml = '';
    for (var h = CAL_HORA_INI; h < CAL_HORA_FIN; h++) {
      var top = (h - CAL_HORA_INI) * CAL_PX_HORA;
      linesHtml += '<div class="cal-hour-line" style="top:'+top+'px"></div>';
      linesHtml += '<div class="cal-hour-line half" style="top:'+(top + CAL_PX_HORA/2)+'px"></div>';
    }
    col.innerHTML = linesHtml;

    // Slots clickeables (cada 30 min)
    for (var hh = CAL_HORA_INI; hh < CAL_HORA_FIN; hh++) {
      [0, 30].forEach(function(mm) {
        var slotTop = calPxFromTime(hh, mm);
        var slot = document.createElement('div');
        slot.className = 'cal-slot';
        slot.style.top    = slotTop + 'px';
        slot.style.height = (CAL_PX_HORA/2) + 'px';
        slot.dataset.fecha = fechaStr;
        slot.dataset.hora  = calFmtTime(hh, mm);
        slot.addEventListener('click', calSlotClick);
        col.appendChild(slot);
      });
    }

    // Turnos del día
    var turnosDia = calGetTurnosDia(fechaStr);
    turnosDia.forEach(function(t) {
      var ev = calCrearBloque(t.key, t.turno, dias.length);
      if (ev) col.appendChild(ev);
    });

    daysEl.appendChild(col);
  });

  // Línea hora actual
  calRenderNowLine();
  if (calNowTimer) clearInterval(calNowTimer);
  calNowTimer = setInterval(calRenderNowLine, 60000);

  // Scroll a hora actual o 8am
  setTimeout(function() {
    var scroll = document.getElementById('cal-scroll');
    if (!scroll) return;
    var now = new Date();
    var target = (now.getHours() >= CAL_HORA_INI && now.getHours() < CAL_HORA_FIN)
      ? calPxFromTime(now.getHours(), now.getMinutes()) - 80
      : calPxFromTime(9, 0);
    scroll.scrollTop = Math.max(0, target);
  }, 50);
}

function calGetDias() {
  if (calView === 'dia') return [new Date(calBaseDate)];
  var lunes = calLunesSemana(calBaseDate);
  return [0,1,2,3,4,5,6].map(function(i){ return calAddDays(lunes,i); });
}

function calGetTurnosDia(fechaStr) {
  return Object.keys(turnosData)
    .filter(function(k){ return turnosData[k].fecha === fechaStr; })
    .map(function(k){ return {key:k, turno:turnosData[k]}; })
    .sort(function(a,b){ return (a.turno.hora||'').localeCompare(b.turno.hora||''); });
}

function calCrearBloque(key, t, numDias) {
  if (!t.hora) return null;
  var partes = t.hora.split(':');
  var h = parseInt(partes[0])||0;
  var m = parseInt(partes[1])||0;
  if (h < CAL_HORA_INI || h >= CAL_HORA_FIN) return null;

  var dur = parseInt(t.duracion) || 60;
  var top    = calPxFromTime(h, m);
  var height = Math.max(24, (dur / 60) * CAL_PX_HORA - 2);
  var cat    = calCategoria(t);

  var ev = document.createElement('div');
  ev.className  = 'cal-event cal-ev-' + cat + (t.estado==='cancelado'?' cancelado':'');
  ev.style.top  = top + 'px';
  ev.style.height = height + 'px';
  ev.dataset.key = key;

  var showTrat = height > 38;
  ev.innerHTML =
    '<div class="cal-event-time">'+t.hora+'</div>' +
    '<div class="cal-event-name">'+calIcono(cat)+' '+(t.paciente||'Paciente')+'</div>' +
    (showTrat && t.tratamiento ? '<div class="cal-event-trat">'+t.tratamiento+'</div>' : '') +
    '<div class="cal-event-resize" data-key="'+key+'"></div>';

  ev.addEventListener('click', function(e) {
    if (e.target.classList.contains('cal-event-resize')) return;
    e.stopPropagation();
    if (typeof abrirModalEdit === 'function') abrirModalEdit(key);
  });
  ev.addEventListener('mouseenter', function(e) { calShowTooltip(t, e); });
  ev.addEventListener('mouseleave', calHideTooltip);
  ev.addEventListener('mousemove',  calMoveTooltip);
  calAddDragListeners(ev, key, t);
  var resizeHandle = ev.querySelector('.cal-event-resize');
  if (resizeHandle) calAddResizeListeners(resizeHandle, key, t, ev);
  return ev;
}

// ── Línea hora actual ─────────────────────────────────────
function calRenderNowLine() {
  // Eliminar línea anterior
  var old = document.querySelector('.cal-now-line');
  if (old) old.remove();

  var now = new Date();
  var hoyStr = calHoyStr();
  var dias = calGetDias();
  var idxHoy = dias.findIndex(function(d){ return calFechaStr(d) === hoyStr; });
  if (idxHoy === -1) return;

  var h = now.getHours(), m = now.getMinutes();
  if (h < CAL_HORA_INI || h >= CAL_HORA_FIN) return;

  var colEl = document.getElementById('cal-days');
  if (!colEl) return;
  var cols = colEl.querySelectorAll('.cal-day-col');
  if (!cols[idxHoy]) return;

  var top = calPxFromTime(h, m);
  var line = document.createElement('div');
  line.className = 'cal-now-line';
  line.style.top = top + 'px';
  line.innerHTML = '<div class="cal-now-dot"></div><div class="cal-now-bar"></div>';
  cols[idxHoy].appendChild(line);
}

// ── Click en slot vacío → nuevo turno ────────────────────
function calSlotClick(e) {
  var fecha = e.currentTarget.dataset.fecha;
  var hora  = e.currentTarget.dataset.hora;
  // Pre-rellenar el formulario de nuevo turno y cambiar a panel agenda
  showPanel('agenda');
  setTimeout(function() {
    if (!formTurnoVisible) toggleFormTurno();
    var fFecha = document.getElementById('t-fecha');
    var fHora  = document.getElementById('t-hora');
    if (fFecha) fFecha.value = fecha;
    if (fHora)  fHora.value  = hora;
  }, 100);
}

// ── Tooltip ───────────────────────────────────────────────
function calShowTooltip(t, e) {
  var tt = document.getElementById('cal-tooltip');
  document.getElementById('cal-tt-name').textContent = t.paciente || 'Paciente';
  document.getElementById('cal-tt-hora').textContent = '⏰ ' + (t.hora||'') + (t.duracion ? '  ·  '+t.duracion+' min' : '');
  document.getElementById('cal-tt-trat').textContent = t.tratamiento || '';
  tt.className = 'cal-tooltip show';
  calMoveTooltip(e);
}
function calMoveTooltip(e) {
  var tt = document.getElementById('cal-tooltip');
  if (!tt) return;
  tt.style.left = (e.clientX + 14) + 'px';
  tt.style.top  = (e.clientY - 10) + 'px';
}
function calHideTooltip() {
  var tt = document.getElementById('cal-tooltip');
  if (tt) tt.className = 'cal-tooltip';
}

// ── Drag & Drop (Fix #14 — AbortController para cleanup limpio) ──
function calAddDragListeners(el, key, t) {
  var startY, startTop;
  var dragController = null; // AbortController para cleanup

  function onStart(e) {
    if (e.target.classList.contains('cal-event-resize')) return;
    e.preventDefault();
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startY   = clientY;
    startTop = parseInt(el.style.top) || 0;
    el.classList.add('dragging');
    calDragState = { key:key, el:el, startY:startY, startTop:startTop };

    // Fix #14: AbortController cancela todos los listeners de una vez
    dragController = new AbortController();
    var sig = dragController.signal;

    document.addEventListener('mousemove', onMove, { signal: sig });
    document.addEventListener('mouseup',   onEnd,  { signal: sig });
    document.addEventListener('touchmove', onMove, { passive: false, signal: sig });
    document.addEventListener('touchend',  onEnd,  { signal: sig });
    // Cancelar también si el foco sale del documento
    document.addEventListener('visibilitychange', function() {
      if (document.hidden) onEnd();
    }, { signal: sig });
  }

  function onMove(e) {
    if (!calDragState) return;
    e.preventDefault();
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var dy = clientY - calDragState.startY;
    var newTop = Math.max(0, calDragState.startTop + dy);
    newTop = Math.round(newTop / (CAL_PX_HORA/4)) * (CAL_PX_HORA/4);
    el.style.top = newTop + 'px';
  }

  function onEnd(e) {
    if (!calDragState) return;
    el.classList.remove('dragging');

    // Fix #14: cancelar todos los listeners de una vez
    if (dragController) { dragController.abort(); dragController = null; }

    var newTop = parseInt(el.style.top) || 0;
    var tiempo = calTimeFromPx(newTop);
    if (tiempo.h >= CAL_HORA_INI && tiempo.h < CAL_HORA_FIN) {
      var nuevaHora = calFmtTime(tiempo.h, tiempo.m);
      var hayConflicto = calHaySolapamiento(key, t.fecha, nuevaHora, parseInt(t.duracion)||60);
      if (hayConflicto) {
        el.style.top = calPxFromTime(parseInt(t.hora.split(':')[0]), parseInt(t.hora.split(':')[1])) + 'px';
        alert('Ese horario se superpone con otro turno.');
      } else {
        db.ref('turnos/'+key).update({ hora: nuevaHora });
        if (turnosData[key]) turnosData[key].hora = nuevaHora;
      }
    } else {
      el.style.top = calPxFromTime(parseInt(t.hora.split(':')[0]), parseInt(t.hora.split(':')[1])) + 'px';
    }
    calDragState = null;
  }

  el.addEventListener('mousedown',  onStart);
  el.addEventListener('touchstart', onStart, { passive: false });
}

// ── Resize (cambiar duración) ─────────────────────────────
function calAddResizeListeners(handle, key, t, el) {
  var startY, startH;

  function onStart(e) {
    e.stopPropagation();
    e.preventDefault();
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    startY = clientY;
    startH = parseInt(el.style.height) || 60;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onEnd);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend',  onEnd);
  }
  function onMove(e) {
    e.preventDefault();
    var clientY = e.touches ? e.touches[0].clientY : e.clientY;
    var dy = clientY - startY;
    var newH = Math.max(CAL_PX_HORA/4, startH + dy);
    newH = Math.round(newH / (CAL_PX_HORA/4)) * (CAL_PX_HORA/4);
    el.style.height = newH + 'px';
  }
  function onEnd() {
    var newH = parseInt(el.style.height) || 60;
    var newDur = Math.round((newH / CAL_PX_HORA) * 60);
    db.ref('turnos/'+key).update({ duracion: newDur });
    if (turnosData[key]) turnosData[key].duracion = newDur;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend',  onEnd);
    // Re-renderizar solo si hay cambio significativo
    setTimeout(renderCal, 100);
  }
  handle.addEventListener('mousedown', onStart);
  handle.addEventListener('touchstart', onStart, {passive:false});
}

// ── Validación solapamiento ───────────────────────────────
function calHaySolapamiento(keyIgnorar, fecha, horaStr, durMin) {
  var partes = horaStr.split(':');
  var iniMin = parseInt(partes[0])*60 + parseInt(partes[1]);
  var finMin = iniMin + durMin;
  return Object.keys(turnosData).some(function(k) {
    if (k === keyIgnorar) return false;
    var tr = turnosData[k];
    if (tr.fecha !== fecha || tr.estado === 'cancelado') return false;
    var tp = (tr.hora||'00:00').split(':');
    var tIni = parseInt(tp[0])*60 + parseInt(tp[1]);
    var tFin = tIni + (parseInt(tr.duracion)||60);
    return iniMin < tFin && finMin > tIni;
  });
}

// Listener para actualizar calendario cuando cambien los turnos
var calListenerActivo = false;
function calIniciarListener() {
  if (calListenerActivo) return;
  calListenerActivo = true;
}

// ── VISTA MES ─────────────────────────────────────────────
function renderCalMes() {
  var hoy     = new Date();
  var hoyStr  = calHoyStr();
  var year    = calBaseDate.getFullYear();
  var month   = calBaseDate.getMonth();
  var DIAS_MES = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

  // Título grande estilo referencia
  var tituloEl = document.getElementById('cal-title');
  var mesNombre = MESES_ES[month];
  tituloEl.textContent = mesNombre.charAt(0).toUpperCase()+mesNombre.slice(1)+' '+year;

  // Cabecera días
  var header = document.getElementById('cal-mes-header');
  if (header) header.innerHTML = DIAS_MES.map(function(d){
    return '<div class="cal-mes-dh">'+d+'</div>';
  }).join('');

  // Primer día del mes → ajustar a inicio de semana (lunes)
  var primerDia = new Date(year, month, 1);
  var diaSem = primerDia.getDay(); // 0=Dom
  var offset = diaSem === 0 ? 6 : diaSem - 1; // días desde el lunes anterior

  var celdas = [];
  var inicio = new Date(year, month, 1 - offset);

  // Generar 6 semanas × 7 días = 42 celdas
  for (var i = 0; i < 42; i++) {
    var d = calAddDays(inicio, i);
    var esMes = d.getMonth() === month;
    var fechaStr = calFechaStr(d);
    var esHoy = fechaStr === hoyStr;

    var turnos = Object.keys(turnosData)
      .filter(function(k){ return turnosData[k].fecha === fechaStr; })
      .map(function(k){ return { key:k, t:turnosData[k] }; })
      .sort(function(a,b){ return (a.t.hora||'').localeCompare(b.t.hora||''); });

    var MAX_VISIBLE = 3;
    var visibles = turnos.slice(0, MAX_VISIBLE);
    var resto    = turnos.length - MAX_VISIBLE;

    var eventsHtml = visibles.map(function(item) {
      var t = item.t;
      var cat = calCategoria(t);
      var clsCat = t.estado==='cancelado' ? 'cat-cancelado' : 'cat-'+cat;
      return '<div class="cal-mes-ev '+clsCat+'" onclick="calMesClickTurno(\''+item.key+'\')" title="'+(t.paciente||'')+'">'+
        '<span class="cal-mes-ev-icon">'+calIcono(cat)+'</span>'+
        '<span class="cal-mes-ev-txt">'+(t.tratamiento||t.paciente||'Turno')+'</span>'+
        '<span class="cal-mes-ev-hora">'+(t.hora||'')+'</span>'+
      '</div>';
    }).join('');

    if (resto > 0) eventsHtml += '<div class="cal-mes-mas">+'+resto+' más</div>';

    celdas.push(
      '<div class="cal-mes-cell'+(esMes?'':' otro-mes')+(esHoy?' hoy-cell':'')+'" '+
          'onclick="calMesClickDia(\''+fechaStr+'\')" data-fecha="'+fechaStr+'">'+
        '<div class="cal-mes-num'+(esHoy?' hoy-num':'')+'">'+d.getDate()+'</div>'+
        eventsHtml+
      '</div>'
    );
  }

  var grid = document.getElementById('cal-mes-grid');
  if (grid) grid.innerHTML = celdas.join('');
}

function calMesClickDia(fechaStr) {
  // Click en día vacío → nuevo turno con esa fecha
  showPanel('agenda');
  setTimeout(function() {
    if (typeof formTurnoVisible !== 'undefined' && !formTurnoVisible && typeof toggleFormTurno === 'function') toggleFormTurno();
    var fFecha = document.getElementById('t-fecha');
    if (fFecha) fFecha.value = fechaStr;
  }, 150);
}

function calMesClickTurno(key) {
  if (typeof abrirModalEdit === 'function') abrirModalEdit(key);
}
