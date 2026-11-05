// Regresión: lo que ya funcionaba debe dar exactamente lo mismo que la versión original (respaldo)
const U = require('./util');
const { chromium } = require('playwright-core');
async function run(html) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
  const page = await ctx.newPage(); const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto('file:///' + U.ROOT + '/' + html); await page.evaluate(() => localStorage.clear()); await page.reload();
  const out = {};
  // 1) ejemplo calcado (formularios y señales)
  await page.click('#wDemo'); await page.waitForTimeout(300);
  out.demo = await page.evaluate(() => { const c = document.createElement('canvas'); return null; });
  const [d1] = await Promise.all([page.waitForEvent('download'), page.click('#bPng')]); const f1 = U.OUT + '/reg_demo_' + html.replace(/\W/g, '_') + '.png'; await d1.saveAs(f1); out.demoPng = U.readPNG(f1);
  out.demoObjs = await page.evaluate(() => window.MesaDeCalco.doc.objs.length);
  // 2) captura + detectar cajas + varita de calco + flecha
  page.once('dialog', d => d.accept()); await page.click('#bNew');
  await page.setInputFiles('#fImg', U.CAP); await page.waitForTimeout(600);
  await page.click('.tool[data-tool="detect"]'); await page.waitForTimeout(300);
  out.detected = await page.evaluate(() => window.MesaDeCalco.doc.objs.map(o => [o.type, o.x, o.y, o.w, o.h].join(':')).join(' '));
  await page.click('.tool[data-tool="arrow"]');
  const b = await page.locator('#cv').boundingBox(); const z = await page.evaluate(() => parseFloat(document.querySelector('#zoomv').textContent) / 100);
  await page.mouse.move(b.x + 600 * z, b.y + 100 * z); await page.mouse.down(); await page.mouse.move(b.x + 700 * z, b.y + 160 * z, { steps: 5 }); await page.mouse.up();
  await page.waitForTimeout(200);
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#bPng')]); const f2 = U.OUT + '/reg_cap_' + html.replace(/\W/g, '_') + '.png'; await d2.saveAs(f2); out.capPng = U.readPNG(f2);
  out.errors = errors;
  await browser.close(); return out;
}
(async () => {
  const a = await run('respaldo/editor-prototipos.original.html');
  const b = await run('editor-prototipos.html');
  let d = U.diff(a.demoPng, b.demoPng);
  U.check(a.demoObjs === b.demoObjs && d.inside + d.outside === 0, `ejemplo calcado (${b.demoObjs} controles): exportación idéntica a la versión original (${d.inside + d.outside} píxeles distintos)`);
  U.check(a.detected === b.detected, `«Detectar cajas» encuentra lo mismo (${b.detected.split(' ').length} cajas)`);
  d = U.diff(a.capPng, b.capPng);
  U.check(d.inside + d.outside === 0, `captura + cajas detectadas + flecha: exportación idéntica (${d.inside + d.outside} píxeles distintos)`);
  U.check(!a.errors.length && !b.errors.length, 'sin errores de JavaScript ' + b.errors.join(' | '));
  U.done();
})();
