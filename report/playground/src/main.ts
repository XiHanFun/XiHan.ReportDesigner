/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 开发预览页：注册 UI 元素、报表查看器与设计器，四个页签各放一份示例报表，第五个页签用设计器打开示例报表，
// 接好工具栏、开关与事件记录。

import type { ReportDocument } from '@xihan-report/core'
import type { ReportDesignerEventMap } from '@xihan-report/designer'
import type { ReportViewerEventMap, XhReportViewer } from '@xihan-report/runtime'
import { defineReportDesigner } from '@xihan-report/designer'
import { defineReportViewer } from '@xihan-report/runtime'
import { reportZhCN } from '@xihan-report/runtime/locale'
import { mergeXhConfig, setXhConfig } from '@xihan-ui/web-components'
import { defineXhElement, XhAlertElement, XhSwitchElement, XhTabsElement, XhToolbarElement } from '@xihan-ui/web-components/define'
import { zhCN } from '@xihan-ui/web-components/locale'
import { createDataProvider } from './data'
import { crosstabReport, dashboardReport, detailReport, groupReport } from './sample'
import '@xihan-ui/styles/index.css'
import '@xihan-ui/designer-shell/style.css'
import '@xihan-report/runtime/style.css'
import '@xihan-report/designer/style.css'

defineXhElement('xh-alert', XhAlertElement)
defineXhElement('xh-toolbar', XhToolbarElement)
defineXhElement('xh-switch', XhSwitchElement)
defineXhElement('xh-tabs', XhTabsElement)
defineReportViewer()
defineReportDesigner()

const REPORTS: Readonly<Record<string, ReportDocument>> = {
  detail: detailReport,
  group: groupReport,
  crosstab: crosstabReport,
  dashboard: dashboardReport,
}

const LOGGED_EVENTS: readonly (keyof ReportViewerEventMap)[] = ['loading-change', 'load-error', 'issues-change', 'parameters-change', 'selections-change', 'datum-press', 'action']

let aggregate = false
const timeZone = new Intl.DateTimeFormat().resolvedOptions().timeZone
const dataProvider = createDataProvider({ aggregate: () => aggregate, timeZone })
const log = document.querySelector<HTMLElement>('#log')!
const viewers = new Map<string, XhReportViewer>()
let active = 'detail'

function write(line: string): void {
  log.textContent = `${line}\n${log.textContent ?? ''}`.slice(0, 4000)
}

function summary(name: keyof ReportViewerEventMap, detail: unknown): string {
  if (name === 'load-error') {
    const { card, error } = detail as ReportViewerEventMap['load-error']['detail']
    return `${card ?? '主体'}：${error instanceof Error ? error.message : String(error)}`
  }
  if (name === 'issues-change')
    return (detail as ReportViewerEventMap['issues-change']['detail']).issues.map(issue => issue.code).join(', ') || '无问题'
  if (name === 'datum-press') {
    const { card, link, value } = detail as ReportViewerEventMap['datum-press']['detail']
    return JSON.stringify({ card, link, value })
  }
  if (name === 'action') {
    const { card, link, value, kind, column, values } = detail as ReportViewerEventMap['action']['detail']
    return `${card ?? '主体'} ${kind} 列 ${column ?? '（Enter）'} ${JSON.stringify(values)}${link === null ? '' : ` 联动 ${link} = ${JSON.stringify(value)}`}`
  }
  return JSON.stringify(detail)
}

for (const [id, schema] of Object.entries(REPORTS)) {
  const viewer = document.querySelector<XhReportViewer>(`xh-report-viewer[data-report="${id}"]`)!
  viewer.dataProvider = dataProvider
  viewer.schema = schema
  for (const name of LOGGED_EVENTS) {
    viewer.addEventListener(name, (event) => {
      if (event.target === viewer)
        write(`[${id}] ${name} ${summary(name, (event as CustomEvent).detail)}`)
    })
  }
  viewers.set(id, viewer)
}

const tabs = document.querySelector('xh-tabs')!
tabs.addEventListener('value-change', (event) => {
  if (event.target === tabs)
    active = (event as CustomEvent<{ value: string | null }>).detail.value ?? active
})

async function download(viewer: XhReportViewer): Promise<void> {
  // 内置的 xlsx 导出器给的是 Blob
  const blob = await viewer.export('xlsx') as Blob
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${viewer.schema?.title ?? viewer.schema?.id ?? 'report'}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

const DESIGNER_EVENTS: readonly (keyof ReportDesignerEventMap)[] = ['schema-change', 'selection-change', 'dirty-change', 'issues-change', 'mode-change', 'save', 'card-dblclick']

function designerSummary(name: keyof ReportDesignerEventMap, detail: unknown): string {
  if (name === 'schema-change') {
    const { kind, operations } = detail as ReportDesignerEventMap['schema-change']['detail']
    return `${kind} ${operations.map(operation => operation.type).join(', ')}`
  }
  if (name === 'issues-change')
    return (detail as ReportDesignerEventMap['issues-change']['detail']).issues.map(issue => issue.code).join(', ') || '无问题'
  return JSON.stringify(detail)
}

const designer = document.querySelector('xh-report-designer')!
designer.dataProvider = dataProvider
designer.schema = dashboardReport
for (const name of DESIGNER_EVENTS) {
  designer.addEventListener(name, (event) => {
    if (event.target === designer)
      write(`[设计器] ${name} ${designerSummary(name, (event as CustomEvent).detail)}`)
  })
}
designer.addEventListener('save', () => designer.markSaved())
document.querySelector('[aria-label="设计器打开的报表"]')!.addEventListener('click', (event) => {
  const item = (event.target as Element).closest<HTMLButtonElement>('button[value]')
  const schema = item ? REPORTS[item.value] : undefined
  if (schema)
    designer.schema = schema
})

document.querySelector('[aria-label="报表操作"]')!.addEventListener('click', (event) => {
  const item = (event.target as Element).closest<HTMLButtonElement>('button[value]')
  if (item?.value === 'clear-log') {
    log.textContent = ''
    return
  }
  if (active === 'designer' && item?.value === 'refresh') {
    void designer.refresh()
    return
  }
  const viewer = viewers.get(active)
  if (!item || item.disabled || !viewer)
    return
  if (item.value === 'refresh')
    void viewer.refresh()
  else if (item.value === 'export')
    download(viewer).catch(error => write(`[${active}] 导出失败：${error instanceof Error ? error.message : String(error)}`))
})

function applyLocale(chinese: boolean): void {
  setXhConfig(chinese ? mergeXhConfig(zhCN, reportZhCN) : {})
}

document.querySelector('#zh')!.addEventListener('checked-change', (event) => {
  applyLocale((event as CustomEvent<{ checked: boolean }>).detail.checked)
})
document.querySelector('#aggregate')!.addEventListener('checked-change', (event) => {
  aggregate = (event as CustomEvent<{ checked: boolean }>).detail.checked
  write(`取数方式：${aggregate ? '后端按请求聚合' : '返回明细行'}`)
  for (const viewer of viewers.values())
    void viewer.refresh()
  void designer.refresh()
})
applyLocale(true)
