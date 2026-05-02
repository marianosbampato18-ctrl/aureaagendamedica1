// ═══════════════════════════════════════════════════════════════════
// ARCHIVOS — Historia clínica multimedia
//
// Backend: Firebase Realtime Database (sin Storage, sin billing)
// Las imágenes se comprimen con Canvas y se guardan como base64
// en pacientes/{key}/archivos/{pushKey}
//
// Límites: imágenes hasta 10 MB · videos no soportados
// Cada imagen se comprime a ≈ 1280px / JPEG 82% → típico 100-350 KB
// ═══════════════════════════════════════════════════════════════════

// ── Estado ────────────────────────────────────────────────────────
var archivosData       = [];
var filtroArchivos     = 'todos';
var archArchivoActual  = null;
var archPendingFiles   = [];
var formArchivoVisible = false;
var _archLazyObserver  = null;

// ── Config de compresión ──────────────────────────────────────────
var ARCH_MAX_WIDTH   = 1280;  // px lado más largo
var ARCH_QUALITY     = 0.82;  // JPEG quality
var ARCH_MAX_BYTES   = 10 * 1024 * 1024; // 10 MB antes de comprimir

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
function initArchivos() {
  _initDragDrop();
  _patchearFunciones();
  console.log('[Archivos] Módulo listo. Backend: Firebase DB + Canvas compression.');
}

function _patchearFunciones() {
  var _origAbrir  = typeof window.abrirFichaKey === 'function' ? window.abrirFichaKey : null;
  var _origCerrar = typeof window.cerrarFicha   === 'function' ? window.cerrarFicha   : null;
  if (_origAbrir) {
    window.abrirFichaKey = function(key) { _origAbrir(key); cargarArchivos(key); };
  }
  if (_origCerrar) {
    window.cerrarFicha = function() { _origCerrar(); _limpiarModuloArchivos(); };
  }
}

// ═══════════════════════════════════════════════════════════════════
// CARGAR — lee desde Firebase DB
// ═══════════════════════════════════════════════════════════════════
function cargarArchivos(patientId) {
  var lista = document.getElementById('lista-archivos');
  if (lista) lista.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div>Cargando archivos…</div>';

  db.ref('pacientes/' + patientId + '/archivos').once('value', function(snap) {
    var data = snap.val() || {};
    archivosData = Object.keys(data)
      .map(function(k) { return Object.assign({ id: k }, data[k]); })
      .filter(function(f) { return !f.eliminado; })
      .sort(function(a, b) { return (b.fecha || '').localeCompare(a.fecha || ''); });
    console.log('[Archivos] Cargados:', archivosData.length, 'para paciente', patientId);
    renderGaleria();
  }, function(err) {
    console.error('[Archivos] Error al cargar:', err);
    if (lista) lista.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Error al cargar</div>';
  });
}

// ═══════════════════════════════════════════════════════════════════
// RENDER — galería con filtro
// ═══════════════════════════════════════════════════════════════════
function renderGaleria() {
  var lista = document.getElementById('lista-archivos');
  if (!lista) return;

  var filtered = filtroArchivos === 'todos'
    ? archivosData
    : archivosData.filter(function(f) { return f.categoria === filtroArchivos; });

  if (!filtered.length) {
    lista.innerHTML = '<div class="empty"><div class="empty-icon">📸</div>Sin archivos' +
      (filtroArchivos !== 'todos' ? ' en esta categoría' : ' aún') + '</div>';
    return;
  }

  var catLabels = { antes: 'Antes', despues: 'Después', tratamiento: 'Tratamiento' };

  // Las imágenes ya están como dataUrl — se muestran directo, sin lazy load remoto
  lista.innerHTML = filtered.map(function(f) {
    var catLabel = catLabels[f.categoria] || f.categoria || '';
    // Usar thumbnail si existe, si no, el dataUrl completo
    var src = f.thumb || f.dataUrl || '';
    return '<div class="arch-thumb" onclick="abrirModalArchivoView(\'' + f.id + '\')">' +
      '<img src="' + _esc(src) + '" alt="' + _esc(catLabel) + '" loading="lazy"/>' +
      '<div class="arch-thumb-badge">' + catLabel + '</div>' +
    '</div>';
  }).join('');
}

function setFiltroArchivos(btn, cat) {
  filtroArchivos = cat;
  document.querySelectorAll('.arch-filtro-btn').forEach(function(b) {
    b.classList.toggle('sel', b === btn);
  });
  renderGaleria();
}

// ═══════════════════════════════════════════════════════════════════
// FORMULARIO — toggle
// ═══════════════════════════════════════════════════════════════════
function toggleFormArchivo() {
  formArchivoVisible = !formArchivoVisible;
  var form = document.getElementById('form-archivo');
  var btn  = document.getElementById('btn-subir-archivo');
  if (form) form.className = 'form-card' + (formArchivoVisible ? ' visible' : '');
  if (btn) {
    btn.textContent = formArchivoVisible ? '✕ Cerrar' : '+ Subir';
    btn.className   = 'btn-primary' + (formArchivoVisible ? ' active' : '');
  }
  if (!formArchivoVisible) _resetFormArchivo();
}

// ═══════════════════════════════════════════════════════════════════
// SELECCIÓN DE ARCHIVOS — solo imágenes, validación
// ═══════════════════════════════════════════════════════════════════
function onArchivoSeleccionado(input) {
  var fileList = input.files;
  if (!fileList || !fileList.length) return;

  archPendingFiles = [];
  var errores = [];

  for (var i = 0; i < fileList.length; i++) {
    var file    = fileList[i];
    var isImage = file.type.startsWith('image/');

    if (!isImage) {
      errores.push('"' + file.name + '": solo se admiten imágenes (JPG, PNG, HEIC).');
      continue;
    }
    if (file.size > ARCH_MAX_BYTES) {
      errores.push('"' + file.name + '": supera 10 MB.');
      continue;
    }
    archPendingFiles.push(file);
  }

  _showArchErr(errores.length ? errores.join(' · ') : null);

  if (!archPendingFiles.length) {
    var btnUp = document.getElementById('btn-confirmar-upload');
    if (btnUp) btnUp.disabled = true;
    return;
  }

  console.log('[Archivos] Seleccionados:', archPendingFiles.length, 'imagen(es) válida(s)');

  var dropText = document.querySelector('#arch-drop-zone .arch-drop-text');
  if (dropText) {
    dropText.textContent = archPendingFiles.length === 1
      ? archPendingFiles[0].name
      : archPendingFiles.length + ' imágenes seleccionadas';
  }

  _renderPreviewLista(archPendingFiles);

  var btn = document.getElementById('btn-confirmar-upload');
  if (btn) {
    btn.disabled    = false;
    btn.textContent = archPendingFiles.length === 1
      ? 'Subir imagen'
      : 'Subir ' + archPendingFiles.length + ' imágenes';
  }
}

// Preview: imagen simple si es 1, lista de nombres si son varias
function _renderPreviewLista(files) {
  var wrap = document.getElementById('arch-preview-wrap');
  var img  = document.getElementById('arch-preview-img');
  if (!wrap) return;

  if (img) { img.src = ''; img.style.display = 'none'; }
  var prevList = wrap.querySelector('.arch-file-list');
  if (prevList) prevList.remove();

  if (files.length === 1 && img) {
    img.src = URL.createObjectURL(files[0]);
    img.style.display = 'block';
    wrap.style.display = 'block';
    return;
  }

  var listDiv = document.createElement('div');
  listDiv.className = 'arch-file-list';
  listDiv.style.cssText = 'margin-top:12px;max-height:150px;overflow-y:auto;border-radius:10px;border:1px solid var(--border);padding:0 10px';
  listDiv.innerHTML = files.map(function(f, i) {
    var mb     = (f.size / 1024 / 1024).toFixed(1) + ' MB';
    var border = i < files.length - 1 ? 'border-bottom:1px solid var(--ivory)' : '';
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;' + border + ';font-size:12px;color:var(--brown)">' +
      '<span>🖼</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(f.name) + '</span>' +
      '<span style="color:var(--brown-soft);flex-shrink:0">' + mb + '</span>' +
    '</div>';
  }).join('');
  wrap.appendChild(listDiv);
  wrap.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════════
// COMPRESIÓN con Canvas
// Devuelve { dataUrl, thumb } via callback(err, result)
// ═══════════════════════════════════════════════════════════════════
function _comprimirImagen(file, callback) {
  var imgEl = new Image();
  var url   = URL.createObjectURL(file);

  imgEl.onload = function() {
    URL.revokeObjectURL(url);

    var w = imgEl.naturalWidth;
    var h = imgEl.naturalHeight;

    // Redimensionar manteniendo proporción
    if (w > ARCH_MAX_WIDTH || h > ARCH_MAX_WIDTH) {
      if (w >= h) { h = Math.round(h * ARCH_MAX_WIDTH / w); w = ARCH_MAX_WIDTH; }
      else        { w = Math.round(w * ARCH_MAX_WIDTH / h); h = ARCH_MAX_WIDTH; }
    }

    // Canvas principal
    var canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(imgEl, 0, 0, w, h);
    var dataUrl = canvas.toDataURL('image/jpeg', ARCH_QUALITY);

    // Thumbnail para galería (300px)
    var tw = 300, th = Math.round(h * 300 / w);
    if (h > w) { th = 300; tw = Math.round(w * 300 / h); }
    var tCanvas = document.createElement('canvas');
    tCanvas.width  = tw;
    tCanvas.height = th;
    tCanvas.getContext('2d').drawImage(imgEl, 0, 0, tw, th);
    var thumb = tCanvas.toDataURL('image/jpeg', 0.70);

    var kbFull  = Math.round(dataUrl.length * 0.75 / 1024);
    var kbThumb = Math.round(thumb.length * 0.75 / 1024);
    console.log('[Archivos] Comprimido:', file.name,
      '| Original:', (file.size/1024).toFixed(0)+'KB',
      '| Full:', kbFull+'KB',
      '| Thumb:', kbThumb+'KB');

    callback(null, { dataUrl: dataUrl, thumb: thumb });
  };

  imgEl.onerror = function() {
    URL.revokeObjectURL(url);
    callback(new Error('No se pudo leer: ' + file.name));
  };

  imgEl.src = url;
}

// ═══════════════════════════════════════════════════════════════════
// UPLOAD — comprime y guarda en Firebase DB
// ═══════════════════════════════════════════════════════════════════
function confirmarUpload() {
  if (!archPendingFiles.length || !fichaActualKey) {
    console.warn('[Archivos] Nada que subir o sin paciente activo.');
    return;
  }

  var cat   = (document.getElementById('arch-categoria') || {}).value || 'tratamiento';
  var notas = ((document.getElementById('arch-notas') || {}).value || '').trim();
  var btn   = document.getElementById('btn-confirmar-upload');

  _setProgress(0, 'Preparando…');
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }

  var total   = archPendingFiles.length;
  var subidos = 0;
  var errores = [];
  var idx     = 0;

  function procesarSiguiente() {
    if (idx >= total) {
      // Fin
      _setProgress(100, subidos === total
        ? '✓ ' + subidos + ' imagen' + (subidos !== 1 ? 'es' : '') + ' guardada' + (subidos !== 1 ? 's' : '') + ' correctamente'
        : '⚠ ' + subidos + ' OK · ' + errores.length + ' con error'
      );
      if (errores.length) {
        _showArchErr('Error en: ' + errores.join(', '));
        if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; }
      }
      if (subidos > 0) {
        setTimeout(function() {
          if (!errores.length) toggleFormArchivo();
          cargarArchivos(fichaActualKey);
        }, 900);
      }
      return;
    }

    var file = archPendingFiles[idx];
    _setProgress(Math.round((idx / total) * 85), 'Comprimiendo ' + (idx + 1) + ' de ' + total + '…');

    _comprimirImagen(file, function(err, result) {
      if (err) {
        console.error('[Archivos] Error comprimiendo:', file.name, err);
        errores.push('"' + file.name + '": ' + err.message);
        idx++;
        procesarSiguiente();
        return;
      }

      _setProgress(Math.round(((idx + 0.5) / total) * 85), 'Guardando ' + (idx + 1) + ' de ' + total + '…');

      db.ref('pacientes/' + fichaActualKey + '/archivos').push({
        dataUrl:   result.dataUrl,
        thumb:     result.thumb,
        categoria: cat,
        notas:     notas,
        nombre:    file.name,
        fecha:     new Date().toISOString(),
        eliminado: false
      })
      .then(function() {
        console.log('[Archivos] ✓ Guardado en DB:', file.name);
        subidos++;
        idx++;
        procesarSiguiente();
      })
      .catch(function(dbErr) {
        console.error('[Archivos] ✗ Error DB:', file.name, dbErr);
        errores.push('"' + file.name + '": error al guardar');
        idx++;
        procesarSiguiente();
      });
    });
  }

  procesarSiguiente();
}

// ═══════════════════════════════════════════════════════════════════
// MODAL VISOR
// ═══════════════════════════════════════════════════════════════════
function abrirModalArchivoView(id) {
  var f = archivosData.find(function(x) { return x.id === id; });
  if (!f) return;
  archArchivoActual = f;

  var overlay = document.getElementById('modal-arch-view');
  if (!overlay) return;

  var catLabels = { antes: 'Antes', despues: 'Después', tratamiento: 'Tratamiento' };
  document.getElementById('mav-categoria').textContent = catLabels[f.categoria] || f.categoria || '';
  document.getElementById('mav-fecha').textContent = f.fecha
    ? new Date(f.fecha).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  var img = document.getElementById('mav-img');
  var vid = document.getElementById('mav-vid');
  img.style.display = 'none'; img.src = '';
  if (vid) { vid.style.display = 'none'; vid.pause(); vid.src = ''; }

  // Mostrar imagen en alta resolución
  img.src = f.dataUrl || f.thumb || '';
  img.style.display = 'block';

  var notasEl = document.getElementById('mav-notas');
  if (notasEl) {
    notasEl.textContent = f.notas || '';
    notasEl.className   = 'modal-arch-notas' + (f.notas ? ' visible' : '');
  }

  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function cerrarModalArchivoView(e) {
  if (e && e.target !== document.getElementById('modal-arch-view')) return;
  _cerrarModalArch();
}

function _cerrarModalArch() {
  var overlay = document.getElementById('modal-arch-view');
  if (overlay) overlay.style.display = 'none';
  document.body.style.overflow = '';
  archArchivoActual = null;
}

// ═══════════════════════════════════════════════════════════════════
// ELIMINAR — soft delete en Firebase DB
// ═══════════════════════════════════════════════════════════════════
function eliminarArchivoActual() {
  if (!archArchivoActual) return;
  if (!confirm('¿Eliminar esta imagen? No se puede deshacer.')) return;

  var id = archArchivoActual.id;
  db.ref('pacientes/' + fichaActualKey + '/archivos/' + id)
    .update({ eliminado: true, dataUrl: null, thumb: null }) // liberar espacio en DB
    .then(function() {
      console.log('[Archivos] Eliminado:', id);
      _cerrarModalArch();
      cargarArchivos(fichaActualKey);
    })
    .catch(function(err) { alert('Error al eliminar: ' + (err.message || '')); });
}

// ═══════════════════════════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════════════════════════
function _initDragDrop() {
  var zone = document.getElementById('arch-drop-zone');
  if (!zone) return;
  ['dragenter', 'dragover'].forEach(function(ev) {
    zone.addEventListener(ev, function(e) { e.preventDefault(); zone.classList.add('over'); });
  });
  ['dragleave', 'drop'].forEach(function(ev) {
    zone.addEventListener(ev, function(e) { e.preventDefault(); zone.classList.remove('over'); });
  });
  zone.addEventListener('drop', function(e) {
    var files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length) onArchivoSeleccionado({ files: files });
  });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS PRIVADOS
// ═══════════════════════════════════════════════════════════════════
function _setProgress(pct, txt) {
  var progWrap = document.getElementById('arch-progress-wrap');
  var progBar  = document.getElementById('arch-progress-bar');
  var progTxt  = document.getElementById('arch-progress-txt');
  if (progWrap) progWrap.style.display = 'block';
  if (progBar)  progBar.style.width = pct + '%';
  if (progTxt)  progTxt.textContent = txt || '';
}

function _resetFormArchivo() {
  archPendingFiles = [];
  var fi = document.getElementById('arch-file-input');
  if (fi) fi.value = '';
  var img  = document.getElementById('arch-preview-img');
  var wrap = document.getElementById('arch-preview-wrap');
  if (img)  { img.src = ''; img.style.display = 'none'; }
  if (wrap) {
    var prevList = wrap.querySelector('.arch-file-list');
    if (prevList) prevList.remove();
    wrap.style.display = 'none';
  }
  var progWrap = document.getElementById('arch-progress-wrap');
  var progBar  = document.getElementById('arch-progress-bar');
  var progTxt  = document.getElementById('arch-progress-txt');
  if (progWrap) progWrap.style.display = 'none';
  if (progBar)  progBar.style.width = '0';
  if (progTxt)  progTxt.textContent = 'Subiendo…';
  var btnUp = document.getElementById('btn-confirmar-upload');
  if (btnUp) { btnUp.disabled = true; btnUp.textContent = 'Subir imagen'; }
  var cat   = document.getElementById('arch-categoria');
  var notas = document.getElementById('arch-notas');
  if (cat)   cat.value   = 'tratamiento';
  if (notas) notas.value = '';
  var dropText = document.querySelector('#arch-drop-zone .arch-drop-text');
  if (dropText) dropText.textContent = 'Tocá o arrastrá aquí';
  _showArchErr(null);
}

function _limpiarModuloArchivos() {
  archivosData = []; filtroArchivos = 'todos';
  archArchivoActual = null; formArchivoVisible = false;
  var lista = document.getElementById('lista-archivos');
  if (lista) lista.innerHTML = '<div class="empty"><div class="empty-icon">📸</div>Sin archivos aún</div>';
  var form = document.getElementById('form-archivo');
  if (form) form.className = 'form-card';
  var btnSubir = document.getElementById('btn-subir-archivo');
  if (btnSubir) { btnSubir.textContent = '+ Subir'; btnSubir.className = 'btn-primary'; }
  document.querySelectorAll('.arch-filtro-btn').forEach(function(b, i) {
    b.classList.toggle('sel', i === 0);
  });
  if (_archLazyObserver) { _archLazyObserver.disconnect(); _archLazyObserver = null; }
  _resetFormArchivo();
}

function _showArchErr(msg) {
  var err = document.getElementById('arch-err');
  if (!err) return;
  if (msg) { err.textContent = msg; err.className = 'err visible'; }
  else      { err.textContent = '';  err.className = 'err'; }
}

function _esc(str) {
  if (!str) return '';
  // Para dataUrls no escapamos (son seguras), solo para strings externos
  if (str.startsWith('data:')) return str;
  return str.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Auto-init ─────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initArchivos);
} else {
  initArchivos();
}
