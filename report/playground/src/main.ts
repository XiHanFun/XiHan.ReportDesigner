/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 开发预览页：注册 UI 元素与报表查看器，四个页签各放一份示例报表，接好工具栏、开关与事件记录。

import type { ReportDocument } from '@xihan-report/core'
import type { ReportViewerEventMap, XhReportViewer } from '@xihan-report/runtime'
import { defineReportViewer } from '@xihan-report/runtime'
import { reportZhCN } from '@xihan-report/runtime/locale'
import { mergeXhConfig, setXhConfig } from '@xihan-ui/web-components'
import { defineXhElements } from '@xihan-ui/web-components/define'
import { zhCN } from '@xihan-ui/web-components/locale'
import { createDataProvider } from './data'
import { crosstabReport, dashboardReport, detailReport, groupReport } from './sample'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineXhElements()
defineReportViewer()

const REPORTS: Readonly<Record<string, ReportDocument>> = {
  detail: detailReport,
  group: groupReport,
  crosstab: crosstabReport,
  dashboard: dashboardReport,
}

const LOGGED_EVENTS: readonly (keyof ReportViewerEventMap)[] = ['loading-change', 'load-error', 'issues-change', 'parameters-change', 'selections-change', 'datum-press']

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
  const blob = await viewer.exportXlsx()
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${viewer.schema?.title ?? viewer.schema?.id ?? 'report'}.xlsx`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 0)
}

document.querySelector('[aria-label="报表操作"]')!.addEventListener('click', (event) => {
  const item = (event.target as Element).closest<HTMLButtonElement>('button[value]')
  const viewer = viewers.get(active)
  if (!item || item.disabled || !viewer)
    return
  if (item.value === 'refresh')
    void viewer.refresh()
  else if (item.value === 'export')
    download(viewer).catch(error => write(`[${active}] 导出失败：${error instanceof Error ? error.message : String(error)}`))
  else if (item.value === 'clear-log')
    log.textContent = ''
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
})
applyLocale(true)
