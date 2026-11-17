// 手机路径自检：headless Chromium + iPhone 模拟，跑真实触屏输入，证明"手机上的代码路径"通。
// 用法：npm run verify            自检 www 构建产物 + 源文件本身
//       VERIFY_URL=http://host/ npm run verify   改测线上部署
// 只证明路径，不证明性能：headless 用的是 SwiftShader（约 4 FPS），帧率/发热/手感要上真机（?bench=1）。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve, extname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../几猫国产3A大作_V1.html');
const WWW = join(here, 'www');
const CHROMIUM = process.env.VERIFY_CHROMIUM
  || '/Users/lani/Library/Caches/ms-playwright/chromium-1155/chrome-mac/Chromium.app/Contents/MacOS/Chromium';
const LAND = { width: 844, height: 390 };   // iPhone 横屏
const SAVE = { v: 1, at: Date.now(), seed: 4207, time: 91, cut: 2, pos: [-12.5, 0, 7.25], yaw: 1.25, pitch: -0.1, health: 63, ammo: 11, reserve: 77 };

let fails = 0;
const ok = (l, c, e = '') => { if (!c) fails++; console.log((c ? 'PASS  ' : 'FAIL  ') + l + (e ? '  ' + e : '')); };

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json' };
async function serve(dir) {
  const s = createServer(async (q, res) => {
    const rel = decodeURIComponent(q.url.split('?')[0]).replace(/^\/+|\/$/g, '') || 'index.html';
    try {
      res.writeHead(200, { 'content-type': MIME[extname(rel)] || 'application/octet-stream', 'cache-control': 'no-store' });
      res.end(await readFile(join(dir, rel)));
    } catch { res.writeHead(404).end('nf'); }
  });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${s.address().port}/index.html`, close: () => s.close() };
}

let chromium, devices;
try { ({ chromium, devices } = await import('playwright')); }
catch { console.error('需要 playwright（本机装在 /Users/lani/node_modules）：cd /Users/lani && npm i -D playwright'); process.exit(2); }

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctxNew = async (opts = {}) => {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], viewport: LAND, ...opts });
  await ctx.addInitScript(() => { window.__vibes = []; navigator.vibrate = p => { window.__vibes.push(p); return true; }; });
  return ctx;
};
const boot = async (url) => {
  const errs = [], bad = [], reqs = [];
  const ctx = await ctxNew();
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  p.on('requestfailed', r => bad.push(r.url().slice(-40)));
  p.on('response', r => { if (r.status() >= 400 && !/favicon/.test(r.url())) bad.push(r.status() + ' ' + r.url().slice(-40)); });
  p.on('request', r => reqs.push(r.url()));
  await p.goto(url);
  await p.waitForFunction(() => window.__ready && window.__G?.game && window.__G.hud, null, { timeout: 120000 });
  return { ctx, p, errs, bad, reqs, cdp: await ctx.newCDPSession(p) };
};

const http = process.env.VERIFY_URL ? { url: process.env.VERIFY_URL, close: () => {} } : await serve(WWW);

/* ---------- 1) 源文件：双击即玩的那份，仍然零外部请求，且手机 UA 下自动降档 ---------- */
{
  const { ctx, p, errs, reqs } = await boot(pathToFileURL(SRC).href + '?noaudio=1');
  ok('源文件加载不请求任何外部资源', reqs.filter(u => !u.startsWith('file://')).length === 0, reqs.slice(0, 3).join(' | '));
  const q = await p.evaluate(() => { const s = window.__stats(); return { name: window.__G.quality.name, vol: window.__G.quality.volSteps, res: s.res, canvas: document.getElementById('view').width, px: s.res[0] * s.res[1] }; });
  ok('手机 UA 自动选 极轻(mobile) 档', q.name === 'mobile' && q.vol === 0, JSON.stringify(q));
  // 高级管线开启时，canvas 只是满 DPR 的 blit 目标；真正干活的是合成链的 res（__stats().res）
  ok('内部分辨率按档位缩小（远低于满 DPR 画布）', q.res[0] <= LAND.width * 1.5 && q.px <= 8e5, JSON.stringify(q));
  ok('无未捕获异常', errs.length === 0, errs[0] || '');
  await ctx.close();
}

/* ---------- 2) 构建产物：竖屏兜底 / 震动 / 断点存档 ---------- */
{
  const { ctx, p, errs, bad, cdp } = await boot(http.url + '?autostart=1&noaudio=1');
  ok('pointer:coarse 命中（触屏层前提）', await p.evaluate(() => matchMedia('(pointer: coarse)').matches));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 400, y: 200, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise(r => setTimeout(r, 600));
  ok('触屏 -> input.mode = touch', (await p.evaluate(() => window.__G.input.mode)) === 'touch');
  ok('autostart 后处于 playing', (await p.evaluate(() => window.__G.game.state)) === 'playing');

  const fire = await p.evaluate(() => { const r = document.querySelector('.t-fire').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: fire[0], y: fire[1], id: 2 }] });
  await new Promise(r => setTimeout(r, 2000));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  ok('开火触发 navigator.vibrate（Android 通道）', (await p.evaluate(() => window.__vibes)).length > 0, JSON.stringify(await p.evaluate(() => window.__vibes)));
  ok('开火消耗弹药', (await p.evaluate(() => window.__G.weapon.ammo)) < 30);

  await p.setViewportSize({ width: 390, height: 844 });
  await new Promise(r => setTimeout(r, 900));
  const po = await p.evaluate(() => ({ cls: document.documentElement.classList.contains('is-portrait'), disp: getComputedStyle(document.querySelector('#rot')).display, state: window.__G.game.state }));
  ok('竖屏 -> 提示层可见 + 运行中自动暂停', po.cls && po.disp === 'flex' && po.state === 'paused', JSON.stringify(po));
  await p.screenshot({ path: '/tmp/verify_portrait.png' });
  await p.setViewportSize(LAND);
  await new Promise(r => setTimeout(r, 600));
  ok('回横屏停在暂停界面（不自动开跑）', (await p.evaluate(() => window.__G.game.state)) === 'paused');
  await p.evaluate(() => window.__G.game.resume());
  await p.waitForFunction(() => window.__G.game.state === 'playing', null, { timeout: 30000 });

  const snap = await p.evaluate(() => {
    const G = window.__G;
    G.game.debugCut(); G.game.debugCut();
    G.player.pos.set(-12.5, 0, 7.25); G.player.yaw = 1.25; G.player.pitch = -0.1; G.player.health = 63;
    G.weapon.ammo = 11; G.weapon.reserve = 77; G.game.run.time = 91; G.game.pause();
    return new Promise(r => setTimeout(() => r(JSON.parse(localStorage.getItem('saltline.resume.v1') || 'null')), 500));
  });
  ok('暂停 -> 断点存档写入', !!snap && snap.cut === 2 && snap.health === 63 && snap.ammo === 11 && snap.time === 91, JSON.stringify(snap));
  await p.evaluate(() => window.__G.game.resume());
  await p.waitForFunction(() => window.__G.game.state === 'playing', null, { timeout: 30000 });
  await p.evaluate(() => { window.__G.game.run.time = 145; Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const bg = await p.evaluate(() => JSON.parse(localStorage.getItem('saltline.resume.v1') || 'null'));
  ok('切后台 -> 存档刷新', !!bg && bg.time >= 145 && bg.cut === 2, JSON.stringify(bg && bg.time));
  ok('无失败请求 / 无 4xx', bad.length === 0, bad.slice(0, 3).join(' | '));
  ok('无未捕获异常', errs.length === 0, errs.slice(0, 2).join(' | '));
  await ctx.close();
}

/* ---------- 3) 断点续玩：命中审计 + 点"继续任务"后的复原（含游戏自身回血/沉降的容忍） ---------- */
{
  const ctx = await ctxNew();
  await ctx.addInitScript(s => localStorage.setItem('saltline.resume.v1', JSON.stringify(s)), SAVE);
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(String(e).slice(0, 160)));
  await p.goto(http.url);
  await p.waitForFunction(() => window.__ready && window.__G?.game, null, { timeout: 120000 });
  await p.waitForSelector('#resume', { timeout: 30000 });
  const audit = await p.evaluate(() => [...document.querySelectorAll('.m-screen[data-s="title"] button')].map(el => {
    const r = el.getBoundingClientRect(), x = Math.round(r.x + r.width / 2), y = Math.round(r.y + r.height / 2);
    let hit = document.elementFromPoint(x, y), self = false;
    for (let n = hit; n; n = n.parentElement) if (n === el) { self = true; break; }
    return { t: el.textContent.trim().slice(0, 10), self, hit: hit && (hit.tagName + (hit.className ? '.' + String(hit.className).split(' ')[0] : '')) };
  }));
  ok('标题页每个按钮都命中自身（无透明层吞点击）', audit.length >= 5 && audit.every(a => a.self), JSON.stringify(audit.filter(a => !a.self)));

  await p.evaluate(() => { window.__S = []; setInterval(() => { const G = window.__G, P = G && G.player; if (P && P.pos) window.__S.push([Math.round(P.health * 100) / 100, +P.pos.x.toFixed(3), +P.pos.z.toFixed(3), G.game.state]); }, 16); });
  await p.tap('#resume', { timeout: 30000 });
  await p.waitForFunction(() => window.__G.game.state === 'playing' && window.__G.game.run.cut === 2, null, { timeout: 90000 });
  await new Promise(r => setTimeout(r, 1500));
  const live = (await p.evaluate(() => window.__S)).filter(r => r[3] === 'playing');
  const last = live[live.length - 1] || [];
  const restored = live.find(r => r[0] >= 63 && r[0] < 64.5 && Math.abs(r[1] + 12.5) < 0.02 && Math.abs(r[2] - 7.25) < 0.05);
  const d = await p.evaluate(() => {
    const G = window.__G, r = G.game.run;
    return { cut: r.cut, time: Math.round(r.time), pips: document.querySelector('.h-relays b')?.textContent, ammo: G.weapon.ammo, reserve: G.weapon.reserve, msg: document.querySelector('.h-toast, .h-msg, .comms')?.textContent?.slice(0, 30) || '' };
  });
  ok('存在一帧生命≈63 且坐标 = 存档点', !!restored, JSON.stringify(restored || live[0]));
  ok('之后生命由游戏回血上涨', last[0] > 63, live[0]?.[0] + ' -> ' + last[0]);
  ok('沉降后坐标仍在存档点附近', Math.abs(last[1] + 12.5) <= 0.3 && Math.abs(last[2] - 7.25) <= 0.3, JSON.stringify(last));
  ok('任务进度复原：中继 2/3、用时、弹药', d.cut === 2 && d.pips === '2/3' && d.time >= 91 && d.ammo === 11 && d.reserve === 77, JSON.stringify(d));
  ok('断点提示已显示', /已从断点继续/.test(d.msg), JSON.stringify(d.msg));
  const yaw0 = await p.evaluate(() => window.__G.player.yaw);
  await cdpDrag(ctx, p);
  const yaw1 = await p.evaluate(() => window.__G.player.yaw);
  ok('恢复后右拇指拖动可转视角', Math.abs(yaw1 - yaw0) > 0.05, `${yaw0.toFixed(2)} -> ${yaw1.toFixed(2)}`);
  ok('无未捕获异常', errs.length === 0, errs.slice(0, 2).join(' | '));
  await p.screenshot({ path: '/tmp/verify_resumed.png' });
  await ctx.close();
}

async function cdpDrag(ctx, p) {
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 600, y: 200, id: 3 }] });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 600 + i * 18, y: 200, id: 3 }] }); await new Promise(r => setTimeout(r, 90)); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

await browser.close();
http.close();
console.log(fails ? `\n${fails} 项未通过` : '\n全部通过（性能请上真机：?bench=1）');
process.exit(fails ? 1 : 0);
