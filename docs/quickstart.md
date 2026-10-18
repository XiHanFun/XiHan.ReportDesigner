# 快速开始

这一页在任意前端项目里装上查看器，把一张销售明细表交给 `<xh-report-viewer>`，由取数回调交回数据并显示出来。页面上的示例就是下面这几段代码在运行。

## 安装

```bash
pnpm add @xihan-report/core @xihan-report/runtime @xihan-ui/styles
```

| 包 | 用途 |
| --- | --- |
| `@xihan-report/core` | 报表定义的类型，这一页用它写报表 |
| `@xihan-report/runtime` | `<xh-report-viewer>` 与它的样式 |
| `@xihan-ui/styles` | 设计令牌与组件皮肤，表格、图表与参数栏的颜色与间距都取自它 |

包都是 ESM，用 Vite、webpack 等打包器引入即可。报表定义也可以直接写成 JSON、或从接口取回，这时业务页面只需要 `@xihan-report/runtime`。

## 注册元素并引入样式

元素不在 import 时注册，调用 `defineReportViewer()` 之后页面上才能用 `<xh-report-viewer>`，重复调用不报错。它会一并注册查看器用到的表格、图表与表单控件，不必再全量注册 UI 的元素。

<<< @/examples/demos/quickstart.ts#setup

## 写一张报表

报表定义是纯 JSON：`datasets` 描述数据集有哪些字段，`body` 是报表的主体。这里的主体是一张明细表：按日期倒序，金额保留两位小数并加千分位，数量与金额两列在末尾出合计。

<<< @/examples/reports/quickstart.ts#schema

数据集只描述字段，不含数据：

<<< @/examples/data/sales.ts#dataset

## 交回数据

查看器不发网络请求。它按报表定义算出每个数据集的取数请求，交给 `dataProvider`；回调交回明细行，筛选、排序与汇总都在浏览器里算。这里直接交回内存里的数组：

<<< @/examples/demos/quickstart.ts#provider

请求里带着数据集 id、参数取值、筛选、排序与聚合查询，宿主可以据此查库或在服务端聚合，见[与宿主集成](./guide/host)。

## 显示出来

把取数回调与报表定义交给 `dataProvider` 与 `schema` 两个属性，查看器随即取数、计算并绘出表格；属性变了会自动重算。复杂数据走属性，不走 attribute。

<<< @/examples/demos/quickstart.ts#render

<ReportDemo name="quickstart" />

## 界面语言

查看器与设计器的界面文字缺省是英文。报表给 XiHan.UI 的每种内建语言各出一份语言包，名字是 `report` 加 UI 语言包的名字：`zhCN` 对 `reportZhCN`，`jaJP` 对 `reportJaJP`。把同一语言的两份合并后全局设置，所有实例都跟着换。下面以中文为例。这一步要另外安装 `@xihan-ui/web-components`：

<<< @/examples/snippets/locale.ts#example

## 下一步

- [报表结构](./guide/structure)：数据集、参数与几种主体视图。
- [看板与卡片](./guide/dashboard)：图表、指标与表格卡片排成看板。
