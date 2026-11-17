# 手机壳层（PWA + Capacitor）

游戏本体仍是根目录那个单文件 HTML；这里只负责"把它装进手机"。

```bash
npm install          # 装 @capacitor/{cli,core,ios,android}
npm run build        # 组装 www/：单文件游戏 + manifest + 图标 + service worker
npm run verify       # headless iPhone 自检（画质降档 / 触屏 / 竖屏 / 震动 / 断点续玩 / 命中审计）
npm run serve        # http://localhost:8123 —— 本机浏览器 / Chrome DevTools 手机模拟
npm run platforms    # 首次：生成 android/ 与 ios/ 原生工程（末尾自动跑 post-add）
npm run postadd      # 只重打原生工程补丁（横屏 / 后台音频 / GLES2）
npm run ios          # build + cap sync + 打开 Xcode
npm run android      # build + cap sync + 打开 Android Studio
npm run apk          # 直接出 debug APK（android/app/build/outputs/apk/debug/app-debug.apk）
npm run perf:device  # 真机测帧：USB 连着已装的 debug 包，走 adb forward + WebView DevTools
```

`www/`、`node_modules/`、`android/`、`ios/` 都在 .gitignore 里：`www/` 是构建产物，原生工程由 `cap add` 现场生成。

## PWA 路线

`www/` 直接丢到任意静态托管（HTTPS）即可。iPhone Safari 用"添加到主屏幕"，Android Chrome 会弹安装横幅；两者都以 fullscreen 启动，`sw.js` 做缓存优先，断网可玩。

- 只有 https 或 localhost 才注册 service worker，`file://` 直接双击打开时不注册。
- 改过游戏文件或图标只要 `npm run build`：`www/sw.js` 的缓存名由内容哈希自动生成，旧缓存会被新 SW 清掉，
  不用手改版本号（`app/sw.js` 里那行 `CACHE` 只是占位）。别手改 `www/`，它是产物。

## 原生壳路线（上架）

`npm run platforms` 生成原生工程后会自动跑 `post-add.mjs`，把 Capacitor 模板缺的都补上（重复运行安全）：

- iOS `Info.plist`：`UISupportedInterfaceOrientations`（含 `~ipad`）只留 LandscapeLeft/Right——横屏成为系统行为，
  不再只靠提示层；`UIBackgroundModes = [audio]`，切后台/锁屏时 WebAudio 会话不被挂起，回前台声音继续。
- Android `AndroidManifest.xml`：`android:screenOrientation="sensorLandscape"`，
  以及 `<uses-feature android:glEsVersion="0x00020000" android:required="true">`（上架时过滤跑不了 WebGL 的机器）。
- Android `MainActivity.java`：沉浸式全屏。主题里的 `windowFullscreen` 在 MIUI/Android 13 上**不生效**
  （状态栏照画，还按刘海留黑边），所以直接管窗口：`FLAG_LAYOUT_IN_SCREEN|FLAG_LAYOUT_NO_LIMITS|FLAG_FULLSCREEN`
  + `LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES` + `WindowInsetsController.hide(systemBars())`，
  并在 `onWindowFocusChanged` 里重新隐藏（MIUI 拿到焦点会把状态栏放回来）。要改这个别改生成文件，改 `post-add.mjs`。

还要人做的只剩：**Xcode 签名**（`ios/App/App` → Signing & Capabilities → Team）；iPad 分屏/台前调度下 WebGL 上下文会被回收，
需要时再自行加 `UIRequiresFullScreen = YES`。

Android 侧 `android.captureInput: true`、`zoomingEnabled: false` 已在 `capacitor.config.json`；WebView 需要 Chrome 84+（WebGL2 才稳定），`minSdk` 用 Capacitor 8 默认值即可。

## 真机才能验的东西

headless Chromium 用的是 SwiftShader，只能证明代码路径，证明不了性能。上真机要过：**帧率与发热**（`?bench=1` 出帧时间曲线）、**左拇指摇杆**、**iOS 音频会话**、**Android 震动**（`navigator.vibrate` 在 iOS 无实现，代码已自动跳过）。
