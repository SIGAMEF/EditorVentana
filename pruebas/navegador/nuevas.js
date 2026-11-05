// Funciones nuevas: detectar formulario, mejorar letras, copiar y pegar, borrar con el color del fondo,
// flecha curva, grilla guía, copiar con marco y marco/sombra en recortes
const U = require('./util');
const fs = require('fs');
let page;
const doc = () => page.evaluate(() => window.MesaDeCalco.doc);
const objs = () => page.evaluate(() => window.MesaDeCalco.doc.objs.map(o => ({ ...o })));
const T = () => page.evaluate(() => window.MesaDeCalco.test.rt);
(async () => {
  const L = await U.launch({ legacy: false }); page = L.page;
  await U.openCapture(page);
  const orig = U.readPNG(U.CAP);

  console.log('\n1) Detectar formulario (captura de prueba)');
  await page.click('.tool[data-tool="detect"]');
  await page.waitForFunction(() => window.MesaDeCalco.doc.objs.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(300);
  let os = await objs();
  const n = t => os.filter(o => o.type === t).length;
  U.check(n('textbox') === 5, `5 cajas de texto (${n('textbox')})`);
  U.check(n('button') === 1 && os.find(o => o.type === 'button').glyph, `el botón «Guardar» se detecta como botón y conserva su texto (${n('button')})`);
  const labs = os.filter(o => o.type === 'label' && o.glyph);
  U.check(labs.length >= 7, `textos detectados con su aspecto original: ${labs.length}`);
  U.check(n('line') + n('group') >= 2, `líneas y marcos: ${n('line') + n('group')}`);
  U.check(os.filter(o => o.type === 'textbox' && o.glyph).length === 5, 'cada caja conserva el texto que tenía');
  let e = await U.exportPNG(page, 'n1_detectado.png');
  let d = U.diff(e.png, orig);
  const formZone = { x: 0, y: 30, w: 450, h: 260 };
  let df = U.diff(e.png, orig, formZone);
  U.check(df.outside < 3000, `la foto, el título y la nota quedan iguales (${df.outside} píxeles distintos fuera del formulario)`);
  console.log(`       dentro del formulario cambian ${df.inside} píxeles (los controles se redibujan)`);
  // mover una etiqueta: el original ya no queda debajo
  const lab = labs.find(o => o.x < 100 && o.y > 80 && o.y < 100);
  U.check(!!lab, 'existe la etiqueta «Item»');
  await page.evaluate(id => { const o = window.MesaDeCalco.doc.objs.find(q => q.id === id); o.x += 300; o.y += 330; }, lab.id);
  await page.waitForTimeout(200);
  e = await U.exportPNG(page, 'n1_etiqueta_movida.png');
  let leftover = 0; for (let y = lab.y; y < lab.y + lab.h; y++) for (let x = lab.x; x < lab.x + lab.w; x++) { const p = U.px(e.png, x, y); if (p[0] + p[1] + p[2] < 600) leftover++; }
  U.check(leftover === 0, `al mover «Item», en su lugar queda solo el fondo (${leftover} píxeles oscuros)`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(250);
  for (let i = 0; i < 5 && (await doc()).objs.length; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(150); }
  e = await U.exportPNG(page, 'n1_deshecho.png'); d = U.diff(e.png, orig);
  U.check(d.inside + d.outside === 0 && (await doc()).retouch.length === 0, `deshacer devuelve la captura intacta (${d.inside + d.outside} píxeles distintos)`);

  console.log('\n2) Mejorar letras');
  await page.click('.tool[data-tool="detect"]');
  await page.waitForFunction(() => window.MesaDeCalco.doc.objs.length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(200);
  const before = (await U.exportPNG(page, 'n2_antes.png')).png;
  await U.tool(page, 'enhance');
  await page.waitForFunction(() => window.MesaDeCalco.test.rt && window.MesaDeCalco.test.rt.k === 'enh');
  await page.click('#right button:text-is("Negrita")');
  await page.waitForTimeout(300);
  await page.screenshot({ path: U.OUT + '/n2_vista_previa.png', clip: { x: 240, y: 40, width: 700, height: 340 } });
  await page.keyboard.press('Enter'); await page.waitForTimeout(300);
  const after = (await U.exportPNG(page, 'n2_mejorado.png')).png;
  const ink = (p, r) => { let s = 0; for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { const q = U.px(p, x, y); s += 765 - q[0] - q[1] - q[2]; } return s; };
  const ITEM = { x: 110, y: 82, w: 120, h: 16 };
  U.check(ink(after, ITEM) > ink(before, ITEM) * 1.2, `el texto de la caja «Item» tiene más tinta (${ink(before, ITEM)} → ${ink(after, ITEM)})`);
  const enh = (await doc()).enh;
  U.check(enh && enh.k > 1 && enh.bold === 1, 'la mejora queda guardada en el proyecto ' + JSON.stringify(enh));
  const PH = { x: 510, y: 300, w: 330, h: 220 };
  U.check(U.diff(after, before, [ITEM, { x: 0, y: 0, w: 900, h: 290 }, { x: 34, y: 322, w: 352, h: 172 }]).outside === 0, 'la foto no cambia');
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);
  U.check(!(await doc()).enh, 'deshacer quita la mejora');

  console.log('\n3) Copiar y pegar (parche)');
  await page.evaluate(() => { const m = window.MesaDeCalco; while (m.doc.objs.length) document.querySelector('#bUndo').click(); });
  await page.waitForTimeout(300);
  await U.tool(page, 'rpatch');
  const SRC = { x: 300, y: 250, w: 100, h: 26 }; // botón «Guardar»
  await U.dragDoc(page, SRC.x, SRC.y, SRC.x + SRC.w, SRC.y + SRC.h);
  U.check((await T()).k === 'paste', 'tras elegir la zona, espera el clic para pegar');
  const tgt = await U.scr(page, 200, 420);
  await page.mouse.move(tgt.x, tgt.y, { steps: 4 }); await page.waitForTimeout(100);
  await page.mouse.click(tgt.x, tgt.y); await page.waitForTimeout(200);
  os = await objs();
  const img = os.find(o => o.type === 'image');
  U.check(img && img.x === 150 && img.y === 407 && img.w === 100 && img.h === 26, `queda un recorte de 100×26 en el lugar del clic ${img && JSON.stringify({ x: img.x, y: img.y })}`);
  U.check((await page.evaluate(() => window.MesaDeCalco.test.tool)) === 'select', 'vuelve a «Seleccionar» con la copia elegida');
  e = await U.exportPNG(page, 'n3_pegado.png');
  let same = 0; for (let y = 0; y < 26; y++) for (let x = 0; x < 100; x++) if (U.px(e.png, 150 + x, 407 + y).join() === U.px(orig, SRC.x + x, SRC.y + y).join()) same++;
  U.check(same === 2600, `la copia es idéntica al original (${same}/2600)`);
  U.check(U.diff(e.png, orig, { x: 150, y: 407, w: 100, h: 26 }).outside === 0, 'el original sigue en su sitio');
  // estirar con Shift mantiene la proporción
  const se = await U.scr(page, 250, 433);
  await page.keyboard.down('Shift'); await page.mouse.move(se.x, se.y); await page.mouse.down(); const se2 = await U.scr(page, 350, 440); await page.mouse.move(se2.x, se2.y, { steps: 5 }); await page.mouse.up(); await page.keyboard.up('Shift');
  const im2 = (await objs()).find(o => o.type === 'image');
  U.check(im2.w === 200 && im2.h === 52, `Shift en la esquina mantiene la proporción (${im2.w}×${im2.h})`);

  console.log('\n4) Marco y sombra en el recorte');
  await page.evaluate(() => { const i = document.querySelector('#right input[aria-label="Grosor del marco"]'); i.focus(); i.value = 3; i.dispatchEvent(new Event('input')); });
  await page.selectOption('#right select[aria-label="bstyle"]', 'guiones');
  await page.evaluate(() => { const i = document.querySelector('#right input[aria-label="Radio de las esquinas"]'); i.focus(); i.value = 8; i.dispatchEvent(new Event('input')); });
  await page.evaluate(() => { const l = [...document.querySelectorAll('#right label.chk')].find(l => /^Sombra/.test(l.textContent)); l.querySelector('input').click(); });
  await page.waitForTimeout(200);
  const im3 = (await objs()).find(o => o.type === 'image');
  U.check(im3.bw === 3 && im3.bstyle === 'guiones' && im3.radius === 8 && im3.shadow === true, `propiedades del marco ${JSON.stringify({ bw: im3.bw, bstyle: im3.bstyle, radius: im3.radius, shadow: im3.shadow })}`);
  e = await U.exportPNG(page, 'n4_marco.png');
  const shadowPx = U.px(e.png, 150 + 100, 407 + 52 + 6), bgPx = U.px(orig, 250, 465);
  U.check(shadowPx[0] < bgPx[0] - 8, `hay sombra bajo el recorte (${shadowPx.slice(0, 3)} vs fondo ${bgPx.slice(0, 3)})`);
  const corner = U.px(e.png, 150, 407);
  U.check(corner.join() !== U.px(e.png, 152, 412).join(), 'la esquina redondeada recorta la imagen');
  await page.screenshot({ path: U.OUT + '/n4_marco_pantalla.png', clip: { x: 340, y: 400, width: 360, height: 160 } });

  console.log('\n5) Borrar y rellenar con el color del fondo (borra también lo que cruza)');
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  for (let i = 0; i < 12 && (await doc()).objs.length; i++) { await page.keyboard.press('Control+z'); await page.waitForTimeout(80); }
  await U.tool(page, 'heal');
  const Z = { x: 100, y: 105, w: 160, h: 22 }; // esquina de la caja «Descripción» con su texto
  await U.dragDoc(page, Z.x, Z.y, Z.x + Z.w, Z.y + Z.h);
  U.check((await T()).via === 'fondo', 'método por defecto: color del fondo');
  await page.keyboard.press('Enter'); await page.waitForTimeout(150);
  e = await U.exportPNG(page, 'n5_borrar_fondo.png');
  const cs = U.colorsIn(e.png, Z);
  U.check(cs.size === 1 && cs.has('240,240,240,255'), `la zona queda entera del color del fondo, sin el borde de la caja (${[...cs].slice(0, 4).join(' | ')})`);
  U.check(U.diff(e.png, orig, Z).outside === 0, 'fuera de la zona no cambia nada');
  await page.keyboard.press('Control+z');

  console.log('\n6) Flecha curva');
  await U.tool(page, 'arrow'); await U.dragDoc(page, 480, 100, 680, 100);
  let ar = (await objs()).find(o => o.type === 'arrow');
  await page.click('.tool[data-tool="select"]'); await U.clickDoc(page, 560, 100);
  const mid = await U.scr(page, 580, 100);
  await page.mouse.move(mid.x, mid.y); await page.mouse.down(); const m2 = await U.scr(page, 580, 40); await page.mouse.move(m2.x, m2.y, { steps: 6 }); await page.mouse.up();
  ar = (await objs()).find(o => o.type === 'arrow');
  U.check(ar.pts && ar.pts.length === 1 && ar.pts[0][1] === 40 && ar.x === 480 && ar.x2 === 680 && ar.y2 === 100, `al arrastrar el punto del medio se curva; origen y punta no se mueven ${JSON.stringify({ pts: ar.pts, x: ar.x, x2: ar.x2 })}`);
  e = await U.exportPNG(page, 'n6_flecha_curva.png');
  const red = (x, y) => { const p = U.px(e.png, x, y); return p[0] > 180 && p[1] < 90; };
  let topRed = false; for (let y = 36; y < 46; y++) if (red(580, y)) topRed = true;
  let midRed = false; for (let y = 96; y < 104; y++) if (red(580, y)) midRed = true;
  U.check(topRed && !midRed, 'el trazo pasa por el punto nuevo y ya no por la recta');
  let tip = 0; for (let y = 92; y < 108; y++) for (let x = 664; x < 681; x++) if (red(x, y)) tip++;
  U.check(tip > 25, `la punta sigue en el destino (${tip} píxeles rojos)`);
  // mover la flecha mueve también su curva
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  ar = (await objs()).find(o => o.type === 'arrow');
  U.check(ar.pts[0][1] === 42 && ar.y === 102, 'las flechas del teclado mueven toda la flecha con su curva');
  await page.screenshot({ path: U.OUT + '/n6_flecha_pantalla.png', clip: { x: 700, y: 40, width: 480, height: 200 } });
  // doble clic en el punto lo quita
  const q = await U.scr(page, 580, 42, 0);
  await page.mouse.dblclick(q.x, q.y); await page.waitForTimeout(150);
  ar = (await objs()).find(o => o.type === 'arrow');
  U.check(!ar.pts.length, 'doble clic en el punto lo quita (vuelve a ser recta)');

  console.log('\n7) Grilla guía');
  const plain = (await U.exportPNG(page, 'n7_sin_grilla.png')).png;
  await page.click('#bGrid');
  U.check(await page.locator('#gridOpts').isVisible(), 'aparecen las opciones de la grilla');
  await page.selectOption('#gSize', '20');
  await page.evaluate(() => { const i = document.querySelector('#gAlpha'); i.value = 0.8; i.dispatchEvent(new Event('input')); });
  await page.waitForTimeout(150);
  const shot = await page.screenshot({ clip: await page.locator('#cv').boundingBox() }); fs.writeFileSync(U.OUT + '/n7_grilla.png', shot);
  const sp = U.fromDataURL('data:image/png;base64,' + shot.toString('base64'));
  let gl = 0; for (let y = 0; y < 200; y++) { const p = U.px(sp, 20 * 5, y); if (p[2] > p[0] + 30) gl++; }
  U.check(gl > 150, `se ven las líneas de la grilla en pantalla (${gl} de 200 píxeles en la línea x=100)`);
  const g2 = (await U.exportPNG(page, 'n7_con_grilla.png')).png;
  d = U.diff(g2, plain); U.check(d.inside + d.outside === 0, 'la grilla no sale en la imagen exportada');
  await U.clickDoc(page, 100, 300);
  U.check((await page.evaluate(() => window.MesaDeCalco.test.gridOpt.size)) === 20, 'el tamaño elegido se recuerda');
  await page.click('#bGrid');

  console.log('\n8) Copiar imagen con marco');
  await page.click('#bCopy');
  U.check(await page.locator('#dlgCopy').isVisible(), 'se abre el diálogo de copiar');
  await page.click('#dlgCopy button:has-text("Esquinas curvas")');
  await page.selectOption('#dlgCopy select[aria-label="Tipo de línea"]', 'puntos');
  await page.evaluate(() => { const i = document.querySelector('#dlgCopy input[aria-label="Grosor"]'); i.value = 4; i.dispatchEvent(new Event('input')); });
  await page.click('#dlgCopy label.chk');
  await page.waitForTimeout(150);
  await page.screenshot({ path: U.OUT + '/n8_dialogo.png' });
  const fo = await page.evaluate(() => window.MesaDeCalco.test.frameOpt);
  U.check(fo.type === 'redondo' && fo.style === 'puntos' && fo.bw === 4 && fo.shadow, 'opciones elegidas ' + JSON.stringify(fo));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#dlgCopy button:has-text("Descargar PNG")')]);
  const ff = U.OUT + '/n8_con_marco.png'; await dl.saveAs(ff); const fp = U.readPNG(ff);
  U.check(fp.width === 900 + 2 * 4 + 40 && fp.height === 560 + 2 * 4 + 40, `la imagen crece con el marco y la sombra (${fp.width}×${fp.height})`);
  U.check(U.px(fp, 2, 2)[3] === 0 && U.px(fp, 20 + 4 + 300, 20 + 4 + 300).join() === U.px(orig, 300, 300).join(), 'esquina exterior transparente y contenido intacto');
  await page.click('#dlgCopy button:has-text("Cerrar")');
  U.check(!(await page.locator('#dlgCopy').isVisible()), 'el diálogo se cierra');
  e = await U.exportPNG(page, 'n8_export_normal.png');
  U.check(e.png.width === 900, '«Exportar imagen» sigue sin marco');

  console.log('\n9) Captura real (si está): tiempos y fidelidad');
  const REAL = U.ROOT + '/para_prueba.png';
  if (fs.existsSync(REAL)) {
    await page.evaluate(() => localStorage.clear()); await page.reload();
    await U.openCapture(page, REAL);
    const t0 = Date.now();
    await page.click('.tool[data-tool="detect"]');
    await page.waitForFunction(() => window.MesaDeCalco.doc.objs.length > 0, null, { timeout: 60000 });
    const ms = Date.now() - t0; await page.waitForTimeout(400);
    os = await objs();
    U.check(ms < 12000, `detección en ${ms} ms: ${await page.locator('#hint').innerText()}`.slice(0, 200));
    U.check(os.filter(o => o.type === 'label').length >= 50 && os.filter(o => ['textbox', 'combo'].includes(o.type)).length >= 30, 'reconoce textos y cajas de la ventana');
    e = await U.exportPNG(page, 'n9_real.png');
    const ro = U.readPNG(REAL); let big = 0;
    for (let y = 0; y < ro.height; y++) for (let x = 0; x < ro.width; x++) { const a = U.px(e.png, x, y), b = U.px(ro, x, y); if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) > 120) big++; }
    U.check(big < ro.width * ro.height * .02, `con la captura visible se ve como el original (${(100 * big / (ro.width * ro.height)).toFixed(2)} % de píxeles muy distintos)`);
  }

  U.check(L.errors.length === 0, 'sin errores de JavaScript ' + L.errors.join(' | '));
  await L.browser.close(); U.done();
})();
