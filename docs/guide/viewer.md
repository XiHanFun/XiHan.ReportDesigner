# 查看器

`<xh-report-viewer>` 是业务页面里显示报表的元素：拿到报表定义与取数回调，按参数与联动取数、计算并绘出主体或看板。它只在 `@xihan-report/runtime` 里，页面不需要加载设计器。全部属性、方法与事件见[参考 · 查看器](../reference/viewer)。

## 注册与样式

<<< @/examples/demos/quickstart.ts#setup

`defineReportViewer()` 注册查看器与它用到的表格、图表和表单控件，重复调用不报错。查看器用 Light DOM，样式只消费 XiHan.UI 的设计令牌：亮色暗色、紧凑与舒适密度都跟着 UI 的主题走。

查看器的宽度随容器，作为 flex 或 grid 子项时可以收窄；比容器宽的表格在自己的区域里横向滚动，不撑宽页面。高度随内容：看板按行数与行高排开，明细多时表格按需渲染可见的行。

## 属性

| 属性 | 作用 |
| --- | --- |
| `schema` | 报表定义 |
| `dataProvider` | 取数回调，见[与宿主集成](./host) |
| `parameters` | 报表参数的取值；写了就是受控，参数栏的改动只派发 `parameters-change` |
| `selections` | 看板联动的选中值；写了就是受控 |
| `hideParameters`（`hide-parameters`） | 不显示参数栏；缺省显示 |
| `expressionEngine` | 表达式引擎，计算字段与公式度量要用 |
| `formatter` | 换掉全部值的显示方式；缺省按格式说明写 |
| `locale`、`timeZone`（`time-zone`） | 语言与时区；缺省取全局配置与运行环境所在的时区 |
| `translations` | 这个元素自己的文案，压在全局配置之上 |
| `extensions` | 扩展：新的卡片与视图种类、渲染、叠加层、导出器与取数中间件，见[扩展](./extensions) |

布尔 attribute 按三态读：没写取缺省，写 `"false"` 是关，空串、`"true"` 与别的写法都是开，移除后回到缺省。这与 HTML 原生的布尔 attribute 不同：原生的只要写了就算开。这是一处行为变化，报表元素此前也照原生读，`hide-parameters="false"` 会隐藏参数栏，现在是显示。

复杂数据都走属性，`schema`、`dataProvider`、`parameters`、`extensions` 或时区变了会重新取数；`selections` 变了只重算受影响的卡片；文案、语言或格式化器变了只重绘。

## 宿主自己管参数

参数栏适合直接给人用。参数要由页面上别的控件、地址栏或权限决定时，写 `parameters` 并隐藏参数栏：

<<< @/examples/demos/viewer.ts#controlled

没写的参数按报表里的缺省值取。参数栏改了取值（没隐藏时），查看器派发 `parameters-change`，受控时宿主把新取值写回 `parameters`。

## 刷新与结果

<<< @/examples/demos/viewer.ts#refresh

<ReportDemo name="viewer" />

- `refresh()` 重新取数；看板可以只刷新部分卡片：`refresh({ cards: ['trend'] })`。刷新时保留旧结果，不回到加载态。
- `getResults()` 是此刻的计算结果快照：主体视图或各张已算好的卡片，以及当时的参数取值、联动选中与各卡片收到的联动筛选。导出与宿主自己汇总都用它。
- `loading` 表示还有取数没完成，开始与结束时派发 `loading-change`；`issues` 是报表定义与参数的问题，变了派发 `issues-change`。

## 状态

查看器把当前状态写在自己的 `data-state` 上，宿主可以按它调整外围的样式：

| `data-state` | 什么时候 | 显示 |
| --- | --- | --- |
| `idle` | 没有报表定义，或没给取数回调 | 空白 |
| `loading` | 报表主体第一次取数 | 正在加载… |
| `invalid` | 报表定义有错误级问题 | 报表定义有问题，无法显示 |
| `parameters` | 必填参数没有值，或取值不合格 | 报表参数缺少或取值不合格 |
| `error` | 报表主体取数或计算出错，派发 `load-error` | 数据加载失败 |
| `ready` | 算好了 | 报表 |

看板上每张卡片各有自己的加载与出错状态，不影响整个查看器。

## 界面文字

查看器的文字取全局配置：用 `setXhConfig(mergeXhConfig(zhCN, reportZhCN))` 换成中文，其他语言同理（见[快速开始](../quickstart#界面语言)）。只改某个实例的个别文字时写 `translations`，例如 `{ empty: '本期没有数据' }`；全部文案键见[参考 · 查看器](../reference/viewer#reportviewertranslations)。

同一页面放多少个查看器都互不影响：它们不共享状态，扩展也按实例传入。
