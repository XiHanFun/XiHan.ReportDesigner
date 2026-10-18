# 介绍

曦寒报表设计器（XiHan.ReportDesigner）是一款框架无关的报表设计器：以原生 Web Components 交付，可视化设计报表，在浏览器里按数据集与参数取数，算出明细表、分组报表、交叉表与看板并显示出来；看板上的卡片可以互相联动，表格的格子可以下钻，计算结果可以导出成 Excel 工作簿。属于曦寒懿（XiHanFun）开源生态，采用 MIT 授权。

## 能做什么

| 场景 | 用什么 |
| --- | --- |
| 在业务页面里显示报表与看板 | `<xh-report-viewer>`：按报表定义取数、计算并绘出主体视图，带参数栏、联动与下钻事件 |
| 设计与修改报表 | `<xh-report-designer>`：数据面板、物料、字段栏、属性面板、问题列表、撤销重做与剪贴板，可切到预览态 |
| 导出 | 查看器的 `export('xlsx')` 把当前的计算结果写成工作簿；扩展可以登记别的格式 |
| 不显示界面，只做计算或校验 | `@xihan-report/core`：校验报表定义、生成取数请求、计算视图与卡片，浏览器与 Node.js 里都能用 |

## 设计原则

- **框架无关**：以原生 Web Components 交付，不绑定任何前端框架。元素用 Light DOM，样式只消费 [XiHan.UI](https://ui.docs.xihanfun.com) 的设计令牌，表格、图表与表单控件也都来自 XiHan.UI。
- **零第三方依赖**：运行时只依赖 `@xihan-report/*` 与 `@xihan-ui/*`，受限表达式、值格式化、聚合与 Excel 写出都来自 XiHan.UI。
- **报表定义即数据**：报表是纯 JSON，不含也不执行任何代码。计算字段与公式度量用受限表达式，导入报表定义不会带来脚本注入。
- **数据由使用方掌控**：组件不发网络请求。报表定义存在哪里、数据从哪里取、谁能改报表，都由使用方决定，经属性、回调与事件交给组件。
- **没有全局状态**：不往 `window` 上挂对象，不读写固定键名的本地存储，同一页面放多个实例互不影响；扩展也按实例传入，不做全局登记。

## 包与入口

| 入口 | 内容 |
| --- | --- |
| `@xihan-report/core` | 报表定义的类型、校验、取数请求、计算、编辑操作与扩展的合并。纯 TypeScript，不依赖 DOM |
| `@xihan-report/runtime` | 业务页面用的 `<xh-report-viewer>`，样式在 `@xihan-report/runtime/style.css` |
| `@xihan-report/runtime/locale` | 各语言的语言包，如 `reportZhCN`、`reportJaJP`，与 XiHan.UI 的内建语言包一一对应，查看器与设计器共用 |
| `@xihan-report/runtime/xlsx` | 把明细表、分组报表与交叉表的计算结果排成工作表，自己组织工作簿时用 |
| `@xihan-report/designer` | `<xh-report-designer>`，样式在 `@xihan-report/designer/style.css` |

依赖方向固定为 `designer → runtime → core`。业务页面只需要 runtime，设计器只在需要编辑报表的地方加载；Excel 写出的代码在导出时才按需加载。

## 工作流程

```text
设计器 <xh-report-designer>
  │  schema-change / save 事件
  ▼
宿主保存报表定义 JSON（数据库、文件，由宿主决定）
  │
  ▼
业务页面取出报表定义，交给 <xh-report-viewer>
  │  dataProvider(request)：查看器按报表定义算出取数请求
  ▼
宿主取数（直接查库、调接口，或在服务端聚合）
  │  交回明细行或汇总行
  ▼
查看器计算并绘出视图 ──▶ 联动、下钻事件 ──▶ export('xlsx')
```

1. 设计：在设计器里编辑报表，设计器派发 `schema-change` 与 `save`，宿主把报表定义存起来。
2. 取数：查看器按报表定义、参数取值与联动选中，为每个数据集算出取数请求，交给宿主的取数回调。
3. 计算与显示：取回的数据在浏览器里计算成明细表、分组报表、交叉表或看板的各张卡片，再绘出来；参数或联动变了，只重算受影响的部分。

## 运行环境

- `@xihan-report/core` 不依赖 DOM，可以在浏览器、Node.js 或其它 JavaScript 运行环境里校验报表、生成取数请求并计算结果。
- `@xihan-report/runtime` 与 `@xihan-report/designer` 要在支持 Custom Elements 的浏览器里运行。
- 计算字段与公式度量要一个表达式引擎，用 `@xihan-ui/expression` 的 `createExpressionEngine()` 即可；报表里没有公式时不需要。

## 下一步

- [快速开始](./quickstart)：在任意前端项目里装包，显示一张明细表。
- [报表结构](./guide/structure)：数据集、参数与几种主体视图。
