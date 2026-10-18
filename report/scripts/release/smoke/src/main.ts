/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 冒烟页面：照文档站快速开始与设计器一页的接法，注册查看器与设计器、引入样式、切换语言，把同一份报表定义与取数回调交给两者。

import type { ReportDocument } from '@xihan-report/core'
import type { ReportDataProvider } from '@xihan-report/runtime'
import { defineReportDesigner } from '@xihan-report/designer'
import { defineReportViewer } from '@xihan-report/runtime'
import { reportZhCN } from '@xihan-report/runtime/locale'
import { createExpressionEngine } from '@xihan-ui/expression'
import { mergeXhConfig, setXhConfig } from '@xihan-ui/web-components'
import { zhCN } from '@xihan-ui/web-components/locale'
import '@xihan-ui/styles/index.css'
import '@xihan-ui/designer-shell/style.css'
import '@xihan-report/runtime/style.css'
import '@xihan-report/designer/style.css'

setXhConfig(mergeXhConfig(zhCN, reportZhCN))
defineReportViewer()
defineReportDesigner()

const schema: ReportDocument = {
  schemaVersion: 1,
  id: 'smoke',
  title: '冒烟',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] }],
  body: {
    type: 'table',
    dataset: 'sales',
    columns: [
      { id: 'region', field: 'region' },
      { id: 'amount', field: 'amount', align: 'end', summary: { aggregate: 'sum' } },
    ],
  },
}
const dataProvider: ReportDataProvider = async () => ({ kind: 'rows', rows: [{ region: '华东', amount: 10 }, { region: '华北', amount: 5 }] })

const viewer = document.createElement('xh-report-viewer')
viewer.dataProvider = dataProvider
viewer.schema = schema

const designer = document.createElement('xh-report-designer')
designer.expressionEngine = createExpressionEngine()
designer.dataProvider = dataProvider
designer.schema = schema
designer.addEventListener('schema-change', () => void designer.schema)

document.body.append(viewer, designer)
