// ═══════════════════════════════════════════════════════════════════
// ARCHIVOS — Historia clínica multimedia
// Backend: Firebase Storage (bucket ya configurado en config.js)
//          Firebase Realtime DB (pacientes/{key}/archivos/)
//
// NO requiere Supabase ni credenciales adicionales.
// ═══════════════════════════════════════════════════════════════════

// ── Estado ────────────────────────────────────────────────────────
var archivosData      = [];     // archivos del paciente abierto
var filtroArchivos    = 'todos';
var archArchivoActual = null;   // archivo abierto en el modal visor
var archPendingFiles  = [];     // archivos seleccionados, listos para subir
var formArchivoVisible = false;
var _archLazyObserver  = null;

// ═══════════════════════════════════════════════════════════════════
// INIT — se llama al cargar el script
// ═══════════════════════════════════════════════════════════════════
function initArchivos() {
  _initDragDrop();
  _patchearFunciones();
  console.log('[Archivos] Módulo listo. Backend: Firebase Storage.');
}

// Devuelve la instancia de Firebase Storage, o null si aún no inició.
function _getStorage() {
  if (typeof firebase === 'undefined') {
    console.error('[Archivos] Firebase SDK no disponible.');
    return null;
  }
  if (!firebase.apps || !firebase.apps.length) {
    console.error('[Archivos] Firebase no inicializado aún.');
    return null;
  }
  try {
    return firebase.storage();
  } catch (e) {
    console.error('[Archivos] firebase.storage() falló:', e.message);
    return null;
  }
}

// Parchea abrirFichaKey y cerrarFicha sin tocar pacientes.js
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
// CARGAR — lee metadata de Firebase DB
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

    console.log('[Archivos] Cargados:', archivosData.length, 'archivos para paciente', patientId);
    renderGaleria();
  }, function(err) {
    console.error('[Archivos] Error al cargar:', err);
    if (lista) lista.innerHTML = '<div class="empty"><div class="empty-icon">⚠️</div>Error al cargar archivos</div>';
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
    : archivosData.filter(function(f) { return f.categoria === filtroArchivos; });

  if (!filtered.length) {
    lista.innerHTML = '<div class="empty"><div class="empty-icon">📸</div>Sin archivos' +
      (filtroArchivos !== 'todos' ? ' en esta categoría' : ' aún') + '</div>';
    return;
  }

  var catLabels = { antes: 'Antes', despues: 'Después', tratamiento: 'Tratamiento' };

  lista.innerHTML = filtered.map(function(f) {
    var isVideo  = f.tipo === 'video';
    var catLabel = catLabels[f.categoria] || f.categoria || '';
    var mediaTag = isVideo
      ? '<video data-src="' + _esc(f.url) + '" muted playsinline preload="none"></video>'
      : '<img data-src="' + _esc(f.url) + '" alt="' + _esc(catLabel) + '"/>';

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
// SELECCIÓN — valida y prepara archivos (soporta múltiples)
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

  _showArchErr(errores.length ? errores.join(' · ') : null);

  if (!archPendingFiles.length) {
    var btnUp = document.getElementById('btn-confirmar-upload');
    if (btnUp) btnUp.disabled = true;
    return;
  }

  console.log('[Archivos] Archivos válidos seleccionados:', archPendingFiles.length);

  // Texto en la zona de drop
  var dropText = document.querySelector('#arch-drop-zone .arch-drop-text');
  if (dropText) {
    dropText.textContent = archPendingFiles.length === 1
      ? archPendingFiles[0].name
      : archPendingFiles.length + ' archivos seleccionados';
  }

  _renderPreviewLista(archPendingFiles);

  var btn = document.getElementById('btn-confirmar-upload');
  if (btn) {
    btn.disabled    = false;
    btn.textContent = archPendingFiles.length === 1 ? 'Subir archivo' : 'Subir ' + archPendingFiles.length + ' archivos';
  }
}

// Preview: imagen simple (1 archivo) o lista de nombres (varios)
function _renderPreviewLista(files) {
  var wrap = document.getElementById('arch-preview-wrap');
  var img  = document.getElementById('arch-preview-img');
  var vid  = document.getElementById('arch-preview-vid');
  if (!wrap) return;

  if (img) { img.src = ''; img.style.display = 'none'; }
  if (vid) { vid.pause(); vid.src = ''; vid.style.display = 'none'; }
  var prevList = wrap.querySelector('.arch-file-list');
  if (prevList) prevList.remove();

  if (files.length === 1 && files[0].type.startsWith('image/') && img) {
    img.src = URL.createObjectURL(files[0]);
    img.style.display = 'block';
    wrap.style.display = 'block';
    return;
  }

  var listDiv = document.createElement('div');
  listDiv.className = 'arch-file-list';
  listDiv.style.cssText = 'margin-top:12px;max-height:150px;overflow-y:auto;border-radius:10px;border:1px solid var(--border);padding:0 10px';
  listDiv.innerHTML = files.map(function(f, i) {
    var icon = f.type.startsWith('video/') ? '🎬' : '🖼';
    var mb   = (f.size / 1024 / 1024).toFixed(1) + ' MB';
    var border = i < files.length - 1 ? 'border-bottom:1px solid var(--ivory)' : '';
    return '<div style="display:flex;align-items:center;gap:8px;padding:7px 0;' + border + ';font-size:12px;color:var(--brown)">' +
      '<span style="flex-shrink:0">' + icon + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _esc(f.name) + '</span>' +
      '<span style="color:var(--brown-soft);flex-shrink:0;margin-left:8px">' + mb + '</span>' +
    '</div>';
  }).join('');

  wrap.appendChild(listDiv);
  wrap.style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════════
// UPLOAD — Firebase Storage con progreso real
// ═══════════════════════════════════════════════════════════════════
function confirmarUpload() {
  if (!archPendingFiles.length || !fichaActualKey) {
    console.warn('[Archivos] Nada que subir o no hay paciente activo.');
    return;
  }

  var storage = _getStorage();
  if (!storage) {
    _showArchErr('Firebase Storage no disponible. Revisá la consola.');
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

  function subirSiguiente() {
    if (idx >= total) {
      // Todos procesados
      _setProgress(100, subidos === total
        ? '✓ ' + subidos + ' archivo' + (subidos !== 1 ? 's' : '') + ' subido' + (subidos !== 1 ? 's' : '') + ' correctamente'
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

    var file    = archPendingFiles[idx];
    var isImage = file.type.startsWith('image/');
    var ext     = (file.name.split('.').pop() || 'bin').toLowerCase();
    var path    = 'pacientes/' + fichaActualKey + '/' + Date.now() + '_' + Math.random().toString(36).slice(2, 8) + '.' + ext;

    console.log('[Archivos] (' + (idx + 1) + '/' + total + ') Subiendo:', file.name, '→', path);

    var fileRef    = storage.ref().child(path);
    var uploadTask = fileRef.put(file, { contentType: file.type });

    uploadTask.on('state_changed',
      // Progreso real
      function(snapshot) {
        var filePct  = snapshot.bytesTransferred / snapshot.totalBytes;
        var totalPct = Math.round(((idx + filePct) / total) * 90);
        _setProgress(totalPct, 'Subiendo ' + (idx + 1) + ' de ' + total + '… (' + Math.round(filePct * 100) + '%)');
      },
      // Error en este archivo
      function(err) {
        console.error('[Archivos] ✗ Error storage "' + file.name + '":', err.code, err.message);
        errores.push('"' + file.name + '" (' + (err.message || err.code) + ')');
        idx++;
        subirSiguiente();
      },
      // Éxito en este archivo
      function() {
        uploadTask.snapshot.ref.getDownloadURL().then(function(url) {
          console.log('[Archivos] ✓ Storage OK:', file.name, '| URL:', url);

          return db.ref('pacientes/' + fichaActualKey + '/archivos').push({
            url:       url,
            tipo:      isImage ? 'image' : 'video',
            categoria: cat,
            notas:     notas,
            fecha:     new Date().toISOString(),
            eliminado: false
          });
        })
        .then(function() {
          console.log('[Archivos] ✓ DB OK:', file.name);
          subidos++;
          idx++;
          subirSiguiente();
        })
        .catch(function(err) {
          console.error('[Archivos] ✗ Error DB "' + file.name + '":', err);
          errores.push('"' + file.name + '" (error al guardar registro)');
          idx++;
          subirSiguiente();
        });
      }
    );
  }

  subirSiguiente();
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
  vid.style.display = 'none'; vid.pause(); vid.src = '';

  if (f.tipo === 'video') { vid.src = f.url; vid.style.display = 'block'; }
  else                    { img.src = f.url; img.style.display = 'block'; }

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
// ELIMINAR — soft delete en Firebase DB
// ═══════════════════════════════════════════════════════════════════
function eliminarArchivoActual() {
  if (!archArchivoActual) return;
  if (!confirm('¿Eliminar este archivo? No se puede deshacer.')) return;

  var id = archArchivoActual.id;
  db.ref('pacientes/' + fichaActualKey + '/archivos/' + id)
    .update({ eliminado: true })
    .then(function() {
      console.log('[Archivos] Archivo eliminado (soft delete):', id);
      _cerrarModalArch();
      cargarArchivos(fichaActualKey);
    })
    .catch(function(err) {
      alert('Error al eliminar: ' + (err.message || ''));
    });
}

// ═══════════════════════════════════════════════════════════════════
// DRAG & DROP — pasa FileList completa a onArchivoSeleccionado
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
// LAZY LOAD
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
// DEBUG — ejecutar desde consola del browser: debugArchivos()
// ═══════════════════════════════════════════════════════════════════
function debugArchivos() {
  console.log('══════════════════════════════');
  console.log('DEBUG ARCHIVOS');
  console.log('══════════════════════════════');
  console.log('Firebase disponible:', typeof firebase !== 'undefined');
  console.log('Firebase apps:', typeof firebase !== 'undefined' && firebase.apps ? firebase.apps.length : 'N/A');

  var storage = _getStorage();
  console.log('Storage disponible:', !!storage);

  if (storage) {
    console.log('Bucket:', storage.app.options.storageBucket);

    // Test: subir archivo texto de prueba
    var blob     = new Blob(['test'], { type: 'text/plain' });
    var testPath = '_debug_test_' + Date.now() + '.txt';
    var testRef  = storage.ref().child(testPath);

    console.log('Test de upload a:', testPath);
    testRef.put(blob).then(function() {
      return testRef.getDownloadURL();
    }).then(function(url) {
      console.log('✅ Storage funciona correctamente. URL de prueba:', url);
      testRef.delete();
    }).catch(function(err) {
      console.error('❌ Error en Storage:', err.code, err.message);
      if (err.code === 'storage/unauthorized') {
        console.error('   → Actualizá las reglas en Firebase Console → Storage → Rules:');
        console.error('     allow read, write: if true;');
      }
    });
  }

  console.log('Paciente activo (fichaActualKey):', typeof fichaActualKey !== 'undefined' ? fichaActualKey : '(ninguno)');
  console.log('Archivos cargados:', archivosData.length);
  console.log('══════════════════════════════');
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
  var vid  = document.getElementById('arch-preview-vid');
  var wrap = document.getElementById('arch-preview-wrap');
  if (img)  { img.src = ''; img.style.display = 'none'; }
  if (vid)  { vid.pause(); vid.src = ''; vid.style.display = 'none'; }
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
