---
name: xihan-report-designer-development
description: 在 XiHan.ReportDesigner 里开发或修改报表定义结构、查看器与设计器元素、卡片与视图种类、扩展点（含导入器）、语言包或界面时使用。适用于“加一种卡片”“改报表定义”“设计器加命令 / 面板 / 属性编辑器”“扩展点”“导入器”“查看器渲染”“语言包”；取数、计算、透视与导出见 xihan-report-compute，文档站见 xihan-report-docs-site。
---

# XiHan.ReportDesigner 设计器开发

## 先定落在哪一层

依赖方向固定为 designer → runtime → core。core 不碰 DOM；runtime 是业务页面用的，体积敏感，设计器专用的代码不进 runtime。

| 改动 | 位置（`report/packages/`） |
| --- | --- |
| 报表定义类型、校验与问题码、编辑操作、增删改的 plan、种类登记与扩展合并 | `core/src/{schema,validate,operations}`、`core/src/*-plans.ts`、`core/src/extensions.ts` |
| 取数请求与计算 | `core/src/engine`，见 `xihan-report-compute` |
| `<xh-report-viewer>`：表格、分组、交叉表、看板与图表渲染，参数栏，导出，语言包 | `runtime/src/viewer`、`runtime/src/xlsx*`、`runtime/src/locale` |
| 设计器画布复用的计算与渲染 | `runtime/src/design.ts`（子入口 `@xihan-report/runtime/design`） |
| `<xh-report-designer>`：菜单栏、工具栏、命令、面板、字段栏、属性编辑器、物料、引导、设置 | `designer/src` |

拿不准落点时先看相邻的同类能力放在哪，照着放。

## 报表定义

- 顶层是 `ReportDocument`：`schemaVersion`、`id`、`parameters`、`datasets`、`body`；`body` 是明细表、分组报表、交叉表、看板或扩展视图，看板里放卡片。类型在 `core/src/schema`。
- 定义是纯 JSON：不放函数、脚本与运行时对象；数据集只描述字段，不含数据。
- 加字段或种类的顺序：类型 → `validate` 的规则与问题码 → 每种语言的问题说明 → 编辑操作与 plan → 查看器渲染 → 设计器的属性与面板。
- 改变已有字段含义的，按 `report/.changeset/README.md` 定级别：旧模板读不进来为 major，结构升版本但带自动迁移为 minor。不加静默兼容。

## 扩展点

扩展按实例经元素的 `extensions` 属性传入，不改包内源码，也没有全局注册。

- core 层 `ReportCoreExtension`：卡片与视图种类（`cards`、`views`）、属性描述、校验规则与问题文案。
- runtime 层 `ReportRuntimeExtension`：卡片与视图渲染、叠加层、导出器（`exporters`）、取数中间件（`dataProvider`）。
- designer 层 `ReportDesignerExtension`：在设计器外壳的扩展之上加物料（`palette`、`paletteGroups`）与导入器（`importers`），以及命令、面板、属性编辑器、物料来源、菜单栏菜单与设置分区。
- 合并时查重，冲突就退回原值再抛错。新加扩展点要同时给类型、合并规则、用例与文档示例。
- 导入器：扩展点开源，「导入模板」命令只在登记了导入器时出现。把其他产品的报表模板转成本报表定义的现成导入器归企业版（`@xihan-report-pro/*` 附加包），不进本仓；开源版不削弱、不加升级提示。

## 复用 XiHan.UI

- 外壳与零件用 `@xihan-ui/designer-shell`（菜单栏、工具栏、面板、设置对话框、引导、自动保存、调试日志）与 `@xihan-ui/designer-kit`，图标用 `@xihan-ui/icons`。
- 图表用 `@xihan-ui/viz`，明细值的聚合也用它的累加器；Excel 用 `@xihan-ui/xlsx`；计算字段与公式度量用 `@xihan-ui/expression`，由宿主经 `expressionEngine` 注入。
- UI 已有的一律直接用；常用能力哪怕眼下只有报表用到，也该进 UI。UI 缺能力或有缺陷时报给维护者在 UI 仓修，不在本仓另写或局部修补；UI 的新能力要等 UI 发版、catalog 升了才能用。
- 不凭记忆写 UI 的 API、部件、事件或令牌，先查 XiHan.UI 源码或 https://ui.docs.xihanfun.com 。
- Light DOM，样式只用 UI 令牌，不写颜色、间距、圆角散值。

## 语言包

- 查看器文案在 `runtime/src/translations.ts`，设计器文案在 `runtime/src/designer-translations.ts`；各语言在 `runtime/src/locale/`，一种语言一个文件，按 `ReportLocale` 声明。
- 加键时每种语言都要写，少键、多键都是类型错误；新问题码在每种语言里各写一条说明。

## 做法与门禁

1. 先写会失败的用例，再实现：core 跑在 Node 里，runtime、designer 要 DOM 的用 jsdom。
2. 在 `report/` 跑 `pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm test`。runtime 与 designer 经 `exports` 读上游 dist，改了上游先 `pnpm build` 再测下游。
3. 界面改动在 `pnpm dev`（http://localhost:5193）的真实浏览器里看一遍；jsdom 证明不了布局与绘制。
4. 改了 `exports`、产物或 peer 依赖时加跑 `pnpm gate:publish` 与 `pnpm smoke --pack`；给 UI 加了新的 peer 时，同步 `docs/package.json` 与文档站 `vite.resolve.dedupe` 的名单。
5. 改了公开 API、属性、问题码或它们的注释，在 `docs/` 跑 `pnpm gen` 并随这一笔提交；使用者能感知的改动附变更集。
6. 跑 `git diff --check`；一项完整功能一个提交。

## 硬性约定（全文见 AGENTS.md）

- 模板即数据：不用 `eval`、`new Function`、动态脚本，不把用户内容拼进 `innerHTML`。
- 无全局状态：不往 `window` 挂对象，不读写固定键名的 localStorage（自动保存只用宿主给的 `draftKey`），同页多个实例互不影响。
- 组件不发网络请求；数据、存储与权限都交给宿主。
- 复杂数据走 property；事件用 `CustomEvent`，短横线命名、不带前缀；公开面都有类型声明。
- 运行时依赖只允许 `@xihan-report/*` 与 `@xihan-ui/*`。
- 注释只写代码做什么；源码文件带版权头。
