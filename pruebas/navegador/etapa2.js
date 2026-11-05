// Etapa 2: borrar y rellenar, mover/estirar recortes (9-slice) y texto que parece original
const U = require('./util');
let page;
const T = () => page.evaluate(() => window.MesaDeCalco.test.rt);
(async () => {
  const L = await U.launch(); page = L.page;
  await U.openCapture(page);
  const orig = U.readPNG(U.CAP);
  const BGc = '240,240,240,255', LINE = '160,160,160,255', BOR = '122,122,122,255', WH = '255,255,255,255';
  const allowed = [];

  console.log('\n1) Borrar un texto que está sobre una línea horizontal');
  await U.tool(page, 'heal');
  const A = { x: 8, y: 36, w: 150, h: 30 }; allowed.push(A);
  await U.dragDoc(page, A.x, A.y, A.x + A.w, A.y + A.h);
  let r = await T(); U.check(r && r.k === 'heal' && r.via === 'filas', 'vista previa con «prolongar filas y columnas»');
  await page.keyboard.press('Enter');
  let e = await U.exportPNG(page, 'e2_borrar_linea.png');
  let d = U.diff(e.png, orig, allowed);
  U.check(d.outside === 0, `fuera de la zona: ${d.outside} píxeles distintos`);
  let ok = true, bad = 0;
  for (let y = A.y; y < A.y + A.h; y++) for (let x = A.x; x < A.x + A.w; x++) { const v = U.px(e.png, x, y).join(); if (v !== (y === 60 ? LINE : BGc)) { ok = false; bad++; } }
  U.check(ok, `la línea sigue recta y del mismo color, el texto desapareció y el fondo queda plano (${bad} píxeles fuera de lo esperado)`);

  console.log('\n2) Borrar la esquina de una caja con texto (bordes y esquina deben reconstruirse)');
  const B = { x: 100, y: 105, w: 160, h: 22 }; allowed.push(B);
  await U.dragDoc(page, B.x, B.y, B.x + B.w, B.y + B.h);
  await page.keyboard.press('Enter');
  e = await U.exportPNG(page, 'e2_borrar_esquina.png');
  d = U.diff(e.png, orig, allowed);
  U.check(d.outside === 0, `fuera de la zona: ${d.outside} píxeles distintos`);
  bad = 0;
  for (let y = B.y; y < B.y + B.h; y++) for (let x = B.x; x < B.x + B.w; x++) {
    const exp = (y === 110 && x >= 110) || (x === 110 && y >= 110) ? BOR : (x > 110 && y > 110 ? WH : BGc);
    if (U.px(e.png, x, y).join() !== exp) bad++;
  }
  U.check(bad === 0, `borde superior, borde izquierdo y esquina idénticos a la caja; interior blanco sin texto (${bad} píxeles fuera de lo esperado)`);

  console.log('\n3) Unión en T: la línea vertical nace en la horizontal');
  const C = { x: 440, y: 54, w: 20, h: 12 };
  await U.dragDoc(page, C.x, C.y, C.x + C.w, C.y + C.h);
  await page.keyboard.press('Enter');
  e = await U.exportPNG(page, 'e2_union_T.png');
  d = U.diff(e.png, orig, allowed);
  U.check(d.outside === 0, `la unión en T se reconstruye idéntica al original (${d.outside} píxeles distintos)`);

  console.log('\n4) Mover recorte: el hueco se rellena limpio');
  const before = e.png;
  await U.tool(page, 'cut');
  const K = { x: 296, y: 246, w: 108, h: 34 }; // el botón «Guardar» con margen
  await U.dragDoc(page, K.x, K.y, K.x + K.w, K.y + K.h);
  e = await U.exportPNG(page, 'e2_recorte_en_su_sitio.png');
  d = U.diff(e.png, before);
  U.check(d.inside + d.outside === 0, 'recién recortado y sin mover, la imagen es idéntica');
  const sl = await page.evaluate(() => { const o = window.MesaDeCalco.doc.objs.at(-1); return { id: o.id, slice: o.slice }; });
  U.check(sl.slice && sl.slice.l >= 4 && sl.slice.t >= 4, `bordes 9-slice detectados automáticamente ${JSON.stringify(sl.slice)}`);
  const s0 = await U.scr(page, 350, 263, .5), s1 = await U.scr(page, 350, 263 + 60, .5);
  await page.mouse.move(s0.x, s0.y); await page.mouse.down(); await page.mouse.move(s1.x, s1.y, { steps: 10 }); await page.mouse.up();
  await page.waitForTimeout(100);
  e = await U.exportPNG(page, 'e2_recorte_movido.png');
  const holeCols = U.colorsIn(e.png, { x: K.x - 1, y: K.y - 1, w: K.w + 2, h: 60 });
  U.check(holeCols.size === 1 && holeCols.has(BGc), `el hueco quedó del color del fondo, sin restos ni bordes (${[...holeCols].join(' | ')})`);
  let moved = 0; for (let y = 0; y < K.h; y++) for (let x = 0; x < K.w; x++) if (U.px(e.png, K.x + x, K.y + 60 + y).join() !== U.px(orig, K.x + x, K.y + y).join()) moved++;
  U.check(moved === 0, 'en el nuevo sitio el botón es idéntico píxel por píxel');

  console.log('\n5) Estirar el recorte con 9-slice');
  const inp = page.locator('#right .four input').nth(2); // Ancho
  await inp.fill('180'); await page.waitForTimeout(100);
  await page.keyboard.press('Escape');
  e = await U.exportPNG(page, 'e2_recorte_estirado.png');
  const btnOrig = { x: 300, y: 250, w: 100, h: 26 };
  const ox = K.x, oy = K.y + 60, nx = ox + (btnOrig.x - K.x), ny = oy + (btnOrig.y - K.y);
  let corners = 0;
  for (let y = 0; y < btnOrig.h; y++) for (let x = 0; x < 5; x++) {
    if (U.px(e.png, nx + x, ny + y).join() !== U.px(orig, btnOrig.x + x, btnOrig.y + y).join()) corners++; // borde izquierdo
    const rx = btnOrig.w - 1 - x; if (U.px(e.png, nx + 72 + rx, ny + y).join() !== U.px(orig, btnOrig.x + rx, btnOrig.y + y).join()) corners++; // borde derecho desplazado 72
  }
  U.check(corners === 0, 'esquinas y bordes laterales idénticos al original tras estirar 72 px');
  const pal = U.colorsIn(orig, btnOrig), newCols = [...U.colorsIn(e.png, { x: nx, y: ny, w: 180, h: 26 })].filter(c => !pal.has(c));
  U.check(newCols.length === 0, `sin colores nuevos ni suavizado al estirar (${newCols.length} colores ajenos)`);
  let topRow = true; for (let x = 0; x < 172; x++) if (U.px(e.png, nx + x, ny).join() !== U.px(orig, btnOrig.x + 50, btnOrig.y).join()) topRow = false;
  U.check(topRow, 'el borde superior sigue continuo y del mismo color');

  console.log('\n6) Cambiar texto con aspecto original (calibrar y escribir)');
  await page.click('#bFit'); await page.evaluate(() => window.MesaDeCalco.test.setZoom(1)); await page.waitForTimeout(80);
  await U.tool(page, 'patch');
  const P = { x: 112, y: 172, w: 80, h: 16 };
  await U.dragDoc(page, P.x, P.y, P.x + P.w, P.y + P.h);
  await page.waitForTimeout(150);
  await page.keyboard.type('BXC-2000'); await page.keyboard.press('Enter');
  await page.waitForTimeout(100);
  const t0 = Date.now();
  await page.click('text=Calibrar con el texto original');
  await page.waitForFunction(() => { const o = window.MesaDeCalco.doc.objs.at(-1); return o && o.match; }, null, { timeout: 30000 });
  const lab = await page.evaluate(() => { const o = window.MesaDeCalco.doc.objs.at(-1); return { font: o.font, fs: o.fs, aa: o.aa, bold: o.bold, tx: o.tx, ty: o.ty, match: o.match, fill: o.fill, color: o.color }; });
  U.check(Number.isInteger(lab.tx) && Number.isInteger(lab.ty), `calibrado en ${((Date.now() - t0) / 1000).toFixed(1)} s: ${lab.font} ${lab.fs}px ${lab.bold ? 'negrita ' : ''}suavizado ${lab.aa}, posición entera (${lab.tx}, ${lab.ty}), color ${lab.color}, fondo ${lab.fill}`);
  const msg = await page.locator('#right').innerText();
  U.check(lab.match.exact ? /Idéntico/.test(msg) : /No es idéntico/.test(msg), `informe honesto: «${(msg.match(/(Idéntico al[^\n]*|Parecido: [^\n]*)/) || [''])[0]}»`);
  e = await U.exportPNG(page, 'e2_texto_original_recreado.png');
  // ahora el texto nuevo
  const editBox = page.locator('#right textarea').first();
  await editBox.fill('BXC-3000'); await editBox.dispatchEvent('change'); await page.waitForTimeout(100);
  await page.keyboard.press('Escape'); await page.click('.tool[data-tool="select"]');
  e = await U.exportPNG(page, 'e2_texto_nuevo.png');
  const prevE = U.readPNG(U.OUT + '/e2_recorte_estirado.png');
  d = U.diff(e.png, prevE, { x: P.x, y: P.y, w: 120, h: P.h });
  U.check(d.outside === 0 && d.inside > 0, `solo cambia la zona del texto (${d.inside} píxeles dentro, ${d.outside} fuera)`);
  await page.screenshot({ path: U.OUT + '/e2_texto_zoom.png' });

  U.check(L.errors.length === 0, 'sin errores de JavaScript ' + L.errors.join(' | '));
  await L.browser.close(); U.done();
})();
