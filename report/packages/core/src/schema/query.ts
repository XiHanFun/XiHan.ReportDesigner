/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义维度、度量、日期粒度与聚合查询；聚合方式取自 @xihan-ui/viz，日期粒度取自 @xihan-ui/core/date。

import type { DateBucketUnit } from '@xihan-ui/core/date'
import type { AggregateKind } from '@xihan-ui/viz'
import type { ReportExtensible } from './extension'
import type { FilterGroup, NullsPosition, SortDirection } from './filter'
import type { FormatSpec } from './format'
import { DATE_BUCKET_UNITS } from '@xihan-ui/core/date'

export { AGGREGATE_KINDS } from '@xihan-ui/viz'
export type { AggregateKind } from '@xihan-ui/viz'

/**
 * 日期粒度：把日期取成分组键。
 * year → 2026，quarter → 2026-Q4，month → 2026-10，week → 2026-W42（ISO 周），day → 2026-10-16，hour → 2026-10-16T08。
 */
export type DateBucket = DateBucketUnit

/** 全部日期粒度，由粗到细。 */
export const DATE_BUCKETS: readonly DateBucket[] = DATE_BUCKET_UNITS

/** 成员的次序：按键，或按某个度量在该成员上的汇总值。 */
export interface AxisSort {
  /** 度量 id（分组报表里是带汇总的列 id）；不写按键。 */
  readonly by?: string
  /** 缺省 asc。 */
  readonly direction?: SortDirection
  /** 缺省 last。 */
  readonly nulls?: NullsPosition
}

/** 维度：按字段分组。 */
export interface Dimension extends ReportExtensible {
  /** 维度身份：查询结果里的键，与同一查询的度量 id 共用命名空间。 */
  readonly id: string
  /** 数据集字段名。 */
  readonly field: string
  /** 日期粒度。 */
  readonly bucket?: DateBucket
  readonly title?: string
  readonly format?: FormatSpec
  /** 成员次序，缺省按键升序。 */
  readonly sort?: AxisSort
}

/** 共有的度量属性。 */
export interface MeasureBase extends ReportExtensible {
  /** 度量身份：查询结果里的键，与同一查询的维度 id 共用命名空间。 */
  readonly id: string
  readonly title?: string
  readonly format?: FormatSpec
}

/** 聚合度量：对字段做聚合；count 不写 field 时数行。 */
export interface AggregateMeasure extends MeasureBase {
  readonly aggregate: AggregateKind
  readonly field?: string
}

/** 公式度量：在聚合之后，以同一查询其它度量的值与报表参数（$名字）为变量求值。 */
export interface FormulaMeasure extends MeasureBase {
  readonly formula: string
}

/** 度量：聚合度量或公式度量。 */
export type Measure = AggregateMeasure | FormulaMeasure

/** 查询结果行的一条排序规则。 */
export interface QuerySortRule {
  /** 维度 id 或度量 id。 */
  readonly key: string
  /** 缺省 asc。 */
  readonly direction?: SortDirection
  /** 缺省 last。 */
  readonly nulls?: NullsPosition
}

/** 聚合查询：按维度分组、计算度量，结果每个维度组合一行。 */
export interface ReportQuery {
  /** 按哪些维度分组；不写维度时结果只有总计。 */
  readonly dimensions: readonly Dimension[]
  /** 每组要算的度量。 */
  readonly measures: readonly Measure[]
  readonly filter?: FilterGroup
  /** 结果行的次序；不写按维度依次升序。 */
  readonly sort?: readonly QuerySortRule[]
  /** 结果行数上限，在排序之后截取。 */
  readonly limit?: number
}
