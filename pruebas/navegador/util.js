// Utilidades comunes para las pruebas de Mesa de Calco
const { chromium } = require('playwright-core');
const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..').split(path.sep).join('/'); // carpeta del editor
const HTML = 'file:///' + ROOT + '/editor-prototipos.html';
const CAP = ROOT + '/pruebas/captura_prueba.png';
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const readPNG = f => PNG.sync.read(fs.readFileSync(f));
const fromDataURL = u => PNG.sync.read(Buffer.from(u.split(',')[1], 'base64'));

async function launch(opts = {}) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: opts.args || [] });
  const context = await browser.newContext({ viewport: opts.viewport || { width: 1600, height: 1000 }, acceptDownloads: true, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_CONNECTION_REFUSED|Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  await page.goto(HTML);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  // las suites antiguas prueban los modos clásicos (parche que tapa, relleno que prolonga líneas)
  if (opts.legacy !== false) await page.evaluate(() => Object.assign(window.MesaDeCalco.test.rtOpt, { pmode2: 'tapar', hmethod: 'filas' }));
  return { browser, context, page, errors };
}

async function openCapture(page, file = CAP) {
  await page.setInputFiles('#fImg', file);
  await page.waitForFunction(() => window.MesaDeCalco.doc.bg && window.MesaDeCalco.test.exportURL().length > 1000);
  await page.waitForTimeout(150);
  await page.evaluate(() => window.MesaDeCalco.test.setZoom(1));
  await page.waitForTimeout(100);
}

// coordenada de documento -> pantalla (esquina del píxel, o centro con c=0.5)
async function scr(page, x, y, c = 0) {
  const b = await page.locator('#cv').boundingBox();
  const z = await page.evaluate(() => window.MesaDeCalco.test.zoom);
  return { x: b.x + (x + c) * z, y: b.y + (y + c) * z };
}
async function dragDoc(page, x0, y0, x1, y1, opt = {}) {
  const a = await scr(page, x0, y0, opt.c || 0), b = await scr(page, x1, y1, opt.c || 0);
  if (opt.alt) await page.keyboard.down('Alt');
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  await page.mouse.move(b.x, b.y, { steps: opt.steps || 8 });
  await page.mouse.up();
  if (opt.alt) await page.keyboard.up('Alt');
  await page.waitForTimeout(60);
}
async function clickDoc(page, x, y, mods = []) {
  const a = await scr(page, x, y, 0.5);
  for (const m of mods) await page.keyboard.down(m);
  await page.mouse.click(a.x, a.y);
  for (const m of mods) await page.keyboard.up(m);
  await page.waitForTimeout(60);
}
async function tool(page, id) { await page.click(`.tool[data-tool="${id}"]`); await page.waitForTimeout(50); }

// exporta con el botón real y lee el PNG descargado
async function exportPNG(page, name) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bPng')]);
  const f = path.join(OUT, name);
  await dl.saveAs(f);
  return { file: f, png: readPNG(f) };
}

// comparación píxel a píxel; rect = zona permitida {x,y,w,h} (o lista)
function diff(a, b, allowed = []) {
  if (a.width !== b.width || a.height !== b.height) return { sizeMismatch: true };
  const rects = Array.isArray(allowed) ? allowed : [allowed];
  let inside = 0, outside = 0, bbox = null;
  for (let y = 0; y < a.height; y++) for (let x = 0; x < a.width; x++) {
    const i = (y * a.width + x) * 4;
    if (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2] || a.data[i + 3] !== b.data[i + 3]) {
      const inR = rects.some(r => x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h);
      if (inR) inside++; else outside++;
      if (!bbox) bbox = { x0: x, y0: y, x1: x, y1: y }; else { bbox.x0 = Math.min(bbox.x0, x); bbox.y0 = Math.min(bbox.y0, y); bbox.x1 = Math.max(bbox.x1, x); bbox.y1 = Math.max(bbox.y1, y); }
    }
  }
  return { inside, outside, bbox };
}
const px = (p, x, y) => { const i = (y * p.width + x) * 4; return [p.data[i], p.data[i + 1], p.data[i + 2], p.data[i + 3]]; };
function colorsIn(p, r) { const s = new Set(); for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) s.add(px(p, x, y).join()); return s; }

let fails = 0;
function check(cond, msg) { console.log((cond ? '  OK   ' : '  FALLA ') + msg); if (!cond) fails++; }
function done() { console.log(fails ? `\n${fails} comprobación(es) fallida(s)` : '\nTodo correcto'); process.exitCode = fails ? 1 : 0; }

module.exports = { launch, openCapture, scr, dragDoc, clickDoc, tool, exportPNG, diff, px, colorsIn, check, done, readPNG, fromDataURL, CAP, OUT, ROOT, HTML };
