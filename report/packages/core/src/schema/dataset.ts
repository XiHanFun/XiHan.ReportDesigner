/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义数据集描述，以及使用方取数回调的请求与返回契约。

import type { ReportExtensible } from './extension'
import type { FilterGroup, RowSortRule } from './filter'
import type { AggregateKind, DateBucket } from './query'
import type { DataRow, FieldType, ParameterValues } from './value'

/** 数据集里的一个字段。写了 formula 的是计算字段，以同一行的字段与报表参数（$名字）为变量逐行求值，不由使用方提供。 */
export interface DatasetField extends ReportExtensible {
  /** 字段名：数据行里的键，在数据集内唯一；不以 $ 开头。 */
  readonly name: string
  readonly type: FieldType
  /** 显示的标题，缺省同 name。 */
  readonly title?: string
  /** 计算字段的表达式；求值能力由 ExpressionEngine 提供。 */
  readonly formula?: string
}

/** 数据集接受的一个参数：取数时由使用方的数据源解释。 */
export interface DatasetParameter extends ReportExtensible {
  /** 参数名，在数据集内唯一。 */
  readonly name: string
  readonly type: FieldType
  readonly title?: string
  /** 取数时必须给值。 */
  readonly required?: boolean
  /** 接受多个值。 */
  readonly multiple?: boolean
}

/** 报表引用的一个数据集。 */
export interface DatasetSchema extends ReportExtensible {
  /** 数据集身份，在报表内唯一，也是取数请求里的 dataset。 */
  readonly id: string
  readonly title?: string
  /** 数据集的字段。 */
  readonly fields: readonly DatasetField[]
  readonly parameters?: readonly DatasetParameter[]
}

/** 取数请求里的一个维度：按 field 分组，写了 bucket 时按日期粒度取键。 */
export interface DatasetQueryDimension {
  /** 维度 id：交回的聚合行里以它为键。 */
  readonly id: string
  readonly field: string
  readonly bucket?: DateBucket
}

/** 取数请求里的一个度量：对 field 做 aggregate；count 不写 field 时数行。 */
export interface DatasetQueryMeasure {
  /** 度量 id：交回的聚合行里以它为键。 */
  readonly id: string
  readonly field?: string
  readonly aggregate: AggregateKind
}

/**
 * 视图需要的聚合：使用方可以照此在后端聚合，返回 aggregated 数据。
 * 已聚合数据的每行以维度 id 与度量 id 为键。
 */
export interface DatasetQuery {
  /** 按哪些维度分组。 */
  readonly dimensions: readonly DatasetQueryDimension[]
  /** 每组要算的度量。 */
  readonly measures: readonly DatasetQueryMeasure[]
  /**
   * 不可累加的度量（avg、distinctCount）要单独给出的汇总分组：每项是一组维度 id，空数组是总计。
   * 没有不可累加的度量时为空。
   */
  readonly rollups: readonly (readonly string[])[]
}

/** 取数请求：core 按视图与参数取值算出，使用方据此取数。 */
export interface DatasetRequest {
  /** 数据集 id。 */
  readonly dataset: string
  /** 数据集参数的取值：已按绑定解析，未给值的参数不出现。 */
  readonly parameters: ParameterValues
  /** 已代入参数的筛选；引用了计算字段时为 null，由 core 在取回的行上筛选。 */
  readonly filter: FilterGroup | null
  /** 明细视图的排序；聚合视图为 null。 */
  readonly sort: readonly RowSortRule[] | null
  /** 明细视图的行数上限；没有上限为 null。 */
  readonly limit: number | null
  /** 视图需要的聚合；明细视图或引用了计算字段时为 null，此时只能返回明细行。 */
  readonly query: DatasetQuery | null
}

/** 明细行：core 负责计算字段、筛选、分组与聚合。 */
export interface DatasetRows {
  /** 交回明细行。 */
  readonly kind: 'rows'
  /** 明细行：以字段名为键；core 在这些行上筛选、聚合与计算。 */
  readonly rows: readonly DataRow[]
}

/** 一条汇总行：按 dimensions 分组的汇总值，键同已聚合行。 */
export interface DatasetRollup {
  /** 分组的维度 id；空数组是总计。 */
  readonly dimensions: readonly string[]
  /** 这一组的汇总值：以度量 id 为键。 */
  readonly row: DataRow
}

/**
 * 已聚合数据：使用方按请求里的 query 在后端聚合并筛选过。
 * rows 以维度 id 与度量 id 为键；不可累加度量的汇总值由 rollups 给出。
 */
export interface DatasetAggregated {
  /** 交回按请求聚合好的行。 */
  readonly kind: 'aggregated'
  /** 每组一行：以维度 id 与度量 id 为键。 */
  readonly rows: readonly DataRow[]
  /** 请求的 rollups 里每个分组的汇总行；请求里 rollups 为空时不写。 */
  readonly rollups?: readonly DatasetRollup[]
}

/** 使用方交回的数据。 */
export type DatasetData = DatasetRows | DatasetAggregated
