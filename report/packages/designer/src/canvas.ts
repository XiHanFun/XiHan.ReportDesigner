/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 设计器的画布内容：看板用查看器的 renderDashboardFrame 搭网格与卡片外壳，卡片内容用 computeCard / renderCard；
// 明细表、分组报表与交叉表用 computeView / renderView。内容按定义缓存，改过的卡片才在去抖后重新取数计算；
// 位置大小变了只改卡片的位置变量。没给取数回调时画占位。

import type { ComputeOptions, DashboardCard, DashboardView, DatasetData, DatasetRequest, DatasetSchema, DataView, ParameterValues, ReportDocument, ViewResult } from '@xihan-report/core'
import type { ReportDataProvider } from '@xihan-report/runtime'
import type { CardState, RenderContext } from '@xihan-report/runtime/design'
import { cardQuery, cardTypeOf, cardView, computeCard, computeView, createDatasetRequest, findDataset, isDataView } from '@xihan-report/core'
import { createReportRuntimeModel } from '@xihan-report/runtime'
import { renderCard, renderDashboardFrame, renderView, tableLabel } from '@xihan-report/runtime/design'
import { clampToGrid } from '@xihan-ui/designer-kit'
import { createAuthoredElement } from '@xihan-ui/web-components/authoring'

/** 重算内容前等待的毫秒数：连续编辑时只算最后一次。 */
const RECOMPUTE_DELAY = 250

/** 画布取数与渲染要用的输入。 */
export interface CanvasInputs {
  readonly document: ReportDocument
  readonly provider: ReportDataProvider | undefined
  readonly values: ParameterValues
  readonly options: ComputeOptions
  readonly context: RenderContext
  /** 占位上的说明：卡片种类与「给了取数回调后显示示例数据」。 */
  readonly placeholder: (kind: string) => string
}

/** 一张卡片（或报表主体的视图）的内容状态。 */
type ContentState = CardState | { readonly status: 'placeholder' } | { readonly status: 'view', readonly view: ViewResult }

interface ContentEntry {
  key: string
  state: ContentState | undefined
  pending: boolean
}

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

function placeholderNode(doc: Document, text: string): HTMLElement {
  return createAuthoredElement(doc, 'div', { 'data-part': 'placeholder' }, [createAuthoredElement(doc, 'span', { 'data-part': 'placeholder-text' }, [text])])
}

/**
 * 画布内容：host 是专门放内容的容器（不与覆盖层共用），update 按文档重画。看板的骨架只在卡片增删、换序或标题说明变化时重建；
 * 位置大小变化只改位置变量。内容的键取卡片（或视图）去掉位置、标题与说明后的定义、数据集定义、参数取值与取数请求，
 * 键变了才重新取数计算；同一个请求的数据在一轮内共用。
 */
export class CanvasContent {
  readonly #host: HTMLElement
  #frame: Map<string, { readonly card: HTMLElement, readonly body: HTMLElement }> | undefined
  #frameKey: string | undefined
  #view: HTMLElement | undefined
  readonly #entries = new Map<string, ContentEntry>()
  #data = new Map<string, Promise<DatasetData>>()
  #inputs: CanvasInputs | undefined
  #timer: ReturnType<typeof setTimeout> | undefined
  #abort: AbortController | undefined
  #runs = 0
  #provider: ReportDataProvider | undefined

  constructor(host: HTMLElement) {
    this.#host = host
  }

  /** 看板上卡片的外壳；不是看板或卡片不存在时为 undefined。 */
  cardElement(id: string): HTMLElement | undefined {
    return this.#frame?.get(id)?.card
  }

  /** 看板网格；不是看板时为 undefined。 */
  get grid(): HTMLElement | undefined {
    return this.#frame ? this.#host.querySelector<HTMLElement>(':scope > [data-part="dashboard"]') ?? undefined : undefined
  }

  /** 按文档更新画布；内容的重算排到去抖之后。 */
  update(inputs: CanvasInputs): void {
    if (inputs.provider !== this.#provider) {
      this.#provider = inputs.provider
      this.#data.clear()
      for (const entry of this.#entries.values())
        entry.key = ''
    }
    this.#inputs = inputs
    const body = inputs.document.body
    if (body.type === 'dashboard')
      this.#updateDashboard(body, inputs)
    else if (isDataView(body))
      this.#updateView(body, inputs)
    else
      this.#clear()
    if ([...this.#entries.values()].some(entry => entry.pending))
      this.#schedule()
  }

  /** 丢掉缓存的数据，全部重新取数计算。 */
  refresh(): Promise<void> {
    this.#data.clear()
    for (const entry of this.#entries.values()) {
      entry.key = ''
      entry.pending = true
    }
    if (this.#inputs)
      this.update(this.#inputs)
    return this.#flush()
  }

  dispose(): void {
    clearTimeout(this.#timer)
    this.#abort?.abort()
  }

  #updateDashboard(dashboard: DashboardView, inputs: CanvasInputs): void {
    this.#view = undefined
    const frameKey = JSON.stringify(dashboard.cards.map(card => [card.id, card.kind, card.title, card.description]))
    const rebuild = frameKey !== this.#frameKey || !this.#frame
    if (rebuild) {
      this.#frame = renderDashboardFrame(this.#host, dashboard)
      this.#frameKey = frameKey
    }
    else {
      const grid = this.grid!
      grid.style.setProperty('--xh-report-columns', String(dashboard.grid.columns))
      grid.style.setProperty('--xh-report-row-h', `${dashboard.grid.rowHeight}px`)
      for (const card of dashboard.cards) {
        const layout = clampToGrid({ id: card.id, ...card.layout }, dashboard.grid.columns)
        const section = this.#frame!.get(card.id)!.card
        section.style.setProperty('--xh-report-x', String(layout.x + 1))
        section.style.setProperty('--xh-report-y', String(layout.y + 1))
        section.style.setProperty('--xh-report-w', String(layout.w))
        section.style.setProperty('--xh-report-h', String(layout.h))
      }
    }
    const ids = new Set(dashboard.cards.map(card => card.id))
    for (const id of this.#entries.keys()) {
      if (!ids.has(id))
        this.#entries.delete(id)
    }
    for (const card of dashboard.cards) {
      const key = this.#contentKey(card, inputs)
      const entry = this.#entries.get(card.id)
      if (entry && entry.key === key) {
        if (rebuild)
          this.#paintCard(card)
        continue
      }
      this.#entries.set(card.id, { key, state: entry?.state, pending: true })
      if (rebuild || !entry)
        this.#paintCard(card)
    }
  }

  /** 主体是扩展视图：画布上没有内容。 */
  #clear(): void {
    this.#frame = undefined
    this.#frameKey = undefined
    this.#view = undefined
    this.#entries.clear()
    this.#host.replaceChildren()
  }

  #updateView(view: DataView, inputs: CanvasInputs): void {
    this.#frame = undefined
    this.#frameKey = undefined
    if (!this.#view || this.#view.parentElement !== this.#host) {
      this.#view = createAuthoredElement(this.#host.ownerDocument, 'div', { 'data-part': 'view' })
      this.#host.replaceChildren(this.#view)
    }
    for (const id of this.#entries.keys()) {
      if (id !== '')
        this.#entries.delete(id)
    }
    const key = this.#contentKey(view, inputs)
    const entry = this.#entries.get('')
    if (entry && entry.key === key)
      return
    this.#entries.set('', { key, state: entry?.state, pending: true })
    if (!entry)
      this.#paintView(view)
  }

  /** 卡片或视图的数据集与取数请求；数据集不存在时为 undefined。 */
  #request(source: DashboardCard | DataView, document: ReportDocument, values: ParameterValues): { readonly request: DatasetRequest, readonly dataset: DatasetSchema } | undefined {
    const target = 'kind' in source ? cardView(source) ?? cardQuery(source) : source
    if (!target)
      return undefined
    const dataset = findDataset(document, target.dataset)
    return dataset ? { request: createDatasetRequest(target, dataset, { parameters: values }), dataset } : undefined
  }

  #contentKey(source: DashboardCard | DataView, inputs: CanvasInputs): string {
    const definition = 'kind' in source ? { ...source, layout: undefined, title: undefined, description: undefined } : source
    const resolved = this.#request(source, inputs.document, inputs.values)
    return JSON.stringify([definition, resolved?.dataset, resolved?.request, inputs.options.timeZone, inputs.provider !== undefined])
  }

  #schedule(): void {
    clearTimeout(this.#timer)
    this.#timer = setTimeout(() => void this.#flush(), RECOMPUTE_DELAY)
  }

  /** 把待算的卡片（或视图）取数计算并重画。 */
  async #flush(): Promise<void> {
    clearTimeout(this.#timer)
    const inputs = this.#inputs
    if (!inputs)
      return
    const run = ++this.#runs
    this.#abort?.abort()
    const abort = new AbortController()
    this.#abort = abort
    const body = inputs.document.body
    const sources: [string, DashboardCard | DataView][] = body.type === 'dashboard' ? body.cards.map(card => [card.id, card]) : isDataView(body) ? [['', body]] : []
    const used = new Set<string>()
    await Promise.all(sources.map(async ([id, source]) => {
      const entry = this.#entries.get(id)
      if (!entry?.pending)
        return
      entry.pending = false
      if (!inputs.provider) {
        entry.state = { status: 'placeholder' }
        this.#paint(id, source)
        return
      }
      const resolved = this.#request(source, inputs.document, inputs.values)
      if (!resolved) {
        entry.state = { status: 'error' }
        this.#paint(id, source)
        return
      }
      const { request, dataset } = resolved
      const requestKey = JSON.stringify(request)
      used.add(requestKey)
      let pending = this.#data.get(requestKey)
      if (!pending) {
        pending = inputs.provider(request, { signal: abort.signal })
        this.#data.set(requestKey, pending)
      }
      if (!entry.state) {
        entry.state = { status: 'loading' }
        this.#paint(id, source)
      }
      try {
        const data = await pending
        if (run !== this.#runs)
          return
        entry.state = 'kind' in source
          ? { status: 'ready', result: computeCard(source, dataset, data, inputs.options) }
          : { status: 'view', view: computeView(source, dataset, data, inputs.options) }
      }
      catch (error) {
        if (run !== this.#runs || isAbort(error))
          return
        this.#data.delete(requestKey)
        entry.state = { status: 'error' }
      }
      this.#paint(id, source)
    }))
    if (run === this.#runs) {
      for (const key of this.#data.keys()) {
        if (!used.has(key))
          this.#data.delete(key)
      }
    }
  }

  #paint(id: string, source: DashboardCard | DataView): void {
    if (id === '')
      this.#paintView(source as DataView)
    else
      this.#paintCard(source as DashboardCard)
  }

  #paintCard(card: DashboardCard): void {
    const inputs = this.#inputs
    const frame = this.#frame?.get(card.id)
    if (!inputs || !frame)
      return
    const state = this.#entries.get(card.id)?.state
    if (!state || state.status === 'placeholder' || state.status === 'view') {
      frame.card.setAttribute('data-state', 'placeholder')
      frame.body.replaceChildren(placeholderNode(this.#host.ownerDocument, inputs.placeholder(cardTypeOf(card))))
      return
    }
    renderCard(frame.body, state, inputs.context, createReportRuntimeModel().cardRenderers)
  }

  #paintView(view: DataView): void {
    const inputs = this.#inputs
    const container = this.#view
    if (!inputs || !container)
      return
    const state = this.#entries.get('')?.state
    if (!state || state.status === 'placeholder' || state.status === 'ready') {
      container.setAttribute('data-state', 'placeholder')
      container.replaceChildren(placeholderNode(this.#host.ownerDocument, inputs.placeholder(`table.${view.type}`)))
      return
    }
    container.setAttribute('data-state', state.status === 'view' ? 'ready' : state.status)
    if (state.status !== 'view') {
      container.replaceChildren(createAuthoredElement(this.#host.ownerDocument, 'div', { 'data-part': 'card-status' }, [state.status === 'loading' ? inputs.context.translations.loading : inputs.context.translations.error]))
      return
    }
    renderView(container, state.view, inputs.context, tableLabel(inputs.document.title, state.view))
  }
}
