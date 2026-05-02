// ═══════════════════════════════════════════
// STATE — Variables globales de la aplicación
// ═══════════════════════════════════════════

var MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
var turnosData = {}, pacientesData = {}, ventasData = {}, pagosData = {}, cierresData = {};
var filtroCaja = 'dia';
var cmMetodo = 'efectivo';
var formCobroManualVisible = false;
var pvSeleccion = null;
var pacienteSeleccionadoKey = null;
var fichaActualKey = null;
var turnoCobroKey = null;
var filasCobroPago = [];
var formTurnoVisible = false, formPacVisible = false, formHistVisible = false;
// PAGO ANTICIPADO en form turno
var pagoAntTipo = 'no';      // 'no' | 'parcial' | 'total'
var pagoAntMetodo = 'efectivo';
var precioActualTurno = 0;   // precio del tratamiento elegido
// PRECIOS / TRATAMIENTOS
var formTratVisible = false;
var tratEditKey = null;
var filtroCatPrecios = 'todas';
var formTratCat = 'Rellenos';

// Pre-carga la lista de precios para visualización offline.
// El seed completo vive en db.js (tratamientosSeed()).
// Aquí solo inicializamos con datos locales para modo offline.
var tratamientosData = (function() {
  var obj = {};
  // Usar el seed centralizado de db.js si está disponible,
  // o un array vacío si db.js aún no cargó (orden de scripts garantiza que db.js va antes)
  var seed = typeof tratamientosSeed === 'function' ? tratamientosSeed() : [];
  seed.forEach(function(t, i){ obj['local_'+i] = t; });
  return obj;
}());
// EDICIÓN DE TURNO
var turnoEditKey = null;
var editTabActual = 'paciente';
// COBRO MANUAL (paciente seleccionado)
var cmPacienteKey = null;
// MÚLTIPLES TRATAMIENTOS por turno (formulario nuevo turno)
var listaTratamientosForm = [];

var ADMINS = ['marianosbampato18@gmail.com'];

// ── Estado de UI ──────────────────────────────────────────
var panelActual = 'agenda';
var turnosPendienteRender = false;
