/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// <xh-report-viewer>：报表查看器。校验报表定义与参数，经使用方的 dataProvider 取数，交给 core 计算后排成 UI 元素；
// 看板的图表卡片可作联动源，选中值换成目标卡片的筛选后只重算目标卡片。

import type { ComputeOptions, DashboardView, DatasetData, DatasetRequest, ExpressionEngine, ExtensionViewResult, FilterCondition, LinkSelections, ParameterIssueCode, ParameterValue, ParameterValues, ReportDocument, ScalarValue, ValidationIssueCode, ViewResult } from '@xihan-report/core'
import type { SchemaIssue } from '@xihan-ui/designer-kit/schema'
import type { PropertyValues } from '@xihan-ui/web-components/authoring'
import type { ReportResults, ReportRuntimeExtension, ReportRuntimeModel } from '../extensions'
import type { ReportViewerTranslations } from '../translations'
import type { ChartPress, RenderedChart } from './charts'
import type { RenderContext } from './context'
import type { CardState } from './dashboard'
import type { ReportFormatter } from './format'
import type { RenderedTable, TableCellRef } from './table'
import { bodyQuery, cardQuery, cardView, computeCard, computeExtensionView, computeView, createDatasetRequest, findDataset, isDataView, resolveLinkFilters, resolveParameters, validateDocument } from '@xihan-report/core'
import { getLocalTimeZone } from '@xihan-ui/core/date'
import { hasErrors, withSeverity } from '@xihan-ui/designer-kit/schema'
import { valueKey } from '@xihan-ui/viz'
import { BOOLEAN_CONVERTER, emitEvent, registerElement, XhConfigController, XhReactiveElement } from '@xihan-ui/web-components/authoring'
import { createReportRuntimeModel } from '../extensions'
import { DEFAULT_REPORT_VIEWER_TRANSLATIONS } from '../translations'
import { createRenderContext } from './context'
import { dashboardScene, keepTableFocus, renderCard, renderDashboardFrame, renderOverlays, renderView, tableLabel } from './dashboard'
import { ownPart } from './dom'
import { defineViewerElements } from './elements'
import { defaultFormatter } from './format'
import { renderParameterBar } from './parameters'

/** 查看器的标签名。 */
export const REPORT_VIEWER_TAG = 'xh-report-viewer'

/** 取数时附带的上下文：参数或联动变化、元素卸载时 signal 被取消。 */
export interface ReportDataContext {
  /** 取消信号：这一轮取数作废时触发，取数回调应随之中止请求。 */
  readonly signal: AbortSignal
}

/** 使用方的取数回调：按 core 算出的请求取数，交回明细行或已聚合行。 */
export type ReportDataProvider = (request: DatasetRequest, context: ReportDataContext) => Promise<DatasetData>

/** 查看器报出的问题：报表定义的校验问题与参数的检查问题，都带上 severity。 */
export type ReportViewerIssue = SchemaIssue<ValidationIssueCode | ParameterIssueCode>

/** 查看器派发的事件。 */
export interface ReportViewerEventMap {
  /** 报表定义的校验问题或参数的检查问题变了。 */
  'issues-change': CustomEvent<{ issues: readonly ReportViewerIssue[] }>
  /** 取数或计算出错：card 是出错的卡片，报表主体出错时为 null。 */
  'load-error': CustomEvent<{ card: string | null, error: unknown }>
  /** 开始或结束取数。 */
  'loading-change': CustomEvent<{ loading: boolean }>
  /** 看板联动的选中值变了：value 是联动 id 到选中取值的对照；受控时宿主要把它写回 selections。 */
  'selections-change': CustomEvent<{ value: LinkSelections }>
  /** 参数栏改了参数：value 是新的参数取值，清空的参数写 null。 */
  'parameters-change': CustomEvent<{ value: ParameterValues }>
  /** 转发图表卡片的 datum-press：link 与 value 是这次点按对应的联动与源维度上的取值，与联动无关时为 null。 */
  'datum-press': CustomEvent<{ card: string, link: string | null, value: unknown, chart: unknown }>
  /**
   * 表格的行主操作（点一格，或焦点行上按 Enter），用来下钻：card 是看板里的表格卡片，报表主体是表格时为 null；
   * kind、column、values 说明点中的那一格（见 TableCellRef）。表格卡片作联动源时，link 与 value 是这次点按对应的联动
   * 与源维度上的取值，与联动无关时为 null。
   */
  'action': CustomEvent<{ card: string | null, link: string | null, value: unknown } & TableCellRef>
}

/** 一轮绘制用到的输入：内容（卡片状态或视图结果）、绘的位置与影响文字的几项。 */
interface PaintKey {
  readonly content: unknown
  readonly target: HTMLElement
  readonly translations: unknown
  readonly formatter: unknown
  readonly locale: string | undefined
  readonly timeZone: string
}

/** 两份文案逐键相同（全局配置每次合并出一份新对象，里面的取值引用不变）。 */
function sameTranslations(a: unknown, b: unknown): boolean {
  if (a === b)
    return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null)
    return false
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every(key => (a as Record<string, unknown>)[key] === (b as Record<string, unknown>)[key])
}

function samePaint(a: PaintKey | undefined, b: PaintKey): boolean {
  return a !== undefined && a.content === b.content && a.target === b.target && sameTranslations(a.translations, b.translations) && a.formatter === b.formatter && a.locale === b.locale && a.timeZone === b.timeZone
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

const DATA_PROPERTIES: readonly PropertyKey[] = ['schema', 'dataProvider', 'expressionEngine', 'extensions', 'parameters', 'timeZone']

function isAbort(error: unknown): boolean {
  return typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
}

/** 报表查看器 <xh-report-viewer>：按报表定义、参数与联动取数，算出并绘出报表主体或看板。 */
export class XhReportViewer extends XhReactiveElement {
  static override properties = {
    schema: { attribute: false },
    dataProvider: { attribute: false },
    expressionEngine: { attribute: false },
    extensions: { attribute: false },
    formatter: { attribute: false },
    parameters: { attribute: false },
    selections: { attribute: false },
    locale: { attribute: 'locale' },
    timeZone: { attribute: 'time-zone' },
    translations: { attribute: false },
    hideParameters: { converter: BOOLEAN_CONVERTER, attribute: 'hide-parameters' },
  }

  /** 报表定义。 */
  declare schema: ReportDocument | undefined
  /** 取数回调。 */
  declare dataProvider: ReportDataProvider | undefined
  /** 表达式引擎：计算字段与公式度量要用。 */
  declare expressionEngine: ExpressionEngine | undefined
  /** 卡片与视图种类、渲染、叠加层、导出与取数中间件的扩展；赋值时当场合并查重，冲突时退回原值再抛。 */
  declare extensions: readonly ReportRuntimeExtension[] | undefined
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
  /** 不显示参数栏；缺省显示。attribute 写 "false" 是显示，其余写法是不显示。 */
  declare hideParameters: boolean | undefined

  readonly #config = new XhConfigController(this)
  #layers: Layers | undefined
  #state: ViewerState = 'idle'
  #issues: readonly ReportViewerIssue[] = []
  #loading = false
  #runs = 0
  #abort: AbortController | undefined
  #inputs: LoadInputs | undefined
  #view: ViewResult | ExtensionViewResult | undefined
  #cards = new Map<string, CardState>()
  #cardFilters = new Map<string, readonly FilterCondition[]>()
  #frame: Map<string, { readonly card: HTMLElement, readonly body: HTMLElement }> | undefined
  #frameOf: DashboardView | undefined
  #charts = new Map<string, RenderedChart>()
  readonly #pressBound = new WeakSet<HTMLElement>()
  /** 各卡片（主体视图记在空串下）上一轮绘制用到的输入。 */
  readonly #painted = new Map<string, PaintKey>()
  #ownSelections: LinkSelections = {}
  #ownParameters: ParameterValues | undefined
  #emittedParameters: string | undefined
  #headerFor: string | undefined
  #pendingCards = 0
  #overlaysQueued = false
  #resize: ResizeObserver | undefined
  #observed: HTMLElement | undefined

  /** 最近一次校验报表定义与检查参数得到的问题。 */
  get issues(): readonly ReportViewerIssue[] {
    return this.#issues
  }

  /** 是否还有未完成的取数。 */
  get loading(): boolean {
    return this.#loading
  }

  /** 此刻的计算结果，只读快照：主体视图或看板上已算好的卡片，以及当时的参数与联动。 */
  getResults(): ReportResults {
    const dashboard = this.#dashboard()
    const cards = (dashboard?.cards ?? []).flatMap((card) => {
      const state = this.#cards.get(card.id)
      return state?.status === 'ready' ? [{ result: state.result, filters: this.#cardFilters.get(card.id) ?? [] }] : []
    })
    return {
      parameters: this.#inputs?.values ?? {},
      selections: this.#selectionsNow(),
      body: dashboard ? undefined : this.#view,
      cards,
    }
  }

  /** 重新取数并计算；看板可以只刷新部分卡片。 */
  refresh(options: { readonly cards?: readonly string[] } = {}): Promise<void> {
    return options.cards && this.#inputs && this.#dashboard() ? this.#loadCards(new Set(options.cards)) : this.#load()
  }

  /** 清除看板联动的选中值。 */
  clearSelections(): void {
    this.#setSelections({})
  }

  /**
   * 导出成文件：交给登记了这种格式的第一个导出器（内置的 xlsx 在最前，扩展可以加别的格式），options 原样交给它。
   * 内置的 xlsx 把当前的计算结果写成工作簿：表格主体导出一张表（表名取 options.name，缺省取报表标题），看板按已算好的
   * 表格卡片各导一张（表名取卡片标题），写出部分按需加载，还没有可导出的结果时抛 RangeError。
   * 没有导出器认这种格式时抛 RangeError。
   */
  export(format: string, options: Readonly<Record<string, unknown>> = {}): Promise<Blob | string> {
    const schema = this.schema
    const exporter = this.#model().exporters.find(item => item.formats.includes(format))
    if (!schema || !exporter)
      return Promise.reject(new RangeError(`[xh-report-viewer] no exporter for ${format}`))
    return exporter.export(format, { schema, results: this.getResults(), translations: this.#translations(), timeZone: this.#timeZone(), options })
  }

  override connectedCallback(): void {
    super.connectedCallback()
    this.#observeGrid()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#abort?.abort()
    this.#resize?.disconnect()
    this.#observed = undefined
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

  /** extensions 赋值时当场合并查重，冲突时退回原值再抛。 */
  override requestUpdate(name?: PropertyKey, oldValue?: unknown): void {
    if (name === 'extensions') {
      try {
        createReportRuntimeModel(this.extensions)
      }
      catch (error) {
        this.extensions = oldValue as readonly ReportRuntimeExtension[] | undefined
        throw error
      }
    }
    super.requestUpdate(name, oldValue)
  }

  #model(): ReportRuntimeModel {
    return createReportRuntimeModel(this.extensions)
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
    const extensions = this.extensions ?? []
    const issues = withSeverity(validateDocument(schema, { extensions, ...(this.expressionEngine ? { expressionEngine: this.expressionEngine } : {}) }), {})
    if (hasErrors(issues)) {
      this.#setIssues(issues)
      return this.#reset('invalid')
    }
    const resolved = resolveParameters(schema.parameters, this.#parametersNow())
    const parameterIssues = withSeverity(resolved.issues, {})
    this.#setIssues([...issues, ...parameterIssues])
    if (hasErrors(parameterIssues))
      return this.#reset('parameters')
    if (!this.dataProvider)
      return this.#reset('idle')
    const provider = this.#model().provider(this.dataProvider)

    const inputs: LoadInputs = {
      schema,
      values: resolved.values,
      provider,
      options: {
        extensions,
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
      const source = isDataView(body) ? body : bodyQuery(body)
      const dataset = source ? findDataset(schema, source.dataset)! : undefined
      const data = source && dataset ? await provider(createDatasetRequest(source, dataset, { parameters: inputs.values }), { signal: abort.signal }) : undefined
      if (run !== this.#runs)
        return
      this.#view = isDataView(body) ? computeView(body, dataset!, data!, inputs.options) : computeExtensionView(body, dataset, data, inputs.options)
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
    const changed = new Set(dashboard.cards.filter(card => JSON.stringify(filters[card.id] ?? []) !== JSON.stringify(this.#cardFilters.get(card.id))).map(card => card.id))
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
        const source = cardView(card) ?? cardQuery(card)
        if (!source) {
          this.#cards.set(card.id, { status: 'ready', result: computeCard(card, undefined, undefined, { ...inputs.options, filters: cardFilters }) })
          this.#cardFilters.set(card.id, cardFilters)
          return
        }
        const dataset = findDataset(inputs.schema, source.dataset)!
        const request = createDatasetRequest(source, dataset, { parameters: inputs.values, filters: cardFilters })
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
        this.#cardFilters.set(card.id, cardFilters)
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

  /** 源卡片上点了一下：以源卡片为源的各联动按 resolve 得到的取值切换选中（再点同一个值取消）。 */
  #select(cardId: string, resolve: (dimension: string) => { readonly value: unknown } | undefined): { link: string | null, value: unknown, apply: () => void } {
    const selections: Record<string, readonly ScalarValue[]> = { ...this.#selectionsNow() }
    let link: string | null = null
    let value: unknown = null
    for (const item of this.#dashboard()?.links ?? []) {
      if (item.card !== cardId)
        continue
      const resolved = resolve(item.dimension)
      if (!resolved)
        continue
      link ??= item.id
      value = link === item.id ? resolved.value : value
      const current = selections[item.id] ?? []
      const same = current.length === 1 && valueKey(current[0]) === valueKey(resolved.value)
      selections[item.id] = same ? [] : [resolved.value as ScalarValue]
    }
    return { link, value, apply: () => link !== null && this.#setSelections(selections) }
  }

  #onPress(cardId: string, event: Event): void {
    event.stopPropagation()
    const detail = (event as CustomEvent<ChartPress>).detail
    const rendered = this.#charts.get(cardId)
    if (!this.#dashboard() || !rendered)
      return
    const { link, value, apply } = this.#select(cardId, dimension => rendered.valueOf(detail, dimension))
    emitEvent(this, 'datum-press', { card: cardId, link, value, chart: detail })
    apply()
  }

  /** 表格的行主操作：换成报表里的那一格转发出去；表格卡片同时按联动切换选中。 */
  #bindTable(cardId: string | null, rendered: RenderedTable): void {
    rendered.element.addEventListener('action', (event) => {
      event.stopPropagation()
      const detail = (event as CustomEvent<{ value: string, column: string | null }>).detail
      const cell = rendered.cellOf(detail.value, detail.column)
      if (!cell)
        return
      const resolve = (dimension: string): { value: unknown } | undefined => (Object.hasOwn(cell.values, dimension) ? { value: cell.values[dimension] } : undefined)
      const { link, value, apply } = cardId === null ? { link: null, value: null, apply: () => {} } : this.#select(cardId, resolve)
      emitEvent(this, 'action', { card: cardId, link, value, ...cell })
      apply()
    })
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

  /** 这一轮绘制用到的输入：与上一轮相同的卡片或主体视图不重绘。 */
  #paintKey(ctx: RenderContext, content: unknown, target: HTMLElement): PaintKey {
    return { content, target, translations: ctx.translations, formatter: this.formatter, locale: this.#locale(), timeZone: this.#timeZone() }
  }

  #renderCard(cardId: string, ctx: RenderContext): void {
    const frame = this.#frame?.get(cardId)
    const state = this.#cards.get(cardId)
    if (!frame || !state)
      return
    const key = this.#paintKey(ctx, state, frame.body)
    if (samePaint(this.#painted.get(cardId), key)) {
      this.#renderActiveKeys()
      return
    }
    this.#painted.set(cardId, key)
    this.#scheduleOverlays()
    this.#charts.delete(cardId)
    const rendered = renderCard(frame.body, state, ctx, this.#model().cardRenderers)
    if (rendered && 'cellOf' in rendered) {
      this.#bindTable(cardId, rendered)
    }
    else if (rendered) {
      this.#charts.set(cardId, rendered)
      // 同种图表复用元素时监听已经挂过，不再重复挂
      if (!this.#pressBound.has(rendered.element)) {
        this.#pressBound.add(rendered.element)
        rendered.element.addEventListener('datum-press', event => this.#onPress(cardId, event))
      }
    }
    this.#renderActiveKeys()
  }

  /** 看板网格；主体不是看板或还没排时为 undefined。 */
  #grid(): HTMLElement | undefined {
    return this.#frame ? this.#layers?.body.querySelector<HTMLElement>(':scope > [data-part="dashboard"]') ?? undefined : undefined
  }

  /** 看板大小变了时重画叠加层。 */
  #observeGrid(): void {
    const grid = this.#grid()
    if (grid === this.#observed || !this.isConnected || typeof ResizeObserver !== 'function')
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
    const grid = this.#grid()
    const dashboard = this.#dashboard()
    const frame = this.#frame
    const schema = this.#inputs?.schema
    if (!grid || !dashboard || !frame || !schema || this.#frameOf !== dashboard)
      return
    renderOverlays(grid, this.#model().overlays, () => dashboardScene(grid, dashboard, frame, id => this.#cards.get(id)), { mode: 'viewer', schema, render: this.#context() })
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
      this.#observeGrid()
      this.#scheduleOverlays()
      return
    }
    this.#frame = undefined
    this.#frameOf = undefined
    const view = this.#view
    if (!view)
      return
    const key = this.#paintKey(ctx, view, layers.body)
    if (samePaint(this.#painted.get(''), key))
      return
    this.#painted.set('', key)
    if ('type' in view) {
      this.#bindTable(null, keepTableFocus(layers.body, () => renderView(layers.body, view, ctx, tableLabel(this.schema?.title, view))))
      return
    }
    const rendered = this.#model().viewRenderers.get(view.view.type)!(layers.body, view, ctx)
    if (rendered && 'cellOf' in rendered)
      this.#bindTable(null, rendered)
  }
}

/** 注册 <xh-report-viewer> 与它排出的 UI 元素（按需注册），宿主不必再全量注册 UI 元素。 */
export function defineReportViewer(): void {
  defineViewerElements()
  registerElement(REPORT_VIEWER_TAG, XhReportViewer)
}

declare global {
  interface HTMLElementTagNameMap {
    'xh-report-viewer': XhReportViewer
  }
}
