/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义报表视图：明细表、分组报表、交叉表与看板，以及扩展登记的卡片与视图。

import type { ChartSpec, MetricSpec } from './chart'
import type { ReportExtensible, ReportExtensionKind } from './extension'
import type { FilterGroup, Operand, RowSortRule } from './filter'
import type { FormatSpec } from './format'
import type { AggregateKind, AxisSort, DateBucket, Dimension, Measure, ReportQuery } from './query'

/** 视图取数的数据集与参数绑定。 */
export interface DataBinding {
  /** 数据集 id。 */
  readonly dataset: string
  /** 数据集参数名到操作数：字面值或报表参数。 */
  readonly parameters?: Readonly<Record<string, Operand>>
}

/** 汇总：对列的字段做聚合，或以其它列的汇总值与报表参数（$名字）为变量求公式。 */
export type ColumnSummary = { readonly aggregate: AggregateKind } | { readonly formula: string }

/** 表格的一列。 */
export interface TableColumn extends ReportExtensible {
  /** 列身份，在视图内唯一。 */
  readonly id: string
  /** 数据集字段名。 */
  readonly field: string
  readonly title?: string
  readonly format?: FormatSpec
  /** 列宽（px）。 */
  readonly width?: number
  readonly align?: 'start' | 'center' | 'end'
  /** 横向滚动时固定在行首侧或行尾侧。 */
  readonly sticky?: 'start' | 'end'
  /** 汇总：分组报表的组小计与总计、明细表的合计行。 */
  readonly summary?: ColumnSummary
}

/** 明细表：逐行列出数据。 */
export interface TableView extends DataBinding, ReportExtensible {
  readonly type: 'table'
  /** 各列，从左到右。 */
  readonly columns: readonly TableColumn[]
  readonly filter?: FilterGroup
  readonly sort?: readonly RowSortRule[]
  /** 行数上限，在排序之后截取。 */
  readonly limit?: number
}

/** 分组报表的一级分组。 */
export interface GroupLevel extends ReportExtensible {
  /** 分组身份，在视图内唯一。 */
  readonly id: string
  /** 数据集字段名。 */
  readonly field: string
  readonly bucket?: DateBucket
  readonly title?: string
  readonly format?: FormatSpec
  /** 组的次序：by 写带汇总的列 id 时按该列的组小计排；缺省按键升序。 */
  readonly sort?: AxisSort
  /** 显示组头，缺省 true。 */
  readonly header?: boolean
  /** 显示组小计，缺省 true。 */
  readonly subtotal?: boolean
}

/** 分组报表：多级分组，组内列出明细，组尾写小计，末尾写总计。 */
export interface GroupView extends DataBinding, ReportExtensible {
  readonly type: 'group'
  /** 各级分组，由外到内。 */
  readonly groups: readonly GroupLevel[]
  /** 明细行与组小计的各列，从左到右。 */
  readonly columns: readonly TableColumn[]
  readonly filter?: FilterGroup
  /** 组内明细行的次序。 */
  readonly sort?: readonly RowSortRule[]
  /** 列出明细行，缺省 true；false 时只有组头与小计。 */
  readonly detail?: boolean
  /** 写总计，缺省 true。 */
  readonly grandTotal?: boolean
}

/** 交叉表一条轴上的汇总。 */
export interface CrosstabTotals {
  /** 除最内层外，每层维度的成员之后写小计，缺省 false。 */
  readonly subtotals?: boolean
  /** 轴的末尾写总计，缺省 true。 */
  readonly grandTotal?: boolean
}

/** 交叉表：行维度与列维度交叉，格子里写度量。 */
export interface CrosstabView extends DataBinding, ReportExtensible {
  readonly type: 'crosstab'
  /** 行维度，由外到内。 */
  readonly rows: readonly Dimension[]
  /** 列维度，由外到内。 */
  readonly columns: readonly Dimension[]
  /** 每个格子里的度量。 */
  readonly measures: readonly Measure[]
  readonly filter?: FilterGroup
  /** 行方向（行维度）的小计与总计。 */
  readonly rowTotals?: CrosstabTotals
  /** 列方向（列维度）的小计与总计。 */
  readonly columnTotals?: CrosstabTotals
  /** 多个度量排在列方向还是行方向，缺省 columns。 */
  readonly measuresOn?: 'columns' | 'rows'
}

/** 看板网格。 */
export interface DashboardGrid {
  /** 列数。 */
  readonly columns: number
  /** 一行的高度（px）。 */
  readonly rowHeight: number
}

/** 卡片在网格上的位置与大小，单位是格。 */
export interface CardLayout {
  readonly x: number
  readonly y: number
  /** 宽，单位是格。 */
  readonly w: number
  /** 高，单位是行。 */
  readonly h: number
}

/** 卡片的共有属性。 */
export interface CardBase extends ReportExtensible {
  /** 卡片身份，在看板内唯一。 */
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly layout: CardLayout
}

/** 图表卡片。 */
export interface ChartCard extends CardBase, DataBinding {
  /** 图表卡片。 */
  readonly kind: 'chart'
  /** 取数的聚合查询：图表的维度与度量都引用它的 id。 */
  readonly query: ReportQuery
  /** 图表配置。 */
  readonly chart: ChartSpec
}

/** 指标卡片。 */
export interface MetricCard extends CardBase, DataBinding {
  /** 指标卡片。 */
  readonly kind: 'metric'
  /** 取数的聚合查询：指标取它的总计，迷你图取它的分组。 */
  readonly query: ReportQuery
  /** 指标配置。 */
  readonly metric: MetricSpec
}

/** 表格卡片：内嵌一个明细表、分组报表或交叉表。 */
export interface TableCard extends CardBase {
  /** 表格卡片。 */
  readonly kind: 'table'
  /** 卡片里的明细表、分组报表或交叉表，带自己的数据集与筛选。 */
  readonly view: TableView | GroupView | CrosstabView
}

/**
 * 扩展登记的卡片：kind 是带点的种类名。取数部分按种类声明的形状写：同图表卡片的 dataset、parameters 与 query，
 * 或同表格卡片的 view，或不取数；其余字段归种类自己。
 */
export interface ExtensionCard extends CardBase, Partial<DataBinding> {
  /** 扩展登记的种类名。 */
  readonly kind: ReportExtensionKind
  /** 取数形状为 query 的种类：聚合查询。 */
  readonly query?: ReportQuery
  /** 取数形状为 view 的种类：明细表、分组报表或交叉表。 */
  readonly view?: DataView
  /** 种类自己的其余字段，由种类的 validate 校验。 */
  readonly [key: string]: unknown
}

/** 看板上的一张卡片：图表、指标、表格，或扩展登记的种类。 */
export type DashboardCard = ChartCard | MetricCard | TableCard | ExtensionCard

/** 联动的一个目标：在目标卡片上按字段筛选。 */
export interface LinkTarget extends ReportExtensible {
  /** 目标卡片 id。 */
  readonly card: string
  /** 目标卡片数据集的字段名。 */
  readonly field: string
}

/**
 * 筛选联动：在源卡片上选中的取值，成为目标卡片在对应字段上的 in 条件。
 * 源维度带日期粒度时，目标字段按同一粒度取键再比较。
 */
export interface DashboardLink extends ReportExtensible {
  /** 联动身份，在看板内唯一。 */
  readonly id: string
  /** 源卡片 id。 */
  readonly card: string
  /**
   * 源卡片上发出取值的维度：图表与指标卡片是查询的维度 id，分组报表是分组 id，
   * 交叉表是行或列维度 id，明细表是列 id。
   */
  readonly dimension: string
  readonly targets: readonly LinkTarget[]
}

/** 看板：网格上排列的卡片。 */
export interface DashboardView extends ReportExtensible {
  readonly type: 'dashboard'
  /** 网格的列数与行高。 */
  readonly grid: DashboardGrid
  /** 看板上的卡片，位置与大小写在各自的 layout 上。 */
  readonly cards: readonly DashboardCard[]
  /** 卡片之间的筛选联动。 */
  readonly links?: readonly DashboardLink[]
}

/**
 * 扩展登记的主体视图：type 是带点的种类名。取数部分按种类声明的形状写：同图表卡片的 dataset、parameters 与 query，
 * 或不取数；其余字段归种类自己。
 */
export interface ExtensionView extends Partial<DataBinding>, ReportExtensible {
  readonly type: ReportExtensionKind
  /** 取数形状为 query 的种类：聚合查询。 */
  readonly query?: ReportQuery
  /** 种类自己的其余字段，由种类的 validate 校验。 */
  readonly [key: string]: unknown
}

/** 报表的主体。 */
export type ReportBody = TableView | GroupView | CrosstabView | DashboardView | ExtensionView

/** 可以直接取数计算的视图。 */
export type DataView = TableView | GroupView | CrosstabView
