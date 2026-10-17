/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义图表卡片与指标卡片的配置，取值与 XiHan.UI 的图表组件一致。
// 凡是字段名的位置都写所在卡片查询的维度 id 或度量 id：查询结果每行以它们为键。

import type { Tone } from '@xihan-ui/core'
import type { SymbolName } from '@xihan-ui/viz'
import type { FormatSpec, NumericFormatSpec } from './format'

/** 语气：XiHan.UI 的 Tone。 */
export type ChartTone = Tone

/** 顺序色阶的色板，与 XiHan.UI 的 ChartPalette 一致。 */
export type ChartPalette = 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'teal' | 'cyan' | 'blue' | 'indigo' | 'purple' | 'pink' | 'gray'

/** 散点形状：XiHan.UI 图表引擎的 SymbolName。 */
export type ChartSymbol = SymbolName

/** 尺寸档。 */
export type ChartSize = 'sm' | 'md' | 'lg'

/** 笛卡尔图系列的共有属性。 */
export interface CartesianSeriesSpecBase {
  /** 系列身份，在图内唯一。 */
  readonly id: string
  /** 图例与提示框里的名字，缺省取度量标题。 */
  readonly name?: string
  /** 固定色槽 1–8。 */
  readonly slot?: number
  /** 语义系列的语气。 */
  readonly tone?: ChartTone
}

/** 柱系列。 */
export interface CartesianBarSeriesSpec extends CartesianSeriesSpecBase {
  readonly mark: 'bar'
  /** 自变量：维度 id。 */
  readonly x: string
  /** 数值：度量 id；写成 [下, 上] 是浮动柱。 */
  readonly y: string | readonly [string, string]
  readonly shape?: 'bar' | 'lollipop'
  readonly stack?: string
  readonly stackOffset?: 'none' | 'expand' | 'diverging'
  readonly labels?: 'none' | 'inside' | 'end'
}

/** 折线系列。 */
export interface CartesianLineSeriesSpec extends CartesianSeriesSpecBase {
  readonly mark: 'line'
  /** 自变量：维度 id。 */
  readonly x: string
  /** 数值：度量 id；写成 [下, 上] 是区间带。 */
  readonly y: string | readonly [string, string]
  readonly curve?: 'linear' | 'monotone' | 'step' | 'step-before' | 'step-after'
  readonly area?: boolean
  readonly stack?: string
  readonly stackOffset?: 'none' | 'expand' | 'silhouette' | 'wiggle'
  readonly symbols?: 'auto' | 'always' | 'none'
  readonly connectNulls?: boolean
  readonly labels?: 'none' | 'end'
  readonly endLabel?: boolean
}

/** 散点系列：每个维度组合一个点。 */
export interface CartesianScatterSeriesSpec extends CartesianSeriesSpecBase {
  readonly mark: 'scatter'
  /** 横坐标：维度 id 或度量 id。 */
  readonly x: string
  /** 纵坐标：度量 id。 */
  readonly y: string
  /** 气泡大小：度量 id。 */
  readonly size?: string
  readonly symbol?: ChartSymbol
  readonly jitter?: number
  /** 按值着色：度量 id。 */
  readonly color?: string
}

export type CartesianSeriesSpec = CartesianBarSeriesSpec | CartesianLineSeriesSpec | CartesianScatterSeriesSpec

/** 坐标轴；时间值写 ISO 8601 字符串。 */
export interface CartesianAxisSpec {
  /** 比例尺；不写按数据推断：带柱或非数值的自变量用 band，日期用 time，数值用 linear。 */
  readonly scale?: 'band' | 'point' | 'linear' | 'log' | 'sqrt' | 'pow' | 'symlog' | 'time' | 'utc'
  /** 类目轴的显式顺序。 */
  readonly domain?: readonly (string | number)[]
  /** 下界；时间轴写 ISO 8601 字符串。 */
  readonly min?: number | string
  /** 上界；时间轴写 ISO 8601 字符串。 */
  readonly max?: number | string
  /** 两端取整到刻度上，数值轴缺省为真。 */
  readonly nice?: boolean
  /** 数值轴包含 0；有柱系列时总是包含。 */
  readonly zero?: boolean
  /** 刻度数量提示。 */
  readonly ticks?: number
  /** 刻度标签的格式。 */
  readonly format?: FormatSpec
  /** 轴标题。 */
  readonly title?: string
  /** 画网格线；不写时数值轴画、类目轴不画。 */
  readonly grid?: boolean
  /** 刻度标签放不下时：自动、旋转、截断或折行。 */
  readonly labelOverflow?: 'auto' | 'rotate' | 'truncate' | 'wrap'
  /** 反向。 */
  readonly reverse?: boolean
  /** pow 轴的指数，正数，缺省 1。 */
  readonly exponent?: number
  /** symlog 轴 sign(x) · log1p(|x| / c) 里的 c，正数，缺省 1；越小越接近对数，越大越接近线性。 */
  readonly constant?: number
  /** 时间轴按哪个时区（IANA 名）排刻度、写标签；不写时 time 轴按运行环境所在时区，utc 轴按 UTC。 */
  readonly timeZone?: string
  /** 这根轴（刻度、标签与标题）至少占的厚度（px）：上下叠放的几张图写同一个值，绘图区的左边就对齐。 */
  readonly minSize?: number
  /** 只用于横轴：数据点等距排列，跳过没有数据的时段；比例尺须为 time、utc 或 linear。 */
  readonly ordinal?: boolean
  /** 只用于纵轴：定义域按全部数据（all，缺省）还是只按缩放窗口里露出的数据（window）算。 */
  readonly fit?: 'all' | 'window'
}

/** 注释；axis 的 x 是自变量轴，y 是数值轴。series 写系列 id。 */
export type CartesianAnnotationSpec
  = | { readonly kind: 'line', readonly axis: 'x' | 'y', readonly value: number | string, readonly label?: string }
    | { readonly kind: 'band', readonly axis: 'x' | 'y', readonly from: number | string, readonly to: number | string, readonly label?: string }
    | { readonly kind: 'point', readonly series: string, readonly at: 'max' | 'min' | 'last' | { readonly x: number | string }, readonly label?: string }
    | { readonly kind: 'average', readonly series: string, readonly label?: string }
    | { readonly kind: 'trend', readonly series: string, readonly method: 'linear' | 'moving-average', readonly window?: number, readonly label?: string }

/** 笛卡尔图：柱、折线、面积、散点。 */
export interface CartesianChartSpec {
  readonly type: 'cartesian'
  /** 各系列：柱、折线与散点可以混排。 */
  readonly series: readonly CartesianSeriesSpec[]
  /** 拆分维度：每个系列按这个维度的每个成员各展开一条。 */
  readonly splitBy?: string
  readonly orientation?: 'vertical' | 'horizontal'
  /** 横轴（自变量轴）；orientation 为 horizontal 时画在左侧。 */
  readonly xAxis?: CartesianAxisSpec
  /** 纵轴（数值轴）。 */
  readonly yAxis?: CartesianAxisSpec
  readonly renderer?: 'svg' | 'canvas' | 'auto'
  readonly trigger?: 'axis' | 'item'
  readonly totals?: boolean
  readonly tooltipOrder?: 'series' | 'descending' | 'ascending'
  readonly palette?: ChartPalette
  readonly annotations?: readonly CartesianAnnotationSpec[]
  readonly zoom?: 'none' | 'x' | 'y' | 'xy'
  readonly brush?: 'none' | 'x' | 'y' | 'xy'
}

/** 饼图：每个维度成员一个扇区。 */
export interface PieChartSpec {
  readonly type: 'pie'
  /** 扇区名：维度 id。 */
  readonly nameField: string
  /** 数值：度量 id。 */
  readonly valueField: string
  readonly variant?: 'pie' | 'donut'
  readonly rose?: boolean
  readonly sweep?: 'full' | 'half'
  readonly sort?: 'none' | 'descending'
  readonly maxSlices?: number
  readonly labels?: 'none' | 'inside' | 'outside'
  readonly labelContent?: 'name-share' | 'name-value' | 'name' | 'share' | 'value'
  readonly format?: NumericFormatSpec
}

/** 漏斗图：每个维度成员一个阶段。 */
export interface FunnelChartSpec {
  readonly type: 'funnel'
  /** 阶段名：维度 id。 */
  readonly nameField: string
  /** 数值：度量 id。 */
  readonly valueField: string
  readonly shape?: 'trapezoid' | 'bar'
  readonly align?: 'center' | 'start'
  readonly direction?: 'down' | 'up'
  readonly conversion?: 'previous' | 'first' | 'none'
  readonly labels?: 'inside' | 'outside'
  readonly palette?: ChartPalette
  readonly format?: NumericFormatSpec
}

/** 雷达图的一个指标。 */
export interface RadarIndicatorSpec {
  /** 度量 id。 */
  readonly key: string
  /** 轴上的名字；不写取度量的标题。 */
  readonly label?: string
  /** 这根轴的下界；不写按数据算。 */
  readonly min?: number
  /** 这根轴的上界；不写按数据算。 */
  readonly max?: number
}

/** 雷达图：每个维度成员一个实体，每个指标一根轴。 */
export interface RadarChartSpec {
  readonly type: 'radar'
  /** 实体名：维度 id。 */
  readonly nameField: string
  readonly indicators: readonly RadarIndicatorSpec[]
  readonly shape?: 'polygon' | 'circle'
  readonly area?: boolean
  readonly scale?: 'shared' | 'independent'
  readonly curve?: 'linear' | 'catmull-rom'
  readonly rings?: number
  readonly ringLabels?: boolean
  readonly format?: NumericFormatSpec
}

/** 桑基图：每个维度组合一条流带。 */
export interface SankeyChartSpec {
  readonly type: 'sankey'
  /** 源节点：维度 id。 */
  readonly sourceField: string
  /** 目标节点：维度 id。 */
  readonly targetField: string
  /** 流量：度量 id。 */
  readonly valueField: string
  readonly orientation?: 'horizontal' | 'vertical'
  readonly nodeAlign?: 'justify' | 'start' | 'end' | 'center'
  readonly linkColor?: 'neutral' | 'source' | 'target' | 'gradient'
  readonly nodeSort?: 'auto' | 'input'
  readonly format?: NumericFormatSpec
}

/** 热力图共有的属性。 */
export interface HeatmapChartSpecBase {
  readonly type: 'heatmap'
  /** 数值：度量 id。 */
  readonly valueField: string
  readonly levels?: number
  readonly thresholds?: readonly number[]
  readonly scale?: 'sequential' | 'diverging'
  readonly midpoint?: number
  readonly continuous?: boolean
  readonly tone?: ChartTone
  readonly palette?: ChartPalette
  readonly size?: ChartSize
}

/** 日期热力图：calendar 连续周列，month 按自然月分块。 */
export interface HeatmapDateChartSpec extends HeatmapChartSpecBase {
  readonly variant: 'calendar' | 'month'
  /** 日期：维度 id，键为 YYYY-MM-DD。 */
  readonly dateField: string
  /** 区间起点（含），YYYY-MM-DD；不写取数据里最早的日期。 */
  readonly startDate?: string
  /** 区间终点（含），YYYY-MM-DD；不写取数据里最晚的日期。 */
  readonly endDate?: string
  /** 周首日，0 = 星期日。 */
  readonly firstDayOfWeek?: number
}

/** 矩阵热力图：行列各是一个维度。 */
export interface HeatmapMatrixChartSpec extends HeatmapChartSpecBase {
  readonly variant: 'matrix'
  /** 行：维度 id。 */
  readonly rowField: string
  /** 列：维度 id。 */
  readonly columnField: string
}

export type HeatmapChartSpec = HeatmapDateChartSpec | HeatmapMatrixChartSpec

/** 层级图：维度依次是由上到下的层。 */
export interface HierarchyChartSpec {
  readonly type: 'hierarchy'
  /** 各层：维度 id，由上到下。 */
  readonly levels: readonly string[]
  /** 数值：度量 id。 */
  readonly valueField: string
  readonly layout?: 'treemap' | 'sunburst' | 'icicle' | 'pack'
  readonly tile?: 'squarify' | 'binary' | 'slice-dice'
  readonly depth?: number
  readonly colorBy?: 'branch' | 'value' | 'uniform'
  readonly palette?: ChartPalette
  readonly orientation?: 'vertical' | 'horizontal'
  readonly format?: NumericFormatSpec
}

export type ChartSpec
  = | CartesianChartSpec
    | PieChartSpec
    | FunnelChartSpec
    | RadarChartSpec
    | SankeyChartSpec
    | HeatmapChartSpec
    | HierarchyChartSpec

/** 全部图表类型。 */
export const CHART_TYPES: readonly ChartSpec['type'][] = ['cartesian', 'pie', 'funnel', 'radar', 'sankey', 'heatmap', 'hierarchy']

/** 迷你图：指标卡片里的走势。 */
export interface SparklineSpec {
  /** 横坐标：维度 id。 */
  readonly x: string
  /** 数值：度量 id。 */
  readonly y: string
  readonly variant?: 'line' | 'area' | 'bar' | 'win-loss'
  readonly curve?: 'linear' | 'monotone'
  /** 标出哪些点：不标、末点或最高最低点。 */
  readonly markers?: 'none' | 'last' | 'extremes'
  /** 参考带 [下界, 上界]。 */
  readonly band?: readonly [number, number]
  /** 参考线：固定值，或按数据算出的均值 / 中位数。 */
  readonly reference?: number | 'mean' | 'median'
  readonly tone?: ChartTone
}

/** 指标卡片：一个汇总值，可带对比与走势。 */
export interface MetricSpec {
  /** 显示的值：度量 id，取查询的总计。 */
  readonly value: string
  /** 对比基准：度量 id，取查询的总计；与 value 比出涨跌。 */
  readonly baseline?: string
  readonly prefix?: string
  readonly suffix?: string
  readonly format?: NumericFormatSpec
  readonly size?: ChartSize
  readonly tone?: ChartTone
  /** 迷你图；不写不画。 */
  readonly sparkline?: SparklineSpec
}
