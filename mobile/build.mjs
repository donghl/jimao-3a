// 组装 mobile/www：单文件游戏 + PWA 壳层资源。
// 源文件 几猫国产3A大作_V1.html 保持"双击即玩"，不引用任何外部资源；
// 只有这里的构建产物才注入 manifest / 图标 / service worker。
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../几猫国产3A大作_V1.html');
const APP = join(here, 'app');
const WWW = join(here, 'www');

const HEAD_ANCHOR = '<meta name="apple-mobile-web-app-title" content="几猫3A">';
const BODY_ANCHOR = '</body>';

const SHELL_HEAD = `
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icons/icon-192.png" sizes="192x192" type="image/png">
<link rel="apple-touch-icon" href="./icons/apple-touch-icon.png">`;

const SHELL_SW = `
<script>
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^https?:\\/\\/(localhost|127\\.)/.test(location.origin))) {
    addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('[sw] ' + e)));
  }
</script>
`;

function need(hay, anchor, what) {
  if (!hay.includes(anchor)) throw new Error(`构建中止：源文件缺少${what}锚点 "${anchor}"（游戏文件结构变了，请同步 build.mjs）`);
}

const src = await readFile(SRC, 'utf8');
need(src, HEAD_ANCHOR, '头部');
need(src, BODY_ANCHOR, 'body');

const html = src.replace(HEAD_ANCHOR, HEAD_ANCHOR + SHELL_HEAD).replace(BODY_ANCHOR, SHELL_SW + BODY_ANCHOR);

await rm(WWW, { recursive: true, force: true });
await mkdir(join(WWW, 'icons'), { recursive: true });
await writeFile(join(WWW, 'index.html'), html);
await cp(join(APP, 'manifest.webmanifest'), join(WWW, 'manifest.webmanifest'));
await cp(join(APP, 'icons'), join(WWW, 'icons'), { recursive: true });

/* 缓存名按内容哈希：游戏或图标一改，SW 换新缓存并在 activate 里清掉旧的，
   免得"改了没生效"被旧缓存盖住。app/sw.js 里的字面量只是占位。 */
const manifest = await readFile(join(WWW, 'manifest.webmanifest'));
const swSrc = await readFile(join(APP, 'sw.js'), 'utf8');
const hash = createHash('sha256').update(html).update(manifest);
for (const f of (await readdir(join(WWW, 'icons'))).sort()) hash.update(await readFile(join(WWW, 'icons', f)));
const CACHE = `jimao-3a-v${hash.digest('hex').slice(0, 10)}`;
if (!/const CACHE = '[^']*';/.test(swSrc)) throw new Error('构建中止：app/sw.js 缺少 `const CACHE = \'…\';` 行');
await writeFile(join(WWW, 'sw.js'), swSrc.replace(/const CACHE = '[^']*';/, `const CACHE = '${CACHE}';`));

console.log(`www/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB  (源 ${(Buffer.byteLength(src) / 1024).toFixed(0)} KB)`);
console.log(`已生成: sw.js (缓存 ${CACHE}) ; 已复制: manifest.webmanifest, icons/`);
