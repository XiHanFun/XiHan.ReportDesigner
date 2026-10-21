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

## 开始前必须做

1. 按任务读取对应技能（`.agents/skills/<目录>/SKILL.md`），同时涉及几项就加载几项，不读取无关资料：

   | 目录 | 用途 |
   | --- | --- |
   | `designer-development` | 报表定义、查看器与设计器元素、扩展点（含导入器）、语言包与界面 |
   | `compute` | 数据集、参数、取数请求、计算与透视、导出 |
   | `docs-site` | 文档站的页面、示例、参考页、导航与 LLMs 资产 |
   | `commit-msg` | 按暂存区生成提交信息 |
   | `create-pr` | 准备或创建 Pull Request |
   | `changelog-collect` | 收集版本间的变化，核对变更集与更新日志页 |
   | `issue-reply` | 调查、起草与回复 Issue |
   | `test-review` | 审查测试的价值、重复与脆弱点 |
   | `version-release` | 定版本、续 rc、打标签发 npm、发后核对与部署文档站 |

2. 检查当前分支、`git status` 与最近提交；保留用户已有改动。

## 目录结构

```text
/
├─ AGENTS.md
├─ CLAUDE.md -> AGENTS.md         # Claude Code 仓库指令入口
├─ .agents/skills/                # 仓库技能：开发、计算、文档站与提交发版流程
├─ .claude/skills -> ../.agents/skills  # Claude Code 技能入口
├─ .github/ .gitee/ .gitcode/     # 三平台 Issue / PR 模板，GitHub 另有 CI 与发版工作流
├─ docs/                          # 产品文档站（VitePress，独立的 pnpm 项目）
└─ report/                           # pnpm monorepo 根
   ├─ .changeset/                 # changesets 配置与待发布的变更集
   ├─ scripts/release/            # 发版脚本：VersionUpgrade、锁步与标签核对、产物契约、冒烟（smoke/ 是冒烟用的宿主项目模板）
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
| 产物契约（publint + attw，先 build） | `pnpm gate:publish` |
| 冒烟（在临时空项目里装包、类型检查与打包） | `pnpm smoke --pack`（要拿同级 XiHan.UI 的源码代替 npm 上的 UI 时加 `--ui ../../XiHan.UI/ui`） |
| 写变更集 | `pnpm changeset` |

`pnpm build` 按依赖拓扑依次构建 core、runtime、designer。runtime 与 designer 经包的 `exports` 读取上游 dist，改了上游先重建再验证下游。

开发预览页在 `report/playground`，用 Vite 起在 5193 端口（strictPort）：「明细表」「分组报表」「交叉表」「看板」四个页签各放一份示例报表，数据是按固定种子生成的一年销售订单；看板里环形图、条形图、日历热力图与「商品与渠道」表格卡片都能点选联动；工具栏可刷新、导出 xlsx，开关切换中文语言包，以及让取数回调返回明细行或模拟后端按请求聚合；下方滚动显示查看器派发的事件，点表格的一格可以看到下钻用的 action。「设计器」页签用 `<xh-report-designer>` 打开同一组示例报表（缺省看板，页签内可切换），事件记录同时显示设计器派发的 schema-change、selection-change 等事件，Ctrl+S 记为已保存。
它直接引用各包的源码，改了源码即时生效，不必先 `pnpm build`；`@xihan-ui/*` 是 npm 上的正式包，装好依赖即可启动：`pnpm dev`。

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

- 报表三个包经 `link:` 读 `report/packages/*` 的产物，先在 `report/` 构建；`@xihan-ui/*` 是 npm 上的正式包。link 进来的包会从 `report/` 工作区再解析出一份 UI，页面上两份 UI 时全局配置（语言包）与元素注册表各管各的，所以 `.vitepress/config.ts` 用 `vite.resolve.dedupe` 把它们去重成文档站这一份；报表包对 UI 新加了 peer 时，同步加进 `docs/package.json` 与那份名单。
- `docs/reference/` 由 `scripts/gen-reference.mjs` 从源码生成（TypeScript 源码注释、属性描述、`reportZhCN` 的中文名与问题说明），不手改。改了报表定义类型、属性、问题码、公开 API 或这些注释，在 `docs/` 跑 `pnpm gen` 并随改动一起提交；参考页的说明不对，就改源码注释。
- 正文里的 TypeScript 与 Vue 示例都放在 `examples/`，用 `<<< @/examples/…#片段` 引入，不在 Markdown 里另写一份：`reports/` 下导出 `schema` 与 `rows` 的报表由 `check:examples` 校验并在 Node 里试算，`demos/` 下的 `.ts` 导出 `mount(host)`、`.vue` 是一个组件，页面上写 `<ReportDemo name="…" />` 真实运行，`snippets/` 只做类型检查。
- 正文里含 `{{` 的行内代码写成 `<code v-pre>…</code>`，否则会被 Vue 当成插值吃掉，构建也不报错。
- 站点自己的导航、侧栏与示例组件放在 `docs/.vitepress/`，不复制或改写主题已提供的样式。
- 文档只写已经做完的能力；不写卡片种类数、图表数与依赖的具体版本号，不写预发布阶段的铺垫。
- 站点地址是 https://report.docs.xihanfun.com：`docs/public/CNAME`、`docs/public/.nojekyll` 与 `.github/workflows/deploy-docs.yml`（main 上 `docs/` 或 `report/` 有变更时先装好并构建 `report/`，再构建文档站，部署到 gh-pages）属于站点契约，不因清理构建配置而删除；主题配置的 `llms.site` 与 `docs/package.json` 的 `homepage` 写同一个地址。

## 分层与依赖

- 依赖方向固定为 `designer → runtime → core`，不得反向引用。
- core 只做模型：schema 类型、校验、编辑命令与算法。tsconfig 不含 DOM 类型库，不得触碰 DOM。
- runtime 是业务页面使用的元素，体积敏感；设计器专用的代码不进 runtime。
- 所有包源码不得 import 任何前端框架（ESLint 已拦截）。
- 运行时依赖只允许 `@xihan-report/*` 与 `@xihan-ui/*`；引入任何其他依赖之前先征得维护者同意。
- 三个公开包对 `@xihan-ui/*` 写 `peerDependencies`（`^5.0.0`，由宿主装唯一的一份），开发时另写一份 `devDependencies`（`catalog:`）；版本范围只在 `report/pnpm-workspace.yaml` 的 catalog 里改。UI 新加的能力要等 UI 发版才用得上。

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

## 发版

做法照 XiHan.UI：changesets 记变更，main 上的 `v<版本>` 标签触发 `.github/workflows/release.yml` 发 npm。说明见 `report/.changeset/README.md`。

- 三个公开包经 changesets 的 `fixed` 组锁步同版；`scripts/release/check-version-lock.mjs` 核对。
- 使用者能感知的改动附一份变更集（`pnpm changeset`），中文、官方口径；CI、测试、文档站、脚本、README 不写。
- 定版本用 `report/scripts/release/VersionUpgrade.bat`（或 `pwsh scripts/release/VersionUpgrade.ps1`）：消费变更集、写各包 CHANGELOG，可进出预发布通道；不提交、不打标签、不推送，`-DryRun` 只打印计划。同一笔在文档站「更新日志」页（`docs/changelog.md`）补这一版的一节，导航上的版本号取 core 的版本，不用改。
- 发一个版本的步骤：
  1. 在 `report/` 跑 VersionUpgrade，选发布通道与升级级别；看一遍三个包的 `package.json`、`CHANGELOG.md` 与 `.changeset/` 的改动。
  2. 在 `docs/changelog.md` 补这一版的一节，日期写计划发布的那天；发布推迟了另起一笔改日期。
  3. `report/` 跑 `pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm test`、`pnpm gate:publish`、`pnpm smoke --pack`，`docs/` 跑文档站门禁，再跑 `git diff --check`；全过再提交 `build: v<版本>`。
  4. 推 dev，等 dev 上的 CI 全绿。
  5. main 从 dev 快进（`git fetch . dev:main`，不是快进就停下查），推 main，等 main 上的 CI 全绿。
  6. 在版本提交上打 `v<版本>` 标签并推送，Release 发包、冒烟、部署文档站；发完用 `npm view @xihan-report/designer dist-tags` 核对。
- release.yml 先核对标签（在 main 的历史里；标签号等于包版本且与 `.changeset/pre.json` 一致，`check-release-tag.mjs`），再构建、`gate:publish`、`changeset publish`（带 provenance），然后 `scripts/release/smoke.mjs --version` 冒烟，最后调 `deploy-docs.yml` 部署文档站。deploy-docs 只部署已经发布的版本：当前版本有标签、main 上的包与标签一致、这个版本已在 npm 上。
- npm 包的版本不建 GitHub Release。
- main 只接收发版；两次发版之间挑进 main 的纯文档修正，进了 main 以后立刻把 main 合回 dev。
- 合并 main、打标签、发布都只在用户明确要求时执行。

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
