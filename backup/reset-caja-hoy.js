#!/usr/bin/env node
// Borra los pagos y ventas del día de hoy (pruebas de caja)

const https = require('https');
const os    = require('fs');
const path  = require('path');

const DB_HOST = 'agenda-bruna-nara-default-rtdb.firebaseio.com';
const HOY     = new Date().toISOString().slice(0, 10);

const C = { reset:'\x1b[0m', green:'\x1b[32m', cyan:'\x1b[36m', red:'\x1b[31m', bold:'\x1b[1m' };
const ok  = s => console.log(C.green+'✓'+C.reset+' '+s);
const inf = s => console.log(C.cyan+'→'+C.reset+' '+s);
const err = s => console.log(C.red+'✗'+C.reset+' '+s);

function getToken() {
  try {
    const p = require('path').join(require('os').homedir(), '.config', 'configstore', 'firebase-tools.json');
    const c = JSON.parse(require('fs').readFileSync(p, 'utf8'));
    return c.tokens && c.tokens.access_token;
  } catch(e) { return null; }
}

function fbGet(endpoint, token) {
  return new Promise((resolve, reject) => {
    https.get('https://'+DB_HOST+endpoint+'?auth='+token, res => {
      let d=''; res.on('data',c=>{d+=c;}); res.on('end',()=>{ try{resolve(JSON.parse(d));}catch(e){reject(e);} });
    }).on('error', reject);
  });
}

function fbDelete(endpoint, token) {
  return new Promise((resolve, reject) => {
    const req = https.request({ method:'DELETE', hostname:DB_HOST, path:endpoint+'?auth='+token }, res => {
      let d=''; res.on('data',c=>{d+=c;}); res.on('end',()=>resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });
}

async function main() {
  console.log('\n'+C.bold+'Resetear caja del día '+HOY+C.reset+'\n');

  const token = getToken();
  if (!token) { err('No hay token Firebase. Ejecutá: firebase login'); process.exit(1); }

  // Borrar pagos de hoy
  inf('Leyendo pagos…');
  const pagos = await fbGet('/pagos.json', token) || {};
  const pagosHoy = Object.keys(pagos).filter(k => (pagos[k].fecha||'').startsWith(HOY));
  inf(pagosHoy.length + ' pago(s) de hoy encontrados');
  for (const k of pagosHoy) {
    await fbDelete('/pagos/'+k+'.json', token);
    ok('Pago eliminado: '+k);
  }

  // Borrar ventas de hoy
  inf('Leyendo ventas…');
  const ventas = await fbGet('/ventas.json', token) || {};
  const ventasHoy = Object.keys(ventas).filter(k => (ventas[k].fecha||'').startsWith(HOY));
  inf(ventasHoy.length + ' venta(s) de hoy encontradas');
  for (const k of ventasHoy) {
    await fbDelete('/ventas/'+k+'.json', token);
    ok('Venta eliminada: '+k);
  }

  // Borrar cierres de hoy (si hubo alguno)
  inf('Leyendo cierres…');
  const cierres = await fbGet('/cierres.json', token) || {};
  const cierresHoy = Object.keys(cierres).filter(k => (cierres[k].fecha||'').startsWith(HOY));
  inf(cierresHoy.length + ' cierre(s) de hoy encontrados');
  for (const k of cierresHoy) {
    await fbDelete('/cierres/'+k+'.json', token);
    ok('Cierre eliminado: '+k);
  }

  console.log('\n'+C.bold+C.green+'✓ Caja de hoy reseteada a $0'+C.reset+'\n');
}

main().catch(e => { err(e.message); process.exit(1); });
