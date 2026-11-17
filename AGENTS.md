# Repository Guidelines

## Project Overview

《几猫国产3A大作》— a zh-CN first-person shooter that ships as **one self-contained HTML file**
(`几猫国产3A大作_V1.html`, ~1.43 MB raw / ~446 KB gzipped, ~6350 lines). three.js, the engine,
the level, shaders, audio synthesis and UI are all inlined. `README.md` is a placeholder
("临时文件"). The game has no bundler, no test suite and no CI; the only dependency manifest is
`mobile/package.json` (Capacitor CLI + platform packages, used purely for packaging).

Treat "single file, zero network requests at runtime" as the project's defining constraint: opening the
HTML loads **nothing** else (verified: exactly one request) — it is played from `file://`, from a phone,
and inside a WebView. Keep game assets inline (data URI or generated at runtime, like the current audio and
textures). The only files allowed to be external are the PWA shell's own (`manifest.webmanifest`, icons,
`sw.js`), and only in the `mobile/www` build output — never in the source HTML.

## Architecture & Data Flow

Layout inside the one file:

- `<head>` metas + one `<style>` block, ~lines 13–363, with `/* ==== */` banners:
  `HUD` (≈41), `radio subtitles` (≈162), `touch controls` (≈168), `menus` (≈194), settings panel (≈270),
  `mobile shell` (≈353).
- Game code is one inline `<script>` from ≈372 to ≈6220: the minified three.js bundle first, then the
  game modules, then the boot function `QC()`. Those lines are minified; some lines exceed 100 KB.
- After it, a second small `<script>` (the 手机壳层 block, un-minified) — see "Mobile shell" above.

Boot and the debug surface:

- `QC()` builds the shared context `t = {THREE, params, events, rng, time, quality, …}` and
  publishes it as **`window.__G`**, then attaches each module: `t.render`, `t.camera`
  (= `render.camera`), `t.scene`, `t.player`, `t.input`, `t.weapon`, `t.hud`, `t.props`,
  `t.enemies`, `t.fx`, `t.audio`, `t.combat`, `t.level`, `t.backdrop`, `t.ground`,
  `t.showcase`. Errors also land in `window.__errors`.
- Module registry `gM={mats,level,backdrop,ground,fx,weapon,enemies,props,render}` —
  `?show=<key>` mounts a single-module showcase instead of the game.

Frame flow: `render` owns the loop → `input.update()` writes `move/look/fire/ads/sprint/crouch`
→ `player` turns input into `pos/yaw/pitch/eye` → `enemies`/`combat`/`fx`/`audio` react →
`hud` paints. Modules never import each other: **all cross-module traffic is the event bus**
(`i.events.emit/on`). Names in use: `weapon:fire|reload|dry`, `player:hit|dead|jump|land|step|rescued`,
`enemy:spawn|alert|fire|hit|killed|melee|telegraph|step`, `objective:done|progress|all`,
`extraction:reached`, `game:state`, `quality:auto`, `input:lock`, `impact`, `explosion`,
`shell:bounce`, `thunder`, `radio:line`, `ui:click`, `ui:hover`.

Two state stores, and the split matters for any save/resume work:

- **Exposed** (`__G`): player pose/health, input flags, quality, camera, params, time, plus the mission
  handle `__G.game = {state, flow, run, menus, start(), pause(), resume(), update(), debugCut()}` —
  `run` is the live mission counter object (`{time, retries, relays:[{o,id,short,t,cut,cutting}], cut, allCut, …}`),
  so state can be read and `debugCut()` runs the game's own relay-cut path.
- **Closure-private**: the mission *logic* — relay interact range, wave scheduling, radio triggers,
  the `game:state` setter `M()`. Progress is observable from the DOM too (objective pips written by
  `hud.setRelays(done,total)`).

Persistence — two `localStorage` keys and nothing else:

- `saltline.settings.v1`: settings, written by `Wf()`, read by `YC()` (whitelist-validated; unknown
  quality values are dropped).
- `saltline.resume.v1`: the phone checkpoint written by the mobile shell (see below), read on next boot.

Mobile shell (`<!-- 手机壳层 -->` block, its own `<script>` at the very tail of the file, plus the
`mobile shell` CSS section): deliberately outside the module system — it only talks to the game through
`window.__G` and the DOM. It owns landscape lock (`screen.orientation.lock`, rejected on iOS, with a
`html.is-portrait` + `#rot` overlay as the fallback that also pauses a running mission), haptics
(`navigator.vibrate` on `weapon:fire` / `player:hit` / `enemy:killed` / `objective:done`, absent on iOS),
and the checkpoint: it snapshots seed/time/cut/pose/health/ammo on pause and on `visibilitychange`
(hidden), clears it on `dead`/`complete`, and offers a `#resume` button on the title screen. Resume
restarts the level with the saved `?seed=` and replays the cut relays through the game's own
`game.debugCut()`, so mission counters, HUD pips, radio lines and waves stay consistent. Keep that
indirection — `game.run`/`game.debugCut()` are public on `__G`, the state machine internals are not.

## Key Directories

Game + docs at the repo root; `mobile/` is the packaging shell (not the game):

- `几猫国产3A大作_V1.html` — the game and the only file to edit for gameplay/graphics/UI.
- `mobile/build.mjs` — assembles `mobile/www/` (gitignored): the game copied to `www/index.html`
  plus PWA shell wiring (manifest link, icons, SW registration) injected at two anchors
  (`<meta name="apple-mobile-web-app-title" …>` and `</body>`). Move either anchor and
  `build.mjs` throws on purpose — update it in the same commit. It also rewrites `www/sw.js`'s
  `CACHE` name from a content hash, so a rebuild invalidates stale caches by itself.
- `mobile/verify.mjs` — headless-iPhone self-check (`npm run verify`): quality auto-drop, touch input,
  portrait fallback, haptics, checkpoint write/restore, title-screen hit-target audit. Start here when
  touching the mobile shell instead of writing a throwaway script.
- `mobile/device-perf.mjs` — real-device fps harness (`npm run perf:device`, USB + installed debug APK):
  forwards the WebView DevTools socket, measures the current tier then `ultra`/`low` for comparison.
- `mobile/app/` — shell sources: `manifest.webmanifest`, `sw.js`, `icons/*.svg` (sources) +
  generated `icons/*.png`. `mobile/post-add.mjs` — idempotent patch of the generated native projects
  (iOS landscape-only + `UIBackgroundModes=audio`; Android `sensorLandscape` + GLES2 `uses-feature`),
  run by the `platforms`/`sync`/`ios`/`android` scripts. `mobile/capacitor.config.json` — app id,
  `webDir: "www"`, `zoomingEnabled: false`, `android.captureInput: true`. `mobile/README.md` — install
  commands plus what the native shell still needs by hand (Xcode signing team).
- `.gitignore` covers `mobile/{www,node_modules,android,ios}`.
  History is whole-file drops ("Initial commit", "提交代码"), not incremental edits.

## Development Commands

The game itself never needs building, linting or unit tests; `mobile/` only packages it.

```bash
open 几猫国产3A大作_V1.html              # desktop play (Chrome/Safari)
python3 -m http.server 8000             # HTTP serve — required for phone / touch / PWA testing

cd mobile
npm install                             # @capacitor/{cli,core,ios,android}
npm run build                           # assemble www/ (game + manifest + icons + sw)
npm run serve                           # http://localhost:8123 with the PWA shell
npm run platforms                       # first time: generate android/ and ios/ projects
npm run ios | npm run android           # build + cap sync + open the IDE
```

Reading the minified bundle without blowing up context (never `read` the whole file,
never read lines ≈360–6000 wholesale):

```bash
grep -o -E ".{0,200}PATTERN.{0,200}" 几猫国产3A大作_V1.html | head
awk 'length($0)<600' 几猫国产3A大作_V1.html | grep -n "PATTERN"   # CSS + DOM-template lines only
read 几猫国产3A大作_V1.html:168-195                             # targeted range (CSS/DOM tail ≈6000-6214)
```

## Runtime/Tooling Preferences

- Runtime target: modern browser WebGL2. No on-disk runtime dependency; Node (v24 here) is used
  only for throwaway verification scripts.
- Keep every asset inline (data URI / generated at runtime, like the current audio and textures).
- Keep the game playable from `file://` — no absolute paths, no module `import`s.
- Player-visible strings are zh-CN; code comments are mixed zh/en. Match the language of the file.

## Code Conventions & Common Patterns

- **Module shape**: each module is `function (i) => ({ api… })` taking the shared context, with all
  state in the closure and only the API on the returned object. Follow it; do not add globals.
- **Defensive cross-module calls**: because module init can fail independently, callers guard —
  `r.setGameplay && r.setGameplay(!0)`, `a(i.audio,"setPaused",!1)`, `o.setRelays && o.setRelays(…)`.
  New call sites must keep that shape (minified name `a(obj,method,...args)` for the guard helper).
- **Quality is data, not branches.** The preset table `Pr` (≈line 4191) holds
  `{name, scale, msaa, shadow, tex, volSteps, ao, planar, bloom, motionBlur, rain}`; `zy()` resolves the
  preset from `?q=` or the device (mobile UA, or `maxTouchPoints>1 && min(screen.width,screen.height)<900`
  → **`mobile`**, the phone tier: scale .6, no volumetrics/AO/planar, 1024 shadows).
  A new tier must be registered in **five** places or it silently misbehaves: `Pr`, the validity list `dM`,
  the settings label map `{mobile:"极轻",low:"低",…}` in the `.seg` template, the per-tier pixel-budget map
  in `resize()` (`{mobile:8e5,low:1e6,…}` — unknown names fall through to the `ultra` budget), and the
  auto-drop chain `{ultra:"high",high:"medium",medium:"low",low:"mobile"}`.
- **Adaptive resolution** (`z(dt)`, in the render module): averages ~45 frames; mean > 21.5 ms shrinks
  `scale` (floor 0.6, back-off doubling), < 17.4 ms grows it back, and at the floor with > 26 ms twice it
  drops a tier down the same chain as above. DPR is clamped to 2 in `resize()`.
  When the advanced pipeline is on (`advanced: true`), the `#view` canvas keeps the full clamped-DPR size as
  a blit target and the tier's real pixel count lives in the composer — read **`__stats().res`** (e.g. 844×390
  at `mobile` ⇒ 1013×468 = 474k px vs `ultra`'s 1.32M), never `canvas.width`, when checking a tier.
- **Debug/demo params** (`?k=v`, read as `i.params.X`): `q`, `shot`, `show`, `only`, `names`, `autostart`,
  `bench` (implies `noaudio`+`autostart`), `noaudio`, `seed` (RNG seed — same seed ⇒ same level),
  `cam=x,y,z,lookX,lookY,lookZ`, `fov`, `wet`, `bshow`, `epre`/`eshow`/`eseed`/`efreeze`,
  `fxt`/`fxsoft`/`fxsize`/`fxshow`/`fxhold`, and the render kill-switches `dynres=0`, `ao=0`, `vol=0`,
  `bloom=0`, `mb=1`. These are the intended knobs for perf experiments — prefer them over new flags.
- **Input** is one factory, `v_()`, returning the handle `{move, look, fire, ads, sprint, crouch, locked,
  touch, gamepad, sensitivity, invertY, mode, down(), pressed(), update(), endFrame(), requestLock(),
  exitLock(), setGameplay(), setPrompt(), onModeChange(), describeMode()}`. `mode` ∈ `lock|drag|touch`;
  the private `r` flag (set by `setGameplay`) gates every gameplay handler, so injected UI must respect it.
  Keymap `h_` (`KeyW→forward` … `Escape/KeyP→pause`, `IJKL`/arrows→turn). Touch UI is injected into `#ui`:
  `.t-stick`/`.t-nub` plus `.t-fire|.t-ads|.t-reload|.t-jump|.t-interact|.t-pause` carrying `data-a`,
  activated by `.touch.on` and `html.is-touch`; HUD shifts out of the thumb corners under `.is-touch …`.
- **Styling**: one dark theme from `:root` tokens; safe areas are `--sat/--sab/--sal/--sar/--gl/--gr`
  (`env(safe-area-inset-*)`) and every overlay consumes them — any new full-bleed UI must too.
  Menu screens are switched by `data-screen` on `.menu` (`title|paused|dead|complete` + `none`),
  panels by `[data-f="…"]`, `.seg button[data-q]`, `#s-sens|#s-vol|#s-fov`, `.toggle`.
- **Invisible ≠ inert.** `.menu.open` turns on `pointer-events` for its whole subtree, so a decorative
  overlay parked at `opacity: 0` (e.g. `.loc-card`, `aria-hidden`) still swallows taps meant for the
  buttons under it — on a 390 px-tall landscape phone it sat exactly over `.m-actions`. Such signage needs
  `pointer-events: none`. When touch input "does nothing", audit hit targets
  (`document.elementFromPoint(center)`) before blaming the listener.

## Important Files

- `几猫国产3A大作_V1.html` — the game, and the only thing to edit. Head metas: charset,
  `viewport` with `viewport-fit=cover` (plus a stale `claude:viewport-fit-sides` meta).
  `?`-param docs, `Pr`, `zy()`, `v_()`, `QC()` all live in it; grep for those names to jump.
- `README.md` — placeholder, not documentation.
- `AGENTS.md` — this file.

## Testing & QA

No frameworks, no coverage, no CI. Verification = load the page and observe it; the console is the
main instrument (`[render] …`, `[game] …`, and `window.__errors`).

Headless mobile emulation that works on this machine (Node 24 + playwright already installed at
`/Users/lani/node_modules/playwright`; the installed playwright expects a newer browser build than the
cache holds, so `executablePath` **must** be pinned, and `npx playwright install` must not be run):

```js
// save under /Users/lani/ (ESM ignores NODE_PATH)
import { chromium, devices } from 'playwright';
const b = await chromium.launch({ headless: true,
  executablePath: '/Users/lani/Library/Caches/ms-playwright/chromium-1155/chrome-mac/Chromium.app/Contents/MacOS/Chromium',
  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await b.newContext({ ...devices['iPhone 13'] });
const p = await ctx.newPage();
await p.goto('file:///Users/lani/src/3A/几猫国产3A大作_V1.html?autostart=1&noaudio=1');
await p.waitForFunction(() => window.__ready && window.__G?.game && window.__G.hud, null, { timeout: 90000 });
const cdp = await ctx.newCDPSession(p);   // trusted touch: Input.dispatchTouchEvent {touchPoints:[{x,y,id}]}
```

- Readiness is `window.__ready` (set on rendered frame 2) **and** `window.__G.game`: `player.enabled`
  is true straight out of the player factory and is NOT a readiness signal; `#boot.done` only means loaded.
- Debug surface: `window.__G` (all modules incl. `game`, `hud`, `render`), `window.__errors`,
  `window.__frames`, `window.__stats()`, `window.__setShot({cam,fov,exposure})`.
- Input must be CDP-dispatched (`Input.dispatchTouchEvent`, `touchPoints: [{x,y,id}]`); `new TouchEvent`
  is not constructible, and untrusted keyboard events do still reach the game's handlers.
  Raw CDP touch *does* synthesize a `click` — on the topmost element, which is why a swallowed tap looks
  identical to a dead listener. `p.tap(sel)` is the diagnostic: it hit-tests and names the intercepting
  element in its timeout log.
- SwiftShader runs ~4 FPS: use it to prove **code paths** (auto `low` tier on mobile UA, `input.mode`
  flipping to `touch`, yaw changing under a look-drag, `.t-btn.active` on press) — never performance.
  Phone FPS, thermals and the left-thumb stick need a real device.
  Reference baseline (Mi 11 / Adreno 660 / WebView Chrome 157, 全屏沉浸后视口 914×411 CSS px, in gameplay):
  **`mobile` 39.6–51 fps**（中位 19–23 ms，内部 658×296，adaptive `scale` 落在 0.6 下限），
  `low` ≈35 fps，强开 `ultra` 只有 **12.5–17 fps** — 即自动降档在这台机器上值 3 倍帧率。
  跑第二次比第一次低约 15%（发热降频），所以对比档位要连着测、同一次会话内比。
  真机测帧：debug 包 + `adb forward tcp:9223 localabstract:webview_devtools_remote_<pid>` +
  `chromium.connectOverCDP`（Capacitor 的 origin 是 `https://localhost/`，是安全上下文，SW 会注册；
  CDP context 没有 `hasTouch`，点按钮要用 `Input.dispatchTouchEvent`，`page.tap` 会直接报错）。
- A change is proven when the page shows it: `__G` state deltas, DOM classes, or a screenshot.
- `cd mobile && npm run verify` runs the assembled phone-path checks against a temp server
  (`mobile/verify.mjs`, exit code non-zero on failure; `VERIFY_URL=` points it at a deployment,
  `VERIFY_CHROMIUM=` pins another browser build). Extend it rather than writing throwaway scripts.
- The omp `browser` tool's `emulate`/`setViewport` currently fails here
  (`Emulation.setDeviceMetricsOverride: … params.height`); use the playwright script above.
