/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 示例扩展 @acme/goal 的设计器层：在运行时层之上加物料组与物料项（新建目标进度卡片），以及卡片右键菜单里的
// 「目标提高一成」命令。

import type { ReportDesignerExtension, XhReportDesigner } from '@xihan-report/designer'
import type { GoalCard } from './goal-core.ts'
import type { FetchRecord } from './goal-runtime.ts'
import { createGoalRuntime } from './goal-runtime.ts'

/** 唯一选中的那张目标进度卡片；没有时为 undefined。 */
function selectedGoal(designer: XhReportDesigner): GoalCard | undefined {
  const body = designer.schema?.body
  const [id] = designer.getSelection().cards
  if (body?.type !== 'dashboard' || designer.getSelection().cards.length !== 1)
    return undefined
  const card = body.cards.find(item => item.id === id)
  return card?.kind === 'goal.progress' ? card as GoalCard : undefined
}

export function createGoalDesigner(onFetch: (record: FetchRecord) => void): ReportDesignerExtension {
  return {
    ...createGoalRuntime(onFetch),
    // #region palette
    paletteGroups: [{ id: 'goal.items', label: '目标' }],
    palette: [{
      id: 'goal.progress',
      group: 'goal.items',
      label: '目标进度',
      template: dataset => ({
        kind: 'goal.progress',
        title: '目标进度',
        layout: { w: 4, h: 3 },
        dataset,
        query: { dimensions: [], measures: [] },
        target: 100000,
      }),
    }],
    // #endregion palette
    // #region command
    commands: [{
      id: '@acme/goal.raise',
      label: '目标提高一成',
      placement: ['menu:card'],
      enabled: ({ designer }) => !designer.readonly && selectedGoal(designer) !== undefined,
      run: ({ designer }) => {
        const card = selectedGoal(designer)
        if (card?.target !== undefined)
          designer.execute([{ type: 'updateCard', id: card.id, changes: [{ path: ['target'], value: Math.round(card.target * 1.1) }] }])
      },
    }],
    // #endregion command
  }
}
