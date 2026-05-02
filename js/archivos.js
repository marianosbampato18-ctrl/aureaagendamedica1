// ═══════════════════════════════════════════
// ARCHIVOS — Historia clínica multimedia
// Supabase Storage + PostgreSQL tabla `files`
// ═══════════════════════════════════════════

// ── Configuración Supabase ────────────────────────────────────────
// PASO OBLIGATORIO: reemplazá estos dos valores con los de tu proyecto.
// Los encontrás en Supabase → Settings → API.
var SUPABASE_URL      = 'https://TU_PROYECTO.supabase.co';
var SUPABASE_ANON_KEY = 'TU_ANON_KEY_PUBLICA';
var SUPABASE_BUCKET   = 'medical-files';

var _sbClient = null; // se inicializa en initArchivos()

// ── Estado del módulo ─────────────────────────────────────────────
var archivosData       = []; // array con todos los archivos del paciente actual
var filtroArchivos     = 'todos'; // 'todos' | 'antes' | 'despues' | 'tratamiento'
var archArchivoActual  = null;   // objeto del archivo abierto en modal
var formArchivoVisible = false;
var archPendingFile    = null;   // File object pendiente de subir

// ── Observer lazy loading ─────────────────────────────────────────
var _archLazyObserver = null;

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
function initArchivos() {
  if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
    console.warn('[Archivos] SDK de Supabase no disponible. Agregá el CDN antes de archivos.js.');
    return;
  }
  if (SUPABASE_URL === 'https://TU_PROYECTO.supabase.co') {
    console.warn('[Archivos] Configurá SUPABASE_URL y SUPABASE_ANON_KEY en js/archivos.js');
    return;
  }

  _sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  _initDragDrop();
  _patchearFunciones();
}

// Parchea abrirFichaKey y cerrarFicha de pacientes.js sin tocar ese archivo.
function _patchearFunciones() {
  var _origAbrir  = typeof window.abrirFichaKey === 'function' ? window.abrirFichaKey : null;
  var _origCerrar = typeof window.cerrarFicha   === 'function' ? window.cerrarFicha   : null;

  if (_origAbrir) {
    window.abrirFichaKey = function(key) {
      _origAbrir(key);
      cargarArchivos(key);
    };
  }
  if (_origCerrar) {
    window.cerrarFicha = function() {
      _origCerrar();
      _limpiarModuloArchivos();
    };
  }
}

// ═══════════════════════════════════════════════════════════════════
// CARGAR — trae los archivos del paciente desde Supabase
// ═══════════════════════════════════════════════════════════════════
function cargarArchivos(patientId) {
  if (!_sbClient) return;
  var lista = document.getElementById('lista-archivos');
  if (lista) lista.innerHTML = '<div class="empty"><div class="empty-icon">⏳</div>Cargando archivos…</div>';

  _sbClient
    .from('files')
    .select('*')
    .eq('patient_id', patientId)
    .eq('eliminado', false)
    .order('created_at', { ascending: false })
    .then(function(result) {
      if (result.error) {
        console.error('[Archivos] Error al cargar:', result.error);
        if (lista) lista.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Error al cargar archivos</div>';
        return;
      }
      archivosData = result.data || [];
      renderGaleria();
    });
}

// ═══════════════════════════════════════════════════════════════════
// RENDER — galería con filtro activo
// ═══════════════════════════════════════════════════════════════════
function renderGaleria() {
  var lista = document.getElementById('lista-archivos');
  if (!lista) return;

  var filtered = filtroArchivos === 'todos'
    ? archivosData
    : archivosData.filter(function(f) { return f.category === filtroArchivos; });

  if (!filtered.length) {
    lista.innerHTML = '<div class="empty"><div class="empty-icon">📸</div>Sin archivos' +
      (filtroArchivos !== 'todos' ? ' en esta categoría' : ' aún') + '</div>';
    return;
  }

  var catLabels = { antes: 'Antes', despues: 'Después', tratamiento: 'Tratamiento' };

  lista.innerHTML = filtered.map(function(f) {
    var isVideo  = f.file_type === 'video';
    var catLabel = catLabels[f.category] || f.category;
    var mediaTag = isVideo
      ? '<video data-src="' + _esc(f.file_url) + '" muted playsinline preload="none"></video>'
      : '<img data-src="' + _esc(f.file_url) + '" alt="' + _esc(catLabel) + '"/>';

    return '<div class="arch-thumb" onclick="abrirModalArchivoView(\'' + f.id + '\')">' +
      mediaTag +
      '<div class="arch-thumb-badge">' + catLabel + '</div>' +
      (isVideo ? '<div class="arch-thumb-play">▶</div>' : '') +
    '</div>';
  }).join('');

  _initLazyLoad();
}

function setFiltroArchivos(btn, cat) {
  filtroArchivos = cat;
  document.querySelectorAll('.arch-filtro-btn').forEach(function(b) {
    b.classList.toggle('sel', b === btn);
  });
  renderGaleria();
}

// ═══════════════════════════════════════════════════════════════════
// FORMULARIO UPLOAD — toggle y helpers
// ═══════════════════════════════════════════════════════════════════
function toggleFormArchivo() {
  formArchivoVisible = !formArchivoVisible;
  var form = document.getElementById('form-archivo');
  var btn  = document.getElementById('btn-subir-archivo');
  if (form) form.className = 'form-card' + (formArchivoVisible ? ' visible' : '');
  if (btn) {
    btn.textContent  = formArchivoVisible ? '✕ Cerrar' : '+ Subir';
    btn.className    = 'btn-primary' + (formArchivoVisible ? ' active' : '');
  }
  if (!formArchivoVisible) _resetFormArchivo();
}

function onArchivoSeleccionado(input) {
  var file = input.files && input.files[0];
  if (!file) return;

  var isImage = file.type.startsWith('image/');
  var isVideo = file.type.startsWith('video/');

  if (!isImage && !isVideo) {
    _showArchErr('Solo se admiten imágenes (JPG, PNG, HEIC) y videos (MP4, MOV).');
    return;
  }

  var maxSize = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
  if (file.size > maxSize) {
    _showArchErr('El archivo supera el límite permitido (' + (isImage ? '10 MB para imágenes' : '50 MB para videos') + ').');
    return;
  }

  archPendingFile = file;
  _showArchErr(null);

  // Preview
  var wrap = document.getElementById('arch-preview-wrap');
  var img  = document.getElementById('arch-preview-img');
  var vid  = document.getElementById('arch-preview-vid');
  var url  = URL.createObjectURL(file);

  if (img) { img.src = ''; img.style.display = 'none'; }
  if (vid) { vid.pause(); vid.src = ''; vid.style.display = 'none'; }
  if (wrap) wrap.style.display = 'block';

  if (isImage && img) { img.src = url; img.style.display = 'block'; }
  if (isVideo && vid) { vid.src = url; vid.style.display = 'block'; }

  var dropText = document.querySelector('#arch-drop-zone .arch-drop-text');
  if (dropText) dropText.textContent = file.name;

  var btnUp = document.getElementById('btn-confirmar-upload');
  if (btnUp) btnUp.disabled = false;
}

// ═══════════════════════════════════════════════════════════════════
// UPLOAD — sube el archivo a Supabase Storage y registra en tabla
// ═══════════════════════════════════════════════════════════════════
function confirmarUpload() {
  if (!archPendingFile || !fichaActualKey || !_sbClient) return;

  var file    = archPendingFile;
  var cat     = (document.getElementById('arch-categoria') || {}).value || 'tratamiento';
  var notas   = ((document.getElementById('arch-notas') || {}).value || '').trim();
  var isImage = file.type.startsWith('image/');

  var ext  = (file.name.split('.').pop() || 'bin').toLowerCase();
  var path = fichaActualKey + '/' + Date.now() + '_' + Math.random().toString(36).slice(2) + '.' + ext;

  // UI: iniciar barra de progreso
  var progWrap = document.getElementById('arch-progress-wrap');
  var progBar  = document.getElementById('arch-progress-bar');
  var progTxt  = document.getElementById('arch-progress-txt');
  var btn      = document.getElementById('btn-confirmar-upload');

  if (progWrap) progWrap.style.display = 'block';
  if (btn) { btn.disabled = true; btn.textContent = 'Subiendo…'; }

  // Barra animada (Supabase JS v2 no expone onUploadProgress en la API pública)
  var progVal = 0;
  var progTimer = setInterval(function() {
    progVal = Math.min(progVal + Math.random() * 10, 85);
    if (progBar) progBar.style.width = progVal + '%';
  }, 250);

  _sbClient.storage
    .from(SUPABASE_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false })
    .then(function(uploadResult) {
      if (uploadResult.error) throw uploadResult.error;
      var publicUrl = _sbClient.storage.from(SUPABASE_BUCKET).getPublicUrl(path).data.publicUrl;
      return _sbClient.from('files').insert([{
        patient_id: fichaActualKey,
        file_url:   publicUrl,
        file_type:  isImage ? 'image' : 'video',
        category:   cat,
        notas:      notas,
        eliminado:  false
      }]);
    })
    .then(function(insertResult) {
      clearInterval(progTimer);
      if (insertResult && insertResult.error) throw insertResult.error;
      if (progBar) progBar.style.width = '100%';
      if (progTxt) progTxt.textContent = '✓ Subido correctamente';
      setTimeout(function() {
        toggleFormArchivo();
        cargarArchivos(fichaActualKey);
      }, 700);
    })
    .catch(function(err) {
      clearInterval(progTimer);
      console.error('[Archivos] Error al subir:', err);
      _showArchErr('Error al subir el archivo: ' + (err.message || 'intentá nuevamente.'));
      if (progWrap) progWrap.style.display = 'none';
      if (btn) { btn.disabled = false; btn.textContent = 'Subir archivo'; }
    });
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
  var catLabel = catLabels[f.category] || f.category;
  var fechaStr = f.created_at
    ? new Date(f.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  document.getElementById('mav-categoria').textContent = catLabel;
  document.getElementById('mav-fecha').textContent = fechaStr;

  var img = document.getElementById('mav-img');
  var vid = document.getElementById('mav-vid');
  img.style.display = 'none'; img.src = '';
  vid.style.display = 'none'; vid.pause(); vid.src = '';

  if (f.file_type === 'video') {
    vid.src = f.file_url; vid.style.display = 'block';
  } else {
    img.src = f.file_url; img.style.display = 'block';
  }

  var notasEl = document.getElementById('mav-notas');
  if (notasEl) {
    if (f.notas) { notasEl.textContent = f.notas; notasEl.className = 'modal-arch-notas visible'; }
    else { notasEl.textContent = ''; notasEl.className = 'modal-arch-notas'; }
  }

  overlay.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function cerrarModalArchivoView(e) {
  // Si el clic fue en el overlay (fondo), cerrar; si fue dentro de la card, no.
  if (e && e.target !== document.getElementById('modal-arch-view')) return;
  _cerrarModalArch();
}

function _cerrarModalArch() {
  var overlay = document.getElementById('modal-arch-view');
  if (overlay) overlay.style.display = 'none';
  var vid = document.getElementById('mav-vid');
  if (vid) { vid.pause(); vid.src = ''; }
  document.body.style.overflow = '';
  archArchivoActual = null;
}

// ═══════════════════════════════════════════════════════════════════
// ELIMINAR — soft delete en tabla (el archivo en storage se conserva)
// ═══════════════════════════════════════════════════════════════════
function eliminarArchivoActual() {
  if (!archArchivoActual || !_sbClient) return;
  if (!confirm('¿Eliminar este archivo? No se puede deshacer.')) return;

  var id = archArchivoActual.id;
  _sbClient.from('files')
    .update({ eliminado: true })
    .eq('id', id)
    .then(function(res) {
      if (res.error) { alert('Error al eliminar: ' + (res.error.message || '')); return; }
      _cerrarModalArch();
      cargarArchivos(fichaActualKey);
    });
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
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    // Simular el evento del input
    onArchivoSeleccionado({ files: [file] });
  });
}

// ═══════════════════════════════════════════════════════════════════
// LAZY LOAD con IntersectionObserver
// ═══════════════════════════════════════════════════════════════════
function _initLazyLoad() {
  if (_archLazyObserver) { _archLazyObserver.disconnect(); _archLazyObserver = null; }

  var targets = document.querySelectorAll('#lista-archivos [data-src]');
  if (!targets.length) return;

  if (!('IntersectionObserver' in window)) {
    targets.forEach(function(el) { el.src = el.dataset.src; delete el.dataset.src; });
    return;
  }

  _archLazyObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        var el = entry.target;
        if (el.dataset.src) { el.src = el.dataset.src; delete el.dataset.src; }
        _archLazyObserver.unobserve(el);
      }
    });
  }, { rootMargin: '120px' });

  targets.forEach(function(el) { _archLazyObserver.observe(el); });
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS PRIVADOS
// ═══════════════════════════════════════════════════════════════════
function _resetFormArchivo() {
  archPendingFile = null;

  var fi = document.getElementById('arch-file-input');
  if (fi) fi.value = '';

  var img  = document.getElementById('arch-preview-img');
  var vid  = document.getElementById('arch-preview-vid');
  var wrap = document.getElementById('arch-preview-wrap');
  if (img)  { img.src = ''; img.style.display = 'none'; }
  if (vid)  { vid.pause(); vid.src = ''; vid.style.display = 'none'; }
  if (wrap) wrap.style.display = 'none';

  var progWrap = document.getElementById('arch-progress-wrap');
  var progBar  = document.getElementById('arch-progress-bar');
  var progTxt  = document.getElementById('arch-progress-txt');
  if (progWrap) progWrap.style.display = 'none';
  if (progBar)  progBar.style.width = '0';
  if (progTxt)  progTxt.textContent = 'Subiendo…';

  var btnUp = document.getElementById('btn-confirmar-upload');
  if (btnUp) { btnUp.disabled = true; btnUp.textContent = 'Subir archivo'; }

  var cat   = document.getElementById('arch-categoria');
  var notas = document.getElementById('arch-notas');
  if (cat)   cat.value   = 'tratamiento';
  if (notas) notas.value = '';

  var dropText = document.querySelector('#arch-drop-zone .arch-drop-text');
  if (dropText) dropText.textContent = 'Tocá o arrastrá aquí';

  _showArchErr(null);
}

function _limpiarModuloArchivos() {
  archivosData       = [];
  filtroArchivos     = 'todos';
  archArchivoActual  = null;
  formArchivoVisible = false;

  var lista = document.getElementById('lista-archivos');
  if (lista) lista.innerHTML = '<div class="empty"><div class="empty-icon">📸</div>Sin archivos aún</div>';

  var form = document.getElementById('form-archivo');
  if (form) form.className = 'form-card';

  var btnSubir = document.getElementById('btn-subir-archivo');
  if (btnSubir) { btnSubir.textContent = '+ Subir'; btnSubir.className = 'btn-primary'; }

  document.querySelectorAll('.arch-filtro-btn').forEach(function(b, i) {
    b.classList.toggle('sel', i === 0); // 'Todos' siempre seleccionado al resetear
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

// Escapar caracteres peligrosos para incluir en atributos HTML
function _esc(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Auto-init al cargar el script ────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initArchivos);
} else {
  initArchivos();
}
