// ═══════════════════════════════════════════
// STOCK — Gestión de insumos (solo admins)
// ═══════════════════════════════════════════

var stockData = {};           // insumos cargados desde Firebase
var stockFormVisible = false;
var stockEditKey = null;

// ── Listener Firebase ────────────────────────────────────────
function initStock() {
  db.ref('insumos').on('child_added',   function(s){ stockData[s.key] = s.val(); renderStock(); });
  db.ref('insumos').on('child_changed', function(s){ stockData[s.key] = s.val(); renderStock(); });
  db.ref('insumos').on('child_removed', function(s){ delete stockData[s.key];    renderStock(); });
}

// ── Render principal ─────────────────────────────────────────
function renderStock() {
  if (!usuarioPuede('stock')) return;
  var contenido = document.getElementById('stock-contenido');
  if (!contenido) return;

  var keys = Object.keys(stockData).filter(function(k){ return !stockData[k].eliminado; });

  // Agrupar por categoría
  var grupos = {};
  keys.forEach(function(k) {
    var item = stockData[k];
    var cat = item.categoria || 'General';
    if (!grupos[cat]) grupos[cat] = [];
    grupos[cat].push({ key: k, item: item });
  });

  // Alertas de stock bajo
  var bajos = keys.filter(function(k){
    var it = stockData[k];
    return (it.stockMinimo > 0) && (it.stock <= it.stockMinimo);
  });

  var html = '';

  // Banner alertas
  if (bajos.length) {
    html += '<div style="background:#FDF0EE;border:1px solid #F0C0B8;border-radius:14px;padding:12px 16px;margin-bottom:18px;display:flex;align-items:center;gap:10px">' +
      '<span style="font-size:18px">⚠️</span>' +
      '<div><div style="font-size:12px;font-weight:700;color:#A03020">Stock bajo en ' + bajos.length + ' insumo' + (bajos.length>1?'s':'') + '</div>' +
      '<div style="font-size:11px;color:#C05040;margin-top:2px">' +
        bajos.map(function(k){ return stockData[k].nombre; }).join(', ') +
      '</div></div>' +
    '</div>';
  }

  if (!keys.length) {
    html += '<div class="empty"><div class="empty-icon">📦</div>Sin insumos cargados.<br><span style="font-size:12px">Usá el botón para agregar el primer insumo.</span></div>';
    document.getElementById('stock-contenido').innerHTML = html;
    return;
  }

  // Tabla por categoría
  Object.keys(grupos).sort().forEach(function(cat) {
    var items = grupos[cat];
    html += '<div style="margin-bottom:24px">';
    html += '<div class="section-label">' + cat + '</div>';

    items.sort(function(a,b){ return (a.item.nombre||'').localeCompare(b.item.nombre||''); }).forEach(function(d) {
      var it = d.item;
      var bajo = (it.stockMinimo > 0) && (it.stock <= it.stockMinimo);
      var stockColor = bajo ? '#A03020' : 'var(--brown)';
      var stockBg    = bajo ? '#FDF0EE' : 'var(--ivory)';

      html += '<div style="background:var(--white);border:1px solid var(--border);border-radius:16px;padding:14px 16px;margin-bottom:10px;display:flex;align-items:center;gap:12px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:14px;font-weight:600;color:var(--brown)">' + sanitize(it.nombre) + '</div>' +
          (it.descripcion ? '<div style="font-size:11px;color:var(--brown-soft);margin-top:2px">' + sanitize(it.descripcion) + '</div>' : '') +
        '</div>' +
        // Stock actual con botones +/-
        '<div style="display:flex;align-items:center;gap:6px">' +
          '<button onclick="ajustarStock(\'' + d.key + '\',-1)" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:var(--ivory);color:var(--brown);font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">−</button>' +
          '<div style="min-width:64px;text-align:center;background:' + stockBg + ';border:1px solid ' + (bajo ? '#F0C0B8' : 'var(--border)') + ';border-radius:10px;padding:6px 10px">' +
            '<div style="font-size:18px;font-weight:800;color:' + stockColor + ';line-height:1">' + (it.stock || 0) + '</div>' +
            '<div style="font-size:9px;color:var(--brown-soft);letter-spacing:.06em;text-transform:uppercase;margin-top:2px">' + sanitize(it.unidad || 'unid.') + '</div>' +
          '</div>' +
          '<button onclick="ajustarStock(\'' + d.key + '\',1)" style="width:28px;height:28px;border-radius:50%;border:1px solid var(--border);background:var(--ivory);color:var(--brown);font-size:16px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center">+</button>' +
        '</div>' +
        // Mínimo y acciones
        '<div style="text-align:right;flex-shrink:0">' +
          (it.stockMinimo > 0 ? '<div style="font-size:10px;color:var(--brown-soft);margin-bottom:6px">Mín: ' + it.stockMinimo + '</div>' : '<div style="margin-bottom:6px"></div>') +
          '<div style="display:flex;gap:6px;justify-content:flex-end">' +
            '<button class="act-btn btn-ficha" onclick="editarInsumo(\'' + d.key + '\')" style="font-size:11px;padding:4px 10px">Editar</button>' +
            '<button class="act-btn btn-del"   onclick="eliminarInsumo(\'' + d.key + '\')" style="font-size:11px;padding:4px 10px">Eliminar</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    });

    html += '</div>';
  });

  document.getElementById('stock-contenido').innerHTML = html;
}

// ── Ajuste rápido de stock (+/−) ─────────────────────────────
function ajustarStock(key, delta) {
  if (!requiereAdmin()) return;
  var actual = parseInt(stockData[key] && stockData[key].stock) || 0;
  var nuevo  = Math.max(0, actual + delta);
  db.ref('insumos/' + key + '/stock').set(nuevo);
}

// ── Descuento automático al completar turno ──────────────────
function descontarStockPorTurno(turno) {
  if (!turno || !turno.tratamientos) return;
  var tratArray = Array.isArray(turno.tratamientos) ? turno.tratamientos : [];
  var updates = {};

  tratArray.forEach(function(tr) {
    if (!tr.key || !tratamientosData[tr.key]) return;
    var insumosDeTrat = tratamientosData[tr.key].insumos;
    if (!insumosDeTrat) return;
    Object.keys(insumosDeTrat).forEach(function(insumoKey) {
      var cantidad = parseInt(insumosDeTrat[insumoKey]) || 0;
      if (!cantidad) return;
      var stockActual = parseInt(stockData[insumoKey] && stockData[insumoKey].stock) || 0;
      var nuevo = Math.max(0, stockActual - cantidad);
      updates['insumos/' + insumoKey + '/stock'] = nuevo;
      // actualizar local para no descontar dos veces si hay dos tratamientos con el mismo insumo
      if (stockData[insumoKey]) stockData[insumoKey].stock = nuevo;
    });
  });

  if (Object.keys(updates).length) {
    db.ref().update(updates);
  }
}

// ── Formulario nuevo / editar insumo ────────────────────────
function toggleFormStock() {
  stockFormVisible = !stockFormVisible;
  if (!stockFormVisible) stockEditKey = null;
  var form = document.getElementById('form-stock');
  if (form) form.className = 'form-card' + (stockFormVisible ? ' visible' : '');
  var btn = document.getElementById('btn-nuevo-insumo');
  if (btn) btn.textContent = stockFormVisible ? '✕ Cerrar' : '+ Insumo';
  if (!stockFormVisible) limpiarFormStock();
}

function limpiarFormStock() {
  ['stock-nombre','stock-categoria','stock-stock','stock-minimo','stock-unidad','stock-descripcion'].forEach(function(id){
    var el = document.getElementById(id);
    if (el) el.value = '';
  });
  var err = document.getElementById('stock-err');
  if (err) err.className = 'err';
  var titulo = document.getElementById('form-stock-title');
  if (titulo) titulo.textContent = 'Nuevo insumo';
  stockEditKey = null;
}

function editarInsumo(key) {
  var it = stockData[key];
  if (!it) return;
  stockEditKey = key;
  document.getElementById('stock-nombre').value      = it.nombre      || '';
  document.getElementById('stock-categoria').value   = it.categoria   || '';
  document.getElementById('stock-stock').value       = it.stock       || 0;
  document.getElementById('stock-minimo').value      = it.stockMinimo || 0;
  document.getElementById('stock-unidad').value      = it.unidad      || '';
  document.getElementById('stock-descripcion').value = it.descripcion || '';
  document.getElementById('form-stock-title').textContent = 'Editar insumo';
  if (!stockFormVisible) toggleFormStock();
  document.getElementById('form-stock').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function guardarInsumo() {
  if (!requiereAdmin()) return;
  var nombre    = (document.getElementById('stock-nombre').value || '').trim();
  var categoria = (document.getElementById('stock-categoria').value || '').trim() || 'General';
  var stock     = parseInt(document.getElementById('stock-stock').value) || 0;
  var minimo    = parseInt(document.getElementById('stock-minimo').value) || 0;
  var unidad    = (document.getElementById('stock-unidad').value || '').trim() || 'unidad';
  var desc      = (document.getElementById('stock-descripcion').value || '').trim();
  var err       = document.getElementById('stock-err');

  if (!nombre) { err.textContent = 'Ingresá el nombre del insumo.'; err.className = 'err visible'; return; }
  err.className = 'err';

  var btn = document.getElementById('btn-save-insumo');
  btn.disabled = true; btn.textContent = 'Guardando…';

  var data = { nombre: nombre, categoria: categoria, stock: stock, stockMinimo: minimo, unidad: unidad };
  if (desc) data.descripcion = desc;

  var promesa = stockEditKey
    ? db.ref('insumos/' + stockEditKey).update(data)
    : db.ref('insumos').push(data);

  promesa.then(function() {
    btn.disabled = false; btn.textContent = 'Guardar insumo';
    toggleFormStock();
  }).catch(function() {
    btn.disabled = false; btn.textContent = 'Guardar insumo';
    err.textContent = 'Error al guardar.'; err.className = 'err visible';
  });
}

function eliminarInsumo(key) {
  if (!requiereAdmin()) return;
  var it = stockData[key];
  if (!confirm('¿Eliminar el insumo "' + (it ? it.nombre : '') + '"?')) return;
  db.ref('insumos/' + key + '/eliminado').set(true);
}

// ── Vincular insumos a un tratamiento ───────────────────────
function abrirModalInsumosTrat(tratKey) {
  if (!requiereAdmin()) return;
  var trat = tratamientosData[tratKey];
  if (!trat) return;

  var insumos = Object.keys(stockData).filter(function(k){ return !stockData[k].eliminado; });
  var vinculados = trat.insumos || {};

  var html = '<div style="padding:20px">' +
    '<div style="font-size:16px;font-weight:700;color:var(--brown);margin-bottom:4px">' + sanitize(trat.nombre) + '</div>' +
    '<div style="font-size:12px;color:var(--brown-soft);margin-bottom:18px">Insumos que se descuentan al realizar este tratamiento</div>';

  if (!insumos.length) {
    html += '<div style="color:var(--brown-soft);font-size:13px;text-align:center;padding:20px">No hay insumos cargados. Cargalos primero en el panel de Stock.</div>';
  } else {
    html += '<div style="display:flex;flex-direction:column;gap:10px">';
    insumos.forEach(function(k) {
      var it = stockData[k];
      var cantidad = vinculados[k] || 0;
      html += '<div style="display:flex;align-items:center;gap:12px;padding:10px 12px;background:var(--ivory);border-radius:12px;border:1px solid var(--border)">' +
        '<div style="flex:1;font-size:13px;font-weight:600;color:var(--brown)">' + sanitize(it.nombre) + '<span style="font-size:11px;color:var(--brown-soft);margin-left:6px">' + sanitize(it.unidad || 'unid.') + '</span></div>' +
        '<input type="number" min="0" value="' + cantidad + '" ' +
          'onchange="_actualizarVinculo(\'' + tratKey + '\',\'' + k + '\',this.value)" ' +
          'style="width:64px;padding:7px 10px;font-size:14px;border:1px solid var(--border);border-radius:10px;background:var(--white);color:var(--brown);font-family:inherit;outline:none;text-align:center" ' +
          'placeholder="0"/>' +
      '</div>';
    });
    html += '</div>';
  }

  html += '<div style="margin-top:18px;font-size:11px;color:var(--brown-soft);text-align:center">Los cambios se guardan automáticamente</div></div>';

  document.getElementById('modal-insumos-body').innerHTML = html;
  document.getElementById('modal-insumos').className = 'modal-overlay active';
}

function _actualizarVinculo(tratKey, insumoKey, valor) {
  var cantidad = parseInt(valor) || 0;
  if (cantidad > 0) {
    db.ref('tratamientos/' + tratKey + '/insumos/' + insumoKey).set(cantidad);
  } else {
    db.ref('tratamientos/' + tratKey + '/insumos/' + insumoKey).remove();
  }
}

function cerrarModalInsumos() {
  var m = document.getElementById('modal-insumos');
  if (m) m.className = 'modal-overlay';
}
