// Exportación limpia (sin asas, guías, cuadrícula ni «Ver encima») y tiempos con una captura de 1920×1080
const U = require('./util');
const { PNG } = require('pngjs');
const fs = require('fs');
(async () => {
  const L = await U.launch(); const page = L.page;
  await U.openCapture(page);
  const orig = U.readPNG(U.CAP);
  // un retoque y una flecha seleccionada
  await U.tool(page, 'heal'); await U.dragDoc(page, 8, 36, 158, 66); await page.keyboard.press('Enter');
  await U.tool(page, 'rect'); await U.dragDoc(page, 500, 80, 700, 200);
  const base = (await U.exportPNG(page, 'x_base.png')).png;
  await page.click('.tool[data-tool="select"]'); await U.clickDoc(page, 500, 140);
  await page.click('#bGrid');
  await page.evaluate(() => { const c = document.querySelector('#pCompare'); c.value = 0.6; c.dispatchEvent(new Event('input')); });
  await U.tool(page, 'rpatch'); await U.dragDoc(page, 12, 144, 52, 160); // vista previa de parche pendiente (sin aplicar)
  const shot = await page.screenshot({ clip: { x: 240, y: 40, width: 700, height: 300 } }); fs.writeFileSync(U.OUT + '/x_pantalla_con_extras.png', shot);
  const e = await U.exportPNG(page, 'x_con_extras.png');
  const d = U.diff(e.png, base);
  U.check(e.png.width === orig.width && e.png.height === orig.height, `mismas dimensiones que la captura (${e.png.width}×${e.png.height})`);
  U.check(d.inside + d.outside === 0, `con selección, cuadrícula, «Ver encima» al 60 % y un parche sin aplicar, el PNG exportado es idéntico (${d.inside + d.outside} píxeles distintos)`);
  const raw = fs.readFileSync(e.file);
  U.check(raw.slice(1, 4).toString() === 'PNG' && PNG.sync.read(raw).width === 900, 'el archivo es un PNG plano y sin pérdida');
  await L.browser.close();

  // captura grande
  const big = new PNG({ width: 1920, height: 1080 });
  for (let y = 0; y < 1080; y++) for (let x = 0; x < 1920; x++) { const i = (y * 1920 + x) * 4; const line = y % 90 === 0 || x % 240 === 0; const v = line ? 170 : 240; big.data[i] = v; big.data[i + 1] = v; big.data[i + 2] = line ? 170 : 240; big.data[i + 3] = 255; }
  for (let y = 300; y < 330; y++) for (let x = 400; x < 700; x++) if ((x * 7 + y * 3) % 11 < 5) { const i = (y * 1920 + x) * 4; big.data[i] = big.data[i + 1] = big.data[i + 2] = 20; }
  const bf = U.OUT + '/x_grande.png'; fs.writeFileSync(bf, PNG.sync.write(big));
  const L2 = await U.launch(); const p = L2.page;
  await U.openCapture(p, bf);
  await U.tool(p, 'rpatch');
  let t0 = Date.now(); await U.dragDoc(p, 395, 295, 705, 335); await p.waitForFunction(() => window.MesaDeCalco.test.rt); const tPatch = Date.now() - t0;
  const r = await p.evaluate(() => window.MesaDeCalco.test.rt);
  await p.keyboard.press('Escape');
  await U.tool(p, 'heal');
  t0 = Date.now(); await U.dragDoc(p, 395, 295, 705, 335); await p.waitForFunction(() => window.MesaDeCalco.test.rt && window.MesaDeCalco.test.rt.via); const tHeal = Date.now() - t0;
  await p.keyboard.press('Enter');
  const eb = await U.exportPNG(p, 'x_grande_rellena.png');
  const db = U.diff(eb.png, big, { x: 395, y: 295, w: 310, h: 40 });
  let lineOK = true; for (let x = 395; x < 705; x++) if (x !== 480 && U.px(eb.png, x, 300)[0] !== 240) lineOK = false; for (let y = 295; y < 335; y++) if (U.px(eb.png, 480, y)[0] !== 170) lineOK = false;
  U.check(db.outside === 0 && lineOK, `1920×1080: relleno sin tocar nada fuera; la línea vertical de x=480 sigue entera`);
  U.check(tPatch < 3000 && tHeal < 3000, `tiempos con 1920×1080 — buscar origen del parche: ${tPatch} ms (fallos de borde ${r.bad}); borrar y rellenar 310×40: ${tHeal} ms`);
  U.check(L.errors.length + L2.errors.length === 0, 'sin errores de JavaScript ' + L.errors.concat(L2.errors).join(' | '));
  await L2.browser.close(); U.done();
})();
