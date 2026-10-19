/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 扩展：设计器装上 @acme/goal 的设计器层。物料面板多出「目标」一组；右键点目标进度卡片，菜单里有「目标提高一成」。

import { defineReportDesigner } from '@xihan-report/designer'
import { createGoalDesigner } from '../extensions/goal-designer.ts'
import { rows, schema } from '../reports/goals.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-ui/designer-shell/style.css'
import '@xihan-report/runtime/style.css'
import '@xihan-report/designer/style.css'

defineReportDesigner()

export function mount(host: HTMLElement): () => void {
  const designer = document.createElement('xh-report-designer')
  designer.autoTour = false
  designer.extensions = [createGoalDesigner(() => {})]
  designer.dataProvider = async () => ({ kind: 'rows', rows })
  designer.schema = schema
  host.append(designer)
  return () => host.replaceChildren()
}
