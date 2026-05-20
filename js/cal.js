// ═══════════════════════════════════════════
// CAL — Vista de calendario (día / semana / mes)
// ═══════════════════════════════════════════

var calViewMode   = 'semana';   // 'dia' | 'semana' | 'mes'
var calCurrentDate = new Date();
var calNowTimer    = null;

var DIAS_CORTO  = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
var MESES_LARGO = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

var CAL_HORA_INICIO = 7;   // primera hora visible
var CAL_HORA_FIN    = 21;  // última hora visible
var CAL_SLOT_H      = 60;  // altura en px de cada hora

// ── Estado → clase CSS de color ──────────────────────────────
function _calEventClass(t) {
  var estado = (t.estado || '').toLowerCase();
  if (estado === 'cancelado')   return 'cal-ev-cancelado';
  if (estado === 'completado')  return 'cal-ev-completado';
  if (estado === 'en_atencion' || estado === 'en atención') return 'cal-ev-atencion';
  if (estado === 'confirmado')  return 'cal-ev-confirmado';
  return 'cal-ev-pendiente'; // pendiente o sin estado
}

// ── Estado → etiqueta visible ─────────────────────────────────
function _calEstadoLabel(t) {
  var estado = (t.estado || '').toLowerCase();
  if (estado === 'cancelado')   return { txt: 'Cancelado',   cls: 'ev-badge ev-badge-cancelado' };
  if (estado === 'completado')  return { txt: 'Completado',  cls: 'ev-badge ev-badge-completado' };
  if (estado === 'en_atencion' || estado === 'en atención') return { txt: 'En atención', cls: 'ev-badge ev-badge-atencion' };
  if (estado === 'confirmado')  return { txt: 'Confirmado',  cls: 'ev-badge ev-badge-confirmado' };
  return { txt: 'Pendiente', cls: 'ev-badge ev-badge-pendiente' };
}

// ── Turnos del día (string YYYY-MM-DD) ──────────────────────
function _calTurnosDia(fechaStr) {
  return Object.keys(turnosData)
    .filter(function(k){ var t = turnosData[k]; return !t.eliminado && t.fecha === fechaStr; })
    .map(function(k){ return Object.assign({}, turnosData[k], { _key: k }); })
    .sort(function(a,b){ return (a.hora||'').localeCompare(b.hora||''); });
}

// ── Convertir hora "HH:MM" → posición px en la grilla ───────
function _calHoraToPx(horaStr) {
  var p = (horaStr||'09:00').split(':');
  var h = parseInt(p[0]) || 9;
  var m = parseInt(p[1]) || 0;
  return (h - CAL_HORA_INICIO + m/60) * CAL_SLOT_H;
}

// ── HTML de un evento en grilla hora ────────────────────────
function _calEventHTML(t, width, left) {
  var top    = _calHoraToPx(t.hora);
  var cls    = _calEventClass(t);
  var badge  = _calEstadoLabel(t);
  var trat   = t.tratamientos && t.tratamientos.length
    ? t.tratamientos.map(function(x){ return x.nombre; }).join(', ')
    : (t.tratamiento || 'Consulta');
  var durMin = parseInt(t.duracion) || 45;
  var altura = Math.max(36, (durMin / 60) * CAL_SLOT_H - 4);
  var style  = 'top:'+top+'px;height:'+altura+'px;';
  if (width !== undefined) style += 'left:'+left+'%;width:'+width+'%;';

  var cancelado = (t.estado||'').toLowerCase() === 'cancelado';

  return '<div class="cal-event '+cls+'" style="'+style+'"'+
    ' onclick="abrirModalEdit(\''+t._key+'\')"'+
    ' onmouseenter="calShowTip(event,\''+t._key+'\')"'+
    ' onmouseleave="calHideTip()">'+
    '<div class="cal-event-top">'+
      '<span class="cal-event-time">'+sanitize(t.hora||'')+'</span>'+
      '<span class="'+badge.cls+'">'+badge.txt+'</span>'+
    '</div>'+
    '<div class="cal-event-name'+(cancelado?' tachado':'')+'">'+sanitize(t.paciente||'')+'</div>'+
    '<div class="cal-event-trat">'+sanitize(trat)+'</div>'+
    (durMin ? '<div class="cal-event-dur">'+durMin+' min</div>' : '')+
    '</div>';
}

// ── Gutter con etiquetas de hora ────────────────────────────
function _renderGutter() {
  var html = '';
  var total = CAL_HORA_FIN - CAL_HORA_INICIO + 1;
  for (var h = CAL_HORA_INICIO; h <= CAL_HORA_FIN; h++) {
    var top = (h - CAL_HORA_INICIO) * CAL_SLOT_H;
    html += '<div class="cal-hour-label" style="top:'+top+'px">'+String(h).padStart(2,'0')+'</div>';
  }
  return html;
}

// ── Líneas de hora en columna ────────────────────────────────
function _renderHourLines() {
  var html = '';
  var total = CAL_HORA_FIN - CAL_HORA_INICIO + 1;
  for (var h = 0; h <= total; h++) {
    html += '<div class="cal-hour-line" style="top:'+(h*CAL_SLOT_H)+'px"></div>';
    if (h < total) html += '<div class="cal-hour-line half" style="top:'+(h*CAL_SLOT_H+CAL_SLOT_H/2)+'px"></div>';
  }
  return html;
}

// ── Línea "ahora" ────────────────────────────────────────────
function _renderNowLine(fechaStr) {
  var hoy = new Date();
  var hoyStr = hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0')+'-'+String(hoy.getDate()).padStart(2,'0');
  if (fechaStr !== hoyStr) return '';
  var h = hoy.getHours(), m = hoy.getMinutes();
  if (h < CAL_HORA_INICIO || h > CAL_HORA_FIN) return '';
  var top = (h - CAL_HORA_INICIO + m/60) * CAL_SLOT_H;
  return '<div class="cal-now-line" style="top:'+top+'px"><div class="cal-now-dot"></div><div class="cal-now-bar"></div></div>';
}

// ── Render vista DÍA ────────────────────────────────────────
function _renderDia() {
  var d = calCurrentDate;
  var fechaStr = d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  var esHoy = fechaStr === (function(){ var n=new Date(); return n.getFullYear()+'-'+String(n.getMonth()+1).padStart(2,'0')+'-'+String(n.getDate()).padStart(2,'0'); })();

  document.getElementById('cal-title').textContent = DIAS_CORTO[d.getDay()] + ' ' + d.getDate() + ' de ' + MESES_LARGO[d.getMonth()] + ' ' + d.getFullYear();

  // Header
  var hdHTML = '<div class="cal-header-day" style="flex:1">';
  hdHTML += '<div class="cal-header-weekday">'+DIAS_CORTO[d.getDay()]+'</div>';
  hdHTML += '<div class="cal-header-num'+(esHoy?' today-num':'')+'">'+d.getDate()+'</div>';
  hdHTML += '</div>';
  document.getElementById('cal-header-days').innerHTML = hdHTML;
  document.getElementById('cal-header').style.display = 'flex';

  // Gutter
  var totalH = CAL_HORA_FIN - CAL_HORA_INICIO + 1;
  document.getElementById('cal-gutter').style.height = (totalH * CAL_SLOT_H) + 'px';
  document.getElementById('cal-gutter').innerHTML = _renderGutter();

  // Columna única
  var turnos = _calTurnosDia(fechaStr);
  var colHTML = '<div class="cal-day-col'+(esHoy?' today-col':'')+'" style="min-height:'+(totalH*CAL_SLOT_H)+'px">';
  colHTML += _renderHourLines();
  colHTML += _renderNowLine(fechaStr);
  turnos.forEach(function(t){ colHTML += _calEventHTML(t); });
  colHTML += '</div>';

  document.getElementById('cal-days').innerHTML = colHTML;
  document.getElementById('cal-mes-wrap').className = 'cal-mes-wrap';
  document.getElementById('cal-scroll').style.display = '';

  _calStartNowTimer();
  _calScrollToNow();
}

// ── Render vista SEMANA ──────────────────────────────────────
function _renderSemana() {
  var d = calCurrentDate;
  // Lunes de la semana
  var lunes = new Date(d);
  var dia = d.getDay() === 0 ? 6 : d.getDay() - 1;
  lunes.setDate(d.getDate() - dia);

  var hoy = new Date();
  var hoyStr = hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0')+'-'+String(hoy.getDate()).padStart(2,'0');

  var viernes = new Date(lunes); viernes.setDate(lunes.getDate() + 6);
  document.getElementById('cal-title').textContent =
    MESES_LARGO[lunes.getMonth()] + (lunes.getMonth()!==viernes.getMonth() ? ' – '+MESES_LARGO[viernes.getMonth()] : '') + ' ' + lunes.getFullYear();

  // Construir array de 7 días (Lun-Dom)
  var dias = [];
  for (var i = 0; i < 7; i++) {
    var dd = new Date(lunes);
    dd.setDate(lunes.getDate() + i);
    dias.push(dd);
  }

  // Header días
  var hdHTML = '';
  dias.forEach(function(dd) {
    var fs = dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0');
    var esHoy = fs === hoyStr;
    hdHTML += '<div class="cal-header-day">';
    hdHTML += '<div class="cal-header-weekday">'+DIAS_CORTO[dd.getDay()]+'</div>';
    hdHTML += '<div class="cal-header-num'+(esHoy?' today-num':'')+'">'+dd.getDate()+'</div>';
    hdHTML += '</div>';
  });
  document.getElementById('cal-header-days').innerHTML = hdHTML;
  document.getElementById('cal-header').style.display = 'flex';

  // Gutter
  var totalH = CAL_HORA_FIN - CAL_HORA_INICIO + 1;
  document.getElementById('cal-gutter').style.height = (totalH * CAL_SLOT_H) + 'px';
  document.getElementById('cal-gutter').innerHTML = _renderGutter();

  // Columnas
  var colsHTML = '';
  dias.forEach(function(dd) {
    var fs = dd.getFullYear()+'-'+String(dd.getMonth()+1).padStart(2,'0')+'-'+String(dd.getDate()).padStart(2,'0');
    var esHoy = fs === hoyStr;
    var turnos = _calTurnosDia(fs);
    colsHTML += '<div class="cal-day-col'+(esHoy?' today-col':'')+'" style="min-height:'+(totalH*CAL_SLOT_H)+'px">';
    colsHTML += _renderHourLines();
    colsHTML += _renderNowLine(fs);
    turnos.forEach(function(t){ colsHTML += _calEventHTML(t); });
    colsHTML += '</div>';
  });

  document.getElementById('cal-days').innerHTML = colsHTML;
  document.getElementById('cal-mes-wrap').className = 'cal-mes-wrap';
  document.getElementById('cal-scroll').style.display = '';

  _calStartNowTimer();
  _calScrollToNow();
}

// ── Render vista MES ─────────────────────────────────────────
function _renderMes() {
  var d = calCurrentDate;
  document.getElementById('cal-title').textContent = MESES_LARGO[d.getMonth()] + ' ' + d.getFullYear();
  document.getElementById('cal-header').style.display = 'none';
  document.getElementById('cal-scroll').style.display = 'none';
  var wrap = document.getElementById('cal-mes-wrap');
  wrap.className = 'cal-mes-wrap visible';

  var hoy = new Date();
  var hoyStr = hoy.getFullYear()+'-'+String(hoy.getMonth()+1).padStart(2,'0')+'-'+String(hoy.getDate()).padStart(2,'0');

  // Header días semana (Lun-Dom)
  var dias = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  document.getElementById('cal-mes-header').innerHTML = dias.map(function(d){ return '<div class="cal-mes-dh">'+d+'</div>'; }).join('');

  // Primer día del mes
  var primero = new Date(d.getFullYear(), d.getMonth(), 1);
  var offsetLunes = primero.getDay() === 0 ? 6 : primero.getDay() - 1; // offset para alinear con Lun
  var totalDias = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();

  var gridHTML = '';
  var totalCeldas = Math.ceil((offsetLunes + totalDias) / 7) * 7;

  for (var i = 0; i < totalCeldas; i++) {
    var diaNum = i - offsetLunes + 1;
    var esMes = diaNum >= 1 && diaNum <= totalDias;
    var fecha = new Date(d.getFullYear(), d.getMonth(), diaNum);
    var fs = fecha.getFullYear()+'-'+String(fecha.getMonth()+1).padStart(2,'0')+'-'+String(fecha.getDate()).padStart(2,'0');
    var esHoy = fs === hoyStr;

    gridHTML += '<div class="cal-mes-cell'+(esHoy?' hoy-cell':'')+(esMes?'':' otro-mes')+'">';
    gridHTML += '<div class="cal-mes-num'+(esHoy?' hoy-num':'')+'">'+Math.abs(diaNum <= 0 ? new Date(d.getFullYear(), d.getMonth(), diaNum).getDate() : diaNum > totalDias ? new Date(d.getFullYear(), d.getMonth()+1, diaNum-totalDias).getDate() : diaNum)+'</div>';

    if (esMes) {
      var turnos = _calTurnosDia(fs);
      var max = 3;
      turnos.slice(0, max).forEach(function(t) {
        var trat = t.tratamientos && t.tratamientos.length ? t.tratamientos[0].nombre : (t.tratamiento || 'Consulta');
        var estado = (t.estado||'pendiente').toLowerCase().replace(' ','_').replace('en_atención','atencion').replace('en_atencion','atencion');
        var cls = 'cat-' + estado;
        gridHTML += '<div class="cal-mes-ev '+cls+'" onclick="abrirModalEdit(\''+t._key+'\')">';
        gridHTML += '<span class="cal-mes-ev-hora">'+sanitize(t.hora||'')+'</span>';
        gridHTML += '<span class="cal-mes-ev-txt">'+sanitize(t.paciente||trat)+'</span>';
        gridHTML += '</div>';
      });
      if (turnos.length > max) {
        gridHTML += '<div class="cal-mes-mas">+' + (turnos.length - max) + ' más</div>';
      }
    }
    gridHTML += '</div>';
  }

  document.getElementById('cal-mes-grid').innerHTML = gridHTML;

  if (calNowTimer) { clearInterval(calNowTimer); calNowTimer = null; }
}

// ── Scroll automático a la hora actual ──────────────────────
function _calScrollToNow() {
  var scroll = document.getElementById('cal-scroll');
  if (!scroll) return;
  var hoy = new Date();
  var h = hoy.getHours(), m = hoy.getMinutes();
  if (h < CAL_HORA_INICIO) h = CAL_HORA_INICIO;
  if (h > CAL_HORA_FIN)    h = CAL_HORA_FIN;
  var top = (h - CAL_HORA_INICIO + m/60) * CAL_SLOT_H - 80;
  scroll.scrollTop = Math.max(0, top);
}

// ── Timer para mover la línea "ahora" ───────────────────────
function _calStartNowTimer() {
  if (calNowTimer) clearInterval(calNowTimer);
  calNowTimer = setInterval(function() {
    if (calViewMode !== 'dia' && calViewMode !== 'semana') return;
    renderCal();
  }, 60000);
}

// ── API pública ──────────────────────────────────────────────

function renderCal() {
  if      (calViewMode === 'dia')    _renderDia();
  else if (calViewMode === 'semana') _renderSemana();
  else                               _renderMes();
}

function calSetView(v) {
  calViewMode = v;
  ['dia','sem','mes'].forEach(function(id) {
    var btn = document.getElementById('cal-btn-'+id);
    if (btn) btn.className = 'cal-view-btn' + (
      (id==='dia'&&v==='dia')||(id==='sem'&&v==='semana')||(id==='mes'&&v==='mes') ? ' active' : ''
    );
  });
  renderCal();
}

function calNav(dir) {
  var d = calCurrentDate;
  if (calViewMode === 'dia') {
    d.setDate(d.getDate() + dir);
  } else if (calViewMode === 'semana') {
    d.setDate(d.getDate() + dir * 7);
  } else {
    d.setMonth(d.getMonth() + dir);
    d.setDate(1);
  }
  calCurrentDate = d;
  renderCal();
}

function calGoToday() {
  calCurrentDate = new Date();
  renderCal();
}

// ── Tooltip hover ────────────────────────────────────────────
function calShowTip(evt, key) {
  var t = turnosData[key];
  if (!t) return;
  var tip = document.getElementById('cal-tooltip');
  var trat = t.tratamientos && t.tratamientos.length
    ? t.tratamientos.map(function(x){ return x.nombre; }).join(', ')
    : (t.tratamiento || 'Consulta');
  document.getElementById('cal-tt-name').textContent = t.paciente || '';
  document.getElementById('cal-tt-hora').textContent = t.hora ? t.hora + ' hs' : '';
  document.getElementById('cal-tt-trat').textContent = trat;
  tip.style.top  = (evt.clientY + 12) + 'px';
  tip.style.left = (evt.clientX + 12) + 'px';
  tip.className = 'cal-tooltip show';
}

function calHideTip() {
  var tip = document.getElementById('cal-tooltip');
  if (tip) tip.className = 'cal-tooltip';
}
