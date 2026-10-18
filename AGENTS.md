# AGENTS.md

本文件约束在 XiHan.ReportDesigner 仓库内工作的 AI Agent。回答和提交说明使用中文；代码标识、公开 API 与标准术语保持英文。

## 仓库概览

XiHan.ReportDesigner 是框架无关的报表设计器，以原生 Web Components 交付，任何前端项目都能使用。本仓库是开源版（MIT），必须能独立安装、构建和使用，不接收依赖私有包的代码。

### 技术栈

| 技术 | 要求 | 用途 |
| --- | --- | --- |
| Node.js | 24+ | 脚本、构建与测试 |
| pnpm | 11+ | 工作区包管理 |
| TypeScript | 6.x | 类型与源码 |
| tsdown | 0.22 | 库打包（ESM only） |
| Vitest | 4.x | 单元测试 |
| Web Components | Light DOM | 对外交付形态 |
| ESLint + oxlint | @antfu/eslint-config | Lint |

## 目录结构

```text
/
├─ AGENTS.md
├─ CLAUDE.md -> AGENTS.md         # Claude Code 仓库指令入口
├─ .github/ .gitee/ .gitcode/     # 三平台 Issue / PR 模板，GitHub 另有 CI
├─ docs/                          # 产品文档站（VitePress，独立的 pnpm 项目）
└─ report/                           # pnpm monorepo 根
   ├─ packages/
   │  ├─ core/                    # @xihan-report/core：模型层，纯 TS，不碰 DOM
   │  ├─ runtime/                 # @xihan-report/runtime：业务页面用的运行时元素；./xlsx 子入口把报表排成 @xihan-ui/xlsx 的工作表，./design 子入口给设计器画布复用计算与渲染
   │  └─ designer/                # @xihan-report/designer：设计器元素
   └─ playground/                 # @xihan-report/playground：开发预览页（private，不发布）
```

仓库根没有 package.json，库命令在 `report/` 执行，文档站命令在 `docs/` 执行。

## 常用命令（`report/`）

| 任务 | 命令 |
| --- | --- |
| 安装 | `pnpm install --frozen-lockfile` |
| 开发预览 | `pnpm dev`（http://localhost:5193） |
| 构建 | `pnpm build` |
| 类型检查 | `pnpm typecheck` |
| 单测 | `pnpm test` |
| Lint | `pnpm lint` |

`pnpm build` 按依赖拓扑依次构建 core、runtime、designer。runtime 与 designer 经包的 `exports` 读取上游 dist，改了上游先重建再验证下游。

开发预览页在 `report/playground`，用 Vite 起在 5193 端口（strictPort）：「明细表」「分组报表」「交叉表」「看板」四个页签各放一份示例报表，数据是按固定种子生成的一年销售订单；看板里环形图、条形图、日历热力图与「商品与渠道」表格卡片都能点选联动；工具栏可刷新、导出 xlsx，开关切换中文语言包，以及让取数回调返回明细行或模拟后端按请求聚合；下方滚动显示查看器派发的事件，点表格的一格可以看到下钻用的 action。「设计器」页签用 `<xh-report-designer>` 打开同一组示例报表（缺省看板，页签内可切换），事件记录同时显示设计器派发的 schema-change、selection-change 等事件，Ctrl+S 记为已保存。
它直接引用各包的源码，改了源码即时生效，不必先 `pnpm build`；`@xihan-ui/*` 经 overrides 读同级 XiHan.UI 的产物，启动前先在 `XiHan.UI/ui` 构建依赖的包：

```bash
# XiHan.UI/ui
pnpm --filter "@xihan-ui/web-components..." --filter "@xihan-ui/viz..." --filter "@xihan-ui/designer-shell..." --filter "@xihan-ui/expression..." --filter "@xihan-ui/xlsx..." --filter "@xihan-ui/styles..." build
# XiHan.ReportDesigner/report
pnpm dev
```

这是开发预览，不是产品：页面只用 UI 的令牌、皮肤与元素，不另写一套样式，也不进任何发布物。

## 文档站（`docs/`）

产品文档站用 VitePress 加组织统一主题 `@xihanfun/vitepress-theme`，做法与打印、表单两站一致。

| 任务 | 命令（在 `docs/`） |
| --- | --- |
| 安装 | `pnpm install --frozen-lockfile` |
| 开发 | `pnpm dev` |
| 构建 | `pnpm build`（站内死链会让构建失败） |
| 重新生成参考页 | `pnpm gen`；`pnpm gate:gen` 只比对、不写文件 |
| 示例类型检查 | `pnpm typecheck` |
| 示例报表校验并试算 | `pnpm check:examples` |
| Lint | `pnpm lint` |

- 报表三个包经 `link:` 读 `report/packages/*` 的产物，先在 `report/` 构建；`@xihan-ui/*` 与 `report/` 工作区一样经 overrides 读同级 XiHan.UI 的产物，UI 5.0.0 正式发布后删掉那一段。
- `docs/reference/` 由 `scripts/gen-reference.mjs` 从源码生成（TypeScript 源码注释、属性描述、`reportZhCN` 的中文名与问题说明），不手改。改了报表定义类型、属性、问题码、公开 API 或这些注释，在 `docs/` 跑 `pnpm gen` 并随改动一起提交；参考页的说明不对，就改源码注释。
- 正文里的 TypeScript 与 Vue 示例都放在 `examples/`，用 `<<< @/examples/…#片段` 引入，不在 Markdown 里另写一份：`reports/` 下导出 `schema` 与 `rows` 的报表由 `check:examples` 校验并在 Node 里试算，`demos/` 下的 `.ts` 导出 `mount(host)`、`.vue` 是一个组件，页面上写 `<ReportDemo name="…" />` 真实运行，`snippets/` 只做类型检查。
- 正文里含 `{{` 的行内代码写成 `<code v-pre>…</code>`，否则会被 Vue 当成插值吃掉，构建也不报错。
- 站点自己的导航、侧栏与示例组件放在 `docs/.vitepress/`，不复制或改写主题已提供的样式。
- 文档只写已经做完的能力；不写卡片种类数、图表数与依赖的具体版本号，不写预发布阶段的铺垫。
- 站点地址是 https://report.docs.xihanfun.com：`docs/public/CNAME`、`docs/public/.nojekyll` 与 `.github/workflows/deploy-docs.yml`（main 上 `docs/` 或 `report/` 有变更时先装好并构建 `report/`，再构建文档站，部署到 gh-pages）属于站点契约，不因清理构建配置而删除；主题配置的 `llms.site` 与 `docs/package.json` 的 `homepage` 写同一个地址。`report/` 的 overrides 生效期间这条流水线跑不通，与不推送远端的约定一致。

## 分层与依赖

- 依赖方向固定为 `designer → runtime → core`，不得反向引用。
- core 只做模型：schema 类型、校验、编辑命令与算法。tsconfig 不含 DOM 类型库，不得触碰 DOM。
- runtime 是业务页面使用的元素，体积敏感；设计器专用的代码不进 runtime。
- 所有包源码不得 import 任何前端框架（ESLint 已拦截）。
- 运行时依赖只允许 `@xihan-report/*` 与 `@xihan-ui/*`；引入任何其他依赖之前先征得维护者同意。

## 硬性约定

- **模板即数据**：模板是纯 JSON，禁止 `eval`、`new Function`、动态插入脚本和把用户内容拼进 `innerHTML`。需要计算的地方用受限的表达式解析，不执行字符串代码。
- **无全局状态**：不往 `window` 上挂对象，不读写固定键名的 localStorage，不在模块顶层产生副作用；同一页面放多个实例互不影响。
- **数据由使用方提供**：组件不发网络请求，数据、存储与权限都经回调或属性交给使用方。
- **对外契约**：复杂数据走 property 不走 attribute；事件用 `CustomEvent`；公开方法、事件和属性都要有类型声明。
- **命名（四款设计器统一）**：元素名一律 `xh-report-*`，查看器是 `<xh-report-viewer>`；报表定义的属性叫 `schema`，表达式引擎叫 `expressionEngine`（core 的计算与校验选项同名），格式化叫 `formatter`；事件名照 XiHan.UI 的写法，不带前缀、用短横线，如 `value-change`。内建文案按产品出语言包，语言与 UI 的内建语言包一一对应，导出名是 `report` 加 UI 语言包的名字（`reportZhCN`、`reportJaJP`……），每份并入 designer-shell 同一语言的那份；宿主用 `mergeXhConfig` 与 UI 同一语言的语言包合并，类型经 `XhTranslationOverrides` 的模块扩充补进去。语言包在 `runtime/src/locale/`，一种语言一个文件，按 `ReportLocale` 声明，对照表的键与英文表同一组，问题说明按内建问题码各写一条，少键、多键都是类型错误。
- **样式**：Light DOM，样式只消费 `@xihan-ui` 设计令牌，不写颜色、间距、圆角等散值。
- **注释**：只写代码做什么，不写为什么这样设计、也不写任何参考项目名称；设计理由写进提交说明。
- **源码文件头**：

```ts
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */
```

## 分支与 worktree

- 主检出上的日常改动直接提交到 `dev`；`main` 只接收发版。
- 开 worktree 时分支按用途分组：`feat/<名>`、`fix/<名>`、`issue/<编号>`、`pr/<编号>-review`；工具生成的 `claude/<名>` 等分支在首次提交前改名。
- worktree 分支的合并、推送、PR 以及删除，只在用户明确要求时执行。

## Git 与提交

- 保留用户已有和无关改动；不要 reset、checkout 或清理它们。
- 使用 Conventional Commits：`<type>(<scope>): <中文说明>`，scope 取 `core`、`runtime`、`designer`、`docs`、`repo`。
- 一项完整功能一个提交；改 `report/` 的提交前跑 `pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm test`，改 `docs/` 的在 `docs/` 跑 `pnpm gate:gen`、`pnpm check:examples`、`pnpm lint`、`pnpm typecheck`、`pnpm build`，都要过 `git diff --check`。
- 不推送、不发布、不创建远程 PR，除非用户明确要求。

## 禁止事项

- 不凭记忆猜 `@xihan-ui` 的 API、部件、事件或令牌，先查 XiHan.UI 源码或文档。
- 不复制其他项目的源码；参考他人设计只学思路。
- 不添加静默兜底和推测性兼容。
- 不通过放宽 Lint 或类型检查掩盖实现问题。
