// Etapa 1: parche (exacto y fusionado) y tampón de clonar; deshacer y guardar/abrir
const U = require('./util');
const T = () => page.evaluate(() => window.MesaDeCalco.test.rt);
let page;
(async () => {
  const L = await U.launch(); page = L.page;
  await U.openCapture(page);
  const orig = U.readPNG(U.CAP);
  const BG = [240, 240, 240, 255].join();

  console.log('\n1) Parche exacto sobre fondo plano (tapa la etiqueta «Marca»)');
  await U.tool(page, 'rpatch');
  const D1 = { x: 12, y: 144, w: 40, h: 16 };
  await U.dragDoc(page, D1.x, D1.y, D1.x + D1.w, D1.y + D1.h);
  let r = await T();
  U.check(r && r.k === 'patch' && r.D.x === D1.x && r.D.w === D1.w, `zona elegida ${JSON.stringify(r && r.D)}`);
  U.check(r.bad === 0, `origen automático con borde coincidente (desplazamiento ${r.dx},${r.dy}, fallos ${r.bad})`);
  await page.screenshot({ path: U.OUT + '/e1_parche_preview.png', clip: { x: 240, y: 60, width: 500, height: 260 } });
  // la vista previa no debe salir en la exportación
  let e = await U.exportPNG(page, 'e1_preview_no_exporta.png');
  U.check(U.diff(e.png, orig).outside === 0 && U.diff(e.png, orig).inside === 0, 'la vista previa y los recuadros no salen en el PNG exportado');
  await page.keyboard.press('Enter');
  e = await U.exportPNG(page, 'e1_parche_exacto.png');
  let d = U.diff(e.png, orig, D1);
  U.check(d.outside === 0, `fuera de la zona: ${d.outside} píxeles distintos`);
  U.check(d.inside > 0, `dentro de la zona: ${d.inside} píxeles cambiados (el texto desapareció)`);
  const cols = U.colorsIn(e.png, { x: D1.x - 1, y: D1.y - 1, w: D1.w + 2, h: D1.h + 2 });
  U.check(cols.size === 1 && cols.has(BG), `zona + contorno con un solo color ${[...cols].join(' | ')} (sin borde ni colores nuevos)`);

  console.log('\n2) Parche sobre una línea: alinear con el origen, imán y flechas');
  const D2 = { x: 200, y: 52, w: 30, h: 16 };
  await U.dragDoc(page, D2.x, D2.y, D2.x + D2.w, D2.y + D2.h);
  r = await T();
  U.check(r.bad === 0 && r.dy === 0, `origen automático en la misma fila (desplazamiento ${r.dx},${r.dy}, fallos ${r.bad})`);
  // arrastrar el origen 2 px hacia abajo: el imán debe volver a alinear la línea
  const s0 = { x: D2.x + r.dx + 10, y: D2.y + r.dy + 5 };
  await U.dragDoc(page, s0.x, s0.y, s0.x, s0.y + 2, { c: 0.5, steps: 4 });
  r = await T();
  U.check(r.bad === 0 && r.dy === 0, `tras mover el origen 2 px, el imán lo realineó (dy ${r.dy}, fallos ${r.bad})`);
  await page.keyboard.press('ArrowDown');
  r = await T();
  U.check(r.dy === 1 && r.bad > 0, `flecha abajo: origen 1 px más abajo, el aviso marca ${r.bad} píxeles del borde que no coinciden`);
  await page.screenshot({ path: U.OUT + '/e1_desalineado.png', clip: { x: 400, y: 100, width: 300, height: 120 } });
  await page.keyboard.press('ArrowUp');
  r = await T();
  U.check(r.dy === 0 && r.bad === 0, 'flecha arriba: vuelve a coincidir');
  await page.keyboard.press('Enter');
  e = await U.exportPNG(page, 'e1_parche_linea.png');
  d = U.diff(e.png, orig, [D1, D2]);
  U.check(d.outside === 0, `fuera de las zonas: ${d.outside} píxeles distintos`);
  let lineOK = true; for (let x = D2.x - 3; x < D2.x + D2.w + 3; x++) if (U.px(e.png, x, 60).join() !== '160,160,160,255') lineOK = false;
  U.check(lineOK, 'la línea horizontal sigue recta y del mismo color a través del parche');

  console.log('\n3) Parche fusionado (Poisson) sobre la sombra');
  await page.click('button[title="Borde suave y mezcla Poisson"]');
  const D3 = { x: 386, y: 380, w: 12, h: 40 };
  await U.dragDoc(page, D3.x, D3.y, D3.x + D3.w, D3.y + D3.h);
  r = await T();
  // forzar un origen con otro tono (fondo plano de más arriba) para ver que Poisson iguala el tono
  await page.evaluate(() => {});
  for (let i = 0; i < 6; i++) await page.keyboard.press('Shift+ArrowUp');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  e = await U.exportPNG(page, 'e1_parche_fusion.png');
  d = U.diff(e.png, orig, [D1, D2, D3]);
  U.check(d.outside === 0, `fuera de las zonas: ${d.outside} píxeles distintos`);
  let jump = 0; for (let y = D3.y; y < D3.y + D3.h; y++) { const a = U.px(e.png, D3.x - 1, y), b = U.px(e.png, D3.x, y); jump = Math.max(jump, Math.abs(a[0] - b[0])); }
  U.check(jump <= 6, `sin salto de tono en el borde izquierdo (máx. ${jump} niveles)`);

  console.log('\n4) Tampón de clonar con pincel duro');
  await U.tool(page, 'clone');
  await U.clickDoc(page, 60, 260, ['Alt']); // origen: fondo plano bajo los campos
  await U.dragDoc(page, 14, 90, 44, 90, { c: 0.5, steps: 12 }); // pinta sobre «Item»
  e = await U.exportPNG(page, 'e1_clon.png');
  const prev = U.readPNG(U.OUT + '/e1_parche_fusion.png');
  d = U.diff(e.png, prev);
  const off = await page.evaluate(() => { const t = document.querySelector('#rtinfo'); return t && t.textContent; });
  let exact = true, changed = 0;
  const m = /desplazamiento (-?\d+), (-?\d+)/.exec(off); const dx = +m[1], dy = +m[2];
  for (let y = d.bbox.y0; y <= d.bbox.y1; y++) for (let x = d.bbox.x0; x <= d.bbox.x1; x++) {
    const a = U.px(e.png, x, y).join(), b = U.px(prev, x, y).join();
    if (a !== b) { changed++; if (a !== U.px(prev, x + dx, y + dy).join()) exact = false; }
  }
  U.check(changed > 0 && exact, `${changed} píxeles clonados, todos copia exacta del origen (sin antialias); desplazamiento ${dx},${dy}`);
  U.check(d.bbox.x1 - d.bbox.x0 <= 52 && d.bbox.y1 - d.bbox.y0 <= 22, `cambios limitados al trazo: ${JSON.stringify(d.bbox)}`);
  // mira visible
  const a = await U.scr(page, 30, 100, .5); await page.mouse.move(a.x, a.y);
  await page.screenshot({ path: U.OUT + '/e1_mira.png', clip: { x: 240, y: 120, width: 360, height: 280 } });
  const retouched = e.png;

  console.log('\n5) Deshacer y rehacer');
  const st = await page.evaluate(() => ({ n: window.MesaDeCalco.doc.retouch.length, undo: window.MesaDeCalco.test.undoBytes }));
  U.check(st.n === 4, `4 retoques en la lista (${st.n}); historial de deshacer: ${st.undo} bytes`);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(80); }
  await page.waitForTimeout(200);
  e = await U.exportPNG(page, 'e1_deshecho.png');
  d = U.diff(e.png, orig);
  U.check(d.inside + d.outside === 0, `tras deshacer todo, idéntica al original (${d.inside + d.outside} píxeles distintos)`);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Control+y'); await page.waitForTimeout(80); }
  await page.waitForTimeout(200);
  e = await U.exportPNG(page, 'e1_rehecho.png');
  d = U.diff(e.png, retouched);
  U.check(d.inside + d.outside === 0, 'rehacer devuelve exactamente la imagen retocada');

  console.log('\n6) Guardar el proyecto y volver a abrirlo');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bSave')]);
  const pf = U.OUT + '/e1_proyecto.json'; await dl.saveAs(pf);
  const pj = JSON.parse(require('fs').readFileSync(pf, 'utf8'));
  U.check(pj.doc.retouch.length === 4 && Object.keys(pj.assets).length === 5, `proyecto: ${pj.doc.retouch.length} retoques, ${Object.keys(pj.assets).length} imágenes, ${(require('fs').statSync(pf).size / 1024).toFixed(0)} KB`);
  U.check(pj.assets[pj.doc.bg] === 'data:image/png;base64,' + require('fs').readFileSync(U.CAP).toString('base64'), 'la captura original se guarda intacta (mismos bytes del archivo)');
  await page.evaluate(() => localStorage.clear()); await page.reload();
  await page.setInputFiles('#fProj', pf);
  await page.waitForFunction(() => window.MesaDeCalco.doc.retouch.length === 4);
  await page.waitForTimeout(400);
  e = await U.exportPNG(page, 'e1_reabierto.png');
  d = U.diff(e.png, retouched);
  U.check(d.inside + d.outside === 0, 'al reabrir el proyecto la imagen es idéntica a la retocada');

  U.check(L.errors.length === 0, 'sin errores de JavaScript ' + L.errors.join(' | '));
  await L.browser.close(); U.done();
})();
