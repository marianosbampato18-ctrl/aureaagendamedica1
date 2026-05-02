// ═══════════════════════════════════════════
// ARCHIVOS — Historia clínica multimedia
// Supabase Storage + PostgreSQL tabla `files`
// ═══════════════════════════════════════════

// ── Configuración Supabase ────────────────────────────────────────
// Reemplazá estos dos valores con los de tu proyecto.
// Supabase → Settings → API
var SUPABASE_URL      = 'https://TU_PROYECTO.supabase.co';
var SUPABASE_ANON_KEY = 'TU_ANON_KEY_PUBLICA';
var SUPABASE_BUCKET   = 'medical-files';

var _sbClient = null;

// ── Estado del módulo ─────────────────────────────────────────────
// FIX #3: era `var archPendingFile = null` (un solo File).
// Ahora es un array para soportar múltiples archivos.
var archPendingFiles   = [];
var archivosData       = [];
var filtroArchivos     = 'todos';
var archArchivoActual  = null;
var formArchivoVisible = false;
var _archLazyObserver  = null;

// ═══════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════
function initArchivos() {
  if (typeof supabase === 'undefined' || typeof supabase.createClient !== 'function') {
    console.warn('[Archivos] SDK de Supabase no disponible. Verificá que el CDN esté antes de archivos.js.');
    return;
  }
  if (SUPABASE_URL === 'https://TU_PROYECTO.supabase.co') {
    console.warn('[Archivos] ⚠ Configurá SUPABASE_URL y SUPABASE_ANON_KEY en js/archivos.js');
    return;
  }

  _sbClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  console.log('[Archivos] Cliente Supabase inicializado →', SUPABASE_URL.split('.')[0]);

  _initDragDrop();
  _patchearFunciones();
}

// ── Parchea abrirFichaKey / cerrarFicha sin tocar pacientes.js ────
function _patchearFunciones() {
  var _origAbrir  = typeof window.abrirFichaKey === 'function' ? window.abrirFichaKey  : null;
  var _origCerrar = typeof window.cerrarFicha   === 'function' ? window.cerrarFicha    : null;

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
      console.log('[Archivos] Archivos cargados:', archivosData.length);
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
// FORMULARIO UPLOAD — toggle
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
// SELECCIÓN DE ARCHIVOS
// FIX #2: antes solo procesaba input.files[0]. Ahora itera FileList
// completo y valida cada archivo individualmente.
// ═══════════════════════════════════════════════════════════════════
function onArchivoSeleccionado(input) {
  var fileList = input.files;
  if (!fileList || !fileList.length) return;

  archPendingFiles = [];
  var errores = [];

  for (var i = 0; i < fileList.length; i++) {
    var file    = fileList[i];
    var isImage = file.type.startsWith('image/');
    var isVideo = file.type.startsWith('video/');

    if (!isImage && !isVideo) {
      errores.push('"' + file.name + '" no es imagen ni video.');
      continue;
    }
    var maxBytes = isImage ? 10 * 1024 * 1024 : 50 * 1024 * 1024;
    if (file.size > maxBytes) {
      errores.push('"' + file.name + '" supera el límite (' + (isImage ? '10 MB' : '50 MB') + ').');
      continue;
    }
    archPendingFiles.push(file);
  }

  // Mostrar errores de validación si los hay
  if (errores.length) {
    _showArchErr(errores.join(' · '));
  } else {
    _showArchErr(null);
  }

  // Sin archivos válidos → deshabilitar botón
  if (!archPendingFiles.length) {
    document.getElementById('btn-confirmar-upload').disabled = true;
    return;
  }

  console.log('[Archivos] Archivos válidos seleccionados:', archPendingFiles.length);

  // Actualizar texto de la zona de drop
  var dropText = document.querySelector('#arch-drop-zone .arch-drop-text');
  if (dropText) {
    dropText.textContent = archPendingFiles.length === 1
      ? archPendingFiles[0].name
      : archPendingFiles.length + ' archivos seleccionados';
  }

  // Render preview
  _renderPreviewLista(archPendingFiles);

  // Habilitar botón de subir
  var btnUp = document.getElementById('btn-confirmar-upload');
  if (btnUp) {
    btnUp.disabled    = false;
    btnUp.textContent = archPendingFiles.length === 1
      ? 'Subir archivo'
      : 'Subir ' + archPendingFiles.length + ' archivos';
  }
}

// Muestra preview: imagen simple si es 1 imagen, lista de nombres si son varios.
function _renderPreviewLista(files) {
  var wrap = document.getElementById('arch-preview-wrap');
  var img  = document.getElementById('arch-preview-img');
  var vid  = document.getElementById('arch-preview-vid');

  if (!wrap) return;

  // Limpiar medios previos
  if (img) { img.src = ''; img.style.display = 'none'; }
  if (vid) { vid.pause(); vid.src = ''; vid.style.display = 'none'; }

  // Eliminar lista previa si existe
  var prevList = wrap.querySelector('.arch-file-list');
  if (prevList) prevList.remove();

  // Si es una sola imagen → preview clásico
  if (files.length === 1 && files[0].type.startsWith('image/') && img) {
    img.src = URL.createObjectURL(files[0]);
    img.style.display = 'block';
    wrap.style.display = 'block';
    return;
  }

  // Múltiples archivos → lista de nombres + tamaños
  var listDiv = document.createElement('div');
  listDiv.className = 'arch-file-list';
  listDiv.style.cssText = 'margin-top:12px;max-height:150px;overflow-y:auto;border-radius:10px;border:1px solid var(--border);padding:0 10px';
  listDiv.innerHTML = files.map(function(f) {
    var icon = f.type.startsWith('video/') ? '🎬' : '🖼';
    var mb   = (f.size / 1024 / 1024).toFixed(1) + ' MB';
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid var(--ivory);font-size:12px;color:var(--brown)">' +
      '<span style="flex-shrink:0">' + icon + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(f.name) + '</span>' +
      '<span style="color:var(--brown-soft);flex-shrink:0;margin-left:8px">' + mb + '</span>' +
    '</div>';
  }).join('');
  // Quitar borde en el último ítem
  var items = listDiv.querySelectorAll('div');
  if (items.length) items[items.length - 1].style.borderBottom = 'none';

  wrap.appendChild(listDiv);
  wrap.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════════
// UPLOAD — async/await, loop por cada archivo
// FIX #4: antes era una cadena .then() para un solo archivo.
// Ahora es async/await que recorre todos los archivos pendientes.
// Si uno falla, los demás siguen subiendo.
// ═══════════════════════════════════════════════════════════════════
async function confirmarUpload() {
  if (!archPendingFiles.length || !fichaActualKey || !_sbClient) {
    console.warn('[Archivos] No se puede subir: archivos=' + archPendingFiles.length +
      ' paciente=' + fichaActualKey + ' cliente=' + !!_sbClient);
    return;
  }

  var cat   = (document.getElementById('arch-categoria') || {}).value || 'tratamiento';
  var notas = ((document.getElementById('arch-notas') || {}).value || '').trim();

  var progWrap = document.getElementById('arch-progress-wrap');
  var progBar  = document.getElementById('arch-progress-bar');
  var progTxt  = document.getElementById('arch-progress-txt');
  var btn      = document.getElementById('btn-confirmar-upload');

  if (progWrap) progWrap.style.display = 'block';
  if (progBar)  progBar.style.width = '0';
  if (btn)      { btn.disabled = true; btn.textContent = 'Subiendo…'; }

  var total   = archPendingFiles.length;
  var subidos = 0;
  var errores = [];

  console.log('[Archivos] Iniciando upload de', total, 'archivo(s). Paciente:', fichaActualKey, 'Bucket:', SUPABASE_BUCKET);

  for (var i = 0; i < total; i++) {
    var file    = archPendingFiles[i];
    var isImage = file.type.startsWith('image/');
    var ext     = (file.name.split('.').pop() || 'bin').toLowerCase();
    // Nombre único para evitar colisiones
    var path    = fichaActualKey + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;

    if (progTxt) progTxt.textContent = 'Subiendo ' + (i + 1) + ' de ' + total + '…';
    if (progBar) progBar.style.width = Math.round((i / total) * 85) + '%';

    console.log('[Archivos] (' + (i+1) + '/' + total + ') Subiendo:', file.name, '→', path, '| Tipo:', file.type, '| Tamaño:', (file.size/1024).toFixed(0) + ' KB');

    try {
      // ── Paso 1: subir al bucket ───────────────────────────────
      var uploadResult = await _sbClient.storage
        .from(SUPABASE_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false });

      if (uploadResult.error) {
        console.error('[Archivos] ✗ Error storage en "' + file.name + '":', uploadResult.error);
        errores.push('"' + file.name + '": ' + (uploadResult.error.message || 'error de storage'));
        continue; // seguir con el siguiente archivo
      }

      console.log('[Archivos] ✓ Storage OK:', file.name);

      // ── Paso 2: obtener URL pública ───────────────────────────
      var publicUrlResult = _sbClient.storage.from(SUPABASE_BUCKET).getPublicUrl(path);
      var publicUrl = publicUrlResult.data.publicUrl;
      console.log('[Archivos] URL pública generada:', publicUrl);

      // ── Paso 3: registrar en tabla files ──────────────────────
      var insertResult = await _sbClient.from('files').insert([{
        patient_id: fichaActualKey,
        file_url:   publicUrl,
        file_type:  isImage ? 'image' : 'video',
        category:   cat,
        notas:      notas,
        eliminado:  false
      }]);

      if (insertResult.error) {
        console.error('[Archivos] ✗ Error DB en "' + file.name + '":', insertResult.error);
        errores.push('"' + file.name + '": ' + (insertResult.error.message || 'error de base de datos'));
        continue;
      }

      console.log('[Archivos] ✓ DB OK:', file.name);
      subidos++;

    } catch (err) {
      console.error('[Archivos] ✗ Excepción en "' + file.name + '":', err);
      errores.push('"' + file.name + '": ' + (err.message || 'error desconocido'));
    }
  }

  // ── Resultado final ───────────────────────────────────────────
  if (progBar) progBar.style.width = '100%';
  console.log('[Archivos] Upload finalizado. Subidos:', subidos, '| Errores:', errores.length);

  if (errores.length === 0) {
    // Todo OK
    if (progTxt) progTxt.textContent = '✓ ' + subidos + ' archivo' + (subidos !== 1 ? 's' : '') + ' subido' + (subidos !== 1 ? 's' : '') + ' correctamente';
    setTimeout(function() {
      toggleFormArchivo();
      cargarArchivos(fichaActualKey);
    }, 800);

  } else if (subidos > 0) {
    // Algunos subieron, algunos fallaron
    if (progTxt) progTxt.textContent = '⚠ ' + subidos + ' OK · ' + errores.length + ' con error';
    _showArchErr('Errores: ' + errores.join(' · '));
    cargarArchivos(fichaActualKey); // mostrar los que sí subieron
    if (progWrap) progWrap.style.display = 'none';
    if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; }

  } else {
    // Todo falló
    if (progTxt) progTxt.textContent = '✗ No se pudo subir ningún archivo';
    _showArchErr('Error: ' + errores.join(' · '));
    if (progWrap) progWrap.style.display = 'none';
    if (btn) { btn.disabled = false; btn.textContent = 'Reintentar'; }
  }
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
  document.getElementById('mav-categoria').textContent = catLabels[f.category] || f.category;
  document.getElementById('mav-fecha').textContent = f.created_at
    ? new Date(f.created_at).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';

  var img = document.getElementById('mav-img');
  var vid = document.getElementById('mav-vid');
  img.style.display = 'none'; img.src = '';
  vid.style.display = 'none'; vid.pause(); vid.src = '';

  if (f.file_type === 'video') { vid.src = f.file_url; vid.style.display = 'block'; }
  else                         { img.src = f.file_url; img.style.display = 'block'; }

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
  var vid = document.getElementById('mav-vid');
  if (vid) { vid.pause(); vid.src = ''; }
  document.body.style.overflow = '';
  archArchivoActual = null;
}

// ═══════════════════════════════════════════════════════════════════
// ELIMINAR — soft delete en tabla
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
      console.log('[Archivos] Archivo eliminado:', id);
      _cerrarModalArch();
      cargarArchivos(fichaActualKey);
    });
}

// ═══════════════════════════════════════════════════════════════════
// DRAG & DROP
// FIX #5: antes solo tomaba files[0]. Ahora pasa toda la FileList.
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
    if (!files || !files.length) return;
    // Pasar la FileList completa — igual que cuando seleccionás con el input
    onArchivoSeleccionado({ files: files });
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
// DEBUG — llamar desde la consola del browser: debugSupabase()
// Verifica conexión, tabla y bucket.
// ═══════════════════════════════════════════════════════════════════
async function debugSupabase() {
  console.log('══════════════════════════════');
  console.log('DEBUG SUPABASE');
  console.log('══════════════════════════════');
  console.log('URL:', SUPABASE_URL);
  console.log('ANON KEY:', SUPABASE_ANON_KEY ? SUPABASE_ANON_KEY.slice(0, 24) + '…' : '(vacía)');
  console.log('BUCKET:', SUPABASE_BUCKET);
  console.log('Cliente inicializado:', !!_sbClient);

  if (!_sbClient) {
    console.error('❌ Cliente no inicializado. Verificá SUPABASE_URL y SUPABASE_ANON_KEY.');
    return;
  }

  // Test 1: tabla files
  console.log('--- Test 1: tabla files ---');
  try {
    var dbTest = await _sbClient.from('files').select('id').limit(1);
    if (dbTest.error) {
      console.error('❌ Error tabla files:', dbTest.error.message, '| Código:', dbTest.error.code);
      console.error('   → Verificá que la tabla exista y que RLS tenga política para anon.');
    } else {
      console.log('✅ Tabla files OK. Filas encontradas:', (dbTest.data || []).length);
    }
  } catch(e) { console.error('❌ Excepción tabla:', e); }

  // Test 2: bucket
  console.log('--- Test 2: bucket "' + SUPABASE_BUCKET + '" ---');
  try {
    var bucketTest = await _sbClient.storage.getBucket(SUPABASE_BUCKET);
    if (bucketTest.error) {
      console.error('❌ Error bucket:', bucketTest.error.message);
      console.error('   → Verificá que el bucket exista y sea público, y que el RLS de storage permita anon.');
    } else {
      console.log('✅ Bucket OK:', JSON.stringify(bucketTest.data));
    }
  } catch(e) { console.error('❌ Excepción bucket:', e); }

  // Test 3: subida de prueba (archivo texto de 5 bytes)
  console.log('--- Test 3: upload de prueba ---');
  try {
    var blob     = new Blob(['test!'], { type: 'text/plain' });
    var testPath = '_debug_test_' + Date.now() + '.txt';
    var upTest   = await _sbClient.storage.from(SUPABASE_BUCKET).upload(testPath, blob, { upsert: true });
    if (upTest.error) {
      console.error('❌ Upload de prueba falló:', upTest.error.message);
      console.error('   → El bucket existe pero los permisos de escritura bloquean la subida.');
    } else {
      var url = _sbClient.storage.from(SUPABASE_BUCKET).getPublicUrl(testPath).data.publicUrl;
      console.log('✅ Upload de prueba OK. URL pública:', url);
      // Limpiar archivo de prueba
      await _sbClient.storage.from(SUPABASE_BUCKET).remove([testPath]);
      console.log('✅ Archivo de prueba eliminado.');
    }
  } catch(e) { console.error('❌ Excepción upload prueba:', e); }

  console.log('══════════════════════════════');
  console.log('Paciente activo (fichaActualKey):', typeof fichaActualKey !== 'undefined' ? fichaActualKey : '(ninguno)');
  console.log('══════════════════════════════');
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS PRIVADOS
// ═══════════════════════════════════════════════════════════════════
function _resetFormArchivo() {
  // FIX: resetear array, no una variable singular
  archPendingFiles = [];

  var fi = document.getElementById('arch-file-input');
  if (fi) fi.value = '';

  var img  = document.getElementById('arch-preview-img');
  var vid  = document.getElementById('arch-preview-vid');
  var wrap = document.getElementById('arch-preview-wrap');
  if (img)  { img.src = ''; img.style.display = 'none'; }
  if (vid)  { vid.pause(); vid.src = ''; vid.style.display = 'none'; }
  if (wrap) {
    // Eliminar lista dinámica si existe
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
  archivosData      = [];
  filtroArchivos    = 'todos';
  archArchivoActual = null;
  formArchivoVisible = false;

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
  return (str || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Auto-init ─────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initArchivos);
} else {
  initArchivos();
}
