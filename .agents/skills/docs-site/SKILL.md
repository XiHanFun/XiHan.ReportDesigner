---
name: xihan-report-docs-site
description: 修改 XiHan.ReportDesigner 文档站（docs/）的页面、示例、参考页、导航侧栏、LLMs 机读资产或站点配置时使用。适用于“写文档”“加示例 / 演示”“参考页不对”“重新生成参考页”“llms.txt”“导航 / 侧栏”“文档站构建失败”；文档站的发布部署见 xihan-report-version-release。
---

# XiHan.ReportDesigner 文档站

`docs/` 是独立的 pnpm 项目：VitePress 加组织主题 `@xihanfun/vitepress-theme`（npm 正式包），站点地址 https://report.docs.xihanfun.com 。命令都在 `docs/` 里跑。

## 先备好

- 报表三个包经 `link:` 读 `report/packages/*` 的产物：先在 `report/` 跑 `pnpm build`，改了包源码要重建后文档站才看得到。
- `@xihan-ui/*` 是 npm 正式包。link 进来的包会从 `report/` 再解析出一份 UI，所以 `.vitepress/config.ts` 用 `vite.resolve.dedupe` 去重；报表包对 UI 新加了 peer 时，同步加进 `docs/package.json` 与那份名单，否则页面上两份 UI，语言包与元素注册表各管各的。
- 本地看效果用 `pnpm dev`，在真实浏览器里点一遍演示。

## 参考页

- `docs/reference/` 由 `scripts/gen-reference.mjs` 从源码生成：TypeScript 注释、属性描述、`reportZhCN` 的中文名与问题说明。不手改。
- 改了报表定义类型、属性、问题码、公开 API 或这些注释，跑 `pnpm gen` 并随源码同一笔提交；`pnpm gate:gen` 只比对、不写文件。参考页说明不对就改源码注释。

## 示例

正文里的 TypeScript 与 Vue 代码都放在 `examples/`，用 `<<< @/examples/…#片段` 引入，不在 Markdown 里另写一份。

| 目录 | 写法 | 检查 |
| --- | --- | --- |
| `reports/` | 导出 `schema` 与 `rows`（用到扩展卡片的另导出 `extensions`） | `pnpm check:examples` 校验并在 Node 里试算 |
| `demos/` | `.ts` 导出 `mount(host)`，`.vue` 是一个组件；页面上写 `<ReportDemo name="…" />` 真实运行 | `pnpm typecheck`，再在 `pnpm dev` 里看 |
| `snippets/` | 只为正文引用的代码片段 | `pnpm typecheck` |
| `data/`、`extensions/` | 示例共用的数据与扩展 | 随引用它们的示例一起检查 |

## 写作规矩

- 只写已经做完的能力；不写卡片种类数、图表数、包数与依赖的具体版本号，不写预发布阶段的铺垫。
- 正文里含 `{{` 的行内代码写成 `<code v-pre>…</code>`，否则会被 Vue 当成插值吃掉，构建也不报错。
- 站内链接用相对路径；跨站链接用完整生产地址（如 https://ui.docs.xihanfun.com ）。站内死链会让构建失败。
- 站点自己的导航、侧栏与示例组件放在 `docs/.vitepress/`，不复制或改写主题已提供的样式；主题缺的回 VitepressTheme 仓改。
- 新页面要同时进侧栏与导航「指南」下拉的对应分组；新开一个目录还要加进主题配置 `llms.sections`（要单独成包的再加 `llms.bundles`）。
- `docs/changelog.md` 只在定版本那一笔补一节，见 `xihan-report-changelog-collect`。

## LLMs 机读资产

构建时由主题按 `.vitepress/config.ts` 的 `llms` 配置产出 `llms.txt`（索引）、`llms-full.txt`（全站正文）、`llms-guide.txt`、`llms-reference.txt`，每页另有 `<页面>.md`。`transform` 把 `<<< @/…` 换成代码块、去掉 `<ReportDemo>` 演示舞台，所以示例代码必须放在 `examples/`，机读正文里才有。`llms.site` 与 `docs/package.json` 的 `homepage` 写同一个地址。构建后到 `.vitepress/dist/` 看一眼这几份文件。

## 门禁

`pnpm gate:gen`、`pnpm check:examples`、`pnpm lint`、`pnpm typecheck`、`pnpm build`，再在仓库根跑 `git diff --check`。只改文档时不跑 `report/` 的全量门禁，除非示例依赖了还没构建的包改动。

`docs/public/CNAME`、`docs/public/.nojekyll` 与 `.github/workflows/deploy-docs.yml` 属于站点契约，不因清理构建配置而删除。
