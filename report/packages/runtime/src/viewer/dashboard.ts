/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板：卡片按网格位置排在 CSS grid 上；每张卡片单独计算与绘制，图表卡片可作联动源。

import type { ChartCard, ChartData, ComputeOptions, DashboardCard, DashboardView, DatasetData, DatasetSchema, MetricCard, MetricResult, QueryResult, TableCard } from '@xihan-report/core'
import type { RenderedChart } from './charts'
import type { ViewResult } from './compute'
import type { RenderContext } from './context'
import type { RenderedTable } from './table'
import { chartData, computeMetric, gridItems, runQuery } from '@xihan-report/core'
import { clampToGrid } from '@xihan-ui/designer-kit'
import { measureLabel } from '../labels'
import { renderChart } from './charts'
import { computeView } from './compute'
import { renderCrosstab } from './crosstab'
import { ownPart } from './dom'
import { renderGroupReport } from './group'
import { renderMetric } from './metric'
import { renderDetailTable } from './table'

/** 一张卡片的计算结果。 */
export type CardResult
  = | { readonly kind: 'chart', readonly card: ChartCard, readonly dataset: DatasetSchema, readonly data: ChartData }
    | { readonly kind: 'metric', readonly card: MetricCard, readonly dataset: DatasetSchema, readonly result: QueryResult, readonly metric: MetricResult }
    | { readonly kind: 'table', readonly card: TableCard, readonly view: ViewResult }

/** 一张卡片的状态。 */
export type CardState
  = | { readonly status: 'loading' }
    | { readonly status: 'error' }
    | { readonly status: 'ready', readonly result: CardResult }

/** 卡片引用的数据集 id。 */
export function cardDataset(card: DashboardCard): string {
  return card.kind === 'table' ? card.view.dataset : card.dataset
}

/** 按卡片类型计算。 */
export function computeCard(card: DashboardCard, dataset: DatasetSchema, data: DatasetData, options: ComputeOptions): CardResult {
  switch (card.kind) {
    case 'chart': {
      const result = runQuery(card.query, dataset, data, options)
      return { kind: 'chart', card, dataset, data: chartData(card.chart, card.query, result) }
    }
    case 'metric': {
      const result = runQuery(card.query, dataset, data, options)
      return { kind: 'metric', card, dataset, result, metric: computeMetric(card.metric, result) }
    }
    case 'table':
      return { kind: 'table', card, view: computeView(card.view, dataset, data, options) }
  }
}

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

/**
 * 把一张卡片的状态绘进内容区；图表与表格卡片返回绘好的元素，供联动与下钻接线。
 * 上一轮绘的是同种图表或指标卡片时复用那些元素，只换数据：刷新与联动不重放入场动效，焦点留在原处。
 * 表格整个重建，焦点还给原来的行。
 */
export function renderCard(body: HTMLElement, state: CardState, ctx: RenderContext): RenderedChart | RenderedTable | undefined {
  const section = body.parentElement
  if (state.status !== 'ready') {
    section?.setAttribute('data-state', state.status)
    body.replaceChildren(ownPart('div', 'card-status', state.status === 'loading' ? ctx.translations.loading : ctx.translations.error))
    return undefined
  }
  section?.setAttribute('data-state', 'ready')
  const result = state.result
  switch (result.kind) {
    case 'chart': {
      const label = result.card.title ?? result.card.query.measures.map(measure => measureLabel(measure, result.dataset)).join(' / ')
      const previous = body.firstElementChild
      const rendered = renderChart(result.card.chart, result.data, result.card.query, result.dataset, ctx, label, previous)
      if (rendered.element !== previous || body.childElementCount !== 1)
        body.replaceChildren(rendered.element)
      return rendered
    }
    case 'metric': {
      const previous = body.firstElementChild
      const content = renderMetric(result.card, result.result, result.metric, result.dataset, ctx, previous)
      if (content !== previous || body.childElementCount !== 1)
        body.replaceChildren(content)
      return undefined
    }
    case 'table':
      return keepTableFocus(body, () => renderView(body, result.view, ctx, tableLabel(result.card.title, result.view)))
  }
}
