#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════
// RESET — Áurea Agenda
// 1) Backup completo (pacientes + turnos + fotos)
// 2) Borra nodos "turnos" y "pacientes" de Firebase
// ═══════════════════════════════════════════════════════════════════

const https = require('https');
const fs    = require('fs');
const path  = require('path');
const os    = require('os');
const XLSX  = require('xlsx');

const DB_HOST  = 'agenda-bruna-nara-default-rtdb.firebaseio.com';
const BASE_DIR = path.join(__dirname);

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
const warn = (s) => console.log(C.yellow + '!' + C.reset + ' ' + s);

// ── Helpers ──────────────────────────────────────────────────────

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
        catch (e) { reject(new Error('JSON parse error: ' + data.slice(0, 200))); }
      });
    }).on('error', reject);
  });
}

function deleteDB(endpoint, token) {
  return new Promise((resolve, reject) => {
    const url = `https://${DB_HOST}${endpoint}?auth=${token}`;
    const options = { method: 'DELETE', hostname: DB_HOST, path: endpoint + '?auth=' + token };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    req.end();
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
  return new Date().toISOString().slice(0, 10);
}

function fechaHoraFormateada() {
  return new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
}

function formatearFecha(isoStr) {
  if (!isoStr) return '';
  try {
    return new Date(isoStr).toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
  } catch(e) { return isoStr; }
}

// ── Procesar pacientes ───────────────────────────────────────────

function extraerTratamientos(p) {
  const lista = [];
  if (p.tratamientos && typeof p.tratamientos === 'object') {
    Object.values(p.tratamientos).forEach((t) => {
      if (!t.eliminado && t.nombre) lista.push(t.nombre);
    });
  }
  if (p.historial && typeof p.historial === 'object') {
    Object.values(p.historial).forEach((h) => {
      if (!h.eliminado && h.tratamiento && !lista.includes(h.tratamiento)) lista.push(h.tratamiento);
    });
  }
  if (p.tratamiento && typeof p.tratamiento === 'string' && !lista.includes(p.tratamiento)) {
    lista.push(p.tratamiento);
  }
  return lista.length ? lista : ['Sin tratamiento registrado'];
}

function extraerHistorial(p) {
  if (!p.historial) return '';
  return Object.values(p.historial)
    .filter((h) => !h.eliminado)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))
    .map((h) => `${formatearFecha(h.fecha)}: ${h.tratamiento}${h.notas ? ' — ' + h.notas : ''}`)
    .join(' | ');
}

function cantidadArchivos(p) {
  if (!p.archivos) return 0;
  return Object.values(p.archivos).filter((a) => !a.eliminado).length;
}

// ── Excel ────────────────────────────────────────────────────────

function generarExcel(pacientesData, turnosData, carpetaDestino) {
  const wb = XLSX.utils.book_new();

  // Hoja 1: Pacientes
  const filasPac = [['#', 'ID', 'Nombre', 'Teléfono', 'DNI', 'Email', 'Tratamientos', 'Historial clínico', 'Notas', 'Fotos']];
  Object.values(pacientesData || {})
    .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
    .forEach((p, i) => {
      filasPac.push([
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
  const wsPac = XLSX.utils.aoa_to_sheet(filasPac);
  wsPac['!cols'] = [
    { wch: 4 }, { wch: 6 }, { wch: 24 }, { wch: 16 }, { wch: 12 },
    { wch: 28 }, { wch: 35 }, { wch: 45 }, { wch: 30 }, { wch: 6 }
  ];
  XLSX.utils.book_append_sheet(wb, wsPac, 'Pacientes');

  // Hoja 2: Turnos
  const filasTurnos = [['Fecha', 'Hora', 'Paciente', 'Tratamiento', 'Estado', 'Notas', 'Duración']];
  Object.values(turnosData || {})
    .sort((a, b) => {
      const da = (a.fecha || '') + (a.hora || '');
      const db = (b.fecha || '') + (b.hora || '');
      return db.localeCompare(da); // más reciente primero
    })
    .forEach((t) => {
      filasTurnos.push([
        formatearFecha(t.fecha),
        t.hora          || '',
        t.pacienteNombre|| t.nombre || '',
        t.tratamiento   || '',
        t.estado        || '',
        t.notas         || '',
        t.duracion      || ''
      ]);
    });
  const wsTurnos = XLSX.utils.aoa_to_sheet(filasTurnos);
  wsTurnos['!cols'] = [
    { wch: 12 }, { wch: 8 }, { wch: 24 }, { wch: 28 },
    { wch: 12 }, { wch: 35 }, { wch: 10 }
  ];
  XLSX.utils.book_append_sheet(wb, wsTurnos, 'Turnos');

  const rutaExcel = path.join(carpetaDestino, `Aurea_Backup_${fechaHoyFormateada()}.xlsx`);
  XLSX.writeFile(wb, rutaExcel);
  return rutaExcel;
}

// ── Guardar fotos ─────────────────────────────────────────────────

function guardarFotosPaciente(paciente, carpetaPaciente) {
  if (!paciente.archivos) return 0;
  const archivos = Object.values(paciente.archivos).filter((a) => !a.eliminado && a.dataUrl);
  if (!archivos.length) return 0;

  if (!fs.existsSync(carpetaPaciente)) fs.mkdirSync(carpetaPaciente, { recursive: true });

  let guardadas = 0;
  archivos.forEach((arch, i) => {
    try {
      const matches = arch.dataUrl.match(/^data:([^;]+);base64,(.+)$/);
      if (!matches) return;
      const ext    = matches[1].includes('png') ? 'png' : 'jpg';
      const buffer = Buffer.from(matches[2], 'base64');
      const cat    = arch.categoria || 'sin_categoria';
      const fecha  = arch.fecha ? arch.fecha.slice(0, 10) : 'sin_fecha';
      const nombre = `${String(i + 1).padStart(3, '0')}_${cat}_${fecha}.${ext}`;
      fs.writeFileSync(path.join(carpetaPaciente, nombre), buffer);
      guardadas++;
    } catch (e) {}
  });
  return guardadas;
}

// ── También guardar JSON crudo de la DB ──────────────────────────

function guardarJSON(data, nombre, carpeta) {
  const ruta = path.join(carpeta, nombre);
  fs.writeFileSync(ruta, JSON.stringify(data, null, 2), 'utf8');
  return ruta;
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════

async function main() {
  console.log('');
  console.log(C.bold + '╔══════════════════════════════════════════════╗' + C.reset);
  console.log(C.bold + '║   BACKUP + RESET — ÁUREA AGENDA              ║' + C.reset);
  console.log(C.bold + '╚══════════════════════════════════════════════╝' + C.reset);
  console.log('');

  // 1. Token
  inf('Obteniendo credenciales Firebase…');
  const token = getFirebaseToken();
  if (!token) {
    err('No hay sesión de Firebase. Ejecutá: firebase login');
    process.exit(1);
  }
  ok('Credenciales OK');

  // 2. Descargar datos
  inf('Descargando pacientes…');
  let pacientesData = null;
  try { pacientesData = await fetchDB('/pacientes.json', token); } catch (e) { err('Error pacientes: ' + e.message); process.exit(1); }

  inf('Descargando turnos…');
  let turnosData = null;
  try { turnosData = await fetchDB('/turnos.json', token); } catch (e) { err('Error turnos: ' + e.message); process.exit(1); }

  const totalPacientes = pacientesData ? Object.keys(pacientesData).length : 0;
  const totalTurnos    = turnosData    ? Object.keys(turnosData).length    : 0;
  ok(`${totalPacientes} pacientes / ${totalTurnos} turnos descargados`);

  // 3. Crear carpeta backup
  const nombreCarpeta  = `backup_${fechaHoraFormateada()}_RESET`;
  const carpetaDestino = path.join(BASE_DIR, nombreCarpeta);
  fs.mkdirSync(carpetaDestino, { recursive: true });
  ok('Carpeta: backup/' + nombreCarpeta);

  // 4. Guardar JSONs crudos (backup fiel de la DB)
  guardarJSON(pacientesData || {}, 'pacientes_raw.json', carpetaDestino);
  guardarJSON(turnosData    || {}, 'turnos_raw.json',    carpetaDestino);
  ok('JSONs crudos guardados (pacientes_raw.json, turnos_raw.json)');

  // 5. Generar Excel
  inf('Generando Excel…');
  try {
    const rutaExcel = generarExcel(pacientesData, turnosData, carpetaDestino);
    ok('Excel: ' + path.basename(rutaExcel));
  } catch (e) {
    err('Error Excel: ' + e.message);
  }

  // 6. Guardar fotos
  inf('Guardando fotos…');
  const carpetaFotos = path.join(carpetaDestino, 'fotos');
  let totalFotos = 0, pacientesConFotos = 0;

  Object.values(pacientesData || {}).forEach((p) => {
    const n = guardarFotosPaciente(p, path.join(carpetaFotos, sanitizarNombreArchivo(p.nombre)));
    if (n > 0) { totalFotos += n; pacientesConFotos++; }
  });
  ok(`${totalFotos} foto(s) en ${pacientesConFotos} carpeta(s)`);

  // ──────────────────────────────────────────────────────────────
  // 7. BORRAR datos de Firebase
  // ──────────────────────────────────────────────────────────────
  console.log('');
  warn('Borrando datos de Firebase…');

  if (totalTurnos > 0) {
    inf('Borrando nodo /turnos…');
    const resTurnos = await deleteDB('/turnos.json', token);
    if (resTurnos.status === 200) {
      ok('/turnos eliminado');
    } else {
      err(`Error borrando turnos: HTTP ${resTurnos.status} — ${resTurnos.body}`);
      process.exit(1);
    }
  } else {
    inf('No había turnos que borrar.');
  }

  if (totalPacientes > 0) {
    inf('Borrando nodo /pacientes…');
    const resPac = await deleteDB('/pacientes.json', token);
    if (resPac.status === 200) {
      ok('/pacientes eliminado');
    } else {
      err(`Error borrando pacientes: HTTP ${resPac.status} — ${resPac.body}`);
      process.exit(1);
    }
  } else {
    inf('No había pacientes que borrar.');
  }

  // 8. Resumen final
  console.log('');
  console.log(C.bold + C.green + '══════════════════════════════════════════════' + C.reset);
  console.log(C.bold + C.green + '  ✓ BACKUP COMPLETADO Y DATOS RESETEADOS' + C.reset);
  console.log(C.bold + C.green + '══════════════════════════════════════════════' + C.reset);
  console.log('');
  console.log('  📁 Backup:    backup/' + nombreCarpeta);
  console.log('  👥 Pacientes: ' + totalPacientes + ' guardados → borrados');
  console.log('  📅 Turnos:    ' + totalTurnos    + ' guardados → borrados');
  console.log('  🖼  Fotos:     ' + totalFotos + ' imagen(es)');
  console.log('');
  console.log(C.yellow + '  La app queda con pacientes y turnos en cero.' + C.reset);
  console.log('  El backup completo está en la carpeta indicada.');
  console.log('');

  // Abrir carpeta en Finder
  const { exec } = require('child_process');
  exec('open "' + carpetaDestino + '"');
}

main().catch((e) => {
  err('Error inesperado: ' + e.message);
  console.error(e);
  process.exit(1);
});
