/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// <xh-report-viewer>：报表查看器。校验报表定义与参数，经使用方的 dataProvider 取数，交给 core 计算后排成 UI 元素；
// 看板的图表卡片可作联动源，选中值换成目标卡片的筛选后只重算目标卡片。

import type { ComputeOptions, DashboardView, DatasetData, DatasetRequest, ExpressionEngine, LinkSelections, ParameterIssueCode, ParameterValue, ParameterValues, ReportDocument, ScalarValue, ValidationIssueCode } from '@xihan-report/core'
import type { SchemaIssue } from '@xihan-ui/designer-kit/schema'
import type { PropertyValues } from '@xihan-ui/web-components/authoring'
import type { ReportViewerTranslations } from '../translations'
import type { ChartPress, RenderedChart } from './charts'
import type { ViewResult } from './compute'
import type { RenderContext } from './context'
import type { CardState } from './dashboard'
import type { ReportFormatter } from './format'
import { createDatasetRequest, findDataset, resolveLinkFilters, resolveParameters, validateDocument } from '@xihan-report/core'
import { getLocalTimeZone } from '@xihan-ui/core/date'
import { hasErrors, withSeverity } from '@xihan-ui/designer-kit/schema'
import { valueKey } from '@xihan-ui/viz'
import { emitEvent, registerElement, XhConfigController, XhReactiveElement } from '@xihan-ui/web-components/authoring'
import { DEFAULT_REPORT_VIEWER_TRANSLATIONS } from '../translations'
import { computeView } from './compute'
import { createRenderContext } from './context'
import { renderCrosstab } from './crosstab'
import { cardDataset, computeCard, renderCard, renderDashboardFrame } from './dashboard'
import { ownPart } from './dom'
import { defaultFormatter } from './format'
import { renderGroupReport } from './group'
import { renderParameterBar } from './parameters'
import { renderDetailTable } from './table'

/** 查看器的标签名。 */
export const REPORT_VIEWER_TAG = 'xh-report-viewer'

/** 取数时附带的上下文：参数或联动变化、元素卸载时 signal 被取消。 */
export interface ReportDataContext {
  readonly signal: AbortSignal
}

/** 使用方的取数回调：按 core 算出的请求取数，交回明细行或已聚合行。 */
export type ReportDataProvider = (request: DatasetRequest, context: ReportDataContext) => Promise<DatasetData>

/** 查看器报出的问题：报表定义的校验问题与参数的检查问题，都带上 severity。 */
export type ReportViewerIssue = SchemaIssue<ValidationIssueCode | ParameterIssueCode>

/** 查看器派发的事件。 */
export interface ReportViewerEventMap {
  'issues-change': CustomEvent<{ issues: readonly ReportViewerIssue[] }>
  'load-error': CustomEvent<{ card: string | null, error: unknown }>
  'loading-change': CustomEvent<{ loading: boolean }>
  'selections-change': CustomEvent<{ value: LinkSelections }>
  /** 参数栏改了参数：value 是新的参数取值，清空的参数写 null。 */
  'parameters-change': CustomEvent<{ value: ParameterValues }>
  /** 转发图表卡片的 datum-press：link 与 value 是这次点按对应的联动与源维度上的取值，与联动无关时为 null。 */
  'datum-press': CustomEvent<{ card: string, link: string | null, value: unknown, chart: unknown }>
}

/** 查看器的状态。 */
type ViewerState = 'idle' | 'loading' | 'ready' | 'invalid' | 'parameters' | 'error'

interface Layers {
  readonly header: HTMLElement
  readonly status: HTMLElement
  readonly body: HTMLElement
}

/** 一轮取数用到的输入。 */
interface LoadInputs {
  readonly schema: ReportDocument
  readonly values: ParameterValues
  readonly provider: ReportDataProvider
  readonly options: ComputeOptions
}

const DATA_PROPERTIES: readonly PropertyKey[] = ['schema', 'dataProvider', 'expressionEngine', 'parameters', 'timeZone']

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

export class XhReportViewer extends XhReactiveElement {
  static override properties = {
    schema: { attribute: false },
    dataProvider: { attribute: false },
    expressionEngine: { attribute: false },
    formatter: { attribute: false },
    parameters: { attribute: false },
    selections: { attribute: false },
    locale: { attribute: 'locale' },
    timeZone: { attribute: 'time-zone' },
    translations: { attribute: false },
    hideParameters: { type: Boolean, attribute: 'hide-parameters' },
  }

  /** 报表定义。 */
  declare schema: ReportDocument | undefined
  /** 取数回调。 */
  declare dataProvider: ReportDataProvider | undefined
  /** 表达式引擎：计算字段与公式度量要用。 */
  declare expressionEngine: ExpressionEngine | undefined
  /** 值的显示文字；缺省按格式说明调 formatValue。 */
  declare formatter: ReportFormatter | undefined
  /** 报表参数的取值；不给时用各参数的缺省值。 */
  declare parameters: ParameterValues | undefined
  /** 看板联动的选中值；给了就是受控。 */
  declare selections: LinkSelections | undefined
  /** BCP 47 语言标记；缺省取全局配置。 */
  declare locale: string | undefined
  /** IANA 时区；缺省取运行环境所在的时区。 */
  declare timeZone: string | undefined
  /** 元素自己的文案，压在全局配置之上。 */
  declare translations: Partial<ReportViewerTranslations> | undefined
  /** 不显示参数栏。 */
  declare hideParameters: boolean | undefined

  readonly #config = new XhConfigController(this)
  #layers: Layers | undefined
  #state: ViewerState = 'idle'
  #issues: readonly ReportViewerIssue[] = []
  #loading = false
  #runs = 0
  #abort: AbortController | undefined
  #inputs: LoadInputs | undefined
  #view: ViewResult | undefined
  #cards = new Map<string, CardState>()
  #cardFilters = new Map<string, string>()
  #frame: Map<string, { readonly card: HTMLElement, readonly body: HTMLElement }> | undefined
  #frameOf: DashboardView | undefined
  #charts = new Map<string, RenderedChart>()
  #ownSelections: LinkSelections = {}
  #ownParameters: ParameterValues | undefined
  #emittedParameters: string | undefined
  #headerFor: string | undefined
  #pendingCards = 0

  /** 最近一次校验报表定义与检查参数得到的问题。 */
  get issues(): readonly ReportViewerIssue[] {
    return this.#issues
  }

  /** 是否还有未完成的取数。 */
  get loading(): boolean {
    return this.#loading
  }

  /** 重新取数并计算；看板可以只刷新部分卡片。 */
  refresh(options: { readonly cards?: readonly string[] } = {}): Promise<void> {
    return options.cards && this.#inputs && this.#dashboard() ? this.#loadCards(new Set(options.cards)) : this.#load()
  }

  /** 清除看板联动的选中值。 */
  clearSelections(): void {
    this.#setSelections({})
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#abort?.abort()
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed)
    const layers = this.#ensureLayers()
    this.setAttribute('aria-label', this.#translations().label)
    this.#renderHeader(layers, changed)
    if (DATA_PROPERTIES.some(key => changed.has(key)))
      void this.#load()
    else if (changed.has('selections') && this.#inputs && this.#dashboard())
      void this.#loadLinked()
    else
      this.#render(layers)
  }

  #translations(): ReportViewerTranslations {
    return this.#config.translations<ReportViewerTranslations>('xh-report-viewer', DEFAULT_REPORT_VIEWER_TRANSLATIONS, this.translations)
  }

  #timeZone(): string {
    return this.timeZone ?? getLocalTimeZone()
  }

  #locale(): string | undefined {
    return this.locale ?? this.#config.locale
  }

  #context(): RenderContext {
    return createRenderContext(this.#translations(), this.formatter ?? defaultFormatter, this.#locale(), this.#timeZone())
  }

  #selectionsNow(): LinkSelections {
    return this.selections ?? this.#ownSelections
  }

  #parametersNow(): ParameterValues {
    return this.parameters ?? this.#ownParameters ?? {}
  }

  #setParameter(name: string, value: ParameterValue | undefined): void {
    const next: Record<string, ParameterValue> = { ...this.#parametersNow(), [name]: value === undefined ? null : value }
    this.#emittedParameters = JSON.stringify(next)
    if (this.parameters === undefined) {
      this.#ownParameters = next
      void this.#load()
    }
    emitEvent(this, 'parameters-change', { value: next })
  }

  /** 参数栏与清除联动按钮：报表定义、文案或显隐变了才重排；参数栏自己发出的改动写回时不重排，以免打断输入。 */
  #renderHeader(layers: Layers, changed: PropertyValues): void {
    const schema = this.schema
    const external = changed.has('parameters') && JSON.stringify(this.parameters ?? {}) !== this.#emittedParameters
    const links = schema?.body.type === 'dashboard' ? (schema.body.links ?? []).length : 0
    const key = JSON.stringify([schema?.id, schema?.parameters, links, this.hideParameters, this.#translations(), this.#locale()])
    if (key === this.#headerFor && !external && layers.header.isConnected)
      return
    this.#headerFor = key
    const ctx = this.#context()
    const parts: HTMLElement[] = []
    if (schema && !this.hideParameters) {
      const values = resolveParameters(schema.parameters, this.#parametersNow()).values
      const bar = renderParameterBar(schema.parameters, values, ctx, { change: (name, value) => this.#setParameter(name, value) })
      if (bar)
        parts.push(bar)
    }
    if (schema?.body.type === 'dashboard' && (schema.body.links ?? []).length > 0) {
      const button = document.createElement('xh-button')
      button.setAttribute('variant', 'outline')
      button.setAttribute('size', 'sm')
      button.dataset.part = 'clear-selections'
      const root = document.createElement('button')
      root.dataset.xhPart = 'root'
      root.type = 'button'
      root.textContent = ctx.translations.clearSelections
      button.append(root)
      root.addEventListener('click', () => this.clearSelections())
      parts.push(button)
    }
    layers.header.replaceChildren(...parts)
    layers.header.hidden = parts.length === 0
  }

  #dashboard(): DashboardView | undefined {
    const body = this.#inputs?.schema.body
    return body?.type === 'dashboard' ? body : undefined
  }

  #ensureLayers(): Layers {
    if (this.#layers && this.#layers.body.parentNode === this)
      return this.#layers
    const header = ownPart('div', 'header')
    const status = ownPart('div', 'status')
    status.setAttribute('role', 'status')
    const body = ownPart('div', 'body')
    this.replaceChildren(header, status, body)
    this.#layers = { header, status, body }
    this.#headerFor = undefined
    this.#frame = undefined
    return this.#layers
  }

  #setIssues(issues: readonly ReportViewerIssue[]): void {
    if (JSON.stringify(issues) === JSON.stringify(this.#issues))
      return
    this.#issues = issues
    emitEvent(this, 'issues-change', { issues })
  }

  #setLoading(loading: boolean): void {
    if (loading === this.#loading)
      return
    this.#loading = loading
    emitEvent(this, 'loading-change', { loading })
  }

  #reset(state: ViewerState): void {
    this.#inputs = undefined
    this.#view = undefined
    this.#cards.clear()
    this.#cardFilters.clear()
    this.#setLoading(false)
    this.#state = state
    this.#render(this.#ensureLayers())
  }

  async #load(): Promise<void> {
    const run = ++this.#runs
    this.#abort?.abort()
    const abort = new AbortController()
    this.#abort = abort
    const schema = this.schema
    if (!schema) {
      this.#setIssues([])
      return this.#reset('idle')
    }
    const issues = withSeverity(validateDocument(schema, this.expressionEngine ? { expressionEngine: this.expressionEngine } : {}), {})
    if (hasErrors(issues)) {
      this.#setIssues(issues)
      return this.#reset('invalid')
    }
    const resolved = resolveParameters(schema.parameters, this.#parametersNow())
    const parameterIssues = withSeverity(resolved.issues, {})
    this.#setIssues([...issues, ...parameterIssues])
    if (hasErrors(parameterIssues))
      return this.#reset('parameters')
    const provider = this.dataProvider
    if (!provider)
      return this.#reset('idle')

    const inputs: LoadInputs = {
      schema,
      values: resolved.values,
      provider,
      options: {
        parameters: resolved.values,
        timeZone: this.#timeZone(),
        collate: new Intl.Collator(this.#locale()).compare,
        ...(this.expressionEngine ? { expressionEngine: this.expressionEngine } : {}),
      },
    }
    if (inputs.schema !== this.#inputs?.schema) {
      this.#view = undefined
      this.#cards.clear()
      this.#cardFilters.clear()
    }
    this.#inputs = inputs
    const body = schema.body
    if (body.type === 'dashboard') {
      this.#state = 'ready'
      return this.#loadCards(undefined, run, abort)
    }

    this.#setLoading(true)
    if (!this.#view) {
      this.#state = 'loading'
      this.#render(this.#ensureLayers())
    }
    try {
      const dataset = findDataset(schema, body.dataset)!
      const request = createDatasetRequest(body, dataset, { parameters: inputs.values })
      const data = await provider(request, { signal: abort.signal })
      if (run !== this.#runs)
        return
      this.#view = computeView(body, dataset, data, inputs.options)
      this.#state = 'ready'
    }
    catch (error) {
      if (run !== this.#runs || isAbort(error))
        return
      this.#view = undefined
      this.#state = 'error'
      emitEvent(this, 'load-error', { card: null, error })
    }
    this.#setLoading(false)
    this.#render(this.#ensureLayers())
  }

  /** 联动变化后只重算筛选变了的卡片；还有卡片在取数时整体重来。 */
  #loadLinked(): Promise<void> {
    const dashboard = this.#dashboard()
    if (!dashboard)
      return Promise.resolve()
    if (this.#pendingCards > 0)
      return this.#load()
    const filters = resolveLinkFilters(dashboard, this.#selectionsNow())
    const changed = new Set(dashboard.cards.filter(card => JSON.stringify(filters[card.id] ?? []) !== this.#cardFilters.get(card.id)).map(card => card.id))
    this.#renderActiveKeys()
    return changed.size > 0 ? this.#loadCards(changed) : Promise.resolve()
  }

  async #loadCards(only: ReadonlySet<string> | undefined, run = ++this.#runs, abort?: AbortController): Promise<void> {
    const inputs = this.#inputs
    const dashboard = this.#dashboard()
    if (!inputs || !dashboard)
      return
    if (!abort) {
      this.#abort?.abort()
      abort = new AbortController()
      this.#abort = abort
    }
    const signal = abort.signal
    const filters = resolveLinkFilters(dashboard, this.#selectionsNow())
    const targets = dashboard.cards.filter(card => !only || only.has(card.id))
    for (const card of targets) {
      if (!this.#cards.has(card.id) || this.#cards.get(card.id)!.status === 'error')
        this.#cards.set(card.id, { status: 'loading' })
    }
    this.#render(this.#ensureLayers())
    this.#pendingCards = targets.length
    this.#setLoading(targets.length > 0)
    const requests = new Map<string, Promise<DatasetData>>()
    await Promise.all(targets.map(async (card) => {
      const cardFilters = filters[card.id] ?? []
      try {
        const dataset = findDataset(inputs.schema, cardDataset(card))!
        const request = createDatasetRequest(card.kind === 'table' ? card.view : card, dataset, { parameters: inputs.values, filters: cardFilters })
        const key = JSON.stringify(request)
        let pending = requests.get(key)
        if (!pending) {
          pending = inputs.provider(request, { signal })
          requests.set(key, pending)
        }
        const data = await pending
        if (run !== this.#runs)
          return
        this.#cards.set(card.id, { status: 'ready', result: computeCard(card, dataset, data, { ...inputs.options, filters: cardFilters }) })
        this.#cardFilters.set(card.id, JSON.stringify(cardFilters))
      }
      catch (error) {
        if (run !== this.#runs || isAbort(error))
          return
        this.#cards.set(card.id, { status: 'error' })
        emitEvent(this, 'load-error', { card: card.id, error })
      }
      finally {
        if (run === this.#runs)
          this.#pendingCards--
      }
      this.#renderCard(card.id, this.#context())
    }))
    if (run === this.#runs)
      this.#setLoading(false)
  }

  #setSelections(next: LinkSelections): void {
    if (JSON.stringify(next) === JSON.stringify(this.#selectionsNow()))
      return
    if (this.selections === undefined) {
      this.#ownSelections = next
      void this.#loadLinked()
    }
    emitEvent(this, 'selections-change', { value: next })
  }

  #onPress(cardId: string, event: Event): void {
    event.stopPropagation()
    const detail = (event as CustomEvent<ChartPress>).detail
    const dashboard = this.#dashboard()
    const rendered = this.#charts.get(cardId)
    if (!dashboard || !rendered)
      return
    const selections: Record<string, readonly ScalarValue[]> = { ...this.#selectionsNow() }
    let link: string | null = null
    let value: unknown = null
    for (const item of dashboard.links ?? []) {
      if (item.card !== cardId)
        continue
      const resolved = rendered.valueOf(detail, item.dimension)
      if (!resolved)
        continue
      link ??= item.id
      value = link === item.id ? resolved.value : value
      const current = selections[item.id] ?? []
      const same = current.length === 1 && valueKey(current[0]) === valueKey(resolved.value)
      selections[item.id] = same ? [] : [resolved.value as ScalarValue]
    }
    emitEvent(this, 'datum-press', { card: cardId, link, value, chart: detail })
    if (link !== null)
      this.#setSelections(selections)
  }

  /** 源图表的 activeKey 写成当前选中值在图表里的键。 */
  #renderActiveKeys(): void {
    const dashboard = this.#dashboard()
    const selections = this.#selectionsNow()
    for (const [cardId, rendered] of this.#charts) {
      let key: unknown
      for (const link of dashboard?.links ?? []) {
        const values = selections[link.id]
        if (link.card === cardId && values && values.length > 0)
          key ??= rendered.keyOf(link.dimension, values[0])
      }
      Object.assign(rendered.element, { activeKey: key })
    }
  }

  #renderCard(cardId: string, ctx: RenderContext): void {
    const frame = this.#frame?.get(cardId)
    const state = this.#cards.get(cardId)
    if (!frame || !state)
      return
    this.#charts.delete(cardId)
    const rendered = renderCard(frame.body, state, ctx)
    if (rendered) {
      this.#charts.set(cardId, rendered)
      rendered.element.addEventListener('datum-press', event => this.#onPress(cardId, event))
    }
    this.#renderActiveKeys()
  }

  #render(layers: Layers): void {
    const t = this.#translations()
    this.dataset.state = this.#state
    const message: Partial<Record<ViewerState, string>> = {
      loading: t.loading,
      invalid: t.invalid,
      parameters: t.parametersInvalid,
      error: t.error,
    }
    const text = message[this.#state]
    layers.status.textContent = text ?? ''
    layers.status.hidden = text === undefined
    if (this.#state !== 'ready') {
      if (this.#state !== 'loading') {
        layers.body.replaceChildren()
        this.#frame = undefined
        this.#frameOf = undefined
      }
      return
    }
    const ctx = this.#context()
    const dashboard = this.#dashboard()
    if (dashboard) {
      if (!this.#frame || this.#frameOf !== dashboard) {
        this.#frame = renderDashboardFrame(layers.body, dashboard)
        this.#frameOf = dashboard
      }
      for (const card of dashboard.cards)
        this.#renderCard(card.id, ctx)
      return
    }
    this.#frame = undefined
    this.#frameOf = undefined
    const view = this.#view
    if (!view)
      return
    if (view.type === 'table')
      renderDetailTable(layers.body, view.view, view.dataset, view.result, ctx)
    else if (view.type === 'group')
      renderGroupReport(layers.body, view.view, view.dataset, view.result, ctx)
    else
      renderCrosstab(layers.body, view.view, view.dataset, view.result, ctx)
  }
}

/** 注册 <xh-report-viewer>；用到的 UI 元素由宿主先经 defineXhElements() 注册。 */
export function defineReportViewer(): void {
  registerElement(REPORT_VIEWER_TAG, XhReportViewer)
}

declare global {
  interface HTMLElementTagNameMap {
    'xh-report-viewer': XhReportViewer
  }
}
