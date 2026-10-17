/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 示例扩展 @acme/goal 的 core 层：登记「目标进度」卡片种类 goal.progress。卡片带一份查询，value 是查询里的一个度量，
// target 是目标值；计算出完成值与目标，交给运行时层画进度条。只有纯数据与纯函数，Node 里也能校验与计算。

import type { CardBase, QueryResult, ReportCardKind, ReportCoreExtension } from '@xihan-report/core'
import type { SchemaIssue } from '@xihan-ui/designer-kit/schema'

// #region card
/** 目标进度卡片在报表里多出来的两个字段。 */
export interface GoalCard extends CardBase {
  readonly value?: string
  readonly target?: number
}

/** 交给渲染的值。 */
export interface GoalValue {
  readonly value: number
  readonly target: number
}

const goalProgress: ReportCardKind<GoalCard, GoalValue> = {
  data: 'query',
  validate: (card, check) => {
    const issues: SchemaIssue[] = []
    if (card.value === undefined || !check.measures.has(card.value))
      issues.push({ code: 'goal.value-measure', path: [...check.path, 'value'] })
    if (typeof card.target !== 'number' || !(card.target > 0))
      issues.push({ code: 'goal.target-positive', path: [...check.path, 'target'] })
    return issues
  },
  compute: (card, input) => ({
    value: Number((input.query as QueryResult).total[card.value!] ?? 0),
    target: card.target!,
  }),
  fillBindings: (card, ids) => (card.value !== undefined && ids.measures.includes(card.value)) || ids.measures[0] === undefined
    ? []
    : [{ path: ['value'], value: ids.measures[0] }],
}
// #endregion card

// #region extension
export const goalCore: ReportCoreExtension = {
  id: '@acme/goal',
  cards: { 'goal.progress': goalProgress },
  properties: {
    'card:goal.progress': [
      { path: ['value'], group: 'data', label: '完成值', control: { kind: 'measure' }, required: true },
      { path: ['target'], group: 'data', label: '目标', control: { kind: 'number', exclusiveMin: 0 }, required: true },
    ],
  },
  issueText: (issue) => {
    if (issue.code === 'goal.value-measure')
      return '完成值要是查询里的一个度量'
    if (issue.code === 'goal.target-positive')
      return '目标要是大于 0 的数'
    return undefined
  },
}
// #endregion extension
