/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 设计器：打开销售看板，画布按示例数据显示；改动后下方显示有未保存的改动，按 Ctrl / ⌘ + S 时由宿主保存并标记为已保存。

// #region setup
import type { ReportDesignerEventMap } from '@xihan-report/designer'
import { defineReportDesigner } from '@xihan-report/designer'
import { createExpressionEngine } from '@xihan-ui/expression'
import { rows, schema } from '../reports/dashboard.ts'
import '@xihan-ui/styles/index.css'
import '@xihan-ui/designer-shell/style.css'
import '@xihan-report/runtime/style.css'
import '@xihan-report/designer/style.css'

defineReportDesigner()
// #endregion setup

export function mount(host: HTMLElement): () => void {
  // #region render
  const designer = document.createElement('xh-report-designer')
  designer.expressionEngine = createExpressionEngine()
  designer.dataProvider = async () => ({ kind: 'rows', rows })
  designer.schema = schema
  // #endregion render
  // 文档页里的示例不自动开始新手引导，免得盖住正文
  designer.autoTour = false

  const status = document.createElement('output')
  status.textContent = '没有改动'

  // #region save
  designer.addEventListener('dirty-change', (event) => {
    const { dirty } = (event as ReportDesignerEventMap['dirty-change']).detail
    status.textContent = dirty ? '有未保存的改动' : '已保存'
  })

  designer.addEventListener('save', () => {
    const saved = JSON.stringify(designer.schema)
    // 宿主在这里把 saved 存进数据库或文件，存好之后：
    designer.markSaved()
    status.textContent = `已保存（${saved.length} 个字符）`
  })
  // #endregion save

  host.append(designer, status)
  return () => host.replaceChildren()
}
