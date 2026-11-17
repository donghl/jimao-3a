# 几猫国产3A大作

一款**单文件 HTML 第一人称射击游戏**：three.js、引擎、关卡、着色器、音频合成与 UI 全部内联在一个
`几猫国产3A大作_V1.html` 里（约 1.4 MB，gzip 后约 446 KB）。打开这个 HTML **不发起任何网络请求**，
可以直接从 `file://`、手机或 WebView 里玩。

> 备注：本项目参考原项目 [blueRaining/temp](https://github.com/blueRaining/temp) 开发，
> 原项目地址：<https://github.com/blueRaining/temp>

## 玩法

雨夜港口渗透：逐个**切断中继站**，然后到撤离点撤离。途中会遭遇守卫波次、无线电剧情字幕与雷暴。

### 键鼠

| 操作 | 按键 |
|---|---|
| 移动 | `W` `A` `S` `D` |
| 视角 | 鼠标（无法锁定时按住拖动，或 `I`/`J`/`K`/`L` 转向） |
| 开火 / 瞄准 | 鼠标左键 / 鼠标右键（`Enter` 备用开火） |
| 切断中继 | `E` |
| 换弹 | `R` |
| 跳跃 / 冲刺 / 蹲伏 | `Space` / `Shift` / `C` 或 `Ctrl` |
| 暂停 | `Esc` 或 `P` |

### 手柄

摇杆移动与视角 · `RT` 开火 · `LT` 瞄准 · `A` 跳跃 · `B` 蹲伏 · `X` 换弹 · `Y` 切断中继 · `L3` 冲刺 · `Start` 暂停。

### 触屏（手机 / 平板）

左手拇指虚拟摇杆移动，右手拇指拖动转视角，屏幕按钮：开火 · 瞄准 · 换弹 · 跳跃。
横屏运行，竖屏时显示旋转提示并自动暂停；支持暂停断点续玩（`localStorage` 存档）。

## 运行

游戏本身无需构建、无依赖、无打包器：

```bash
open 几猫国产3A大作_V1.html      # 桌面直接打开即玩（Chrome / Safari）
python3 -m http.server 8000       # 手机 / 触屏 / PWA 测试需要 HTTP 服务
```

调试参数（`?k=v`）：`q=ultra|high|medium|low|mobile` 画质档、`seed=` 关卡种子、
`autostart=1` 跳过标题、`noaudio=1`、`show=`/`only=` 单模块展示、`cam=`/`fov=` 摆相机、
`dynres=0|ao=0|vol=0|bloom=0|mb=1` 渲染开关等。运行时调试面板：`window.__G`、`window.__stats()`。

## 手机打包（mobile/）

`mobile/` 是用 Capacitor 打包手机壳的目录（不是游戏本体）：

```bash
cd mobile
npm install
npm run build      # 组装 www/：游戏 + PWA manifest + 图标 + Service Worker
npm run serve      # http://localhost:8123 预览
npm run platforms  # 首次生成 android/ 与 ios/ 工程
npm run ios | npm run android
```

画质自适应：根据帧率自动升降档（`ultra → high → medium → low → mobile`），移动端默认 `mobile` 档。

## 文件说明

- `几猫国产3A大作_V1.html` — 游戏本体（唯一需要编辑的文件）
- `mobile/` — Capacitor / PWA 打包壳
- `AGENTS.md` — 仓库开发与验证指南
