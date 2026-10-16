/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 看板：卡片按网格位置排在 CSS grid 上；每张卡片单独计算与绘制，图表卡片可作联动源。

import type { ChartCard, ChartData, ComputeOptions, DashboardCard, DashboardView, DatasetData, DatasetSchema, MetricCard, MetricResult, QueryResult, TableCard } from '@xihan-report/core'
import type { RenderedChart } from './charts'
import type { ViewResult } from './compute'
import type { RenderContext } from './context'
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

/** 看板的骨架：网格与各卡片的外壳，返回卡片 id 到内容区的对照。 */
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
    if (card.title !== undefined) {
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

/** 把一张卡片的状态绘进内容区；图表卡片返回绘好的图表，供联动接线。 */
export function renderCard(body: HTMLElement, state: CardState, ctx: RenderContext): RenderedChart | undefined {
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
      const rendered = renderChart(result.card.chart, result.data, result.card.query, result.dataset, ctx, label)
      if (!rendered) {
        section?.setAttribute('data-state', 'unsupported')
        body.replaceChildren(ownPart('div', 'card-status', ctx.translations.unsupported))
        return undefined
      }
      body.replaceChildren(rendered.element)
      return rendered
    }
    case 'metric':
      body.replaceChildren(renderMetric(result.card, result.result, result.metric, result.dataset, ctx))
      return undefined
    case 'table': {
      const view = result.view
      if (view.type === 'table')
        renderDetailTable(body, view.view, view.dataset, view.result, ctx)
      else if (view.type === 'group')
        renderGroupReport(body, view.view, view.dataset, view.result, ctx)
      else
        renderCrosstab(body, view.view, view.dataset, view.result, ctx)
      return undefined
    }
  }
}
