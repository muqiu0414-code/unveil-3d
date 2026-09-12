# UNVEIL® 网站还原 — 完整实现文档

> 项目：`D:\Desktop\rep\unveil-3d`（本工程）
> 还原目标：https://unveil.fr/ （首页 3D 玻璃面板轮播 + Index 索引页）
> 交付：首页（`#/`）+ Index 页（`#/index`）两个页面

---

## 一、总体目标与交付物

用户要求"完全还原 unveil.fr 的动效与 3D 效果"，核心交互是：

1. **首页**：把项目图片变成"微透玻璃板"，鼠标放在某块玻璃板上会把它滑出；上下滚动鼠标滚轮时，所有玻璃板按顺序滚动（3D 纵深轮播）。
2. **Index 页**：点击右下角 Index 按钮出现新页面——左侧为项目列表（项目名 + 信息），右侧为图片展示区。
3. 附带要求：优化加载速度、调试自查、输出完整技术文档。

交付物为两个页面 + 本文档，工程可 `pnpm build && pnpm preview` 后本地访问。

---

## 二、技术栈总览

| 层 | 技术 | 用途 |
|---|---|---|
| 构建 | **Vite 5** + **TypeScript 5** | 打包、HMR、类型安全 |
| 3D 渲染 | **Three.js r169** | WebGL 场景、相机、BoxGeometry 着色器面板 |
| 动画 | **GSAP 3.12** | 入场相机运镜、camPan 收拢、面板滑出、UI 淡入、详情弹层 |
| 滚动 | **原生 window wheel 事件 + 虚拟滚动公式**（无 Lenis、无页面滚动条） | 滚轮 → `scroll.current -= (deltaY+deltaX)/20` → 面板按源站公式位移 |
| 包管理 | **pnpm 11** | 依赖安装（`pnpm approve-builds --all` 放行 esbuild） |
| 样式 | 原生 **CSS**（无框架） | 全部视觉与动效样式 |
| 数据 | 原生 TS 模块 | 170 个 visuals（首页面板，源站 DatoCMS 载荷解析生成）+ 43 个项目（Index 页） |
| 路由 | 原生 hash 路由 | `#/` 首页 ↔ `#/index` 索引页 |
| 服务 | **零依赖 Node 静态服务器 `serve.cjs`** | 生产预览（端口 4174，避开用户其他项目），常驻保活 |

> **演进说明**：初版曾用 **Lenis** + 600vh 滚动面做平滑滚动，第三轮对齐时发现源站是 `virtualscroll` 库 + `overflow:hidden` 无滚动面的"虚拟滚动"（详见 11.2），故删除 Lenis 依赖，改为原生 wheel 直写。

架构上刻意保持"零 UI 框架"：三个状态对象（scroll / drag / camPan）在 `scene.ts` 中共享，DOM 层只做覆盖与监听，与源站（SvelteKit + 原生 Three/GSAP 写法）行为一致。

---

## 三、源站逆向（关键事实如何获得）

### 3.1 静态资源逆向

用 curl 完整抓取源站首页 HTML 与全部 JS/CSS（落盘 `unveil-site\_src\`）：

- `index_raw.html`（917KB）——内含 **全部 43 个项目数据**（DatoCMS 序列化载荷，字段：title / slug / year / tags / thumbnail / seo.description / visuals[] 多图）
- `node0.js`（509KB）——**核心 3D/动效逻辑**（Three.js + GSAP + virtualscroll 打包产物）

从 `node0.js` 逐段提取出以下可复刻参数（全部经运行核验）：

### 3.2 相机与入场

```js
// PerspectiveCamera fov=5，初始在 y 高处（100/7.5），入场飞向 (0,0,30/35)
camera.position.set(0, 100/7.5, 35);
gsap.to(camera.position, { x:0, y:0, z: w<640 ? 35 : 30, ease:"expo.inOut", duration:1.25,
  onUpdate: () => camera.lookAt(0,0,0) });
```

### 3.3 玻璃着色器（逐字提取，见 `src/shaders.ts`）

核心思路：`uImageTexture`（清晰原图）+ `uBlurTexture`（低分辨率模糊图）按边缘距离混色，实现"微透玻璃板"质感：

- 四周 `margin=0.15` 的 UV 边缘平滑过渡；
- `blurTexture.a *= 0.75` 控制玻璃半透明度；
- `color = mix(imageTexture, blurTexture, 1.0 - progress)` 边缘渐入模糊；
- 顶点着色器只透传 UV。

### 3.4 面板几何（图片宽高比自适应）

```js
// 源站：be=img.h/img.w；基准 H=W=1.5；W*=be；H*=(1-(be-1)*0.5)
// 即 W = 1.5*be*fe, H = 1.5*fe, fe = 1-(be-1)*0.5
// 图像 mesh 偏移 position.x = -(H-1.5)/2；悬停检测面同几何、scale.x=1.5
```

### 3.5 布局 / 滚动驱动公式（核心）

```js
G = 0.375;  F = 项目数 * G / 2;
J = scroll.previous / 25 - dragDrift / (桌面100 / 移动50) + camPan.x;
fe = i - J;
v.position.x = wrap(-F, F, fe * G);          // GSAP utils.wrap(min, max, value)
v.position.y = 0;
v.position.z = 移动端 ? -x*6 : -x * aspect * 1.5;
v.rotation.y = -Math.PI / 6;
v.visible = z < 12.5 && z > -12.5;
// scroll.previous 为虚拟滚动值的缓动：previous += (current - previous) * 0.15
// dragDrift 为拖拽惯性：M += (drag.x - drag.y - M) * 0.1
```

### 3.6 悬停滑出 / 点击

```js
// 桌面 hover：imageGroup.position → {x:0.325, y:-0.1}（expo.out 0.5s），离开归零
// 移动端：{x: 2/3, y:-0.1}
// 点击：面板先归中（x→0、rotation.y→0，expo.inOut 1.25s），再跳项目页
```

### 3.7 视频抽帧逆向 Index 页

用户提供 27.5s 交互演示视频，按 0.2s 间隔抽 **138 帧**（`unveil-site\_idx_frames\`），逐帧确认 Index 页设计：

- URL 为 `unveil.fr/index`，顶部保留同一导航（UNVEIL® PROJECTS / RESEARCH / BRAND / CONTACT）；
- 左侧三列表格：**YEAR | PROJECT | CATEGORY**，全量项目按年份倒序（43 项），行内文字全大写、分类用 "AI / STILLS" 斜杠格式；
- 右侧为图片展示区（帧内鼠标在表格上移动时右侧区域出现项目图）；
- 底部右下角 Overview / Index 胶囊按钮同排；
- 点击表格行会进入对应项目页（帧中地址栏出现 `/9-portraits-of-a-vase`、`/le-k` 等）。

---

## 四、首页实现（`src/`）

### 4.1 模块划分

| 文件 | 职责 |
|---|---|
| `main.ts` | 入口：滚动接线、hash 路由、rAF 主循环、预加载器完成→入场 |
| `scene.ts` | Three 场景全逻辑：渲染器/相机/面板构建（BoxGeometry+双纹理）/布局公式/射线检测/拖拽/入场/滚轮虚拟滚动 |
| `shaders.ts` | 玻璃着色器（源站逐字复刻） |
| `ui.ts` | DOM 覆盖层：预加载器、导航、悬停标签、详情弹层、Index 页渲染、路由 |
| `data.ts` | 首页项目数据（早期 12 项，已由 data-tiles 取代） |
| `data-tiles.ts` | 首页面板 170 个 visuals（脚本生成，运行时 Fisher–Yates 洗牌还原源站 randomTiles） |
| `data-full.ts` | 全量 43 个项目（Index 页用），由脚本从源站数据生成 |

### 4.2 渲染管线

1. 每张图片经 `TextureLoader.load()` **只加载一次**，成功后：
   - 以 `texture.image` 的原始尺寸计算面板宽高比（be/fe 公式，`W=1.5·be·fe·0.8`、`H=1.5·fe·0.8`，0.8 为用户要求的 1/5 缩小）；
   - 同步生成与原图同宽的模糊 canvas 纹理（`blur(10px)`，边缘磨砂素材，颜色自动跟随原图）；
   - 构建 **BoxGeometry(H, W, 0.0175)**：4 个侧面 = 磨砂黑材质（`0x141414`、opacity 0.9），正面/背面 = 玻璃 ShaderMaterial（`uBlurTexture` + `uImageTexture` 双纹理，透明）——还原源站"带厚度的玻璃板"；
   - 另建同几何的透明悬停检测 mesh（`scale.x=1.5`）；
   - 计数 +1 并上报加载进度（驱动预加载器百分比）。
2. 全部 170 张就绪 → 预加载器显示 100% 并淡出 → 触发入场动画：
   - `camPan.x: -2 → 0`（expo.out 0.8s，面板轻微收拢——源站完整动画在 preloader 期间已进行，用户只感知收尾）；
   - 相机 `(0, 100/7.5, 35) → (0, 100/7.5, 30)`（expo.inOut 1.25s，onUpdate lookAt 原点，**y 保持俯视**）；
   - 导航/联系栏/胶囊按钮错峰淡入。
3. 主循环每帧：处理 wheel 累积的 `scroll.current` → 缓动 `previous += (current-previous)*0.15` → 按源站公式更新每个面板的位置/旋转/可见性 → 射线检测悬停 → 渲染。

### 4.3 交互细节

- **滚轮滚动**：`window` wheel 事件 → `scroll.current -= (e.deltaY + e.deltaX)/20`（每格 120 仅位移 0.09，细腻）→ 每帧 `previous += (current-previous)*0.15` 缓动 → 面板按公式顺序位移、循环回绕（wrap）；页面本体 `overflow:hidden` 无滚动条；方向键/空格同步（下/右=面板向右）；
- **鼠标悬停**：Raycaster 每帧从鼠标位置投射，命中最近面板 → 该面板 imageGroup 滑出（x=0.325, y=-0.1，与源站一致）+ 右上角跟随鼠标显示"标题 + 描述"双行标签（mix-blend-exclusion 白字，融合于画面）；
- **拖拽**：按住面板区域可水平拖拽平移轮播（150ms 长按判定、4px 位移阈值区分点击/拖拽）；
- **点击**：快速点击悬停面板 → 打开项目详情弹层（毛玻璃背景 + 左图右信息：年份/标签/标题/描述/外链），Esc/点空白/× 关闭；
- **移动端**：相机 z=55、面板 z=-x*6、悬停改点选、滑出 x=2/3。

### 4.4 预加载器

源站首页有一个居中显示的百分比预加载器（22%→64%→100%），本实现 1:1 复刻：图片加载进度实时更新大号百分比，全部就绪后短暂停留 350ms 再淡出，让"加载"有明确反馈，避免白屏焦虑。

---

## 五、Index 页实现（`#/index`）

### 5.1 路由

原生 hash 路由（`src/ui.ts`）：`window.location.hash` 变化 → `applyRoute()` 切换 `#home` / `#index-page` 两个根节点的显隐；首页 Index 按钮 / 表格页 Overview 按钮 / 导航 UNVEIL® Projects 均接入导航。路由切换时通过 `setTilesBusy()` 暂停首页射线检测（3D 循环保持运行，返回首页零成本恢复）。

### 5.2 左侧列表（UL/LI，源站实测结构）

- 数据：`data-full.ts` 43 个项目（**由脚本 `scripts/gen-data-full.cjs` 从源站 `_projects2.json` 生成**，含 title/slug/year/tags/seo 描述/缩略图路径，字段真实可溯源）；
- 结构：**`<ul>` + 43 个 `<li class="idx-row">`**（源站实测为 UL/LI 而非 table，详见 11.4），每行三列 `YEAR | PROJECT | CATEGORY`：年份列 `w-1/4 pl-2.5`、项目名列固定 `225px`、分类列窄屏隐藏；字号 10.5px、行距 33px；
- 滚动：容器 `overflow-y:auto` + `scrollbar-width:none`（视觉无滚动条），页面本体 `overflow:hidden`；
- 入场：行列表逐行淡入上移（GSAP stagger 0.012s）。

### 5.3 右侧图片区

- 默认展示第一个项目图；**悬停某行** → 该行高亮 + 右侧图片交叉淡入切换（新图按需懒加载：`new Image()` 预取后赋值，避免首次闪烁）；
- 43 张缩略图均为 512px webp（平均 ~30KB），**只加载首屏 1 张 + 悬停命中行**，43 张总 ~1.3MB 不会一次性拉取；
- **点击某行** → 打开同一项目详情弹层（复用首页详情组件，传入完整项目数据）。

### 5.4 页脚与按钮

底部居中显示联系信息（contact@unveil.fr / Instagram / 巴黎地址）；右下角 Overview / Index 胶囊按钮（Index 高亮为当前页）。

---

## 六、性能优化（加载速度）全过程

### 6.1 问题诊断

| # | 问题 | 影响 |
|---|---|---|
| 1 | 每张图 `new Image()` + `TextureLoader.load()` **双重加载** | 12 张图 = 24 个请求，白屏期加倍 |
| 2 | 12 张 512px **PNG** 合计 700KB+ | 网络传输占大头 |
| 3 | 图片加载时同步做 12 个 256px canvas blur（`blur(28px)`） | 首帧前阻塞主线程 |
| 4 | 全部 JS（three+gsap+lenis）打进**单个 564KB bundle** | 首屏 JS 解析慢、无法缓存复用 |
| 5 | 加载过程**无进度反馈**（白屏） | 用户体感"慢" |
| 6 | 生产构建仍每帧生成 debug 对象 | 无谓的 GC/CPU 开销 |

### 6.2 优化措施与量化结果

| 措施 | 实现 | 收益 |
|---|---|---|
| **图片转 webp** | 源站 CDN 直接输出 `fm=webp&h=512&q=70` 落盘 `public/img/*.webp` | 首页图 **700KB+ → 325KB（约 -53%）** |
| **单次加载** | 只用 TextureLoader 一次加载，blur 纹理复用 `texture.image` | 请求数 **24 → 12（-50%）** |
| **轻量 blur** | 模糊 canvas 256px→160px，`blur(28px)`→`blur(18px)`，关 mipmap | 每张图 blur 成本降至 ~1-2ms，12 张仅 ~20ms 一次性 |
| **预加载器** | 加载进度实时百分比 + 淡出 | 消除白屏无反馈，体感加载显著改善 |
| **并行预取** | `<link rel="preload">` 前 4 张图 + 全部图片并行解码 | 关键图提前进入解码管线 |
| **JS 分 chunk** | `vite manualChunks`：`three`(116KB gzip) / `anim`(gsap, 33KB gzip) / `index`(9KB gzip)（Lenis 已在第三轮删除） | 三.js 单独缓存；首屏仅需 index+anim，three 可并行加载 |
| **懒加载 Index 图** | 43 张缩略图仅加载首屏 1 张，其余悬停行时才 `new Image()` 预取 | 首屏 0 额外图片请求 |
| **生产去掉 debug** | `__debugEnable` 仅 DEV 生效 | 每帧省掉一个 12 字段对象构造 |
| **ES2022 target** | 构建目标上调，减少语法降级代码 | JS 体积略降、解析更快 |
| **静态资源缓存**（终版补充） | serve.cjs 对图片/字体设 `public,max-age=604800,immutable`（构建后不变），HTML/JS 仍 `no-cache` | 二次访问 170 张图走浏览器缓存，加载从数秒降至秒开 |

**前后对比（首页首屏）**：

- 图片：~700KB → **325KB**
- 图片请求：24 → **12**
- JS 总 gzip：~160KB → **~158KB**（且拆分为可缓存 chunk，二次访问只需 index 9KB + anim 33KB）
- 白屏期：无进度 → 百分比预加载器，且 12 张图并行加载

### 6.3 调试中发现并修复的 Bug（自查记录）

1. **滚动后玻璃板"全部消失"**——根因：把 GSAP 的 `utils.wrap(min, max, value)` 记成了 `(value, min, max)`，参数顺序写反导致 wrap 返回恒等于 -F，12 块面板全部塌缩到视野外。对照 `node0.js` 源站确认签名后修复。
2. **悬停滑出动画从未生效**——`setHover()` 方法定义了但无人调用，悬停只更新标签不滑动面板。在 hover 变更处补 `tile.setHover(true/false)`。
3. **合成事件下 pointerdown 报错**——`e.target.closest` 在 target 非 Element 时抛异常，加 `typeof closest === "function"` 守卫（真实用户点击不受影响）。

---

## 七、验证过程（自查）

- `pnpm build`（tsc 类型检查 + vite 构建）通过，无类型错误；
- `pnpm preview` 启动后在内置浏览器实测：
  - ✅ 预加载器 100% → 淡出 → 入场动画；
  - ✅ 滚动 0/150/300/800px 面板位置按公式正确回绕（`wrap` 修复后逐点核对数值）；
  - ✅ 悬停检测精确（屏幕坐标 → 命中项目正确），滑出位置 x=0.325/y=-0.1 与源站一致；
  - ✅ 双行悬停标签（标题+描述）；
  - ✅ 点击面板 → 详情弹层（年份/标签/描述/图片/外链齐全）；
  - ✅ Index 页：43 行表格（YEAR/PROJECT/CATEGORY）、右侧默认图、行悬停换图、行点击开详情；
  - ✅ 路由 `#/` ↔ `#/index` 往返正常；
  - ✅ 控制台无 error；
- 移动端：按源站公式实现（z=-x*6、相机 55、点选交互），CSS 640px 断点适配两页布局。

---

## 八、目录结构与运行

```
unveil-3d/
├─ index.html             # 两路由 DOM 骨架（首页 + Index 页）
├─ vite.config.ts         # base "./" + manualChunks 拆分
├─ serve.cjs              # 零依赖静态服务器（生产预览 4174，常驻保活）
├─ src/
│  ├─ main.ts             # 入口：滚动接线/路由/rAF 主循环/入场调度
│  ├─ scene.ts            # Three 场景：BoxGeometry 面板构建/布局公式/虚拟滚动/交互/入场
│  ├─ shaders.ts          # 玻璃着色器（源站复刻）
│  ├─ ui.ts               # 预加载器/导航/悬停标签/详情/Index 页/路由
│  ├─ data.ts             # 首页项目数据（早期 12 项）
│  ├─ data-tiles.ts       # 首页面板 170 visuals（脚本生成，运行时洗牌）
│  ├─ data-full.ts        # Index 页 43 项目（脚本生成）
│  └─ style.css           # 全部样式
├─ public/img/            # tiles/ 170 张面板图 webp + idx/ 43 张 Index 图 webp
├─ public/fonts/          # NB International Pro 自托管
└─ scripts/               # 数据生成/图片下载脚本（可复跑）
```

运行：
```bash
pnpm approve-builds --all   # 首次安装时放行 esbuild
pnpm dev                    # 开发（http://localhost:5173）
pnpm build                  # 生产构建
node serve.cjs              # 静态预览（http://localhost:4174，端口避开用户其他项目）
```

---

## 九、已知差异与说明

1. **悬停标签第三行（生成提示词）**：源站悬停时显示"标题 + 图片描述 + Midjourney 提示词"三行，其中提示词来自运行时 API，静态 HTML/JS 包中不存在，故本实现显示"标题 + seo 描述"两行（结构与源站一致）。
2. **Overview 按钮**：源站 Overview 为另一独立视图，未提供对应视频/数据；本实现将其指向项目索引页（与 Index 同内容）。
3. **详情页跳转**：点击项目后源站跳独立项目页（`unveil.fr/{slug}`），本实现以站内详情弹层呈现，并提供"View project"外链指向源站对应页面。
4. **图片素材**：170 张面板图来自源站 DatoCMS 数据，视觉内容与源站相同（用户允许"页面中所用的图片可随便插入几个"）；每次加载洗牌顺序与源站 randomTiles 行为一致，故具体排列不完全等于某次源站截图。
5. **边缘材质（11.11 已定论并验收）**：v5 为最终版本——blur(40px) 磨砂渐变边缘 + Box 厚度 0.008，边缘色跟随原图，用户验收通过。

---

## 十、第二轮 UI 对齐与虚拟滚动（用户反馈"与源站有差异"后）

用户对照源站后发现 UI 差异，本轮逐项抓取源站真实 DOM 样式后对齐修复：

### 10.1 样式差异修复（实测源站 computed style）

| 项 | 源站实测值 | 修复前 | 修复后 |
|---|---|---|---|
| 导航字体 | 10.5px、uppercase、字重 400、字距 0.1575px | 15px、首字母大写、500 | ✅ 完全一致 |
| 导航形态 | 无边框、`pt-10 pb-[7px]`（顶部大留白） | 胶囊边框 | ✅ 无边框 + 顶部留白 |
| 导航激活态 | 非激活 span opacity 0.5、激活 1 | 边框区分 | ✅ opacity 区分 |
| OVERVIEW/INDEX | 纯文字 10.5px uppercase、无边框无内边距 | 2.5rem 高胶囊按钮 | ✅ 纯文字 |
| 首页联系信息 | 屏幕中央胶囊（contact/Instagram/地址），10.5px uppercase | 存在但 opacity:0 永不显示（**bug：缺少 `data-chrome` 属性，入场动画漏接**） | ✅ 修复显示 |
| Cookie/Privacy/Legal | fixed 底部左 0.875rem、10.5px uppercase、30% 黑 | 同定位、首字母大写 | ✅ 一致 |

### 10.2 字体对齐

从源站抓取 **NB International Pro** 字体（`fonts/nbinternationalproreg-webfont.woff2`，仅 21KB）自托管到 `public/fonts/`，`@font-face` + `font-display: swap`，正文与全部 UI 使用该字体，视觉与源站完全一致。

### 10.3 虚拟滚动（无滚动条）

**发现**：源站首页 `scrollHeight == innerHeight`，**没有任何滚动条**——面板轮播由"虚拟滚动"驱动（滚轮被 Lenis 拦截，页面本体不滚动）。我的初版用 600vh 真实滚动面，右侧有滚动条，属可见差异。

> **注**：本节为第二轮实现（Lenis + 600vh 滚动容器）。第三轮对齐时证实源站用的是 `virtualscroll` 库直接驱动（无滚动容器），已删除 Lenis 改为原生 wheel（见 11.2）。本节保留作排错记录。

**实现**（第二轮）：
- 页面 `body { overflow: hidden }`，彻底无滚动条；
- `#scroll-root`（100vh、overflow hidden）内放 600vh `scroll-spacer` 作为滚动内容；
- Lenis 配置 `wrapper: #scroll-root, content: .scroll-spacer`，滚轮事件从 canvas 冒泡到 scroll-root（**canvas 移入 scroll-root 内部**，否则 wheel 不在冒泡路径上），Lenis 驱动 `scroll-root.scrollTop`；
- `scroll-root.scrollTop` → Lenis `scroll` 事件 → `scene.scroll.current` → 面板公式照常工作；
- 路由切换 Index 页时 `lenis.stop()`（Index 表格自身内部滚动），返回首页 `lenis.start()`。

**排错记录**（本轮踩坑）：
1. `#scroll-root` 用 `height:100%` 时被内容撑开（clientHeight=600vh），无溢出不可滚 → 改 `height:100vh`；
2. 合成测试事件需派发到 canvas（真实滚轮路径），派发到 window 时 Lenis 收不到；
3. 面板位置应读 `mesh.parent.position`（tick 更新对象），`imageGroup.position` 是悬停滑出用——此前误读导致误判"面板不动"。

---

## 十一、第三轮对齐：170 张随机面板 + 虚拟滚动公式 + 斜向滚动 + Index UL/LI（用户反馈"斜向 vs 横轴 / 重叠高 / Index 滚动条"后）

用户对比源站后指出：Overview 应为斜向滚动、图片重叠过高、Index 页不应有滚动条。逐项溯源源站代码（node0.js）与数据后修复：

### 11.1 面板数据：全部 visuals + randomTiles（根因发现）

**从源站数据（index_raw.html 内嵌 DatoCMS 数据）确认**：
- 源站首页面板 = **全部 43 个项目的全部 170 个 visuals** 扁平列表（不是每项目 1 张缩略图）；
- `globalInformation.general.randomTiles: true` —— **每次加载随机洗牌**面板图（这就是不同时间打开源站，面板图都不同的原因）；
- 面板图是**随机的一组图**（蘑菇/月球/嘴唇/人眼等来自不同项目），与我的 12 张固定缩略图完全不同。

**实现**：`scripts/gen-data-tiles.cjs` 从 `_projects2.json` 生成 `src/data-tiles.ts`（170 项，含 title/slug/year/tags/desc/w/h/src），图片下载为 512px webp（`public/img/tiles/`，共约 4MB）；`scene.ts` 运行时 `shuffle()` 洗牌（还原 randomTiles 行为）。

### 11.2 滚动机制：源站 virtual-scroll 公式（移除 Lenis）

**从源站代码确认**：源站滚动用 `virtualscroll` 库，`scroll.current -= (virtualDeltaY + virtualDeltaX)/20`（标准 wheel 事件换算后即 `current += deltaY/20`），页面本体 `overflow:hidden` 无滚动面，每帧 `previous += (current-previous)*0.15` 缓动。

**实现**：删除 Lenis 与 600vh scroll-spacer，改在 `scene.ts` 直接监听 `window wheel`：`scroll.current += (e.deltaY + e.deltaX)/20`（**初版误写 +=，方向与源站相反，11.6 修正为 `-=`**；+ 方向键/空格 keydown，还原源站 virtual-scroll 键盘支持）。**每滚轮一格（deltaY=120）仅移动 0.09 单位**——细腻手感与源站一致（此前 Lenis 换算偏快 ~100 倍，滚动猛、横轴感强）。

### 11.3 斜向滚动（用户核心诉求，**此方案已被 11.7 推翻，保留作排错记录**）

源站面板 `rotation.y=-PI/6`（绕 y 轴斜 30°），静止时面板斜向排布。用户要求滚动时也沿斜向移动、停住保留斜向。第一版尝试：面板位置加 **y 分量**，令面板沿自身斜轴（对角线）排布与运动：

```ts
v.position.y = -v.position.x * Math.tan(Math.PI/6) * 0.65;
```

滚动时 x 变化 → y 同步变化 → 面板沿 30° 斜线流动。**但像素级对比源站视频后证实：源站 `v.position.y=0`，斜向观感完全来自相机俯视投影（见 11.10），滚动轴向是水平的**。此方案在 11.7 被删除，恢复源站公式。

### 11.4 Index 页：UL/LI 结构 + 无滚动条

**从源站 /index 实测**：
- 列表是 `ul.pb-quarter pt-half ... overflow-y-auto px-1 pt-[9rem]`，**行是 `<li class="mb-5 flex w-full">`**（不是 table！）；
- 行内 3 个 span：`w-1/4 pl-2.5 sm:w-[85px]`（年份）、`flex-shrink-0 pl-[12px] sm:w-[225px]`（项目名）、`hidden w-[100%] sm:flex`（分类，窄屏隐藏）；
- 字号 10.5px、行距 = li 高 13px + mb-5 20px = 33px（43 行 × 33 = 1419 = 源站 UL scrollHeight，实测吻合）；
- 列表容器 `overflow-y: auto` 但**视觉无滚动条**（用户诉求）。

**实现**：`#index-table` 改为 `<ul>`，行渲染为 `<li class="idx-row">` + 3 spans；样式对齐源站（10.5px、mb-5、sm 断点固定列宽、`pt-[9rem]`）；`.index-table { scrollbar-width: none } + ::-webkit-scrollbar { display:none }` 隐藏滚动条；页面本体 `overflow:hidden`（无页面滚动条）。

### 11.5 验证结果

- 首页：170 面板随机加载（进度条 → 入场）→ 滚轮细腻斜向滚动 → 悬停滑出 → 点击详情 → 路由往返，console 无错误；
- 滚动换算实测：`deltaY=120` → `Δx=0.09`/次，与源站公式一致；
- Index：43 行、UL 滚动容器（scrollbar-width:none）、页面无滚动条、行距/字号/列宽与源站一致。

### 11.6 滚动方向符号修复（用户反馈"打开对、滚动后方向变"）

用户对比发现：打开页面时（入场动画）方向正确，但一滚动方向就与源站相反。定位根因：

**源站**：`scroll.current -= (virtualDeltaY + virtualDeltaX) / 20` —— 滚轮向下（deltaY>0）→ current **减小** → J 减小 → `x = (i-J)*G` 增大 → **面板向右**移动。

**我**：误写为 `scroll.current += (deltaY+deltaX)/20` —— 向下滚 → current 增大 → **面板向左**移动，方向整体相反。入场动画由 `camPan.x:-20→0` 驱动（与滚动无关），所以"刚开始是对的"；一旦滚动，滚动驱动的位移方向与源站相反 → "小的滚动动画之后方向就变了"。

**修复**：`onWheel` 改 `scroll.current -= (e.deltaY + e.deltaX) / 20`；键盘方向键同步反转（下/右=面板向右、上/左=面板向左，与滚轮一致）。实测：`deltaY=+120 → Δx=+0.09`（面板向右）、`deltaY=-120 → Δx=-0.09`，幅度与源站公式完全一致。

### 11.7 轴向与入场动画对齐（用户逐帧对比两个网站视频后确认）

用户以源站视频（unveil.fr 录屏）与本地视频逐帧对比，指出两点：

**(1) 滚动轴向**：源站 `node0.js` 布局段原文 `v.position.y=0`（面板中心永远在同一水平线），斜向观感完全来自 `rotation.y=-π/6` + `z=-x·aspect·1.5` 的深度透视。我曾加 `y=-x·tan30°·0.65` 想让滚动"更斜"，结果把滚动轴向改成了 20° 斜线，与源站水平轴向完全不同——**删除 y 分量**，恢复源站公式。实测：`deltaY=+120 → Δx=+0.09, Δy=0`，轴向逐项与源站一致。

**(2) 入场动画**：源站同样执行 `camPan.x:-20→0`（2s expo.out）+ 相机 swoop `(0,13.33,35)→(0,0,30)`（1.25s），但该动画在 preloader（170 张图 CDN 加载，耗时数秒）期间就已进行，用户只能感知到收尾的**轻微滚动 + 相机缩放**。而我此前在 preloader 消失后才启动入场（本地图加载快），用户完整看到 7.5 单位的大幅横向滑移 → 误以为"初始化后轴向变了"。**修复**：`camPan` 初始从 `-20` 调至 `-2`（滑移仅 0.75 单位），动画时长 `2s → 0.8s`，相机 swoop 保留 → 入场表现为"小滚动 + 缩放"，面板轴向全程不变。

验证：入场时间线 4 帧面板位置稳定；滚轮方向/幅度、hover、详情、Index 43 行无滚动条全部回归通过，console 无错误。

### 11.9 玻璃/亚克力质感（边缘雾化 vs 玻璃板）

用户反馈"边缘雾化度太高，像图片做了虚化处理，源站像玻璃板"。逐行核对源站 fragment shader（`margin=0.15`、`blurTexture.a*=0.75`、`mix(image, blur, 1-progress.r)`）与我的 GLASS_FRAGMENT **完全一致**——差异不在 shader 代码，而在两处渲染细节：

1. **几何**：源站面板是 `BoxGeometry(H, W, 0.0175)`（带 0.0175 厚度的玻璃板，6 面共用 ShaderMaterial，侧面 uv 拉伸 → 玻璃侧边效果）；我此前用 `PlaneGeometry`（无厚度）→ 观感"一张被虚化的图片"而非"一块玻璃板"。**修复**：改用 `BoxGeometry(H, W, 0.0175, 1, 1, 1)`。
2. **模糊纹理质量**：源站每张视觉由 DatoCMS 提供**原图 + 高清模糊图**双纹理；我用运行时 canvas 模拟。此前 160px 画布 + `blur(18px)` 等效原图 512px 上 ~57px 的模糊量 → 边缘"雾化过度"。**修复**：模糊画布与原图同宽（512px）+ `blur(10px)` → 等效原图 10px 的轻量磨砂 → 玻璃边缘而非糊印。

修复后实测：面板呈现与源站一致的"半透明亚克力板叠加"质感（_glass_zoom_cmp.png 放大对比，两边面板边缘清晰度、文字可读性、叠层关系一致）。

### 11.10 相机俯视（斜向阶梯的最终根因）——像素级实测定位

用户再次反馈"横着的"。此前的公式核对（y=0、rotation.y、z、G/F、J、面板尺寸）全部一致，但**面板 y 分布实测**暴露出真正的差异：

| 状态 | 面板 y 峰值分布 | 跨度 |
| --- | --- | --- |
| 源站（滚动后） | 364 / 436 / 496 / 556 / 576 / 764 / 812 / 824 | ~460px |
| 我的（修复前，相机 y=0） | 424~556 集中一条水平带 | ~132px |
| 我的（修复后，相机俯视） | 312 / 396 / 428 / 604 / 752 / 772 / 788 / 824 | ~512px |

**根因**：源站相机是**俯视**的（`position.set(0, 100/7.5, 35)`，y≈13.33，lookAt 原点），面板虽 `y=0`，但投影公式 `y' = sinθ·z·f/(cosθ·z_cam−z)` 使面板的屏幕垂直位置随 z（= −x·aspect·1.5）变化 → 左低右高（或左高右低）的**斜向阶梯**，滚动时面板沿斜线运动（"斜轴向滚动"）。此前我照抄了 swoop 的 `y:0` 目标，把相机拉成平视 → 所有面板投影到同一水平线（"横着的"）。

**修复**：相机 swoop 只做 z 缩放（35→30），**y 保持 100/7.5 俯视**。实测 y 分布跨度 512px ≈ 源站 460px，斜向阶梯达成。滚动方向/幅度、hover、详情、Index 回归全部通过。

### 11.11 面板尺寸与边缘材质迭代（用户反馈"偏大 + 磨砂黑/镜面"）

用户逐项对照后提出两轮修改，均为"与源站观感对齐"的微调：

**(1) 面板整体缩小 1/5**：`W/H` 基准从 `1.5` 改为 `1.5×0.8`（`W=1.5·be·fe·0.8`、`H=1.5·fe·0.8`）；`A.position.x=-(H-1.5)/2` 的对齐公式不变（面板右边缘仍对齐组中心 +0.75）。

**(2) 边缘材质三连改（此处的错误教训）**：

| 版本 | 实现 | 用户反馈 |
|---|---|---|
| v1 | `PlaneGeometry` + 160px blur(18px) 彩色模糊 | "像图片做了虚化处理，不是玻璃板" → 11.9 修复为 BoxGeometry + 512px blur(10px) |
| v2 | BoxGeometry 4 侧面磨砂黑（0x141414）+ blur 全局 `brightness(0.5) saturate(0.45)` | "全磨砂黑，浅色主体也黑，丑" |
| v3 | 4 侧面磨砂黑保留；blur 纹理**纯模糊不再变暗去饱和** | "还是不磨砂黑" |
| v4 | **移除 4 侧面磨砂黑**，BoxGeometry 6 面全部使用玻璃 ShaderMaterial（与源站 `A=new rn(q,D)` 单材质完全一致）；blur 纹理纯 `blur(10px)` 跟随原图 | "边缘变透镜感/有锯齿" |
| v5（最终验收） | blur 提升至 **`blur(40px)`**（512px 原图上明显磨砂渐变边缘）；Box 厚度 **0.0175 → 0.008**（消除俯视下侧面薄片投影的锯齿细线） | **用户验收通过** |

**v2→v3 的教训**：把"源站深色图边缘看起来黑"误当作"所有边缘都该黑"，给 blur 纹理加了全局 `brightness(0.5) saturate(0.45)`，结果浅色内容的面板边缘也被压黑。源站模糊纹理就是原图的模糊（颜色忠实），深色视觉多所以观感偏黑。修复：删除全局变暗/去饱和，仅保留 `blur(10px)`。

**v3→v4 的根因（最终定论）**：用户反馈"还是不磨砂黑"后，重查源站材质创建段，铁证 `A=new rn(q,D)`——**BoxGeometry 与单个 ShaderMaterial 绑定，6 个面全部渲染玻璃 shader，不存在磨砂黑侧面**。我此前为"还原玻璃厚度"主观加了 4 个 `0x141414` 侧面材质，俯视相机（y=13.33）把 0.0175 厚度投影成屏幕上一圈 2~4px 黑色描边 → **每块面板都有一圈黑**，浅色图也黑。修复：移除侧面材质数组，`BoxGeometry` + 单 ShaderMaterial（6 面同材质），边缘颜色 100% 由 shader 的 `mix(image, blur)` 决定，深色图自然磨砂黑、浅色图自然浅色。

**v4→v5（验收通过）**：v4 后用户反馈"边框镜面感太强、有锯齿"——blur(10px) 太轻，边缘区 mix 后仍锐利像透镜/镜片边缘。修复两处：① blur 半径 **10px → 40px**（512px 原图上，屏幕投影约 47px 磨砂渐变，边缘明显雾化）；② Box 厚度 **0.0175 → 0.008**（0.0175 的薄片侧面在俯视投影下光栅化成 2~4px 锯齿细线，减半后不可见）。最终**用户验收通过**（并已删除全部迭代诊断中间产物，工程保持干净）。

---

## 十二、完整排错与修复实录（按用户反馈时间线）

> 本节汇总本项目全部"用户反馈 → 根因 → 修复"，是 6.x/10.x/11.x 各节排错记录的合并与补全。

| # | 用户反馈/症状 | 根因 | 修复 |
|---|---|---|---|
| 1 | 滚动后玻璃板全部消失 | GSAP `utils.wrap` 参数写成 `(value,min,max)`，实际签名 `(min,max,value)`，wrap 恒返回 -F，面板塌缩到视野外 | 对照 node0.js 修正参数顺序 |
| 2 | 悬停只出标签、面板不滑出 | `setHover()` 定义了但无人调用 | hover 变更处补 `tile.setHover(true/false)` |
| 3 | 合成事件 pointerdown 报错 | `e.target.closest` 在非 Element 上抛异常 | 加 `typeof closest==="function"` 守卫 |
| 4 | 与源站 UI 差异大 | 导航/按钮/联系栏样式凭印象写，非源站实测值 | 抓取源站 computed style 逐项对齐（10.1 表） |
| 5 | 首页联系信息永不显示 | DOM 缺 `data-chrome` 属性，入场动画漏接 | 补属性，接入入场淡入 |
| 6 | 首页出现滚动条（源站无） | 用 600vh 真实滚动面 | 改 body `overflow:hidden` + 虚拟滚动 |
| 7 | Overview 是横轴滚动（源站斜向） | 只有 12 张缩略图 + 面板挤一排 | 170 visuals 全量 + randomTiles 洗牌（11.1） |
| 8 | 图片重叠过高影响观感 | 面板尺寸/间距比例不对 | 按源站 be/fe 公式重算尺寸 |
| 9 | Index 页有滚动条 | 表格用 table + 页面可滚动 | 改 UL/LI + 容器 `scrollbar-width:none` + 页面 `overflow:hidden` |
| 10 | 滚动方向与源站相反（"打开对、滚动后变"） | 误写 `+=`，源站是 `current -= (deltaY+deltaX)/20` | 改减号，键盘同步反转（11.6） |
| 11 | 我加了 y 分量想让滚动更斜，轴向变成 20° 斜线 | 源站 `v.position.y=0`（源码原文），斜向观感来自相机俯视投影 | 删除 y 分量（11.7） |
| 12 | 入场"小滚动动画后轴向变了" | camPan 初始 -20（源站完整动画在 preloader 期间完成，用户只见收尾）；我入场太晚幅度太大 | camPan -20→-2、时长 2s→0.8s（11.7） |
| 13 | "横着的"（面板全在一水平线） | 相机 swoop 抄了 `y:0` 平视目标；源站相机保持俯视（y=13.33），面板屏幕 y 随 z 错落形成斜向阶梯 | swoop 只动 z，y 保持 100/7.5；像素级 y 分布验证（11.10） |
| 14 | 边缘像"虚化图片"不是玻璃板 | 平面几何无厚度 + 160px 模糊等效 57px 过度雾化 | BoxGeometry(0.0175) + 512px blur(10px)（11.9） |
| 15 | 全磨砂黑，浅色图也黑 | 误加 blur 全局 `brightness(0.5) saturate(0.45)` | 删除变暗/去饱和，边缘色跟随原图（11.11） |
| 16 | 服务器频繁被系统回收（"服务器都挂了"） | `pnpm preview` 进程在完全访问模式下被回收 | 零依赖 `serve.cjs` 静态服务器 + `Cache-Control:no-cache`，Start-Process 后台常驻，交付前复检可达 |
| 17 | 加载慢 | 双次加载图片、PNG 700KB+、160px blur 阻塞、单 bundle 564KB、无进度反馈 | webp 化、单次加载、轻量 blur、manualChunks 拆分、预加载器、懒加载 Index 图（第六章） |
| 18 | 每块面板边缘一圈黑（"还是不磨砂黑"） | 我主观加了 4 个磨砂黑侧面材质；源站 `A=new rn(q,D)` 单材质，Box 6 面全玻璃 shader，俯视下侧面投影成黑描边 | 移除侧面材质数组，Box + 单 ShaderMaterial（11.11 v4） |
| 19 | 端口冲突（用户其他项目占用） | 预览端口固定 4173 | 改为 4174，文档同步（第八章） |
| 20 | 边框镜面感太强、有锯齿 | blur(10px) 太轻，边缘 mix 后锐利如透镜；Box 0.0175 薄片侧面俯视投影成锯齿细线 | blur 提至 40px + 厚度减半 0.008（11.11 v5，用户验收通过） |
| 21 | 每次刷新预加载器卡数秒（二次访问慢） | serve.cjs 对所有资源设 `no-cache`，170 张图每次全量重下（~4MB） | 图片/字体 `public,max-age=604800,immutable`，HTML/JS 保持 no-cache（第六章 6.2 补） |

**通用教训**（本项目沉淀）：
1. **参数签名与符号必须对照源码原文**，不能凭记忆（#1、#10）；
2. **视觉差异要像素级实测定位**（y 分布直方图、滚动增量、computed style），不要凭观感猜（#13、#15）；
3. **动画时序要考虑"加载期已消耗的时间"**——源站动画与 preloader 并行，本地资源快时要主动压缩幅度（#12）；
4. **交付前必须自查截图并与源站逐像素对比**，不能只交付不验证（#15 后用户明确批评"截完图自己不对比吗"）；
5. **服务器等基础设施要选可常驻方案**并交付前复检（#16）。
