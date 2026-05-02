#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// BACKUP — Áurea Agenda
// Genera planilla Excel + carpetas de fotos desde Firebase DB
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const XLSX  = require('xlsx');

const DB_HOST  = 'agenda-bruna-nara-default-rtdb.firebaseio.com';
const BASE_DIR = path.join(__dirname); // carpeta backup/

// ── Colores para la terminal ─────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  bold:   '\x1b[1m',
  red:    '\x1b[31m',
};
const ok  = (s) => console.log(C.green + '✓' + C.reset + ' ' + s);
const inf = (s) => console.log(C.cyan  + '→' + C.reset + ' ' + s);
const err = (s) => console.log(C.red   + '✗' + C.reset + ' ' + s);

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

function getFirebaseToken() {
  try {
    const confPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json');
    const conf = JSON.parse(fs.readFileSync(confPath, 'utf8'));
    return conf.tokens && conf.tokens.access_token;
  } catch (e) {
    return null;
  }
}

function fetchDB(endpoint, token) {
  return new Promise((resolve, reject) => {
    const url = `https://${DB_HOST}${endpoint}?auth=${token}`;
    https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 100))); }
      });
    }).on('error', reject);
  });
}

function sanitizarNombreArchivo(nombre) {
  return (nombre || 'sin_nombre')
    .replace(/[\/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, '_')
    .trim()
    .slice(0, 80);
}

function fechaHoyFormateada() {
  const d = new Date();
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function fechaHoraFormateada() {
  const d = new Date();
  return d.toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function formatearFecha(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  } catch(e) { return isoStr; }
}

// ═══════════════════════════════════════════════════════════════════
// PROCESAR DATOS
// ═══════════════════════════════════════════════════════════════════

function extraerTratamientos(paciente) {
  const lista = [];

  // De la colección tratamientos
  if (paciente.tratamientos && typeof paciente.tratamientos === 'object') {
    Object.values(paciente.tratamientos).forEach((t) => {
      if (!t.eliminado && t.nombre) lista.push(t.nombre);
    });
  }

  // Del historial clínico (campo tratamiento)
  if (paciente.historial && typeof paciente.historial === 'object') {
    Object.values(paciente.historial).forEach((h) => {
      if (!h.eliminado && h.tratamiento && !lista.includes(h.tratamiento)) {
        lista.push(h.tratamiento);
      }
    });
  }

  // Campo legacy string
  if (paciente.tratamiento && typeof paciente.tratamiento === 'string') {
    if (!lista.includes(paciente.tratamiento)) lista.push(paciente.tratamiento);
  }

  return lista.length ? lista : ['Sin tratamiento registrado'];
}

function extraerHistorial(paciente) {
  if (!paciente.historial) return '';
  return Object.values(paciente.historial)
    .filter((h) => !h.eliminado)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .map((h) => `${formatearFecha(h.fecha)}: ${h.tratamiento}${h.notas ? ' — ' + h.notas : ''}`)
    .join(' | ');
}

function cantidadArchivos(paciente) {
  if (!paciente.archivos) return 0;
  return Object.values(paciente.archivos).filter((a) => !a.eliminado).length;
}

// ═══════════════════════════════════════════════════════════════════
// GENERAR EXCEL
// ═══════════════════════════════════════════════════════════════════

function estiloEncabezado() {
  return {
    font:      { bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
    fill:      { fgColor: { rgb: '2A2118' } },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top:    { style: 'thin', color: { rgb: 'C9A35A' } },
      bottom: { style: 'thin', color: { rgb: 'C9A35A' } },
      left:   { style: 'thin', color: { rgb: 'C9A35A' } },
      right:  { style: 'thin', color: { rgb: 'C9A35A' } },
    }
  };
}

function estiloGrupo() {
  return {
    font:      { bold: true, sz: 12, color: { rgb: '8C6F2F' } },
    fill:      { fgColor: { rgb: 'F5EFE4' } },
    alignment: { horizontal: 'left', vertical: 'center' }
  };
}

function estiloFila(par) {
  return {
    fill:      { fgColor: { rgb: par ? 'FAF6EC' : 'FFFFFF' } },
    alignment: { vertical: 'center', wrapText: true },
    border: {
      bottom: { style: 'hair', color: { rgb: 'D9C9B0' } }
    }
  };
}

function generarExcel(pacientesData, carpetaDestino) {
  const wb = XLSX.utils.book_new();

  // ── Hoja 1: Por Tratamiento ──────────────────────────────────
  const filasGrupal = [];

  // Construir mapa tratamiento → pacientes
  const mapaTrats = {};
  Object.entries(pacientesData).forEach(([key, p]) => {
    const tratas = extraerTratamientos(p);
    tratas.forEach((trat) => {
      if (!mapaTrats[trat]) mapaTrats[trat] = [];
      mapaTrats[trat].push({ key, ...p });
    });
  });

  // Ordenar tratamientos alfabéticamente
  const tratamientosOrdenados = Object.keys(mapaTrats).sort();

  // Encabezados
  const cols1 = [
    'Tratamiento', 'Nombre completo', 'Teléfono', 'DNI',
    'Email', 'Notas del paciente', 'Historial clínico', 'Fotos cargadas'
  ];

  // Fila encabezado
  filasGrupal.push(cols1);

  tratamientosOrdenados.forEach((trat) => {
    const pacientesDelTrat = mapaTrats[trat];

    // Fila de grupo (solo tratamiento en negrita)
    filasGrupal.push([
      `▸ ${trat} (${pacientesDelTrat.length} paciente${pacientesDelTrat.length !== 1 ? 's' : ''})`,
      '', '', '', '', '', '', ''
    ]);

    // Pacientes del grupo ordenados por nombre
    pacientesDelTrat
      .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      .forEach((p) => {
        filasGrupal.push([
          trat,
          p.nombre || '',
          p.telefono || '',
          p.dni || '',
          p.email || '',
          p.notas || '',
          extraerHistorial(p),
          cantidadArchivos(p)
        ]);
      });

    // Fila vacía entre grupos
    filasGrupal.push(['', '', '', '', '', '', '', '']);
  });

  const ws1 = XLSX.utils.aoa_to_sheet(filasGrupal);

  // Ancho de columnas
  ws1['!cols'] = [
    { wch: 28 }, { wch: 24 }, { wch: 16 }, { wch: 12 },
    { wch: 28 }, { wch: 30 }, { wch: 45 }, { wch: 10 }
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'Por Tratamiento');

  // ── Hoja 2: Todos los pacientes ──────────────────────────────
  const filasTodos = [];
  const cols2 = [
    '#', 'ID', 'Nombre completo', 'Teléfono', 'DNI', 'Email',
    'Tratamientos', 'Historial clínico', 'Notas', 'Fotos'
  ];
  filasTodos.push(cols2);

  Object.values(pacientesData)
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    .forEach((p, i) => {
      filasTodos.push([
        i + 1,
        p.pacienteId ? '#' + p.pacienteId : '',
        p.nombre    || '',
        p.telefono  || '',
        p.dni       || '',
        p.email     || '',
        extraerTratamientos(p).join(' / '),
        extraerHistorial(p),
        p.notas     || '',
        cantidadArchivos(p)
      ]);
    });

  const ws2 = XLSX.utils.aoa_to_sheet(filasTodos);
  ws2['!cols'] = [
    { wch: 4 }, { wch: 6 }, { wch: 24 }, { wch: 16 }, { wch: 12 },
    { wch: 28 }, { wch: 35 }, { wch: 45 }, { wch: 30 }, { wch: 6 }
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'Todos los Pacientes');

  // ── Hojas individuales por tratamiento (si tienen 2+ pacientes) ──
  tratamientosOrdenados.forEach((trat) => {
    const pacs = mapaTrats[trat];
    if (pacs.length < 1) return;

    const nombreHoja = trat.slice(0, 28).replace(/[\/\\?*[\]]/g, '_');
    const filas = [];
    filas.push(['Nombre completo', 'Teléfono', 'DNI', 'Email', 'Notas', 'Historial', 'Fotos']);

    pacs.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
      .forEach((p) => {
        filas.push([
          p.nombre    || '',
          p.telefono  || '',
          p.dni       || '',
          p.email     || '',
          p.notas     || '',
          extraerHistorial(p),
          cantidadArchivos(p)
        ]);
      });

    const wsT = XLSX.utils.aoa_to_sheet(filas);
    wsT['!cols'] = [
      { wch: 24 }, { wch: 16 }, { wch: 12 }, { wch: 28 },
      { wch: 30 }, { wch: 45 }, { wch: 6 }
    ];
    XLSX.utils.book_append_sheet(wb, wsT, nombreHoja);
  });

  // Guardar
  const nombreArchivo = `Aurea_Backup_${fechaHoyFormateada()}.xlsx`;
  const rutaExcel     = path.join(carpetaDestino, nombreArchivo);
  XLSX.writeFile(wb, rutaExcel);
  return rutaExcel;
}

// ═══════════════════════════════════════════════════════════════════
// GUARDAR FOTOS
// ═══════════════════════════════════════════════════════════════════

function guardarFotosPaciente(paciente, carpetaPaciente) {
  if (!paciente.archivos) return 0;

  const archivos = Object.values(paciente.archivos).filter((a) => !a.eliminado && a.dataUrl);
  if (!archivos.length) return 0;

  if (!fs.existsSync(carpetaPaciente)) fs.mkdirSync(carpetaPaciente, { recursive: true });

  let guardadas = 0;
  archivos.forEach((arch, i) => {
    try {
      // dataUrl: "data:image/jpeg;base64,/9j/4AAQ..."
      const matches = arch.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return;

      const ext       = matches[1].includes('png') ? 'png' : 'jpg';
      const base64    = matches[2];
      const buffer    = Buffer.from(base64, 'base64');
      const cat       = arch.categoria || 'sin_categoria';
      const fecha     = arch.fecha ? arch.fecha.slice(0, 10) : 'sin_fecha';
      const nombre    = `${String(i + 1).padStart(3, '0')}_${cat}_${fecha}.${ext}`;
      const rutaFoto  = path.join(carpetaPaciente, nombre);

      fs.writeFileSync(rutaFoto, buffer);
      guardadas++;
    } catch (e) {
      // silencioso — foto corrupta
    }
  });

  return guardadas;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log(C.bold + '╔══════════════════════════════════════════╗' + C.reset);
  console.log(C.bold + '║        BACKUP — ÁUREA AGENDA             ║' + C.reset);
  console.log(C.bold + '╚══════════════════════════════════════════╝' + C.reset);
  console.log('');

  // 1. Token
  inf('Obteniendo credenciales Firebase…');
  const token = getFirebaseToken();
  if (!token) {
    err('No hay sesión de Firebase. Ejecutá: firebase login');
    process.exit(1);
  }
  ok('Credenciales OK');

  // 2. Fetch datos
  inf('Descargando datos de pacientes…');
  let pacientesData;
  try {
    pacientesData = await fetchDB('/pacientes.json', token);
  } catch (e) {
    err('Error al conectar con Firebase: ' + e.message);
    process.exit(1);
  }

  if (!pacientesData) {
    err('La base de datos está vacía.');
    process.exit(0);
  }

  const totalPacientes = Object.keys(pacientesData).length;
  ok(`${totalPacientes} pacientes descargados`);

  // 3. Crear carpeta con fecha y hora
  const nombreCarpeta = `backup_${fechaHoraFormateada()}`;
  const carpetaDestino = path.join(BASE_DIR, nombreCarpeta);
  fs.mkdirSync(carpetaDestino, { recursive: true });
  ok('Carpeta creada: backup/' + nombreCarpeta);

  // 4. Generar Excel
  inf('Generando planilla Excel…');
  try {
    const rutaExcel = generarExcel(pacientesData, carpetaDestino);
    ok('Excel generado: ' + path.basename(rutaExcel));
  } catch (e) {
    err('Error al generar Excel: ' + e.message);
  }

  // 5. Guardar fotos
  inf('Guardando fotos por paciente…');
  const carpetaFotos = path.join(carpetaDestino, 'fotos');
  let totalFotos = 0;
  let pacientesConFotos = 0;

  Object.values(pacientesData).forEach((paciente) => {
    const nombreCarpetaPac = sanitizarNombreArchivo(paciente.nombre);
    const carpetaPaciente  = path.join(carpetaFotos, nombreCarpetaPac);
    const n = guardarFotosPaciente(paciente, carpetaPaciente);
    if (n > 0) {
      totalFotos += n;
      pacientesConFotos++;
    }
  });

  if (totalFotos > 0) {
    ok(`${totalFotos} foto(s) guardada(s) en ${pacientesConFotos} carpeta(s) de pacientes`);
  } else {
    inf('No hay fotos cargadas en la base de datos aún.');
  }

  // 6. Resumen
  console.log('');
  console.log(C.bold + C.green + '══════════════════════════════════════════' + C.reset);
  console.log(C.bold + C.green + '  ✓ BACKUP COMPLETADO' + C.reset);
  console.log(C.bold + C.green + '══════════════════════════════════════════' + C.reset);
  console.log('');
  console.log('  📁 Ubicación: Aurea agenda/backup/' + nombreCarpeta);
  console.log('  📊 Excel:     Aurea_Backup_' + fechaHoyFormateada() + '.xlsx');
  console.log('  🖼  Fotos:     ' + totalFotos + ' imagen(es) en ' + pacientesConFotos + ' carpeta(s)');
  console.log('  👥 Pacientes: ' + totalPacientes);
  console.log('');

  // 7. Abrir carpeta en Finder
  const { exec } = require('child_process');
  exec('open "' + carpetaDestino + '"');
}

main().catch((e) => {
  err('Error inesperado: ' + e.message);
  process.exit(1);
});
