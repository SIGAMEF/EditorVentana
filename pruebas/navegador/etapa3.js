// Etapa 3: quitar fondo en el HTML (varita, sumar/restar, pincel, halo, vista previa, transparencia real)
const U = require('./util');
let page;
const setRange = (label, v) => page.evaluate(([l, v]) => { const i = document.querySelector(`#right input[aria-label="${l}"]`); i.value = v; i.dispatchEvent(new Event('input')); }, [label, v]);
const setHalo = on => page.evaluate(on => { const lab = [...document.querySelectorAll('#right label.chk')].find(l => /halo/.test(l.textContent)); const i = lab.querySelector('input'); if (i.checked !== on) i.click(); }, on);
const info = () => page.locator('#rtinfo').innerText();
const ready = () => page.waitForFunction(() => window.MesaDeCalco.test.mk && window.MesaDeCalco.test.mk.ready);
// borde visible del objeto: píxeles con alfa>0 que tocan uno transparente; promedio del canal azul (el cielo es azul, la pelota no)
function edgeBlue(p, R) { let s = 0, n = 0; for (let y = R.y + 1; y < R.y + R.h - 1; y++) for (let x = R.x + 1; x < R.x + R.w - 1; x++) { const a = U.px(p, x, y); if (!a[3]) continue; if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => U.px(p, x + i, y + j)[3] === 0)) { s += a[2]; n++; } } return { avg: n ? s / n : 0, n }; }
(async () => {
  const L = await U.launch(); page = L.page;
  await U.openCapture(page);
  const orig = U.readPNG(U.CAP);
  const PH = { x: 510, y: 300, w: 330, h: 220 }; // foto (sin su marco)
  const BALL = { x: 560, y: 320, w: 160, h: 160 };

  console.log('\n1) Varita contigua sobre el cielo, sumar y restar');
  await U.tool(page, 'erase'); await ready();
  await setRange('Tolerancia', 90);
  await U.clickDoc(page, 520, 310);
  const n1 = await info(); U.check(/píxeles quedarán transparentes/.test(n1), 'vista previa: ' + n1);
  await page.screenshot({ path: U.OUT + '/e3_vista_cuadros.png', clip: { x: 700, y: 300, width: 420, height: 300 } });
  await U.clickDoc(page, 830, 510, ['Alt']); const nAlt = await info();
  await U.clickDoc(page, 830, 510, ['Shift']); const nShift = await info();
  U.check(parseInt(nAlt.replace(/\./g,'')) < parseInt(n1.replace(/\./g,''))*0.01 && nShift === n1, `Alt resta la zona contigua («${nAlt}») y Shift la vuelve a sumar («${nShift}»)`);

  console.log('\n2) Sin limpieza de halo (para comparar), tolerancia 40 y varios Shift+clic');
  await setRange('Tolerancia', 40); await U.clickDoc(page, 520, 310);
  for (const [x, y] of [[520, 380], [520, 450], [520, 512], [830, 310], [830, 450], [700, 512], [700, 305]]) await U.clickDoc(page, x, y, ['Shift']);
  await setHalo(false);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  const A = await U.exportPNG(page, 'e3_sin_halo_limpio.png');
  const eA = edgeBlue(A.png, BALL);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);

  console.log('\n3) Con limpieza de halo, pincel para corregir, aplicar y exportar');
  await U.tool(page, 'erase'); await ready();
  await setHalo(true);
  await page.click('#right button:has-text("Varita")');
  await U.clickDoc(page, 520, 310);
  for (const [x, y] of [[520, 380], [520, 450], [520, 512], [830, 310], [830, 450], [700, 512], [700, 305]]) await U.clickDoc(page, x, y, ['Shift']);
  await page.click('#right button:has-text("Pincel")'); await setRange('Pincel', 10);
  await U.dragDoc(page, 530, 500, 560, 500, { alt: true, c: 0.5, steps: 6 });
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  U.check(await page.evaluate(() => window.MesaDeCalco.doc.transparent) === true, 'el lienzo pasa a exportar con transparencia');
  let e = await U.exportPNG(page, 'e3_sin_fondo.png');
  const d = U.diff(e.png, orig, PH);
  U.check(d.outside === 0, `fuera de la foto (incluido su marco de 1 px): ${d.outside} píxeles distintos`);
  let clear = 0, solid = 0, partial = 0, brushKept = 0;
  for (let y = PH.y; y < PH.y + PH.h; y++) for (let x = PH.x; x < PH.x + PH.w; x++) { const a = U.px(e.png, x, y)[3]; if (a === 0) clear++; else if (a === 255) solid++; else partial++; }
  for (let x = 534; x < 556; x++) if (U.px(e.png, x, 500)[3] === 255) brushKept++;
  U.check(U.px(e.png, 520, 310)[3] === 0 && U.px(e.png, 640, 410)[3] === 255, 'cielo transparente, pelota opaca');
  U.check(clear > 40000 && solid > 14000 && partial > 50, `${clear} transparentes, ${solid} opacos, ${partial} semitransparentes en el borde`);
  const eB = edgeBlue(e.png, BALL);
  U.check(eB.avg < eA.avg - 25, `halo: azul medio del borde visible ${eA.avg.toFixed(0)} sin limpieza → ${eB.avg.toFixed(0)} con limpieza (pelota ≈ 20–50)`);
  U.check(brushKept >= 18, `el pincel con Alt restauró el trazo (${brushKept} de 22 píxeles opacos)`);

  console.log('\n4) La transparencia se mantiene al volver a abrir el PNG');
  await page.setInputFiles('#fImg', e.file);
  await page.waitForFunction(() => window.MesaDeCalco.doc.transparent === true);
  await page.waitForTimeout(250);
  const e2 = await U.exportPNG(page, 'e3_reabierto.png');
  const d2 = U.diff(e2.png, e.png);
  U.check(d2.inside + d2.outside === 0, `reabrir y exportar de nuevo: ${d2.inside + d2.outside} píxeles distintos (alfa incluido)`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  e = await U.exportPNG(page, 'e3_deshecho.png');
  const d3 = U.diff(e.png, orig);
  U.check(d3.inside + d3.outside === 0, 'deshacer devuelve la captura original idéntica (opaca)');

  console.log('\n5) Quitar fondo de un recorte y exportar ese recorte');
  await page.evaluate(() => { const c = document.querySelector('#right label.chk input'); });
  await page.evaluate(() => { const l = [...document.querySelectorAll('#right label.chk')].find(l => /transparencia/.test(l.textContent)); if (l && l.querySelector('input').checked) l.querySelector('input').click(); });
  await U.tool(page, 'cut');
  await U.dragDoc(page, PH.x, PH.y, PH.x + PH.w, PH.y + PH.h);
  await page.click('#right button:has-text("Quitar fondo…")');
  await page.waitForFunction(() => window.MesaDeCalco.test.mk && window.MesaDeCalco.test.mk.ready && window.MesaDeCalco.test.mk.target !== 'bg');
  await page.click('#right button:has-text("Varita")');
  await U.clickDoc(page, 520, 310);
  for (const [x, y] of [[520, 380], [520, 450], [520, 512], [830, 310], [830, 450], [700, 512], [700, 305]]) await U.clickDoc(page, x, y, ['Shift']);
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.click('.tool[data-tool="select"]');
  await U.clickDoc(page, 640, 410);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#right button:has-text("Exportar este recorte")')]);
  const rf = U.OUT + '/e3_recorte.png'; await dl.saveAs(rf);
  const rp = U.readPNG(rf);
  U.check(rp.width === PH.w && rp.height === PH.h && U.px(rp, 10, 10)[3] === 0 && U.px(rp, 130, 110)[3] === 255, `recorte ${rp.width}×${rp.height} con cielo transparente y pelota opaca`);
  const onCanvas = await U.exportPNG(page, 'e3_recorte_en_lienzo.png');
  U.check(U.px(onCanvas.png, 520, 310)[3] === 255, 'en la imagen completa, bajo el recorte se ve el hueco rellenado (sin agujeros)');

  U.check(L.errors.length === 0, 'sin errores de JavaScript ' + L.errors.join(' | '));
  await L.browser.close(); U.done();
})();
