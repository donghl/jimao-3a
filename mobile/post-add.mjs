#!/usr/bin/env node
// post-add.mjs — patch the generated native projects to what this game needs.
// `npx cap add` writes portrait-capable defaults; Capacitor exposes no config key for
// orientation or GL requirements, so they are patched here (idempotent, safe to re-run).
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const plist = join(root, 'ios/App/App/Info.plist');
const manifest = join(root, 'android/app/src/main/AndroidManifest.xml');
const note = (file, msg) => console.log(`[post-add] ${msg} (${file})`);

/* iOS: 横屏专用 + 后台音频(切后台/锁屏时 BGM 不炸音) */
if (existsSync(plist)) {
  let x = readFileSync(plist, 'utf8');
  const landscape = (key) => {
    const re = new RegExp(`(<key>${key.replace('~', '~')}<\\/key>\\s*<array>)([\\s\\S]*?)(<\\/array>)`);
    if (!re.test(x)) return false;
    const want = '\n\t\t<string>UIInterfaceOrientationLandscapeLeft</string>\n\t\t<string>UIInterfaceOrientationLandscapeRight</string>\n\t';
    const before = x;
    x = x.replace(re, (_, a, __, c) => a + want + c);
    return before !== x;
  };
  const o1 = landscape('UISupportedInterfaceOrientations');
  const o2 = landscape('UISupportedInterfaceOrientations~ipad');
  let bg = false;
  if (!/<key>UIBackgroundModes<\/key>/.test(x)) {
    const i = x.lastIndexOf('</dict>');
    x = x.slice(0, i) + '\t<key>UIBackgroundModes</key>\n\t<array>\n\t\t<string>audio</string>\n\t</array>\n' + x.slice(i);
    bg = true;
  }
  if (o1 || o2 || bg) {
    writeFileSync(plist, x);
    note('ios/Info.plist', `横屏锁定=${o1 && o2}, UIBackgroundModes=${bg ? 'audio' : 'already set'}`);
  } else note('ios/Info.plist', 'already patched');
} else note('ios/Info.plist', 'missing — run `npx cap add ios` first');

/* Android: Gradle 需要 JDK 21（Capacitor 8 的 capacitor.build.gradle 写死 VERSION_21），
   机器默认 java 可能还是 17 —— 找到可用的 21+ 就固定给 Gradle，避免"无效的源发行版：21"。 */
const gradleProps = join(root, 'android/gradle.properties');
if (existsSync(gradleProps)) {
  const cands = [
    '/Applications/Android Studio.app/Contents/jbr/Contents/Home',
    '/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home',
    '/Library/Java/JavaVirtualMachines/temurin-21.jdk/Contents/Home'
  ];
  try {
    const jh = execSync('/usr/libexec/java_home -v 21 2>/dev/null || true', { encoding: 'utf8' }).trim();
    if (jh) cands.unshift(jh);   // 注意：java_home 找不到 21 时会回落成 17，所以下面还要验真实版本号
  } catch { /* 没有 java_home 就算了 */ }
  const major = p => {
    try {
      const m = execSync(`"${p}/bin/java" -version 2>&1`, { encoding: 'utf8' }).match(/version "(\d+)/);
      return m ? +m[1] : 0;
    } catch { return 0; }
  };
  const home = cands.find(p => existsSync(join(p, 'bin/java')) && major(p) >= 21);
  let gp = readFileSync(gradleProps, 'utf8');
  const cur = gp.match(/^org\.gradle\.java\.home=(.*)$/m);
  if (home && cur?.[1] !== home) {
    gp = cur ? gp.replace(cur[0], `org.gradle.java.home=${home}`) : (gp.endsWith('\n') ? gp : gp + '\n') + `org.gradle.java.home=${home}\n`;
    writeFileSync(gradleProps, gp);
    note('android/gradle.properties', `Gradle JDK = ${home}${cur ? '（覆盖 ' + cur[1] + '）' : ''}`);
  } else if (home) note('android/gradle.properties', `Gradle JDK 已是 ${home}`);
  else note('android/gradle.properties', '未找到 JDK 21+，Gradle 会报"无效的源发行版：21"');
}

/* Android: 沉浸式全屏。Capacitor 模板留着系统状态栏，游戏是双手横屏，
   状态栏既吃高度又可能被误触；顺便让内容画到刘海后面（CSS 已经吃 env(safe-area-inset-*)）。 */
const styles = join(root, 'android/app/src/main/res/values/styles.xml');
if (existsSync(styles)) {
  const ADD = ['<item name="android:windowFullscreen">true</item>',
    '<item name="android:windowLayoutInDisplayCutoutMode">shortEdges</item>',
    '<item name="android:statusBarColor">@android:color/transparent</item>'].join('\n        ');
  let sx = readFileSync(styles, 'utf8'), done = 0;
  sx = sx.replace(/<style name="AppTheme(\.NoActionBar|\.NoActionBarLaunch)?"[^>]*>[\s\S]*?<\/style>/g, block => {
    if (block.includes('android:windowFullscreen')) return block;
    done++;
    return block.replace(/\s*<\/style>$/, `\n        ${ADD}\n    </style>`);
  });
  if (done) { writeFileSync(styles, sx); note('android/styles.xml', `沉浸式全屏已写入 ${done} 个主题`); }
  else note('android/styles.xml', 'already patched');
} else note('android/styles.xml', 'missing');

/* Android: 真·沉浸式。主题里的 windowFullscreen 在 MIUI/Android 13 上被忽略（状态栏还在，
   还被系统按刘海留了黑边），只能在 Activity 里直接管窗口：贴满屏 + 画进刘海 + 隐藏系统栏。 */
const javaDir = join(root, 'android/app/src/main/java');
if (existsSync(javaDir)) {
  const find = d => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { const r = find(p); if (r) return r; }
      else if (e.name === 'MainActivity.java') return p;
    }
    return null;
  };
  const main = find(javaDir);
  if (main) {
    const src = readFileSync(main, 'utf8');
    const pkg = (src.match(/^package\s+([\w.]+);/m) || [])[1] || 'com.jimao.saltline';
    if (!src.includes('saltline:immersive v2')) {
      writeFileSync(main, `package ${pkg};

import android.os.Bundle;
import android.view.WindowManager;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;

// 游戏是双手横屏全屏：状态栏/导航栏既吃高度又会被误触，刘海处也不能留黑边。  // saltline:immersive v2
// MIUI 会在拿到焦点时把状态栏放回来，所以每次 onWindowFocusChanged 都重新隐藏；
// FLAG_FULLSCREEN 是给 MIUI 兜底的老开关，API 30+ 走 WindowInsetsController，更老的走 systemUiVisibility。
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN
                | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
                | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        if (android.os.Build.VERSION.SDK_INT >= 28) {
            getWindow().getAttributes().layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
        }
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemBars();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) getWindow().getDecorView().post(this::hideSystemBars);
    }

    private void hideSystemBars() {
        if (android.os.Build.VERSION.SDK_INT >= 30) {
            WindowInsetsControllerCompat controller =
                    WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.systemBars());
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | android.view.View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | android.view.View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | android.view.View.SYSTEM_UI_FLAG_FULLSCREEN
                            | android.view.View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY);
        }
    }
}
`);
      note('MainActivity.java', '沉浸式全屏（隐藏系统栏 + 画进刘海）已写入');
    } else note('MainActivity.java', 'already patched');
  } else note('MainActivity.java', 'missing');
}

if (existsSync(manifest)) {
  let x = readFileSync(manifest, 'utf8');
  let orient = false, gl = false;
  if (!/android:screenOrientation=/.test(x)) {
    x = x.replace('android:configChanges=', 'android:screenOrientation="sensorLandscape"\n            android:configChanges=');
    orient = /android:screenOrientation=/.test(x);
  }
  if (!/uses-feature/.test(x)) {
    x = x.replace(/(\n\s*<application)/, '\n        <uses-feature\n            android:glEsVersion="0x00020000"\n            android:required="true" />\n$1');
    gl = /uses-feature/.test(x);
  }
  if (orient || gl) {
    writeFileSync(manifest, x);
    note('android/AndroidManifest.xml', `screenOrientation=${orient}, GLES2=${gl}`);
  } else note('android/AndroidManifest.xml', 'already patched');
} else note('android/AndroidManifest.xml', 'missing — run `npx cap add android` first');
