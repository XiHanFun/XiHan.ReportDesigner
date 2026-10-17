/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板：卡片按网格位置排在 CSS grid 上；每张卡片单独计算与绘制，图表卡片可作联动源。

import type { CardResult, ChartCard, ChartData, DashboardView, MetricCard, MetricValue, ViewResult } from '@xihan-report/core'
import type { ReportCardRenderer, ReportRendered } from '../extensions'
import type { RenderedChart } from './charts'
import type { RenderContext } from './context'
import type { RenderedTable } from './table'
import { gridItems } from '@xihan-report/core'
import { clampToGrid } from '@xihan-ui/designer-kit'
import { measureLabel } from '../labels'
import { renderChart } from './charts'
import { renderCrosstab } from './crosstab'
import { ownPart } from './dom'
import { renderGroupReport } from './group'
import { renderMetric } from './metric'
import { renderDetailTable } from './table'

/** 一张卡片的状态：计算结果是 core 的 CardResult，值的形状由卡片种类定。 */
export type CardState
  = | { readonly status: 'loading' }
    | { readonly status: 'error' }
    | { readonly status: 'ready', readonly result: CardResult }

/** 看板的骨架：网格与各卡片的外壳（指标卡片的标题由指标的标签承担，外壳不写标题），返回卡片 id 到内容区的对照。 */
export function renderDashboardFrame(container: HTMLElement, dashboard: DashboardView): Map<string, { readonly card: HTMLElement, readonly body: HTMLElement }> {
  const grid = ownPart('div', 'dashboard')
  grid.style.setProperty('--xh-report-columns', String(dashboard.grid.columns))
  grid.style.setProperty('--xh-report-row-h', `${dashboard.grid.rowHeight}px`)
  const items = new Map(gridItems(dashboard).map(item => [item.id, clampToGrid(item, dashboard.grid.columns)]))
  const cards = new Map<string, { card: HTMLElement, body: HTMLElement }>()
  for (const card of dashboard.cards) {
    const layout = items.get(card.id)!
    const section = ownPart('section', 'card')
    section.dataset.card = card.id
    section.dataset.kind = card.kind
    section.style.setProperty('--xh-report-x', String(layout.x + 1))
    section.style.setProperty('--xh-report-y', String(layout.y + 1))
    section.style.setProperty('--xh-report-w', String(layout.w))
    section.style.setProperty('--xh-report-h', String(layout.h))
    if (card.title !== undefined && card.kind !== 'metric') {
      const title = ownPart('div', 'card-title', card.title)
      title.setAttribute('role', 'heading')
      title.setAttribute('aria-level', '3')
      section.append(title)
    }
    if (card.description !== undefined)
      section.append(ownPart('p', 'card-description', card.description))
    const body = ownPart('div', 'card-body')
    section.append(body)
    grid.append(section)
    cards.set(card.id, { card: section, body })
  }
  container.replaceChildren(grid)
  return cards
}

/** 把明细表、分组报表或交叉表排进 container；label 是表格的可及名。 */
export function renderView(container: HTMLElement, view: ViewResult, ctx: RenderContext, label: string): RenderedTable {
  if (view.type === 'table')
    return renderDetailTable(container, view.view, view.dataset, view.result, ctx, label)
  if (view.type === 'group')
    return renderGroupReport(container, view.view, view.dataset, view.result, ctx, label)
  return renderCrosstab(container, view.view, view.dataset, view.result, ctx, label)
}

/** 表格的可及名：给出的标题，没有时取数据集的标题或 id。 */
export function tableLabel(title: string | undefined, view: ViewResult): string {
  return title ?? view.dataset.title ?? view.dataset.id
}

/** 还没还回去的焦点：表格升级前又重建了一次时接着用。 */
const pendingFocus = new WeakMap<HTMLElement, { readonly row: string, readonly cell: string | undefined }>()

/** 表格重建后把焦点还给原来的行（与格）：重建前焦点在哪一行，表格升级后再聚焦同一行。 */
export function keepTableFocus(body: HTMLElement, render: () => RenderedTable): RenderedTable {
  const active = body.ownerDocument.activeElement
  const inside = active instanceof HTMLElement && body.contains(active) ? active : undefined
  const pending = pendingFocus.get(body)
  const row = inside?.closest('[data-xh-part="row"][value]')?.getAttribute('value') ?? pending?.row
  const cell = inside ? inside.closest('[data-xh-part="cell"][value]')?.getAttribute('value') ?? undefined : pending?.cell
  const rendered = render()
  if (row === undefined)
    return rendered
  pendingFocus.set(body, { row, cell })
  void rendered.element.updateComplete.then(() => {
    if (!body.contains(rendered.element))
      return
    pendingFocus.delete(body)
    const target = [...rendered.element.querySelectorAll<HTMLElement>('[data-xh-part="row"][value]')].find(item => item.getAttribute('value') === row)
    const focusCell = cell === undefined ? undefined : [...(target?.querySelectorAll<HTMLElement>('[data-xh-part="cell"][value]') ?? [])].find(item => item.getAttribute('value') === cell && item.tabIndex >= 0)
    ;(focusCell ?? target)?.focus()
  })
  return rendered
}

/** 内置图表卡片的渲染：上一轮画的是同种图表时复用元素，只换数据，刷新与联动不重放入场动效。 */
export function renderChartCard(body: HTMLElement, result: CardResult, ctx: RenderContext): RenderedChart {
  const card = result.card as ChartCard
  const dataset = result.dataset!
  const label = card.title ?? card.query.measures.map(measure => measureLabel(measure, dataset)).join(' / ')
  const previous = body.firstElementChild
  const rendered = renderChart(card.chart, result.value as ChartData, card.query, dataset, ctx, label, previous)
  if (rendered.element !== previous || body.childElementCount !== 1)
    body.replaceChildren(rendered.element)
  return rendered
}

/** 内置指标卡片的渲染：复用上一轮的指标与迷你图元素，只换数据。 */
export function renderMetricCard(body: HTMLElement, result: CardResult, ctx: RenderContext): undefined {
  const previous = body.firstElementChild
  const metric = result.value as MetricValue
  const content = renderMetric(result.card as MetricCard, metric.result, metric.metric, result.dataset!, ctx, previous)
  if (content !== previous || body.childElementCount !== 1)
    body.replaceChildren(content)
  return undefined
}

/** 内置表格卡片的渲染：表格整个重建，焦点还给原来的行。 */
export function renderTableCard(body: HTMLElement, result: CardResult, ctx: RenderContext): RenderedTable {
  const view = result.value as ViewResult
  return keepTableFocus(body, () => renderView(body, view, ctx, tableLabel(result.card.title, view)))
}

/**
 * 把一张卡片的状态绘进内容区：取数中或出错时写状态，算好了交给它种类的渲染；图表与表格返回绘好的元素，供联动与下钻接线。
 * 种类没有渲染时抛 TypeError。
 */
export function renderCard(body: HTMLElement, state: CardState, ctx: RenderContext, renderers: ReadonlyMap<string, ReportCardRenderer>): ReportRendered | undefined {
  const section = body.parentElement
  if (state.status !== 'ready') {
    section?.setAttribute('data-state', state.status)
    body.replaceChildren(ownPart('div', 'card-status', state.status === 'loading' ? ctx.translations.loading : ctx.translations.error))
    return undefined
  }
  section?.setAttribute('data-state', 'ready')
  const render = renderers.get(state.result.card.kind)
  if (!render)
    throw new TypeError(`[report] no renderer for card kind ${state.result.card.kind}`)
  return render(body, state.result, ctx)
}
