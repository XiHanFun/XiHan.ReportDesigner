/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义筛选条件、排序规则与操作数；运算符与排序方向取自 @xihan-ui/viz。

import type { FilterOperator, NullsPosition, SortDirection } from '@xihan-ui/viz'
import type { DateBucket } from './query'
import type { ScalarValue } from './value'

/** 引用一个报表参数的值。 */
export interface ParameterRef {
  /** 报表参数名：取数时换成参数的取值。 */
  readonly parameter: string
}

/** 操作数：字面值、字面值数组，或报表参数。 */
export type Operand = ScalarValue | readonly ScalarValue[] | ParameterRef

export { FILTER_OPERATORS } from '@xihan-ui/viz'
export type { FilterOperator, NullsPosition, SortDirection } from '@xihan-ui/viz'

/** 一个筛选条件。 */
export interface FilterCondition {
  /** 条件身份，在所在筛选树内唯一。 */
  readonly id: string
  /** 数据集字段名。 */
  readonly field: string
  /** 先把字段值按日期粒度取键再比较。 */
  readonly bucket?: DateBucket
  /** 运算符，见 FilterOperator；isEmpty、isNotEmpty 不要操作数，between 要两个值，in、notIn 要一组值。 */
  readonly operator: FilterOperator
  /** 操作数；isEmpty / isNotEmpty 不写。 */
  readonly value?: Operand
  /** 字符串运算符忽略大小写。 */
  readonly ignoreCase?: boolean
}

/** 条件组：and 全部满足，or 任一满足。 */
export interface FilterGroup {
  /** and 是全部满足，or 是任一满足。 */
  readonly logic: 'and' | 'or'
  /** 条件与子组；组里的条件都不参与（空数组，或操作数都为空）时整组不筛选。 */
  readonly conditions: readonly FilterNode[]
}

/** 嵌套在条件组里的子组。 */
export interface FilterSubgroup extends FilterGroup {
  /** 子组身份，在所在筛选树内唯一。 */
  readonly id: string
}

/** 条件组里的一项：条件或子组。 */
export type FilterNode = FilterCondition | FilterSubgroup

/** 明细行的一条排序规则。 */
export interface RowSortRule {
  /** 数据集字段名。 */
  readonly field: string
  /** 缺省 asc。 */
  readonly direction?: SortDirection
  /** 缺省 last。 */
  readonly nulls?: NullsPosition
}
