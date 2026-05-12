// ═══════════════════════════════════════════
// REPORTES — Panel de análisis mensual (solo admins)
// ═══════════════════════════════════════════

var repMesActual = new Date().getMonth();
var repAnioActual = new Date().getFullYear();

var MESES_REP = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

function renderReportes() {
  if (!usuarioPuede('reportes')) return;
  var cont = document.getElementById('rep-contenido');
  if (!cont) return;

  var mes  = repMesActual;
  var anio = repAnioActual;

  var mesStr  = String(mes + 1).padStart(2, '0');
  var prefijo = anio + '-' + mesStr;

  // Mes anterior
  var mesAntNum  = mes === 0 ? 11 : mes - 1;
  var anioAntNum = mes === 0 ? anio - 1 : anio;
  var prefijoAnt = anioAntNum + '-' + String(mesAntNum + 1).padStart(2, '0');

  // ── Datos del mes actual ─────────────────────────────────
  var turnosMes = Object.values(turnosData).filter(function(t) {
    return !t.eliminado && (t.fecha || '').startsWith(prefijo);
  });

  var turnosAnt = Object.values(turnosData).filter(function(t) {
    return !t.eliminado && (t.fecha || '').startsWith(prefijoAnt);
  });

  var pagosMes = Object.values(pagosData || {}).filter(function(p) {
    return !p.eliminado && (p.fecha || '').startsWith(prefijo);
  });

  var pagosAnt = Object.values(pagosData || {}).filter(function(p) {
    return !p.eliminado && (p.fecha || '').startsWith(prefijoAnt);
  });

  // Totales
  var totalMes = pagosMes.reduce(function(s, p) { return s + (parseFloat(p.monto) || 0); }, 0);
  var totalAnt = pagosAnt.reduce(function(s, p) { return s + (parseFloat(p.monto) || 0); }, 0);
  var diffPct  = totalAnt > 0 ? Math.round((totalMes - totalAnt) / totalAnt * 100) : null;

  var turnosRealizados    = turnosMes.filter(function(t) { return t.estado === 'completado'; }).length;
  var turnosRealizadosAnt = turnosAnt.filter(function(t) { return t.estado === 'completado'; }).length;
  var turnosCancelados    = turnosMes.filter(function(t) { return t.estado === 'cancelado'; }).length;
  var turnosProximos      = turnosMes.filter(function(t) { return t.estado === 'proximo' || t.estado === 'in_progress'; }).length;

  // Por método de pago
  var porMetodo = {};
  pagosMes.forEach(function(p) {
    var m = p.metodo || 'efectivo';
    porMetodo[m] = (porMetodo[m] || 0) + (parseFloat(p.monto) || 0);
  });

  // Ranking tratamientos
  var contTrats = {};
  turnosMes.filter(function(t){ return t.estado === 'completado'; }).forEach(function(t) {
    if (t.tratamientos && t.tratamientos.length) {
      t.tratamientos.forEach(function(tr) {
        contTrats[tr.nombre] = (contTrats[tr.nombre] || 0) + 1;
      });
    } else if (t.tratamiento) {
      contTrats[t.tratamiento] = (contTrats[t.tratamiento] || 0) + 1;
    }
  });
  var rankingTrats = Object.keys(contTrats).sort(function(a,b){ return contTrats[b]-contTrats[a]; }).slice(0, 6);

  // Día de semana más ocupado
  var porDia = [0,0,0,0,0,0,0]; // Dom-Sáb
  turnosMes.filter(function(t){ return t.estado === 'completado'; }).forEach(function(t) {
    if (t.fecha) {
      var d = new Date(t.fecha + 'T12:00:00');
      porDia[d.getDay()]++;
    }
  });
  var DIAS_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
  var maxDia = porDia.indexOf(Math.max.apply(null, porDia));

  // Franja horaria más ocupada
  var porHora = {};
  turnosMes.filter(function(t){ return t.estado === 'completado' && t.hora; }).forEach(function(t) {
    var h = parseInt(t.hora.split(':')[0]);
    var franja = h < 10 ? '07–10 hs' : h < 13 ? '10–13 hs' : h < 16 ? '13–16 hs' : '16–20 hs';
    porHora[franja] = (porHora[franja] || 0) + 1;
  });
  var franjaTop = Object.keys(porHora).sort(function(a,b){ return porHora[b]-porHora[a]; })[0] || '—';

  // Pacientes nuevos vs recurrentes
  var pacNuevos = turnosMes.filter(function(t){ return t.primeraVez === true; }).length;
  var pacRecurrentes = turnosMes.filter(function(t){ return t.primeraVez === false; }).length;

  // ── HTML ─────────────────────────────────────────────────
  var flechaDiff = diffPct === null ? '' :
    diffPct >= 0
      ? '<span style="color:#3D6B10;font-size:13px;font-weight:700">▲ '+diffPct+'% vs mes anterior</span>'
      : '<span style="color:#C0392B;font-size:13px;font-weight:700">▼ '+Math.abs(diffPct)+'% vs mes anterior</span>';

  var METODO_LABEL = { efectivo:'💵 Efectivo', transferencia:'📲 Transferencia', tarjeta:'💳 Tarjeta', mercadopago:'💸 Mercado Pago', qr:'📱 QR' };

  var metodosHTML = Object.keys(porMetodo).length
    ? Object.keys(porMetodo).sort(function(a,b){ return porMetodo[b]-porMetodo[a]; }).map(function(m) {
        var pct = totalMes > 0 ? Math.round(porMetodo[m]/totalMes*100) : 0;
        return '<div style="margin-bottom:10px">'+
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'+
            '<span style="font-size:13px;color:var(--brown-mid)">'+(METODO_LABEL[m]||m)+'</span>'+
            '<span style="font-size:13px;font-weight:700;color:var(--brown)">$'+porMetodo[m].toLocaleString('es-AR')+'&nbsp;<span style="font-size:11px;color:var(--brown-soft)">('+pct+'%)</span></span>'+
          '</div>'+
          '<div style="height:6px;background:var(--ivory);border-radius:4px;overflow:hidden">'+
            '<div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--gold-dark),var(--gold));border-radius:4px"></div>'+
          '</div>'+
        '</div>';
      }).join('')
    : '<div style="color:var(--brown-soft);font-size:13px">Sin cobros registrados este mes</div>';

  var rankingHTML = rankingTrats.length
    ? rankingTrats.map(function(nombre, i) {
        var cant = contTrats[nombre];
        var max  = contTrats[rankingTrats[0]];
        var pct  = Math.round(cant/max*100);
        return '<div style="margin-bottom:10px">'+
          '<div style="display:flex;justify-content:space-between;margin-bottom:4px">'+
            '<span style="font-size:13px;color:var(--brown)">'+(i+1)+'. '+sanitize(nombre)+'</span>'+
            '<span style="font-size:13px;font-weight:700;color:var(--gold-dark)">'+cant+'×</span>'+
          '</div>'+
          '<div style="height:6px;background:var(--ivory);border-radius:4px;overflow:hidden">'+
            '<div style="height:100%;width:'+pct+'%;background:linear-gradient(90deg,var(--gold-dark),var(--gold));border-radius:4px"></div>'+
          '</div>'+
        '</div>';
      }).join('')
    : '<div style="color:var(--brown-soft);font-size:13px">Sin tratamientos realizados este mes</div>';

  function card(titulo, contenido) {
    return '<div style="background:var(--white);border-radius:20px;padding:18px 20px;margin-bottom:14px;border:1px solid var(--border);box-shadow:0 2px 16px rgba(59,51,43,.06)">'+
      '<div style="font-family:var(--font-display);font-size:10px;font-weight:600;color:var(--gold-dark);letter-spacing:.28em;text-transform:uppercase;margin-bottom:14px">'+titulo+'</div>'+
      contenido+
    '</div>';
  }

  var html = '';

  // Navegación mes
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">';
  html += '<button onclick="repNavMes(-1)" style="background:none;border:1px solid var(--border);border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer;color:var(--brown)">‹</button>';
  html += '<div style="font-family:var(--font-display);font-size:16px;font-weight:600;color:var(--brown);text-align:center">'+MESES_REP[mes]+' '+anio+'</div>';
  html += '<button onclick="repNavMes(1)" style="background:none;border:1px solid var(--border);border-radius:50%;width:34px;height:34px;font-size:16px;cursor:pointer;color:var(--brown)">›</button>';
  html += '</div>';

  // Card facturación
  html += card('Facturación del mes',
    '<div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:6px">'+
      '<div style="font-size:36px;font-weight:800;color:var(--brown)">$'+totalMes.toLocaleString('es-AR')+'</div>'+
      flechaDiff+
    '</div>'+
    '<div style="font-size:12px;color:var(--brown-soft)">Mes anterior: $'+totalAnt.toLocaleString('es-AR')+'</div>'
  );

  // Card turnos
  html += card('Turnos',
    '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;text-align:center">'+
      '<div><div style="font-size:28px;font-weight:800;color:#3D6B10">'+turnosRealizados+'</div><div style="font-size:11px;color:var(--brown-soft);margin-top:3px">Realizados</div></div>'+
      '<div><div style="font-size:28px;font-weight:800;color:var(--gold-dark)">'+turnosProximos+'</div><div style="font-size:11px;color:var(--brown-soft);margin-top:3px">Próximos</div></div>'+
      '<div><div style="font-size:28px;font-weight:800;color:#C0392B">'+turnosCancelados+'</div><div style="font-size:11px;color:var(--brown-soft);margin-top:3px">Cancelados</div></div>'+
    '</div>'+
    (turnosRealizadosAnt > 0 ? '<div style="font-size:12px;color:var(--brown-soft);margin-top:12px;text-align:center">Mes anterior: '+turnosRealizadosAnt+' realizados</div>' : '')
  );

  // Card métodos de pago
  html += card('Cobros por método', metodosHTML);

  // Card ranking tratamientos
  html += card('Tratamientos más realizados', rankingHTML);

  // Card hábitos
  html += card('Días y horarios',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">'+
      '<div style="text-align:center;background:var(--ivory);border-radius:14px;padding:14px 10px">'+
        '<div style="font-size:11px;font-weight:700;color:var(--gold-dark);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Día más ocupado</div>'+
        '<div style="font-size:20px;font-weight:800;color:var(--brown)">'+(porDia[maxDia]>0?DIAS_FULL[maxDia]:'—')+'</div>'+
        (porDia[maxDia]>0?'<div style="font-size:12px;color:var(--brown-soft);margin-top:3px">'+porDia[maxDia]+' turnos</div>':'')+
      '</div>'+
      '<div style="text-align:center;background:var(--ivory);border-radius:14px;padding:14px 10px">'+
        '<div style="font-size:11px;font-weight:700;color:var(--gold-dark);letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px">Franja peak</div>'+
        '<div style="font-size:20px;font-weight:800;color:var(--brown)">'+franjaTop+'</div>'+
        (porHora[franjaTop]?'<div style="font-size:12px;color:var(--brown-soft);margin-top:3px">'+porHora[franjaTop]+' turnos</div>':'')+
      '</div>'+
    '</div>'
  );

  // Card pacientes
  html += card('Pacientes',
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;text-align:center">'+
      '<div style="background:var(--ivory);border-radius:14px;padding:14px 10px">'+
        '<div style="font-size:28px;font-weight:800;color:var(--gold-dark)">'+pacNuevos+'</div>'+
        '<div style="font-size:11px;color:var(--brown-soft);margin-top:3px">Primera vez</div>'+
      '</div>'+
      '<div style="background:var(--ivory);border-radius:14px;padding:14px 10px">'+
        '<div style="font-size:28px;font-weight:800;color:var(--brown)">'+pacRecurrentes+'</div>'+
        '<div style="font-size:11px;color:var(--brown-soft);margin-top:3px">Recurrentes</div>'+
      '</div>'+
    '</div>'
  );

  cont.innerHTML = html;
}

function repNavMes(dir) {
  repMesActual += dir;
  if (repMesActual > 11) { repMesActual = 0;  repAnioActual++; }
  if (repMesActual < 0)  { repMesActual = 11; repAnioActual--; }
  renderReportes();
}
