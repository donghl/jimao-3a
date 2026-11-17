// 真机测帧：连着 USB 的手机（已 adb install 的 debug 包）跑一遍，打印真实 fps / 帧时间 / 内部分辨率，
// 再切到 ultra 做对照，最后恢复。原理：debug 包的 WebView 开着 DevTools，用 adb forward + CDP 直连。
// 用法：npm run perf:device      （或 PERF_ADB=/path/to/adb npm run perf:device）
//      PERF_SECS=10 npm run perf:device
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const ADB = process.env.PERF_ADB || 'adb';
const APP = process.env.PERF_APP || 'com.jimao.saltline';
const PORT = +(process.env.PERF_PORT || 9223);
const SECS = +(process.env.PERF_SECS || 6);
const adb = (...a) => execFileSync(ADB, a, { encoding: 'utf8', timeout: 60000 }).trim();

let pid = adb('shell', 'pidof', APP).split(/\s+/)[0];
if (!pid) {
  console.log(`没有运行中的 ${APP}，正在启动…`);
  adb('shell', 'monkey', '-p', APP, '-c', 'android.intent.category.LAUNCHER', '1');
  await new Promise(r => setTimeout(r, 12000));
  pid = adb('shell', 'pidof', APP).split(/\s+/)[0];
}
if (!pid) { console.error('起不来：先手动打开 App（debug 包才有 DevTools）'); process.exit(1); }
console.log(`pid=${pid}  设备=${adb('shell', 'getprop', 'ro.product.model')}  Android ${adb('shell', 'getprop', 'ro.build.version.release')}`);
adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);

const b = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
const page = b.contexts()[0].pages().find(p => /localhost|index\.html/.test(p.url()));
if (!page) { console.error('没找到游戏页面：', b.contexts()[0].pages().map(p => p.url())); await b.close(); process.exit(1); }
await page.bringToFront();

const env = await page.evaluate(() => ({
  dpr: devicePixelRatio, w: innerWidth, h: innerHeight, cores: navigator.hardwareConcurrency,
  vis: document.visibilityState, chrome: navigator.userAgent.match(/Chrome\/[\d.]+/)?.[0],
  gpu: (() => { const c = document.createElement('canvas').getContext('webgl2'), e = c && c.getExtension('WEBGL_debug_renderer_info'); return e ? c.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'n/a'; })(),
  tier: window.__G?.quality?.name, res: window.__stats?.().res
}));
console.log('环境', JSON.stringify(env));
if (env.vis !== 'visible') { console.error('页面不可见（锁屏或后台），帧率会被系统掐掉——解锁并让 App 在前台再跑'); await b.close(); process.exit(1); }

if (await page.evaluate(() => window.__G.game.state) !== 'playing') {
  // CDP 连的是设备 WebView，context 没开 hasTouch → 用原生触摸事件，最接近真手指
  const [x, y] = await page.evaluate(() => {
    const b = document.querySelector('.m-screen[data-s="title"] .btn.primary').getBoundingClientRect();
    return [Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)];
  });
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  const started = await page.waitForFunction(() => window.__G.game.state === 'playing', null, { timeout: 25000 })
    .then(() => true).catch(() => false);
  if (!started) {   // 兜底：直接点按钮（游戏菜单是 click 委托，untrusted 也收）
    await page.evaluate(() => document.querySelector('.m-screen[data-s="title"] .btn.primary').click());
  }
  await page.waitForFunction(() => window.__G.game.state === 'playing', null, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 3000));   // 让着色器编译/首帧峰值过去
}

async function measure(label) {
  const r = await page.evaluate(async secs => {
    const t0 = performance.now(), f0 = window.__G.time.frame;
    const gaps = []; let last = t0;
    await new Promise(res => {
      const step = () => { const now = performance.now(); gaps.push(now - last); last = now; now - t0 < secs * 1000 ? requestAnimationFrame(step) : res(); };
      requestAnimationFrame(step);
    });
    const gaps2 = gaps.slice(2).sort((a, b) => a - b), s = window.__stats();
    return {
      fps: +((window.__G.time.frame - f0) / ((performance.now() - t0) / 1000)).toFixed(1),
      med: +gaps2[gaps2.length >> 1].toFixed(1), p95: +gaps2[Math.floor(gaps2.length * .95)].toFixed(1),
      max: +gaps2[gaps2.length - 1].toFixed(1), res: s.res, scale: +s.scale.toFixed(2), calls: s.calls, tris: +(s.tris / 1e6).toFixed(2)
    };
  }, SECS);
  console.log(`${label.padEnd(20)} fps=${String(r.fps).padStart(5)}  中位=${String(r.med).padStart(5)}ms  p95=${String(r.p95).padStart(5)}ms  最差=${String(r.max).padStart(6)}ms  内部=${r.res.join('×')}  scale=${r.scale}  draw=${r.calls}  tris=${r.tris}M`);
  return r;
}

const keep = await page.evaluate(() => ({ ...window.__G.quality }));
await measure(`${keep.name}（当前档）`);
for (const [name, over] of [['ultra', { scale: 1, msaa: 4, shadow: 2048, tex: 2, volSteps: 8, ao: 1, planar: 1, bloom: 1, motionBlur: 1, rain: 1 }], ['low', { scale: 0.7, msaa: 0, shadow: 1024, tex: 1, volSteps: 4, ao: 0, planar: 0, bloom: 1, motionBlur: 0 }]]) {
  await page.evaluate(o => { window.__G.render.setQuality({ ...window.__G.quality, ...o }); }, over);
  await new Promise(r => setTimeout(r, 4000));
  await measure(`${name}（对照）`);
}
await page.evaluate(k => window.__G.render.setQuality(k), keep);
console.log(`已恢复 ${keep.name} 档`);
await b.close();
