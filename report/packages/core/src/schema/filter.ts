/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义筛选条件、排序规则与操作数。

import type { DateBucket } from './query'
import type { ScalarValue } from './value'

/** 引用一个报表参数的值。 */
export interface ParameterRef {
  readonly parameter: string
}

/** 操作数：字面值、字面值数组，或报表参数。 */
export type Operand = ScalarValue | readonly ScalarValue[] | ParameterRef

/**
 * 筛选运算符。
 * - eq / neq：相等、不等；
 * - gt / gte / lt / lte：大小比较；
 * - between：闭区间，操作数为 [下界, 上界]；
 * - in / notIn：属于、不属于一组值；
 * - contains / notContains / startsWith / endsWith：字符串匹配；
 * - isEmpty / isNotEmpty：值缺失、不缺失，不需要操作数。
 */
export type FilterOperator
  = | 'eq'
    | 'neq'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'between'
    | 'in'
    | 'notIn'
    | 'contains'
    | 'notContains'
    | 'startsWith'
    | 'endsWith'
    | 'isEmpty'
    | 'isNotEmpty'

/** 全部筛选运算符。 */
export const FILTER_OPERATORS: readonly FilterOperator[] = [
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'between',
  'in',
  'notIn',
  'contains',
  'notContains',
  'startsWith',
  'endsWith',
  'isEmpty',
  'isNotEmpty',
]

/** 一个筛选条件。 */
export interface FilterCondition {
  /** 条件身份，在所在筛选树内唯一。 */
  readonly id: string
  /** 数据集字段名。 */
  readonly field: string
  /** 先把字段值按日期粒度取键再比较。 */
  readonly bucket?: DateBucket
  readonly operator: FilterOperator
  /** 操作数；isEmpty / isNotEmpty 不写。 */
  readonly value?: Operand
  /** 字符串运算符忽略大小写。 */
  readonly ignoreCase?: boolean
}

/** 条件组：and 全部满足，or 任一满足。 */
export interface FilterGroup {
  readonly logic: 'and' | 'or'
  readonly conditions: readonly FilterNode[]
}

/** 嵌套在条件组里的子组。 */
export interface FilterSubgroup extends FilterGroup {
  /** 子组身份，在所在筛选树内唯一。 */
  readonly id: string
}

/** 条件组里的一项：条件或子组。 */
export type FilterNode = FilterCondition | FilterSubgroup

/** 排序方向。 */
export type SortDirection = 'asc' | 'desc'

/** 缺失值排在最前还是最后，与方向无关。 */
export type NullsPosition = 'first' | 'last'

/** 明细行的一条排序规则。 */
export interface RowSortRule {
  /** 数据集字段名。 */
  readonly field: string
  /** 缺省 asc。 */
  readonly direction?: SortDirection
  /** 缺省 last。 */
  readonly nulls?: NullsPosition
}
