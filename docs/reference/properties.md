# 属性

<!-- 本页由 docs/scripts/gen-reference.mjs 从源码生成，不要手改；源码变了之后在 docs/ 运行 pnpm gen。 -->

设计器的属性面板按下面的描述编辑报表里的对象。属性路径相对所在对象，嵌套属性用点连接；「名称」是属性面板里的中文名，「分组」是属性面板里的分区。

分组的先后：`basic` 基本、`data` 数据、`display` 显示、`axis` 坐标轴、`style` 样式、`interaction` 交互、`totals` 汇总、`sparkline` 迷你图。扩展可以给已有对象追加属性，路径不能与这里的重复。

## 报表 {#document}

没有选中任何对象时，属性面板编辑报表本身。路径相对 [ReportDocument](./schema#reportdocument)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `description` | 说明 | 基本 | 多行文本 | 可省 |

## 看板 {#dashboard}

主体是看板、没有选中卡片时编辑看板。路径相对 [DashboardView](./schema#dashboardview)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `grid.columns` | 列数 | 基本 | 整数，≥ 1 | 是 |
| `grid.rowHeight` | 行高 | 基本 | 数值（px），> 0 | 是 |

## 卡片 {#card}

卡片自身的属性。图表与指标卡片带查询，还有取数属性；表格卡片的取数属性在它的视图上，见[视图](#view)。

### 图表与指标卡片 {#card-query}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `description` | 说明 | 基本 | 多行文本 | 可省 |
| `dataset` | 数据集 | 数据 | 报表里的数据集 id | 是 |
| `parameters` | 参数绑定 | 数据 | 数据集参数名到[操作数](./schema#operand)的对照，见 [DataBinding](./schema#databinding) | 可省 |
| `query.filter` | 筛选 | 数据 | [筛选条件树](./schema#filtergroup) | 可省 |
| `query.limit` | 行数上限 | 数据 | 整数，≥ 1 | 可省 |

### 表格卡片 {#card-table}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `description` | 说明 | 基本 | 多行文本 | 可省 |

## 图表 {#chart}

图表卡片的图表配置，路径相对 [ChartSpec](./schema#chartspec)。柱线图的系列另见[系列](#series)。

### 柱线图 `cartesian` {#chart-cartesian}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `splitBy` | 拆分系列 | 数据 | 所在查询的维度 id | 可省 |
| `orientation` | 方向 | 显示 | `vertical` 竖向、`horizontal` 横向 | 可省 |
| `totals` | 显示合计 | 显示 | 布尔 | 可省 |
| `palette` | 色板 | 样式 | `red`、`orange`、`amber`、`yellow`、`lime`、`green`、`teal`、`cyan`、`blue`、`indigo`、`purple`、`pink`、`gray` | 可省 |
| `renderer` | 渲染方式 | 样式 | `svg`、`canvas`、`auto` 自动 | 可省 |
| `xAxis.title` | 横轴标题 | 坐标轴 | 文本 | 可省 |
| `xAxis.scale` | 横轴刻度 | 坐标轴 | `band`、`point`、`linear` 直线、`log`、`sqrt`、`pow`、`symlog`、`time`、`utc` | 可省 |
| `xAxis.format` | 横轴格式 | 坐标轴 | [值格式](./schema#formatspec) | 可省 |
| `xAxis.grid` | 横轴网格线 | 坐标轴 | 布尔 | 可省 |
| `xAxis.zero` | 横轴含零 | 坐标轴 | 布尔 | 可省 |
| `xAxis.nice` | 横轴取整 | 坐标轴 | 布尔 | 可省 |
| `xAxis.reverse` | 横轴反向 | 坐标轴 | 布尔 | 可省 |
| `xAxis.ticks` | 横轴刻度数 | 坐标轴 | 整数，≥ 1 | 可省 |
| `xAxis.labelOverflow` | 横轴标签过长时 | 坐标轴 | `auto` 自动、`rotate`、`truncate`、`wrap` | 可省 |
| `yAxis.title` | 纵轴标题 | 坐标轴 | 文本 | 可省 |
| `yAxis.scale` | 纵轴刻度 | 坐标轴 | `band`、`point`、`linear` 直线、`log`、`sqrt`、`pow`、`symlog`、`time`、`utc` | 可省 |
| `yAxis.format` | 纵轴格式 | 坐标轴 | [值格式](./schema#formatspec) | 可省 |
| `yAxis.grid` | 纵轴网格线 | 坐标轴 | 布尔 | 可省 |
| `yAxis.zero` | 纵轴含零 | 坐标轴 | 布尔 | 可省 |
| `yAxis.nice` | 纵轴取整 | 坐标轴 | 布尔 | 可省 |
| `yAxis.reverse` | 纵轴反向 | 坐标轴 | 布尔 | 可省 |
| `yAxis.ticks` | 纵轴刻度数 | 坐标轴 | 整数，≥ 1 | 可省 |
| `yAxis.labelOverflow` | 纵轴标签过长时 | 坐标轴 | `auto` 自动、`rotate`、`truncate`、`wrap` | 可省 |
| `trigger` | 提示框触发 | 交互 | `axis` 整列、`item` 单个数据点 | 可省 |
| `tooltipOrder` | 提示框排序 | 交互 | `series` 按系列、`descending` 降序、`ascending` 升序 | 可省 |
| `zoom` | 缩放 | 交互 | `none` 无、`x`、`y`、`xy` | 可省 |
| `brush` | 刷选 | 交互 | `none` 无、`x`、`y`、`xy` | 可省 |
| `annotations` | 标注 | 显示 | [CartesianAnnotationSpec](./schema#cartesianannotationspec) 的数组 | 可省 |

### 饼图 `pie` {#chart-pie}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `nameField` | 名称维度 | 数据 | 所在查询的维度 id | 是 |
| `valueField` | 数值度量 | 数据 | 所在查询的度量 id | 是 |
| `variant` | 形态 | 显示 | `pie` 饼图、`donut` 环形图 | 可省 |
| `rose` | 玫瑰图 | 显示 | 布尔 | 可省 |
| `sweep` | 扇区范围 | 显示 | `full` 整圆、`half` 半圆 | 可省 |
| `sort` | 排序 | 显示 | `none` 无、`descending` 降序 | 可省 |
| `maxSlices` | 最多扇区数 | 显示 | 整数，≥ 1 | 可省 |
| `labels` | 标签 | 显示 | `none` 无、`inside` 内侧、`outside` 外侧 | 可省 |
| `labelContent` | 标签内容 | 显示 | `name-share` 名称与占比、`name-value` 名称与数值、`name` 名称、`share` 占比、`value` 数值 | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec)，限数值、百分比 | 可省 |

### 漏斗图 `funnel` {#chart-funnel}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `nameField` | 名称维度 | 数据 | 所在查询的维度 id | 是 |
| `valueField` | 数值度量 | 数据 | 所在查询的度量 id | 是 |
| `shape` | 形状 | 显示 | `trapezoid` 梯形、`bar` 柱 | 可省 |
| `align` | 对齐 | 显示 | `center` 居中、`start` 开头 | 可省 |
| `direction` | 方向 | 显示 | `down` 向下、`up` 向上 | 可省 |
| `conversion` | 转化率 | 显示 | `previous` 相对上一阶段、`first` 相对第一阶段、`none` 无 | 可省 |
| `labels` | 标签 | 显示 | `inside` 内侧、`outside` 外侧 | 可省 |
| `palette` | 色板 | 样式 | `red`、`orange`、`amber`、`yellow`、`lime`、`green`、`teal`、`cyan`、`blue`、`indigo`、`purple`、`pink`、`gray` | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec)，限数值、百分比 | 可省 |

### 雷达图 `radar` {#chart-radar}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `nameField` | 名称维度 | 数据 | 所在查询的维度 id | 是 |
| `indicators` | 指标 | 数据 | [RadarIndicatorSpec](./schema#radarindicatorspec) 的数组 | 是 |
| `shape` | 形状 | 显示 | `polygon` 多边形、`circle` 圆形 | 可省 |
| `area` | 面积 | 显示 | 布尔 | 可省 |
| `scale` | 刻度 | 显示 | `shared` 共用刻度、`independent` 各自刻度 | 可省 |
| `curve` | 曲线 | 显示 | `linear` 直线、`catmull-rom` | 可省 |
| `rings` | 环数 | 显示 | 整数，≥ 2，≤ 10 | 可省 |
| `ringLabels` | 环标签 | 显示 | 布尔 | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec)，限数值、百分比 | 可省 |

### 桑基图 `sankey` {#chart-sankey}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `sourceField` | 源维度 | 数据 | 所在查询的维度 id | 是 |
| `targetField` | 目标维度 | 数据 | 所在查询的维度 id | 是 |
| `valueField` | 数值度量 | 数据 | 所在查询的度量 id | 是 |
| `orientation` | 方向 | 显示 | `horizontal` 横向、`vertical` 竖向 | 可省 |
| `nodeAlign` | 节点对齐 | 显示 | `justify`、`start` 开头、`end` 末端、`center` 居中 | 可省 |
| `linkColor` | 连线颜色 | 样式 | `neutral` 中性、`source`、`target`、`gradient` | 可省 |
| `nodeSort` | 节点排序 | 显示 | `auto` 自动、`input` | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec)，限数值、百分比 | 可省 |

### 热力图 `heatmap` {#chart-heatmap}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `variant` | 形态 | 数据 | `calendar` 日历、`month` 月、`matrix` 矩阵 | 是 |
| `valueField` | 数值度量 | 数据 | 所在查询的度量 id | 是 |
| `dateField` | 日期维度 | 数据 | 所在查询的维度 id；「形态」为 `calendar`、`month` 之一时显示 | 是 |
| `startDate` | 开始日期 | 数据 | 文本，写作 `YYYY-MM-DD`；「形态」为 `calendar`、`month` 之一时显示 | 可省 |
| `endDate` | 结束日期 | 数据 | 文本，写作 `YYYY-MM-DD`；「形态」为 `calendar`、`month` 之一时显示 | 可省 |
| `firstDayOfWeek` | 每周第一天 | 显示 | 整数，≥ 0，≤ 6；「形态」为 `calendar`、`month` 之一时显示 | 可省 |
| `rowField` | 行维度 | 数据 | 所在查询的维度 id；「形态」为 `matrix`时显示 | 是 |
| `columnField` | 列维度 | 数据 | 所在查询的维度 id；「形态」为 `matrix`时显示 | 是 |
| `levels` | 层级 | 显示 | 整数，≥ 1 | 可省 |
| `thresholds` | 分档阈值 | 显示 | 数值的数组，由小到大 | 可省 |
| `scale` | 刻度 | 显示 | `sequential` 单向色阶、`diverging` 发散色阶 | 可省 |
| `midpoint` | 中点 | 显示 | 数值 | 可省 |
| `continuous` | 连续色阶 | 显示 | 布尔 | 可省 |
| `tone` | 语气 | 样式 | `brand` 品牌、`neutral` 中性、`success` 成功、`warning` 警告、`danger` 危险、`info` 信息 | 可省 |
| `palette` | 色板 | 样式 | `red`、`orange`、`amber`、`yellow`、`lime`、`green`、`teal`、`cyan`、`blue`、`indigo`、`purple`、`pink`、`gray` | 可省 |
| `size` | 尺寸 | 样式 | `sm` 小、`md` 中、`lg` 大 | 可省 |

### 层级图 `hierarchy` {#chart-hierarchy}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `levels` | 层级 | 数据 | 维度 id 的数组，由上到下 | 是 |
| `valueField` | 数值度量 | 数据 | 所在查询的度量 id | 是 |
| `layout` | 布局 | 显示 | `treemap` 矩形树图、`sunburst` 旭日图、`icicle` 冰柱图、`pack` 圆堆图 | 可省 |
| `tile` | 切分方式 | 显示 | `squarify`、`binary`、`slice-dice` | 可省 |
| `depth` | 展开层数 | 显示 | 整数，≥ 1 | 可省 |
| `colorBy` | 着色依据 | 样式 | `branch`、`value` 数值、`uniform` | 可省 |
| `palette` | 色板 | 样式 | `red`、`orange`、`amber`、`yellow`、`lime`、`green`、`teal`、`cyan`、`blue`、`indigo`、`purple`、`pink`、`gray` | 可省 |
| `orientation` | 方向 | 显示 | `vertical` 竖向、`horizontal` 横向 | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec)，限数值、百分比 | 可省 |

### 系列 {#series}

柱线图的一条系列，路径相对 [CartesianSeriesSpec](./schema#cartesianseriesspec)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `mark` | 标记 | 基本 | `bar` 柱、`line` 线、`scatter` 散点 | 是 |
| `name` | 名称 | 基本 | 文本 | 可省 |
| `x` | 横坐标 | 数据 | 所在查询的维度 id；「标记」为 `bar`、`line` 之一时显示 | 是 |
| `x` | 横坐标 | 数据 | 所在查询的维度或度量 id；「标记」为 `scatter`时显示 | 是 |
| `y` | 纵坐标 | 数据 | 所在查询的度量 id | 是 |
| `size` | 气泡大小 | 数据 | 所在查询的度量 id；「标记」为 `scatter`时显示 | 可省 |
| `color` | 颜色度量 | 数据 | 所在查询的度量 id；「标记」为 `scatter`时显示 | 可省 |
| `stack` | 堆叠组 | 显示 | 文本；「标记」为 `bar`、`line` 之一时显示 | 可省 |
| `shape` | 形状 | 显示 | `bar` 柱、`lollipop` 棒棒糖；「标记」为 `bar`时显示 | 可省 |
| `stackOffset` | 堆叠方式 | 显示 | `none` 无、`expand` 百分比堆叠、`diverging` 发散色阶；「标记」为 `bar`时显示 | 可省 |
| `labels` | 标签 | 显示 | `none` 无、`inside` 内侧、`end` 末端；「标记」为 `bar`时显示 | 可省 |
| `curve` | 曲线 | 显示 | `linear` 直线、`monotone` 平滑、`step` 阶梯、`step-before`、`step-after`；「标记」为 `line`时显示 | 可省 |
| `area` | 面积 | 显示 | 布尔；「标记」为 `line`时显示 | 可省 |
| `stackOffset` | 堆叠方式 | 显示 | `none` 无、`expand` 百分比堆叠、`silhouette`、`wiggle`；「标记」为 `line`时显示 | 可省 |
| `symbols` | 数据点 | 显示 | `auto` 自动、`always` 总是显示、`none` 无；「标记」为 `line`时显示 | 可省 |
| `connectNulls` | 连接空值 | 显示 | 布尔；「标记」为 `line`时显示 | 可省 |
| `labels` | 标签 | 显示 | `none` 无、`end` 末端；「标记」为 `line`时显示 | 可省 |
| `endLabel` | 末端标签 | 显示 | 布尔；「标记」为 `line`时显示 | 可省 |
| `symbol` | 点形状 | 显示 | `circle` 圆形、`square`、`diamond`、`triangle`、`triangleDown`、`cross`、`star`、`wye`；「标记」为 `scatter`时显示 | 可省 |
| `jitter` | 抖动 | 显示 | 数值，≥ 0，≤ 1；「标记」为 `scatter`时显示 | 可省 |
| `slot` | 色槽 | 样式 | 整数，≥ 1，≤ 8 | 可省 |
| `tone` | 语气 | 样式 | `brand` 品牌、`neutral` 中性、`success` 成功、`warning` 警告、`danger` 危险、`info` 信息 | 可省 |

## 指标 {#metric}

指标卡片的指标配置，路径相对 [MetricSpec](./schema#metricspec)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `value` | 数值 | 数据 | 所在查询的度量 id | 是 |
| `baseline` | 基准值 | 数据 | 所在查询的度量 id | 可省 |
| `prefix` | 前缀 | 显示 | 文本 | 可省 |
| `suffix` | 后缀 | 显示 | 文本 | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec)，限数值、百分比 | 可省 |
| `size` | 尺寸 | 样式 | `sm` 小、`md` 中、`lg` 大 | 可省 |
| `tone` | 语气 | 样式 | `brand` 品牌、`neutral` 中性、`success` 成功、`warning` 警告、`danger` 危险、`info` 信息 | 可省 |
| `sparkline.x` | 迷你图横坐标 | 迷你图 | 所在查询的维度 id；写了`sparkline`时显示 | 是 |
| `sparkline.y` | 迷你图数值 | 迷你图 | 所在查询的度量 id；写了`sparkline`时显示 | 是 |
| `sparkline.variant` | 迷你图形态 | 迷你图 | `line` 线、`area`、`bar` 柱、`win-loss`；写了`sparkline`时显示 | 可省 |
| `sparkline.curve` | 迷你图曲线 | 迷你图 | `linear` 直线、`monotone` 平滑；写了`sparkline`时显示 | 可省 |
| `sparkline.markers` | 迷你图标记 | 迷你图 | `none` 无、`last` 最后、`extremes`；写了`sparkline`时显示 | 可省 |
| `sparkline.tone` | 迷你图语气 | 迷你图 | `brand` 品牌、`neutral` 中性、`success` 成功、`warning` 警告、`danger` 危险、`info` 信息；写了`sparkline`时显示 | 可省 |

## 视图 {#view}

报表主体或表格卡片的视图，路径相对视图本身。

### 明细表 `table` {#view-table}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `dataset` | 数据集 | 数据 | 报表里的数据集 id | 是 |
| `parameters` | 参数绑定 | 数据 | 数据集参数名到[操作数](./schema#operand)的对照，见 [DataBinding](./schema#databinding) | 可省 |
| `filter` | 筛选 | 数据 | [筛选条件树](./schema#filtergroup) | 可省 |
| `sort` | 排序 | 数据 | [RowSortRule](./schema#rowsortrule) 的数组 | 可省 |
| `limit` | 行数上限 | 数据 | 整数，≥ 1 | 可省 |

### 分组报表 `group` {#view-group}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `dataset` | 数据集 | 数据 | 报表里的数据集 id | 是 |
| `parameters` | 参数绑定 | 数据 | 数据集参数名到[操作数](./schema#operand)的对照，见 [DataBinding](./schema#databinding) | 可省 |
| `filter` | 筛选 | 数据 | [筛选条件树](./schema#filtergroup) | 可省 |
| `sort` | 排序 | 数据 | [RowSortRule](./schema#rowsortrule) 的数组 | 可省 |
| `detail` | 列出明细 | 显示 | 布尔 | 可省 |
| `grandTotal` | 总计 | 汇总 | 布尔 | 可省 |

### 交叉表 `crosstab` {#view-crosstab}

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `dataset` | 数据集 | 数据 | 报表里的数据集 id | 是 |
| `parameters` | 参数绑定 | 数据 | 数据集参数名到[操作数](./schema#operand)的对照，见 [DataBinding](./schema#databinding) | 可省 |
| `filter` | 筛选 | 数据 | [筛选条件树](./schema#filtergroup) | 可省 |
| `measuresOn` | 度量排在 | 显示 | `columns` 列方向、`rows` 行方向 | 可省 |
| `rowTotals.subtotals` | 行小计 | 汇总 | 布尔 | 可省 |
| `rowTotals.grandTotal` | 行总计 | 汇总 | 布尔 | 可省 |
| `columnTotals.subtotals` | 列小计 | 汇总 | 布尔 | 可省 |
| `columnTotals.grandTotal` | 列总计 | 汇总 | 布尔 | 可省 |

## 字段栏里的项 {#items}

在字段栏里选中一项时编辑它。

### 列 {#column}

明细表与分组报表的一列，路径相对 [TableColumn](./schema#tablecolumn)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `field` | 字段 | 数据 | 所在数据集的字段名 | 是 |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec) | 可省 |
| `width` | 列宽 | 显示 | 数值（px），> 0 | 可省 |
| `align` | 对齐 | 显示 | `start` 开头、`center` 居中、`end` 末端 | 可省 |
| `sticky` | 冻结 | 显示 | `start` 开头、`end` 末端 | 可省 |
| `summary.aggregate` | 汇总方式 | 汇总 | `sum` 求和、`avg` 平均、`count` 计数、`min` 最小、`max` 最大、`distinctCount` 去重计数；没写「汇总公式」时显示 | 可省 |
| `summary.formula` | 汇总公式 | 汇总 | 文本；没写「汇总方式」时显示 | 可省 |

### 分组 {#group-level}

分组报表的一级分组，路径相对 [GroupLevel](./schema#grouplevel)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `field` | 字段 | 数据 | 所在数据集的字段名 | 是 |
| `bucket` | 日期粒度 | 数据 | `year` 年、`quarter` 季度、`month` 月、`week` 周、`day` 日、`hour` 小时 | 可省 |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec) | 可省 |
| `sort.by` | 排序依据 | 数据 | 所在查询的维度或度量 id | 可省 |
| `sort.direction` | 排序方向 | 数据 | `asc` 升序、`desc` 降序 | 可省 |
| `sort.nulls` | 空值位置 | 数据 | `first` 最前、`last` 最后 | 可省 |
| `header` | 组头 | 显示 | 布尔 | 可省 |
| `subtotal` | 组小计 | 汇总 | 布尔 | 可省 |

### 维度 {#dimension}

查询或交叉表的一个维度，路径相对 [Dimension](./schema#dimension)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `field` | 字段 | 数据 | 所在数据集的字段名 | 是 |
| `bucket` | 日期粒度 | 数据 | `year` 年、`quarter` 季度、`month` 月、`week` 周、`day` 日、`hour` 小时 | 可省 |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec) | 可省 |
| `sort.by` | 排序依据 | 数据 | 所在查询的维度或度量 id | 可省 |
| `sort.direction` | 排序方向 | 数据 | `asc` 升序、`desc` 降序 | 可省 |
| `sort.nulls` | 空值位置 | 数据 | `first` 最前、`last` 最后 | 可省 |

### 度量 {#measure}

查询或交叉表的一个度量，路径相对 [Measure](./schema#measure)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `aggregate` | 聚合 | 数据 | `sum` 求和、`avg` 平均、`count` 计数、`min` 最小、`max` 最大、`distinctCount` 去重计数；没写「公式」时显示 | 是 |
| `field` | 字段 | 数据 | 所在数据集的字段名；没写「公式」时显示 | 可省 |
| `formula` | 公式 | 数据 | 文本；没写「聚合」时显示 | 是 |
| `format` | 格式 | 显示 | [值格式](./schema#formatspec) | 可省 |

## 数据 {#data}

在数据面板里选中字段或参数时编辑它。

### 字段 {#field}

数据集的一个字段，路径相对 [DatasetField](./schema#datasetfield)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `name` | 名称 | 基本 | 文本 | 是 |
| `type` | 类型 | 基本 | `string` 文本、`number` 数值、`boolean` 布尔、`date` 日期、`datetime` 日期时间 | 是 |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `formula` | 公式 | 数据 | 文本 | 可省 |

### 参数 {#parameter}

报表的一个参数，路径相对 [ReportParameter](./schema#reportparameter)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `name` | 名称 | 基本 | 文本 | 是 |
| `type` | 类型 | 基本 | `string` 文本、`number` 数值、`boolean` 布尔、`date` 日期、`datetime` 日期时间 | 是 |
| `title` | 标题 | 基本 | 文本 | 可省 |
| `required` | 必填 | 数据 | 布尔 | 可省 |
| `multiple` | 多选 | 数据 | 布尔 | 可省 |
| `defaultValue` | 缺省值 | 数据 | 按参数的类型与是否多选取值 | 可省 |
| `options` | 候选项 | 数据 | [ParameterOption](./schema#parameteroption) 的数组，在设计器里是逐行编辑的选项表（值、文字与禁用），值不能重复；「类型」为 `string`、`date`、`datetime` 之一时显示 | 可省 |
| `options` | 候选项 | 数据 | [ParameterOption](./schema#parameteroption) 的数组；「类型」为 `number`、`boolean` 之一时显示 | 可省 |

## 联动 {#link}

看板的一条联动，路径相对 [DashboardLink](./schema#dashboardlink)。

| 属性 | 名称 | 分组 | 取值 | 必填 |
| --- | --- | --- | --- | --- |
| `card` | 源卡片 | 数据 | 看板上的卡片 id | 是 |
| `dimension` | 源维度 | 数据 | 源卡片上能发出取值的维度 id | 是 |
| `targets` | 目标 | 数据 | [LinkTarget](./schema#linktarget) 的数组 | 是 |
