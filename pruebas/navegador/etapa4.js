// Etapa 4: el HTML abierto desde file:// con el motor (detección, inpaint, modelo, rembg) y sin motor ni internet
const U = require('./util');
const { execSync, spawn } = require('child_process');
let page;
const T = () => page.evaluate(() => window.MesaDeCalco.test);
const ROOT = U.ROOT;
function motorPid() { try { const l = execSync('netstat -ano').toString().split('\n').find(l => /127\.0\.0\.1:8765\s.*LISTENING/.test(l)); return l ? l.trim().split(/\s+/).pop() : null; } catch (e) { return null; } }
(async () => {
  const L = await U.launch(); page = L.page;
  const reqs = []; page.on('request', r => reqs.push(r.url()));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.waitForFunction(() => window.MesaDeCalco.test.motor.on, null, { timeout: 8000 }).catch(() => {});
  console.log('\n1) Detección del motor desde file://');
  U.check(page.url().startsWith('file:///'), 'página abierta como archivo local: ' + page.url());
  const st = await page.locator('#motor').innerText();
  U.check(/activo/.test(st), `la barra de estado dice «${st}»`);
  await U.openCapture(page);
  const orig = U.readPNG(U.CAP);

  console.log('\n2) Borrar y rellenar con cv2.inpaint (motor)');
  await U.tool(page, 'heal');
  const opt = await page.evaluate(() => [...document.querySelectorAll('#right select option')].map(o => o.value + (o.disabled ? ':off' : ':on')).join(' '));
  U.check(/telea:on/.test(opt) && /ns:on/.test(opt), 'opciones del motor habilitadas: ' + opt);
  await page.selectOption('#right select', 'telea');
  const Z = { x: 700, y: 372, w: 30, h: 24 }; // borde de la pelota con el cielo: zona compleja
  await U.dragDoc(page, Z.x, Z.y, Z.x + Z.w, Z.y + Z.h);
  await page.waitForFunction(() => { const r = window.MesaDeCalco.test.rt; return r && !r.busy && r.via; }, null, { timeout: 30000 });
  let r = (await T()).rt; U.check(r.via === 'telea', 'vista previa calculada por el motor: ' + r.via);
  await page.keyboard.press('Enter');
  let e = await U.exportPNG(page, 'e4_inpaint.png');
  let d = U.diff(e.png, orig, Z);
  U.check(d.outside === 0 && d.inside > 0, `solo cambia la zona (${d.inside} dentro, ${d.outside} fuera)`);
  await page.keyboard.press('Control+z'); await page.waitForTimeout(300);

  console.log('\n3) Quitar fondo automático: aviso y descarga única del modelo, luego rembg');
  await U.tool(page, 'erase');
  await page.waitForFunction(() => window.MesaDeCalco.test.mk && window.MesaDeCalco.test.mk.ready);
  let motorInfo = (await T()).motor.info;
  if (motorInfo.rembg === 'sin_modelo') {
    const b = page.locator('#right button:has-text("Descargar modelo")');
    U.check(await b.count() === 1, 'botón «' + (await b.innerText()) + '» visible antes de cualquier descarga');
    const t0 = Date.now();
    await b.click();
    await page.waitForFunction(() => window.MesaDeCalco.test.motor.info && window.MesaDeCalco.test.motor.info.rembg === 'listo', null, { timeout: 1500000, polling: 2000 });
    U.check(dialogs.length === 1 && /UNA VEZ/.test(dialogs[0]) && /única conexión externa/.test(dialogs[0]), `se avisó antes de descargar (${((Date.now() - t0) / 1000).toFixed(0)} s): «${dialogs[0].split('\n')[0]}…»`);
  } else console.log('  (el modelo ya estaba descargado)');
  await page.waitForTimeout(300);
  // recortar la foto y aplicarle rembg
  await page.keyboard.press('Escape');
  await U.tool(page, 'cut');
  const PH = { x: 510, y: 300, w: 330, h: 220 };
  await U.dragDoc(page, PH.x, PH.y, PH.x + PH.w, PH.y + PH.h);
  await page.click('#right button:has-text("Quitar fondo…")');
  await page.waitForFunction(() => window.MesaDeCalco.test.mk && window.MesaDeCalco.test.mk.ready && window.MesaDeCalco.test.mk.target !== 'bg');
  const auto = page.locator('#right button:has-text("Quitar fondo automático")');
  U.check(await auto.count() === 1, 'botón «Quitar fondo automático» disponible con el motor activo');
  const t1 = Date.now();
  await auto.click();
  await page.waitForFunction(() => window.MesaDeCalco.test.mk && !window.MesaDeCalco.test.mk.busy && /quedarán/.test(document.querySelector('#rtinfo').textContent), null, { timeout: 300000 });
  await page.waitForTimeout(200);
  const msg = await page.locator('#rtinfo').innerText();
  U.check(/quedarán transparentes/.test(msg), `rembg terminó en ${((Date.now() - t1) / 1000).toFixed(1)} s: ${msg}`);
  // ajuste manual posterior con la varita (Shift suma)
  await page.click('#right button:has-text("Varita")');
  await U.clickDoc(page, 515, 305, ['Shift']);
  await page.screenshot({ path: U.OUT + '/e4_rembg_preview.png', clip: { x: 700, y: 300, width: 420, height: 300 } });
  await page.keyboard.press('Enter'); await page.waitForTimeout(200);
  await page.click('.tool[data-tool="select"]');
  await U.clickDoc(page, 640, 410);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#right button:has-text("Exportar este recorte")')]);
  const rf = U.OUT + '/e4_recorte_rembg.png'; await dl.saveAs(rf);
  const rp = U.readPNG(rf);
  let skyClear = 0, ballSolid = 0;
  for (let y = 0; y < 220; y += 4) for (let x = 0; x < 330; x += 4) { const a = U.px(rp, x, y)[3]; const inBall = Math.hypot(x - 150, y - 110) < 62, inSky = Math.hypot(x - 150, y - 110) > 78; if (inSky && a === 0) skyClear++; if (inBall && a === 255) ballSolid++; }
  const skyN = (() => { let n = 0; for (let y = 0; y < 220; y += 4) for (let x = 0; x < 330; x += 4) if (Math.hypot(x - 150, y - 110) > 78) n++; return n; })();
  const ballN = (() => { let n = 0; for (let y = 0; y < 220; y += 4) for (let x = 0; x < 330; x += 4) if (Math.hypot(x - 150, y - 110) < 62) n++; return n; })();
  U.check(skyClear / skyN > 0.97 && ballSolid / ballN > 0.97, `rembg + ajuste: cielo transparente ${(100 * skyClear / skyN).toFixed(1)} %, pelota opaca ${(100 * ballSolid / ballN).toFixed(1)} %`);

  console.log('\n4) Conexiones hechas por la página');
  const ext = reqs.filter(u => !u.startsWith('file:') && !u.startsWith('data:') && !u.startsWith('blob:') && !u.startsWith('http://127.0.0.1:8765/'));
  U.check(ext.length === 0, `la página solo habló con el motor local (${reqs.filter(u => u.startsWith('http://127.0.0.1')).length} peticiones) y nada más ${ext.join(' ')}`);
  const log = process.env.MOTOR_LOG ? require('fs').readFileSync(process.env.MOTOR_LOG, 'utf8') : '';
  U.check(!/Traceback/.test(log), 'el motor no registró errores internos');

  console.log('\n5) Se apaga el motor: el editor lo detecta y desactiva sus funciones');
  const pid = motorPid(); if (pid) execSync(`taskkill /F /PID ${pid}`);
  await U.tool(page, 'heal');
  await page.waitForFunction(() => !window.MesaDeCalco.test.motor.on, null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const st2 = await page.locator('#motor').innerText();
  const opt2 = await page.evaluate(() => [...document.querySelectorAll('#right select option')].map(o => o.value + (o.disabled ? ':off' : ':on')).join(' '));
  const note = await page.locator('#right').innerText();
  U.check(/apagado/.test(st2) && /telea:off/.test(opt2), `estado «${st2}», opciones del motor desactivadas (${opt2})`);
  U.check(/iniciar_motor\.bat/.test(note), 'explica en una línea cómo iniciarlo: «' + (note.split('\n').find(l => /iniciar_motor/.test(l)) || '') + '»');
  await U.tool(page, 'erase');
  U.check(await page.locator('#right button:has-text("Quitar fondo automático")').count() === 0, '«Quitar fondo automático» se oculta sin motor');
  U.check(L.errors.length === 0, 'sin errores de JavaScript ' + L.errors.join(' | '));
  await L.browser.close();

  console.log('\n6) Sin motor y sin internet: todo lo demás funciona');
  const L2 = await U.launch(); const p2 = L2.page;
  const blocked = [];
  await L2.context.route('**/*', route => { const u = route.request().url(); if (u.startsWith('file:') || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); blocked.push(u); return route.abort('internetdisconnected'); });
  await p2.reload();
  await U.openCapture(p2);
  page = p2;
  await U.tool(p2, 'rpatch');
  await U.dragDoc(p2, 12, 144, 52, 160); await p2.keyboard.press('Enter');
  await U.tool(p2, 'heal');
  await U.dragDoc(p2, 8, 36, 158, 66); await p2.keyboard.press('Enter');
  e = await U.exportPNG(p2, 'e4_offline.png');
  d = U.diff(e.png, orig, [{ x: 12, y: 144, w: 40, h: 16 }, { x: 8, y: 36, w: 150, h: 30 }]);
  U.check(d.outside === 0 && d.inside > 0, `parche y relleno funcionan sin conexión (${d.inside} píxeles retocados, ${d.outside} fuera)`);
  U.check(blocked.every(u => u.startsWith('http://127.0.0.1:8765/')), `las únicas peticiones de red fueron al motor local (apagado): ${blocked.length}`);
  U.check(/apagado/.test(await p2.locator('#motor').innerText()), 'indica «Motor local: apagado»');
  U.check(L2.errors.length === 0, 'sin errores de JavaScript ' + L2.errors.join(' | '));
  await L2.browser.close(); U.done();
})();
