# 看板与卡片

主体写成看板 `dashboard` 时，报表是一张网格，上面排着图表、指标与表格卡片。每张卡片各自取数、各自计算，可以来自不同的数据集。

<ReportDemo name="dashboard" />

## 网格与布局

`grid.columns` 是列数，`grid.rowHeight` 是每行的高度（px）；列宽随看板的宽度均分。每张卡片的 `layout` 写左上角所在的格（`x`、`y`，从 0 起）和占多少格（`w`、`h`）：

<<< @/examples/reports/dashboard.ts#dashboard

- 卡片互相重叠、或超出列数时，校验报 `layout-overlap`、`layout-out-of-bounds`。
- 视口窄于 768px 时，查看器把看板退成单列，按卡片的位置自上而下排，每张卡片保持原来的高度。

## 取数与刷新

看板上的卡片各自生成取数请求；同一轮里请求相同的卡片只取一次。取回后每张卡片单独计算、单独绘制，取数中显示「正在加载…」，出错的卡片显示「数据加载失败」并派发 `load-error`，不影响其它卡片。

`refresh()` 重新取数，`refresh({ cards: ['trend'] })` 只刷新列出的卡片。刷新与联动时卡片原地更新：同种图表复用元素、只换数据，不重放入场动效，键盘焦点也留在原处，适合定时刷新。

## 查询

图表与指标卡片用一份聚合查询 `query` 取数：按 `dimensions` 分组，每组算出 `measures`。

- 维度写数据集字段 `field`，日期字段可以写粒度 `bucket`（`year`、`quarter`、`month`、`week`、`day`、`hour`），`sort` 按键或按某个度量排成员。
- 度量写聚合方式 `aggregate` 与字段：`sum`、`avg`、`count`、`min`、`max`、`distinctCount`，`count` 不写字段就是数行数。度量也可以写公式 `formula`，以同一查询的其它度量与 `$参数名` 为变量，在分组算好之后求值。
- `filter` 是查询自己的筛选，`sort` 按维度或度量 id 排结果行，`limit` 在排序之后截取，不影响总计。

维度与度量的 `id` 是结果行里的键，图表与指标的配置都引用这些 id，而不是字段名。

## 图表卡片

图表卡片 `kind: 'chart'` 带一份查询和一份图表配置 `chart`。图表用 XiHan.UI 的图表元素绘出，颜色只取图表的语义色。

<<< @/examples/reports/dashboard.ts#chart

| 图表 | `type` | 绑定 |
| --- | --- | --- |
| 柱线图 | `cartesian` | 每条系列 `series` 写标记（`bar`、`line`、`scatter`）、横坐标维度 `x` 与数值度量 `y`；`splitBy` 按一个维度的每个成员各展开一条，`stack` 相同的系列堆叠；横向、坐标轴、标注、缩放与刷选另有配置 |
| 饼图 | `pie` | 名称维度 `nameField` 与数值度量 `valueField`；`variant: 'donut'` 是环形图，还可以写成玫瑰图、半圆 |
| 漏斗图 | `funnel` | 阶段维度与数值度量；可以显示相对上一阶段或第一阶段的转化率 |
| 雷达图 | `radar` | 实体维度 `nameField`，每个指标 `indicators` 是一根轴 |
| 桑基图 | `sankey` | 源维度、目标维度与数值度量 |
| 热力图 | `heatmap` | 日历（`calendar`、`month`）按日期维度着色；矩阵（`matrix`）按行列两个维度着色 |
| 层级图 | `hierarchy` | 各层维度 `levels` 由上到下，数值度量 `valueField`；布局可选矩形树图、旭日图、冰柱图与圆堆图 |

每种图表的全部属性见[属性 · 图表](../reference/properties#chart)。

## 指标卡片

指标卡片 `kind: 'metric'` 显示查询总计里的一个值：

<<< @/examples/reports/dashboard.ts#metric

- `value` 是显示的度量；`baseline` 是对比基准，卡片按两者比出涨跌与变化率。上面的目标是一个只写常数的公式度量。
- `prefix`、`suffix`、`format` 决定值怎么写，`size` 与 `tone` 是尺寸与语气。
- `sparkline` 画一条迷你走势，横坐标是查询的一个维度、数值是一个度量，所以查询按月分组时迷你图就按月走。

## 表格卡片

表格卡片 `kind: 'table'` 带一个视图 `view`：明细表、分组报表或交叉表，写法与报表主体一样，有自己的数据集与筛选。

<<< @/examples/reports/dashboard.ts#table

## 扩展卡片

[扩展](./extensions)可以登记新的卡片种类，种类名带点，如 `gantt.timeline`。没装登记它的扩展时，校验报 `unknown-kind`：查看器不取数，显示「报表定义有问题」；设计器里卡片原样保留，画出种类名占位。
