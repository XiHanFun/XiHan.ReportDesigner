/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 公式的接入点：表达式求值由使用方注入的 ExpressionEngine 完成；排序与按序求值用 @xihan-ui/expression 的 planExpressions、evaluatePlan，这里把问题换成报表的错误码。

import type { ExpressionEntry, ExpressionPlanStep } from '@xihan-ui/expression'
import type { ExpressionEngine } from '../expression'
import type { DataRow, DatasetSchema, ParameterValues } from '../schema'
import { evaluatePlan as evaluateSteps, planExpressions } from '@xihan-ui/expression'
import { ReportComputeError } from './errors'

/** 编译并按依赖排好序的一组公式。 */
export type FormulaPlan = readonly ExpressionPlanStep[]

/**
 * 编译一组公式，并按相互引用排序：被引用的先求值。没有公式时不需要引擎。
 * 没有引擎时抛出 formula-engine-missing；某个公式编译不通过时抛出 formula-compile-failed（params.issues 是它的问题）；
 * 公式之间循环引用时抛出 formula-cycle，params.names 是环上的名字。kind 是错误位置里公式名所用的键。
 */
export function planFormulas(engine: ExpressionEngine | undefined, entries: readonly ExpressionEntry[], kind: string): FormulaPlan {
  if (entries.length === 0)
    return []
  if (!engine)
    throw new ReportComputeError('formula-engine-missing', { [kind]: entries[0]!.name })
  const plan = planExpressions(engine, entries)
  if (plan.ok)
    return plan.steps
  const failed = plan.issues.find(issue => issue.code !== 'XH_EXPR_CYCLE')
  if (failed && 'name' in failed) {
    const entry = entries.find(item => item.name === failed.name)!
    const issues = plan.issues.filter(issue => 'name' in issue && issue.name === failed.name)
    throw new ReportComputeError('formula-compile-failed', { [kind]: entry.name, expression: entry.expression, issues })
  }
  const cycle = plan.issues.find(issue => issue.code === 'XH_EXPR_CYCLE')!
  throw new ReportComputeError('formula-cycle', { names: 'names' in cycle ? cycle.names : [] })
}

/** 报表参数在公式里的变量：参数名前加 $。 */
export function parameterScope(parameters: ParameterValues): Readonly<Record<string, unknown>> {
  const scope: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(parameters))
    scope[`$${name}`] = value
  return scope
}

/**
 * 按计划求值，结果逐个写进 target；target 与 extra 里的变量都可引用，extra 不写进 target。
 * 求值不通过时抛出 formula-evaluation-failed，params.issue 是表达式的问题。
 */
export function evaluatePlan(plan: FormulaPlan, target: Record<string, unknown>, location: Readonly<Record<string, unknown>>, extra?: Readonly<Record<string, unknown>>): void {
  if (plan.length === 0)
    return
  const outcome = evaluateSteps(plan, extra === undefined ? target : { ...extra, ...target })
  if (!outcome.ok)
    throw new ReportComputeError('formula-evaluation-failed', { ...location, name: outcome.name, issue: outcome.issue })
  Object.assign(target, outcome.values)
}

/** 数据集里的计算字段。 */
export function calculatedFields(dataset: DatasetSchema): readonly ExpressionEntry[] {
  const entries: ExpressionEntry[] = []
  for (const field of dataset.fields) {
    if (field.formula !== undefined)
      entries.push({ name: field.name, expression: field.formula })
  }
  return entries
}

/**
 * 给每行算出计算字段，返回新的行数组；数据集没有计算字段时原样返回。
 * 计算字段以同一行的其它字段（含先算出的计算字段）与报表参数（$名字）为变量。
 */
export function applyCalculatedFields(rows: readonly DataRow[], dataset: DatasetSchema, engine: ExpressionEngine | undefined, parameters: ParameterValues = {}): readonly DataRow[] {
  const entries = calculatedFields(dataset)
  if (entries.length === 0)
    return rows
  const plan = planFormulas(engine, entries, 'field')
  const extra = parameterScope(parameters)
  return rows.map((row, index) => {
    const values: Record<string, unknown> = { ...row }
    evaluatePlan(plan, values, { dataset: dataset.id, row: index }, extra)
    return values
  })
}
