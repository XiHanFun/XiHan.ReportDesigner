/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 设计器的画布内容：看板用查看器的 renderDashboardFrame 搭网格与卡片外壳，卡片内容用 computeCard 与运行时模型里的渲染；
// 明细表、分组报表与交叉表用 computeView / renderView，作主体的扩展视图按种类计算并交给它的渲染。内容按定义缓存，
// 改过的卡片才在去抖后重新取数计算；位置大小变了只改卡片的位置变量。没给取数回调时取数的内容画占位，没登记的种类画种类名。
// 看板上照查看器画扩展的叠加层。卡片内容与表格视图在画布上不接收焦点与指针，点在上面落到卡片外壳。
// 渲染调试日志开着时记取数、计算与出图的耗时。

import type { ComputeOptions, DashboardCard, DashboardView, DatasetData, DatasetRequest, DatasetSchema, ExtensionViewResult, ParameterValues, ReportBody, ReportDocument, ViewResult } from '@xihan-report/core'
import type { ReportDataProvider, ReportRuntimeModel } from '@xihan-report/runtime'
import type { CardState, RenderContext, SceneCardState } from '@xihan-report/runtime/design'
import type { DesignerDebugLogger } from '@xihan-ui/designer-shell'
import { bodyQuery, cardQuery, cardTypeOf, cardView, computeCard, computeExtensionView, computeView, createDatasetRequest, findDataset, isDataView } from '@xihan-report/core'
import { dashboardScene, renderCard, renderDashboardFrame, renderOverlays, renderView, tableLabel } from '@xihan-report/runtime/design'
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
  /** 种类、渲染与取数中间件；取数回调已经包好中间件。 */
  readonly runtime: ReportRuntimeModel
  /** 占位上的说明：卡片种类与「给了取数回调后显示示例数据」。 */
  readonly placeholder: (kind: string) => string
}

/** 报表主体里不是看板的视图：明细表、分组报表、交叉表或扩展视图。 */
type BodyView = Exclude<ReportBody, DashboardView>

/** 画布上一份内容的定义：看板上的一张卡片，或报表主体的视图。 */
type Source = { readonly card: DashboardCard, readonly view?: undefined } | { readonly card?: undefined, readonly view: BodyView }

/** 一张卡片（或报表主体的视图）的内容状态；unknown 是种类没有登记。 */
type ContentState
  = | CardState
    | { readonly status: 'placeholder' }
    | { readonly status: 'unknown' }
    | { readonly status: 'view', readonly view: ViewResult | ExtensionViewResult }

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

/** 调试日志里一份内容的叫法：看板上的卡片写 card 加 id，报表主体写 body 加视图种类。 */
function sourceLabel({ card, view }: Source): string {
  return card ? `card ${card.id}` : `body ${view.type}`
}

/**
 * 画布内容：host 是专门放内容的容器（不与覆盖层共用），update 按文档重画。看板的骨架只在卡片增删、换序或标题说明变化时重建；
 * 位置大小变化只改位置变量。内容的键取卡片（或视图）去掉位置、标题与说明后的定义、数据集定义、参数取值与取数请求，
 * 键变了才重新取数计算；同一个请求的数据在一轮内共用。debug 的渲染日志开着时，每次取数、计算与出图各记一组耗时。
 */
export class CanvasContent {
  readonly #host: HTMLElement
  readonly #debug: DesignerDebugLogger
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
  #runtime: ReportRuntimeModel | undefined
  #overlaysQueued = false
  #resize: ResizeObserver | undefined
  #observed: HTMLElement | undefined

  constructor(host: HTMLElement, debug: DesignerDebugLogger) {
    this.#host = host
    this.#debug = debug
  }

  /** 看板上卡片的外壳；不是看板或卡片不存在时为 undefined。 */
  cardElement(id: string): HTMLElement | undefined {
    return this.#frame?.get(id)?.card
  }

  /** 看板网格；不是看板时为 undefined。 */
  get grid(): HTMLElement | undefined {
    return this.#frame ? this.#host.querySelector<HTMLElement>(':scope > [data-part="dashboard"]') ?? undefined : undefined
  }

  /** 按文档更新画布；内容的重算排到去抖之后。取数回调或扩展换了时全部重算。 */
  update(inputs: CanvasInputs): void {
    if (inputs.provider !== this.#provider) {
      this.#provider = inputs.provider
      this.#data.clear()
      for (const entry of this.#entries.values())
        entry.key = ''
    }
    if (inputs.runtime !== this.#runtime) {
      this.#runtime = inputs.runtime
      for (const entry of this.#entries.values())
        entry.key = ''
    }
    this.#inputs = inputs
    const body = inputs.document.body
    if (body.type === 'dashboard')
      this.#updateDashboard(body, inputs)
    else
      this.#updateView(body, inputs)
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
    this.#resize?.disconnect()
  }

  #updateDashboard(dashboard: DashboardView, inputs: CanvasInputs): void {
    this.#view = undefined
    const frameKey = JSON.stringify(dashboard.cards.map(card => [card.id, card.kind, card.title, card.description]))
    const rebuild = frameKey !== this.#frameKey || !this.#frame
    if (rebuild) {
      this.#frame = renderDashboardFrame(this.#host, dashboard)
      this.#frameKey = frameKey
      for (const { body } of this.#frame.values())
        body.toggleAttribute('inert', true)
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
      const key = this.#contentKey({ card }, inputs)
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
    this.#observeGrid()
    this.#scheduleOverlays()
  }

  /** 看板大小变了时重画叠加层。 */
  #observeGrid(): void {
    const grid = this.grid
    if (grid === this.#observed || typeof ResizeObserver !== 'function')
      return
    this.#resize ??= new ResizeObserver(() => this.#scheduleOverlays())
    this.#resize.disconnect()
    this.#observed = grid
    if (grid)
      this.#resize.observe(grid)
  }

  /** 同一轮里卡片一张张画完后再画一次叠加层。 */
  #scheduleOverlays(): void {
    if (this.#overlaysQueued)
      return
    this.#overlaysQueued = true
    queueMicrotask(() => {
      this.#overlaysQueued = false
      this.#renderOverlays()
    })
  }

  #renderOverlays(): void {
    const inputs = this.#inputs
    const grid = this.grid
    const frame = this.#frame
    const dashboard = inputs?.document.body
    if (!inputs || !grid || !frame || dashboard?.type !== 'dashboard')
      return
    const stateOf = (id: string): SceneCardState => {
      const state = this.#entries.get(id)?.state
      return state?.status === 'loading' || state?.status === 'error' || state?.status === 'ready' ? state : { status: 'placeholder' }
    }
    renderOverlays(grid, inputs.runtime.overlays, () => dashboardScene(grid, dashboard, frame, stateOf), { mode: 'designer', schema: inputs.document, render: inputs.context })
  }

  #updateView(view: BodyView, inputs: CanvasInputs): void {
    this.#frame = undefined
    this.#frameKey = undefined
    if (!this.#view || this.#view.parentElement !== this.#host) {
      this.#view = createAuthoredElement(this.#host.ownerDocument, 'div', { 'data-part': 'view', 'inert': true })
      this.#host.replaceChildren(this.#view)
    }
    for (const id of this.#entries.keys()) {
      if (id !== '')
        this.#entries.delete(id)
    }
    const key = this.#contentKey({ view }, inputs)
    const entry = this.#entries.get('')
    if (entry && entry.key === key)
      return
    this.#entries.set('', { key, state: entry?.state, pending: true })
    if (!entry)
      this.#paintView(view)
  }

  /** 卡片或视图取数的部分；不取数的为 undefined。 */
  #target({ card, view }: Source): ReturnType<typeof cardQuery> | ReturnType<typeof cardView> {
    if (card)
      return cardView(card) ?? cardQuery(card)
    return isDataView(view) ? view : bodyQuery(view)
  }

  /** 卡片或视图的数据集与取数请求；不取数或数据集不存在时为 undefined。 */
  #request(source: Source, document: ReportDocument, values: ParameterValues): { readonly request: DatasetRequest, readonly dataset: DatasetSchema } | undefined {
    const target = this.#target(source)
    if (!target)
      return undefined
    const dataset = findDataset(document, target.dataset)
    return dataset ? { request: createDatasetRequest(target, dataset, { parameters: values }), dataset } : undefined
  }

  /** 种类有没有登记：内置的明细表、分组报表与交叉表总是登记的。 */
  #registered({ card, view }: Source, runtime: ReportRuntimeModel): boolean {
    return card ? runtime.cards.has(card.kind) : runtime.views.has(view.type)
  }

  /** 不取数的内容直接计算。 */
  #computeWithoutData({ card, view }: Source, options: ComputeOptions): ContentState {
    if (card)
      return { status: 'ready', result: computeCard(card, undefined, undefined, options) }
    if (isDataView(view))
      throw new TypeError(`[report] view ${view.type} reads data`)
    return { status: 'view', view: computeExtensionView(view, undefined, undefined, options) }
  }

  #contentKey(source: Source, inputs: CanvasInputs): string {
    const definition = source.card ? { ...source.card, layout: undefined, title: undefined, description: undefined } : source.view
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
    const sources: [string, Source][] = body.type === 'dashboard' ? body.cards.map(card => [card.id, { card }]) : [['', { view: body }]]
    const used = new Set<string>()
    await Promise.all(sources.map(async ([id, source]) => {
      const entry = this.#entries.get(id)
      if (!entry?.pending)
        return
      entry.pending = false
      if (!this.#registered(source, inputs.runtime)) {
        entry.state = { status: 'unknown' }
        this.#paint(source)
        return
      }
      if (!this.#target(source)) {
        try {
          entry.state = this.#computeWithoutData(source, inputs.options)
        }
        catch {
          entry.state = { status: 'error' }
        }
        this.#paint(source)
        return
      }
      if (!inputs.provider) {
        entry.state = { status: 'placeholder' }
        this.#paint(source)
        return
      }
      const resolved = this.#request(source, inputs.document, inputs.values)
      if (!resolved) {
        entry.state = { status: 'error' }
        this.#paint(source)
        return
      }
      const { request, dataset } = resolved
      const requestKey = JSON.stringify(request)
      used.add(requestKey)
      let pending = this.#data.get(requestKey)
      if (!pending) {
        const end = this.#debug.start('render', `fetch: ${request.dataset}`)
        pending = inputs.provider(request, { signal: abort.signal })
        pending.then(data => end(() => ({ request, kind: data.kind, rows: data.rows.length })), (error: unknown) => end(() => ({ request, error })))
        this.#data.set(requestKey, pending)
      }
      if (!entry.state) {
        entry.state = { status: 'loading' }
        this.#paint(source)
      }
      try {
        const data = await pending
        if (run !== this.#runs)
          return
        const { card, view } = source
        entry.state = this.#debug.measure('render', `compute: ${sourceLabel(source)}`, (): ContentState => card
          ? { status: 'ready', result: computeCard(card, dataset, data, inputs.options) }
          : { status: 'view', view: isDataView(view) ? computeView(view, dataset, data, inputs.options) : computeExtensionView(view, dataset, data, inputs.options) }, () => ({ rows: data.rows.length }))
      }
      catch (error) {
        if (run !== this.#runs || isAbort(error))
          return
        this.#data.delete(requestKey)
        entry.state = { status: 'error' }
      }
      this.#paint(source)
    }))
    if (run === this.#runs) {
      for (const key of this.#data.keys()) {
        if (!used.has(key))
          this.#data.delete(key)
      }
    }
  }

  #paint({ card, view }: Source): void {
    if (card)
      this.#paintCard(card)
    else
      this.#paintView(view)
  }

  #paintCard(card: DashboardCard): void {
    const inputs = this.#inputs
    const frame = this.#frame?.get(card.id)
    if (!inputs || !frame)
      return
    const state = this.#entries.get(card.id)?.state
    this.#scheduleOverlays()
    if (state?.status === 'unknown') {
      frame.card.setAttribute('data-state', 'placeholder')
      frame.body.replaceChildren(placeholderNode(this.#host.ownerDocument, card.kind))
      return
    }
    if (!state || state.status === 'placeholder' || state.status === 'view') {
      frame.card.setAttribute('data-state', 'placeholder')
      frame.body.replaceChildren(placeholderNode(this.#host.ownerDocument, inputs.placeholder(cardTypeOf(card))))
      return
    }
    this.#debug.measure('render', `paint: card ${card.id}`, () => renderCard(frame.body, state, inputs.context, inputs.runtime.cardRenderers), () => ({ status: state.status }))
  }

  #paintView(view: BodyView): void {
    const inputs = this.#inputs
    const container = this.#view
    if (!inputs || !container)
      return
    const state = this.#entries.get('')?.state
    if (state?.status === 'unknown') {
      container.setAttribute('data-state', 'placeholder')
      container.replaceChildren(placeholderNode(this.#host.ownerDocument, view.type))
      return
    }
    if (!state || state.status === 'placeholder' || state.status === 'ready') {
      container.setAttribute('data-state', 'placeholder')
      container.replaceChildren(placeholderNode(this.#host.ownerDocument, inputs.placeholder(isDataView(view) ? `table.${view.type}` : view.type)))
      return
    }
    container.setAttribute('data-state', state.status === 'view' ? 'ready' : state.status)
    if (state.status !== 'view') {
      container.replaceChildren(createAuthoredElement(this.#host.ownerDocument, 'div', { 'data-part': 'card-status' }, [state.status === 'loading' ? inputs.context.translations.loading : inputs.context.translations.error]))
      return
    }
    const result = state.view
    this.#debug.measure('render', `paint: body ${view.type}`, () => {
      if ('type' in result)
        renderView(container, result, inputs.context, tableLabel(inputs.document.title, result))
      else
        inputs.runtime.viewRenderers.get(result.view.type)?.(container, result, inputs.context)
    })
  }
}
