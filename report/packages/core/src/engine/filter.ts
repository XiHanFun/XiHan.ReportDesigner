/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表筛选的编译：参数引用、日期规范化与按粒度取键，求值交给 @xihan-ui/viz 的 compileFilter。

import type { StringCollator } from '@xihan-ui/viz'
import type { DataRow, FieldType, FilterCondition, FilterGroup, FilterNode, Operand, ParameterValues } from '../schema'
import type { DateTools } from './date'
import { compileFilter as compileTree, isMissing, isVizError } from '@xihan-ui/viz'
import { ReportComputeError } from './errors'

/** 编译筛选需要的环境。 */
export interface FilterEnvironment {
  readonly parameters: ParameterValues
  readonly dates: DateTools
  /** 字段的类型；不认识的字段为 undefined。 */
  readonly fieldType: (field: string) => FieldType | undefined
  readonly collate?: StringCollator
}

/** 行谓词。 */
export type RowPredicate = (row: DataRow) => boolean

/** 操作数的值：参数引用取参数值，未给值的参数为 undefined。 */
export function resolveOperand(operand: Operand | undefined, parameters: ParameterValues): unknown {
  if (operand !== null && typeof operand === 'object' && !Array.isArray(operand))
    return parameters[(operand as { parameter: string }).parameter]
  return operand
}

/** 操作数为空：缺失值，或去掉缺失元素后为空的数组。 */
export function isEmptyOperand(value: unknown): boolean {
  if (Array.isArray(value))
    return value.every(item => isMissing(item))
  return isMissing(value)
}

/** 判断一个节点是否为子组。 */
export function isFilterGroup(node: FilterNode): node is FilterNode & FilterGroup {
  return 'conditions' in node
}

/**
 * 把筛选编译成行谓词。extra 里的条件与 group 同时满足。
 * 缺失值与比较语义同 @xihan-ui/viz 的 compileFilter：否定运算符匹配缺失值，操作数为空（含未给值的参数）的条件不参与筛选。
 * date / datetime 字段两边先规范成所在时区的墙上时间再比；写了 bucket 的条件先把字段值按粒度取键，操作数直接写键（如 2026-10）。
 * 操作数形状不对时抛出 invalid-filter-operand。
 */
export function compileFilter(group: FilterGroup | undefined, extra: readonly FilterCondition[], env: FilterEnvironment): RowPredicate {
  const root: FilterGroup = {
    logic: 'and',
    conditions: group ? [{ id: '', ...group }, ...extra] : extra,
  }
  try {
    return compileTree<DataRow, FilterCondition>(root, {
      operand: condition => resolveOperand(condition.value, env.parameters),
      normalize(condition) {
        const bucket = condition.bucket
        if (bucket)
          return { value: value => env.dates.bucket(value, bucket) }
        const type = env.fieldType(condition.field)
        if (type !== 'date' && type !== 'datetime')
          return undefined
        const wallClock = (value: unknown): unknown => env.dates.wallClock(value, type)
        return { value: wallClock, operand: wallClock }
      },
      collate: env.collate,
    })
  }
  catch (error) {
    if (isVizError(error) && error.code === 'XH_VIZ_FILTER_OPERAND') {
      const condition = error.detail.condition as FilterCondition
      throw new ReportComputeError('invalid-filter-operand', { condition: condition.id, operator: condition.operator }, { cause: error })
    }
    throw error
  }
}
