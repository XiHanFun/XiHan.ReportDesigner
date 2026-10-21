# For Agents

给 Claude Code、Cursor、Codex、GitHub Copilot 这类 AI 编程工具的入口：在项目里用报表设计器与查看器时，怎样让 AI 写对接法；参与报表仓库开发时，AI 该读什么。

报表设计器没有单独的命令行或 MCP 服务端，AI 工具要的资料在两处：本站构建时产出的[机读文档](./llms)，以及仓库根的 `AGENTS.md`。报表用到的 XiHan.UI 另有自己的 [AI 辅助开发](https://ui.docs.xihanfun.com/ai/agents)资料。

## 复制这段提示词

把下面这段放进对话，或写进项目的 `AGENTS.md` / `CLAUDE.md` / `.cursor/rules`：

```text
这个项目用曦寒报表设计器（@xihan-report/*）设计报表、在业务页面显示报表。
写代码前先读 https://report.docs.xihanfun.com/llms.txt，按需读取其中列出的页面（站点地址后加 .md 取 Markdown）。
元素、属性、事件、报表定义的结构与问题码以文档和项目里装的版本为准，不要凭记忆写，也不要套用别的报表组件的 API。
用到 XiHan.UI 的组件、设计令牌、表达式引擎或语言包时，再读 https://ui.docs.xihanfun.com/llms.txt。
```

## 要装的包

| 用途 | 安装 | 注册 | 引入的样式 |
| --- | --- | --- | --- |
| 业务页面显示报表 | `pnpm add @xihan-report/core @xihan-report/runtime @xihan-ui/styles` | `defineReportViewer()` | `@xihan-ui/styles/index.css`、`@xihan-report/runtime/style.css` |
| 设计报表 | `pnpm add @xihan-report/core @xihan-report/designer @xihan-report/runtime @xihan-ui/styles @xihan-ui/designer-shell` | `defineReportDesigner()` | 上面两份，再加 `@xihan-ui/designer-shell/style.css`、`@xihan-report/designer/style.css` |
| 计算字段与公式度量 | 另装 `@xihan-ui/expression` | 把 `createExpressionEngine()` 交给 `expressionEngine` | — |
| 界面语言 | 另装 `@xihan-ui/web-components` | 见下文「关键约定」 | — |

`@xihan-report/core` 用来在代码里写报表定义；报表定义直接写成 JSON 或从接口取回时，业务页面只要 `@xihan-report/runtime`。`@xihan-ui/*` 是报表各包的 peer 依赖，由项目装唯一的一份，与项目自己用的 XiHan.UI 同一个版本，页面上不会出现两份 UI。

## 关键约定

把这几条一并告诉 AI，常见的错写多出在这里：

- **先注册再用**：元素不在 import 时注册，应用启动时调用一次 `defineReportViewer()` 或 `defineReportDesigner()`，重复调用不报错。
- **对象走属性**：报表定义、取数回调、参数取值与扩展这类对象交给元素的属性（`schema`、`dataProvider`、`parameters`、`extensions`），不写成 attribute。Vue 里用 `.prop` 修饰，并把 `xh-` 开头的标签声明为自定义元素，见[在框架里使用](../guide/host#在框架里使用)。
- **报表定义是纯 JSON**：不含函数与脚本；数据集只描述字段、不含数据，计算字段与公式度量是受限表达式，要给 `expressionEngine` 才能计算与校验。结构见[报表结构](../guide/structure)与[报表定义类型](../reference/schema)，问题码见[问题码](../reference/issues)。
- **数据由宿主交回**：组件不发网络请求。查看器与设计器按报表定义算出取数请求交给 `dataProvider`，宿主交回明细行（`kind: 'rows'`）或按请求聚合好的行（`kind: 'aggregated'`），见[与宿主集成](../guide/host)。
- **宿主管保存**：设计器每次修改派发 `schema-change`，保存命令（Ctrl / ⌘ + S 或「文件」菜单的「保存」）派发 `save`，宿主存好后调用 `markSaved()`，见[打开与保存](../guide/designer#打开与保存)。
- **扩展走 `extensions`**：卡片与视图种类、渲染、导出器、取数中间件、属性编辑器、命令、面板与物料都经 `extensions` 登记，按实例传入，不改包内源码，见[扩展](../guide/extensions)。
- **语言包合并后全局设置**：界面文字缺省是英文。语言包的名字是 `report` 加 XiHan.UI 语言包的名字（`zhCN` 对 `reportZhCN`），与 UI 同一语言的那份合并：`setXhConfig(mergeXhConfig(zhCN, reportZhCN))`，见[快速开始](../quickstart#界面语言)。

## 参与报表仓库开发

仓库根的 `AGENTS.md` 是写给 AI 的仓库规范：

| 内容 | 说明 |
| --- | --- |
| 仓库概览与目录结构 | `report/` 是三个包与开发预览页的工作区，`docs/` 是本站 |
| 常用命令 | 构建、类型检查、单测、Lint、产物契约与冒烟，以及文档站的命令 |
| 分层与依赖 | `designer → runtime → core`，core 不碰 DOM，运行时依赖只允许 `@xihan-report/*` 与 `@xihan-ui/*` |
| 硬性约定 | 模板即数据、无全局状态、数据由使用方提供、对外契约、命名与语言包、样式、注释 |
| 文档站、发版、Git 与提交 | 各自的做法与禁止事项 |

`CLAUDE.md` 是指向 `AGENTS.md` 的链接，Claude Code 打开仓库即读到；Codex 直接读 `AGENTS.md`；Cursor、GitHub Copilot 等工具在各自的规则文件里写一句「先读仓库根的 AGENTS.md」即可。

## 相关

- [LLMs.txt](./llms) · [快速开始](../quickstart) · [与宿主集成](../guide/host)
- [XiHan.UI 的 AI 辅助开发](https://ui.docs.xihanfun.com/ai/agents)
