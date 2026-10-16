/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// <xh-report-viewer>：报表查看器。校验报表定义与参数，经使用方的 dataProvider 取数，交给 core 计算后排成 UI 元素。

import type { DatasetData, DatasetRequest, ExpressionEngine, LinkSelections, ParameterIssueCode, ParameterValues, ReportDocument, ValidationIssueCode } from '@xihan-report/core'
import type { SchemaIssue } from '@xihan-ui/designer-kit/schema'
import type { PropertyValues } from '@xihan-ui/web-components/authoring'
import type { ReportViewerTranslations } from '../translations'
import type { ViewResult } from './compute'
import type { ReportFormatter } from './format'
import { createDatasetRequest, findDataset, resolveParameters, validateDocument } from '@xihan-report/core'
import { getLocalTimeZone } from '@xihan-ui/core/date'
import { hasErrors, withSeverity } from '@xihan-ui/designer-kit/schema'
import { emitEvent, registerElement, XhConfigController, XhReactiveElement } from '@xihan-ui/web-components/authoring'
import { DEFAULT_REPORT_VIEWER_TRANSLATIONS } from '../translations'
import { computeView } from './compute'
import { createRenderContext } from './context'
import { ownPart } from './dom'
import { defaultFormatter } from './format'
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
}

/** 查看器的状态。 */
type ViewerState = 'idle' | 'loading' | 'ready' | 'invalid' | 'parameters' | 'error' | 'unsupported'

interface Layers {
  readonly status: HTMLElement
  readonly body: HTMLElement
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
  #view: ViewResult | undefined

  /** 最近一次校验报表定义与检查参数得到的问题。 */
  get issues(): readonly ReportViewerIssue[] {
    return this.#issues
  }

  /** 是否还有未完成的取数。 */
  get loading(): boolean {
    return this.#loading
  }

  /** 重新取数并计算。 */
  refresh(): Promise<void> {
    return this.#load()
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    this.#abort?.abort()
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed)
    const layers = this.#ensureLayers()
    this.setAttribute('aria-label', this.#translations().label)
    if (DATA_PROPERTIES.some(key => changed.has(key)))
      void this.#load()
    else
      this.#render(layers)
  }

  #translations(): ReportViewerTranslations {
    return this.#config.translations<ReportViewerTranslations>('xh-report-viewer', DEFAULT_REPORT_VIEWER_TRANSLATIONS, this.translations)
  }

  #timeZone(): string {
    return this.timeZone ?? getLocalTimeZone()
  }

  #ensureLayers(): Layers {
    if (this.#layers && this.#layers.body.parentNode === this)
      return this.#layers
    const status = ownPart('div', 'status')
    status.setAttribute('role', 'status')
    const body = ownPart('div', 'body')
    this.replaceChildren(status, body)
    this.#layers = { status, body }
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

  #finish(state: ViewerState): void {
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
      this.#view = undefined
      this.#setIssues([])
      this.#setLoading(false)
      return this.#finish('idle')
    }
    const issues = withSeverity(validateDocument(schema, this.expressionEngine ? { expressionEngine: this.expressionEngine } : {}), {})
    if (hasErrors(issues)) {
      this.#view = undefined
      this.#setIssues(issues)
      this.#setLoading(false)
      return this.#finish('invalid')
    }
    const resolved = resolveParameters(schema.parameters, this.parameters ?? {})
    const parameterIssues = withSeverity(resolved.issues, {})
    this.#setIssues([...issues, ...parameterIssues])
    if (hasErrors(parameterIssues)) {
      this.#view = undefined
      this.#setLoading(false)
      return this.#finish('parameters')
    }
    const provider = this.dataProvider
    const body = schema.body
    if (body.type === 'dashboard') {
      this.#view = undefined
      this.#setLoading(false)
      return this.#finish('unsupported')
    }
    if (!provider) {
      this.#view = undefined
      this.#setLoading(false)
      return this.#finish('idle')
    }
    this.#setLoading(true)
    if (!this.#view)
      this.#finish('loading')
    try {
      const dataset = findDataset(schema, body.dataset)!
      const request = createDatasetRequest(body, dataset, { parameters: resolved.values })
      const data = await provider(request, { signal: abort.signal })
      if (run !== this.#runs)
        return
      this.#view = computeView(body, dataset, data, {
        parameters: resolved.values,
        timeZone: this.#timeZone(),
        collate: new Intl.Collator(this.#locale()).compare,
        ...(this.expressionEngine ? { expressionEngine: this.expressionEngine } : {}),
      })
      this.#setLoading(false)
      this.#finish('ready')
    }
    catch (error) {
      if (run !== this.#runs || isAbort(error))
        return
      this.#view = undefined
      this.#setLoading(false)
      emitEvent(this, 'load-error', { card: null, error })
      this.#finish('error')
    }
  }

  #locale(): string | undefined {
    return this.locale ?? this.#config.locale
  }

  #render(layers: Layers): void {
    const t = this.#translations()
    this.dataset.state = this.#state
    const message: Partial<Record<ViewerState, string>> = {
      loading: t.loading,
      invalid: t.invalid,
      parameters: t.parametersInvalid,
      error: t.error,
      unsupported: t.unsupported,
    }
    const text = message[this.#state]
    layers.status.textContent = text ?? ''
    layers.status.hidden = text === undefined
    if (this.#state !== 'ready' || !this.#view) {
      if (this.#state !== 'loading')
        layers.body.replaceChildren()
      return
    }
    const ctx = createRenderContext(t, this.formatter ?? defaultFormatter, this.#locale(), this.#timeZone())
    const view = this.#view
    if (view.type === 'table')
      renderDetailTable(layers.body, view.view, view.dataset, view.result, ctx)
    else
      layers.body.replaceChildren(ownPart('div', 'unsupported', t.unsupported))
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
