// ═══════════════════════════════════════════════════════════
// HELPERS — Seguridad, soft delete, validaciones, errores
// ═══════════════════════════════════════════════════════════

// ── SOFT DELETE ──────────────────────────────────────────────
// En vez de .remove(), marca el nodo con eliminado:true + timestamp
// Los datos quedan en Firebase y son recuperables.
function softDelete(ref, motivo) {
  return ref.update({
    eliminado:        true,
    eliminadoEn:      new Date().toISOString(),
    eliminadoPor:     usuarioActual ? usuarioActual.nombre : 'desconocido',
    eliminadoMotivo:  motivo || ''
  });
}

// ── CONFIRMACIÓN DOBLE ────────────────────────────────────────
// Para acciones destructivas: primer confirm genérico, segundo específico.
function confirmarAccionCritica(entidad, detalle) {
  var msg1 = '⚠️ ¿Querés eliminar este ' + entidad + '?\n\n' +
             '"' + detalle + '"\n\n' +
             'El registro quedará oculto pero se puede recuperar contactando al administrador.';
  if (!confirm(msg1)) return false;
  return true;
}

// ── MANEJO DE ERRORES FIREBASE ────────────────────────────────
// Captura errores y los muestra de forma clara al usuario.
// Nunca falla silenciosamente.
function manejarErrorFirebase(e, contexto, elErr) {
  var msgs = {
    'PERMISSION_DENIED':  'Sin permisos para esta acción. Verificá tu sesión.',
    'NETWORK_ERROR':      'Sin conexión a internet. Los cambios se aplicarán cuando vuelva la conexión.',
    'DISCONNECTED':       'Conexión interrumpida. Intentá de nuevo.',
    'UNAVAILABLE':        'Firebase no disponible temporalmente. Intentá en unos segundos.',
  };
  var codigo = e && e.code ? e.code.replace('database/', '').toUpperCase() : '';
  var msg = msgs[codigo] || ('Error inesperado: ' + (e && e.message ? e.message : 'desconocido'));
  var msgFinal = '[' + (contexto||'Sistema') + '] ' + msg;

  console.error('Firebase error:', contexto, e);

  if (elErr && elErr.className !== undefined) {
    elErr.textContent = msgFinal;
    elErr.className = 'err visible';
  } else {
    setSyncBar('error', '⚠ ' + msg);
    setTimeout(function(){ setSyncBar('ok', '✦ Sincronizado'); }, 5000);
  }
  return msgFinal;
}

// ── VALIDACIONES ───────────────────────────────────────────────

function validarTextoObligatorio(valor, campo) {
  var v = (valor || '').trim();
  if (!v) return campo + ' es obligatorio.';
  if (v.length < 2) return campo + ' debe tener al menos 2 caracteres.';
  if (v.length > 200) return campo + ' es demasiado largo (máx. 200 caracteres).';
  return null;
}

function validarMonto(valor, campo) {
  var n = parseFloat(valor);
  if (isNaN(n)) return (campo||'El monto') + ' debe ser un número válido.';
  if (n < 0)    return (campo||'El monto') + ' no puede ser negativo.';
  if (n > 99999999) return (campo||'El monto') + ' parece demasiado alto. Verificá.';
  return null;
}

function validarFecha(valor) {
  if (!valor) return 'La fecha es obligatoria.';
  var d = new Date(valor + 'T00:00:00');
  if (isNaN(d.getTime())) return 'Fecha inválida.';
  // No permitir fechas más de 2 años en el futuro
  var maxFutura = new Date(); maxFutura.setFullYear(maxFutura.getFullYear() + 2);
  if (d > maxFutura) return 'La fecha parece incorrecta (más de 2 años en el futuro).';
  return null;
}

function validarHora(hh, mm) {
  var h = parseInt(hh), m = parseInt(mm);
  if (isNaN(h) || isNaN(m)) return 'Hora inválida.';
  if (h < 0 || h > 23) return 'La hora debe estar entre 0 y 23.';
  if (m < 0 || m > 59) return 'Los minutos deben estar entre 0 y 59.';
  return null;
}

function validarTelefono(valor) {
  if (!valor) return null; // opcional
  var v = valor.replace(/[\s\-\(\)]/g, '');
  if (!/^\+?[0-9]{7,15}$/.test(v)) return 'Teléfono inválido (solo números, 7-15 dígitos).';
  return null;
}

function validarDNI(valor) {
  if (!valor) return null; // opcional
  var v = valor.replace(/[\s\.]/g, '');
  if (!/^[0-9]{7,8}$/.test(v)) return 'DNI inválido (7-8 dígitos sin puntos).';
  return null;
}

// ── MOSTRAR ERRORES DE VALIDACIÓN ─────────────────────────────
function mostrarErrorValidacion(elErr, mensaje) {
  if (!elErr) return;
  elErr.textContent = mensaje;
  elErr.className   = 'err visible';
  // Auto-scroll al error
  elErr.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function limpiarError(elErr) {
  if (!elErr) return;
  elErr.textContent = '';
  elErr.className   = 'err';
}

// ── EXPORTACIÓN DE DATOS (preparación para backup) ───────────
// Genera un JSON descargable con todos los datos del sistema.
// No requiere backend — usa el estado en memoria.
function exportarDatos() {
  if (!requiereAdmin()) return;
  if (!confirm('¿Exportar todos los datos a un archivo JSON?\n\nEsto genera una copia de seguridad completa.')) return;

  var datos = {
    exportadoEn:  new Date().toISOString(),
    exportadoPor: usuarioActual ? usuarioActual.nombre : 'desconocido',
    version:      '1.0',
    datos: {
      pacientes:    pacientesData,
      turnos:       turnosData,
      ventas:       ventasData,
      pagos:        pagosData,
      cierres:      cierresData,
      tratamientos: tratamientosData
    }
  };

  var json = JSON.stringify(datos, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url  = URL.createObjectURL(blob);
  var a    = document.createElement('a');
  var fecha = new Date().toISOString().split('T')[0];
  a.href     = url;
  a.download = 'aurea-backup-' + fecha + '.json';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
