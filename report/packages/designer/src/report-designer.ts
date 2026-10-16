/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// <xh-report-designer>：报表设计器元素。编辑模型（历史、选择、剪贴板、布局手势）在 createReportEditor 里，
// 画布内容复用查看器的计算与渲染；物料、属性、问题等面板用 @xihan-ui/designer-shell 的零件。

import type { DashboardCard, DashboardView, ExpressionEngine, ParameterValues, ReportDocument, ReportOperation, ValidationIssue } from '@xihan-report/core'
import type { ReportDataProvider, ReportDesignerTranslations, ReportFormatter, ReportViewerTranslations } from '@xihan-report/runtime'
import type { ExecuteOptions, HistoryChangeKind, Rect } from '@xihan-ui/designer-kit'
import type { DesignerTransformItem } from '@xihan-ui/designer-shell'
import type { PropertyValues } from '@xihan-ui/web-components/authoring'
import type { ReportAddCardInit, ReportClipboard, ReportEditor, ReportItemRef, ReportSelection } from './editor'
import { resolveParameters } from '@xihan-report/core'
import { DEFAULT_REPORT_DESIGNER_TRANSLATIONS, DEFAULT_REPORT_VIEWER_TRANSLATIONS, defaultFormatter } from '@xihan-report/runtime'
import { createRenderContext, defineViewerElements } from '@xihan-report/runtime/design'
import { getLocalTimeZone } from '@xihan-ui/core/date'
import { defineDesignerShellElement, XhDesignerTransformElement } from '@xihan-ui/designer-shell'
import { createAuthoredElement, emitEvent, registerElement, XhConfigController, XhReactiveElement } from '@xihan-ui/web-components/authoring'
import { CanvasContent } from './canvas'
import { readReportClipboardData, writeReportClipboardData } from './clipboard'
import { createReportEditor, writeReportClipboard } from './editor'

export const REPORT_DESIGNER_TAG = 'xh-report-designer'

/** 可以收起的面板，画布常驻、不在其中。 */
export const REPORT_DESIGNER_PANELS = ['toolbar', 'data', 'palette', 'wells', 'properties', 'issues'] as const

export type ReportDesignerPanel = (typeof REPORT_DESIGNER_PANELS)[number]

/** 设计或预览。 */
export type ReportDesignerMode = 'design' | 'preview'

/** 数据集能改到什么程度：none 只读；fields 能改字段的标题、类型与计算字段公式，增删报表参数；full 另能增删数据集与字段。 */
export type ReportDatasetEditing = 'none' | 'fields' | 'full'

/** schema-change 的来由。 */
export type ReportSchemaChangeKind = 'execute' | 'undo' | 'redo' | 'load'

/** 设计器派发的事件。 */
export interface ReportDesignerEventMap {
  'schema-change': CustomEvent<{ schema: ReportDocument, operations: readonly ReportOperation[], kind: ReportSchemaChangeKind }>
  'selection-change': CustomEvent<ReportSelection>
  'dirty-change': CustomEvent<{ dirty: boolean }>
  'issues-change': CustomEvent<{ issues: readonly ValidationIssue[] }>
  'save': CustomEvent<Record<string, never>>
  'mode-change': CustomEvent<{ mode: ReportDesignerMode }>
  'card-dblclick': CustomEvent<{ id: string }>
  /** 可取消；不取消时弹内建右键菜单。 */
  'card-contextmenu': CustomEvent<{ id: string, x: number, y: number }>
  /** 可取消；不取消时弹内建右键菜单。 */
  'blank-contextmenu': CustomEvent<{ x: number, y: number }>
}

interface Layers {
  readonly root: HTMLElement
  readonly canvas: HTMLElement
  readonly surface: HTMLElement
  readonly content: HTMLElement
  readonly overlay: XhDesignerTransformElement
  readonly empty: HTMLElement
}

const EMPTY_SELECTION: ReportSelection = { cards: [] }

function sameIssues(a: readonly ValidationIssue[], b: readonly ValidationIssue[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function parsePanels(value: string | null | undefined): ReadonlySet<ReportDesignerPanel> {
  if (value === null || value === undefined)
    return new Set(REPORT_DESIGNER_PANELS)
  const tokens = value.split(/\s+/).filter(Boolean)
  return new Set(REPORT_DESIGNER_PANELS.filter(panel => tokens.includes(panel)))
}

export class XhReportDesigner extends XhReactiveElement {
  static override properties = {
    schema: { attribute: false },
    dataProvider: { attribute: false },
    expressionEngine: { attribute: false },
    formatter: { attribute: false },
    parameters: { attribute: false },
    editors: { attribute: false },
    translations: { attribute: false },
    locale: { attribute: 'locale' },
    timeZone: { attribute: 'time-zone' },
    readonly: { type: Boolean },
    mode: { attribute: 'mode' },
    panels: { attribute: 'panels' },
    datasetEditing: { attribute: 'dataset-editing' },
  }

  /** 报表定义：赋值即装载（清空历史与选择）；赋回当前这一份不重新装载。读取得到当前报表。 */
  declare schema: ReportDocument | undefined
  /** 与查看器同一个取数回调，画布与预览用；不给时画布画占位。 */
  declare dataProvider: ReportDataProvider | undefined
  declare expressionEngine: ExpressionEngine | undefined
  declare formatter: ReportFormatter | undefined
  /** 预览与画布取数用的报表参数取值。 */
  declare parameters: ParameterValues | undefined
  /** 自定义属性编辑器，压在内建之上。 */
  declare editors: unknown
  declare translations: Partial<ReportDesignerTranslations> | undefined
  declare locale: string | undefined
  declare timeZone: string | undefined
  /** 只读：可选择、浏览与预览，不能修改。 */
  declare readonly: boolean
  /** design 或 preview，缺省 design。 */
  declare mode: ReportDesignerMode | undefined
  /** 空格分隔的可收起面板：toolbar data palette wells properties issues；不写即全部显示。 */
  declare panels: string | undefined
  /** 缺省 fields。 */
  declare datasetEditing: ReportDatasetEditing | undefined

  readonly #config = new XhConfigController(this)
  #editor: ReportEditor | undefined
  #layers: Layers | undefined
  #content: CanvasContent | undefined
  #issues: readonly ValidationIssue[] = []
  #dirty = false
  /** 事务里执行过的操作，提交时一起报出。 */
  #pending: ReportOperation[] = []
  #resize: ResizeObserver | undefined

  constructor() {
    super()
    this.readonly = false
  }

  get canUndo(): boolean {
    return !this.readonly && (this.#editor?.history.canUndo ?? false)
  }

  get canRedo(): boolean {
    return !this.readonly && (this.#editor?.history.canRedo ?? false)
  }

  /** 有未保存的修改。 */
  get dirty(): boolean {
    return this.#editor?.history.dirty ?? false
  }

  /** 编辑模型里留着可粘贴的内容。 */
  get canPaste(): boolean {
    return !this.readonly && (this.#editor?.hasClipboard ?? false)
  }

  /** 执行一组操作并记为一步撤销；返回新文档。还没有报表时抛错。 */
  execute(operations: readonly ReportOperation[], options?: ExecuteOptions): ReportDocument {
    return this.#requireEditor().execute(operations, options)
  }

  undo(): boolean {
    return !this.readonly && (this.#editor?.undo() ?? false)
  }

  redo(): boolean {
    return !this.readonly && (this.#editor?.redo() ?? false)
  }

  /** 把当前位置记为保存点。 */
  markSaved(): void {
    this.#editor?.history.markSaved()
    this.#syncDirty()
  }

  /** 新增卡片并选中它；报表主体不是看板时抛错。 */
  addCard(init: ReportAddCardInit, options?: ExecuteOptions): DashboardCard {
    return this.#requireEditor().addCard(init, options)
  }

  select(selection: Partial<ReportSelection>): void {
    this.#editor?.select(selection)
  }

  getSelection(): ReportSelection {
    return this.#editor?.selection ?? EMPTY_SELECTION
  }

  deleteSelection(): boolean {
    return !this.readonly && (this.#editor?.deleteSelection() ?? false)
  }

  /** 复制选中的卡片，同时写进系统剪贴板；没有选中卡片时返回 undefined。 */
  copy(): ReportClipboard | undefined {
    const copied = this.#editor?.copy()
    if (copied)
      this.#writeSystemClipboard(copied)
    return copied
  }

  /** 复制后删除选中的卡片，同时写进系统剪贴板；只读或没有选中卡片时返回 undefined。 */
  cut(): ReportClipboard | undefined {
    if (this.readonly)
      return undefined
    const copied = this.#editor?.cut()
    if (copied)
      this.#writeSystemClipboard(copied)
    return copied
  }

  /** 粘贴卡片，不给 clipboard 时用最近一次复制的内容；返回新的选择。 */
  paste(clipboard?: ReportClipboard): ReportSelection {
    return this.readonly || !this.#editor ? EMPTY_SELECTION : this.#editor.paste(clipboard)
  }

  duplicate(): ReportSelection {
    return this.readonly || !this.#editor ? EMPTY_SELECTION : this.#editor.duplicate()
  }

  /** 按当前的表达式引擎校验报表。 */
  validate(): readonly ValidationIssue[] {
    return this.#editor ? this.#editor.validate(this.#validateOptions()) : []
  }

  /** 丢掉缓存的数据，画布重新取数计算。 */
  refresh(): Promise<void> {
    return this.#content?.refresh() ?? Promise.resolve()
  }

  /** 滚动到卡片。 */
  scrollToCard(id: string): void {
    this.#content?.cardElement(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  /** 卡片不在画布的可见区时才滚动到它。 */
  revealCard(id: string): void {
    const card = this.#content?.cardElement(id)
    const canvas = this.#layers?.canvas
    if (!card || !canvas)
      return
    const box = card.getBoundingClientRect()
    const view = canvas.getBoundingClientRect()
    if (box.top < view.top || box.bottom > view.bottom || box.left < view.left || box.right > view.right)
      card.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }

  /** 选中列表项所在的卡片并让它可见。 */
  revealItem(ref: ReportItemRef): void {
    this.select(ref.card === undefined ? { cards: [], item: ref } : { cards: [ref.card], item: ref })
    if (ref.card !== undefined)
      this.revealCard(ref.card)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    const doc = this.ownerDocument
    doc.addEventListener('copy', this.#onClipboard)
    doc.addEventListener('cut', this.#onClipboard)
    doc.addEventListener('paste', this.#onClipboard)
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback()
    const doc = this.ownerDocument
    doc.removeEventListener('copy', this.#onClipboard)
    doc.removeEventListener('cut', this.#onClipboard)
    doc.removeEventListener('paste', this.#onClipboard)
    this.#resize?.disconnect()
    this.#resize = undefined
    this.#content?.dispose()
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed)
    const layers = this.#ensureLayers()
    const t = this.#translations()
    this.setAttribute('aria-label', t.label)
    layers.canvas.setAttribute('aria-label', t.canvas)
    if (changed.has('schema'))
      this.#load()
    this.#applyPanels(layers)
    layers.overlay.readonly = this.readonly
    this.#renderCanvas()
  }

  #translations(): ReportDesignerTranslations {
    return this.#config.translations<ReportDesignerTranslations>('xh-report-designer', DEFAULT_REPORT_DESIGNER_TRANSLATIONS, this.translations)
  }

  #viewerTranslations(): ReportViewerTranslations {
    return this.#config.translations<ReportViewerTranslations>('xh-report-viewer', DEFAULT_REPORT_VIEWER_TRANSLATIONS, undefined)
  }

  #timeZone(): string {
    return this.timeZone ?? getLocalTimeZone()
  }

  #locale(): string | undefined {
    return this.locale ?? this.#config.locale
  }

  #validateOptions(): { expressionEngine?: ExpressionEngine } {
    return this.expressionEngine ? { expressionEngine: this.expressionEngine } : {}
  }

  #requireEditor(): ReportEditor {
    if (!this.#editor)
      throw new RangeError('[xh-report-designer] there is no schema to edit')
    return this.#editor
  }

  /** schema 换了一份时装载：首次建编辑模型，之后换文档并清空历史；赋回当前文档不处理。 */
  #load(): void {
    const schema = this.schema
    if (!schema || schema === this.#editor?.document)
      return
    if (this.#editor) {
      this.#editor.load(schema)
      return
    }
    const editor = createReportEditor({ document: schema })
    this.#editor = editor
    editor.subscribe((change) => {
      if (change.kind === 'selection') {
        this.#renderSelection()
        emitEvent(this, 'selection-change', change.selection)
        return
      }
      this.#onDocument(change.cause, change.document, change.operations)
    })
    this.#refreshIssues()
  }

  /**
   * 文档变了：画布随之重画。事务里（拖动手势、整体删除）的执行先攒着，提交时作为一次 execute 报出；回滚不报。
   */
  #onDocument(cause: HistoryChangeKind, document: ReportDocument, operations: readonly ReportOperation[]): void {
    const history = this.#editor!.history
    if (this.schema === document)
      this.#renderCanvas()
    else
      this.schema = document
    if (history.inTransaction) {
      if (cause === 'execute')
        this.#pending.push(...operations)
      return
    }
    const emit = (kind: ReportSchemaChangeKind, done: readonly ReportOperation[]): void => {
      emitEvent(this, 'schema-change', { schema: document, operations: done, kind })
    }
    switch (cause) {
      case 'execute':
      case 'undo':
      case 'redo':
        emit(cause, operations)
        break
      case 'commit':
        if (this.#pending.length > 0)
          emit('execute', this.#pending)
        this.#pending = []
        break
      case 'rollback':
        this.#pending = []
        break
      case 'reset':
        this.#pending = []
        emit('load', [])
        break
    }
    this.#syncDirty()
    this.#refreshIssues()
  }

  #syncDirty(): void {
    const dirty = this.dirty
    if (dirty === this.#dirty)
      return
    this.#dirty = dirty
    emitEvent(this, 'dirty-change', { dirty })
  }

  #refreshIssues(): void {
    const issues = this.validate()
    if (sameIssues(issues, this.#issues))
      return
    this.#issues = issues
    emitEvent(this, 'issues-change', { issues })
  }

  #ensureLayers(): Layers {
    if (this.#layers?.root.isConnected && this.#layers.root.parentElement === this)
      return this.#layers
    const doc = this.ownerDocument
    const content = createAuthoredElement(doc, 'div', { 'data-part': 'content' })
    const overlay = doc.createElement('xh-designer-transform') as XhDesignerTransformElement
    overlay.dataset.part = 'overlay'
    const empty = createAuthoredElement(doc, 'div', { 'data-part': 'empty', 'hidden': true })
    const surface = createAuthoredElement(doc, 'div', { 'data-part': 'surface' }, [content, overlay, empty])
    const canvas = createAuthoredElement(doc, 'div', { 'data-part': 'canvas', 'role': 'group', 'tabindex': 0 }, [surface])
    const workspace = createAuthoredElement(doc, 'div', { 'data-part': 'workspace' }, [canvas])
    const root = createAuthoredElement(doc, 'div', { 'data-part': 'root' }, [workspace])
    this.replaceChildren(root)
    canvas.addEventListener('pointerdown', this.#onPointerDown)
    canvas.addEventListener('dblclick', this.#onDoubleClick)
    canvas.addEventListener('contextmenu', this.#onContextMenu)
    canvas.addEventListener('keydown', this.#onKeyDown)
    canvas.addEventListener('scroll', () => this.#renderSelection(), { passive: true })
    this.#resize?.disconnect()
    if (typeof ResizeObserver === 'function') {
      this.#resize = new ResizeObserver(() => this.#renderSelection())
      this.#resize.observe(surface)
    }
    this.#content?.dispose()
    this.#content = new CanvasContent(content)
    this.#layers = { root, canvas, surface, content, overlay, empty }
    return this.#layers
  }

  #applyPanels(layers: Layers): void {
    const shown = parsePanels(this.panels)
    layers.root.dataset.panels = [...shown].join(' ')
  }

  #renderCanvas(): void {
    const layers = this.#layers
    const document = this.#editor?.document
    if (!layers || !document || !this.#content)
      return
    const t = this.#translations()
    const values = resolveParameters(document.parameters, this.parameters ?? {}).values
    const context = createRenderContext(this.#viewerTranslations(), this.formatter ?? defaultFormatter, this.#locale(), this.#timeZone())
    this.#content.update({
      document,
      provider: this.dataProvider,
      values,
      options: {
        parameters: values,
        timeZone: this.#timeZone(),
        collate: new Intl.Collator(this.#locale()).compare,
        ...(this.expressionEngine ? { expressionEngine: this.expressionEngine } : {}),
      },
      context,
      placeholder: kind => `${t.cardTypes[kind] ?? kind} · ${t.placeholder}`,
    })
    const dashboard = document.body.type === 'dashboard' ? document.body : undefined
    layers.empty.hidden = !dashboard || dashboard.cards.length > 0
    layers.empty.textContent = t.emptyDashboard
    this.#renderSelection()
  }

  /** 卡片在 surface 里的位置与大小（画布像素，即世界坐标）。 */
  #cardRect(id: string): Rect | undefined {
    const card = this.#content?.cardElement(id)
    const surface = this.#layers?.surface
    if (!card || !surface)
      return undefined
    const box = card.getBoundingClientRect()
    const origin = surface.getBoundingClientRect()
    return { x: box.left - origin.left, y: box.top - origin.top, width: box.width, height: box.height }
  }

  /** 把选中的卡片交给覆盖层画选中框与控制柄。 */
  #renderSelection(): void {
    const layers = this.#layers
    if (!layers)
      return
    const selected = this.#editor?.selection.cards ?? []
    const items: DesignerTransformItem[] = []
    for (const id of selected) {
      const rect = this.#cardRect(id)
      if (rect)
        items.push({ id, rect })
    }
    layers.overlay.viewport = { x: 0, y: 0, zoom: 1 }
    layers.overlay.items = items
    for (const section of layers.content.querySelectorAll<HTMLElement>('[data-part="card"]'))
      section.toggleAttribute('data-selected', selected.includes(section.dataset.card ?? ''))
  }

  #dashboard(): DashboardView | undefined {
    const body = this.#editor?.document.body
    return body?.type === 'dashboard' ? body : undefined
  }

  /** 指针下的卡片 id。 */
  #cardAt(target: EventTarget | null): string | undefined {
    const section = (target as Element | null)?.closest?.<HTMLElement>('[data-part="card"][data-card]')
    return section && this.#layers?.content.contains(section) ? section.dataset.card : undefined
  }

  readonly #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || !this.#editor)
      return
    this.#layers?.canvas.focus({ preventScroll: true })
    const id = this.#cardAt(event.target)
    if (id === undefined) {
      if (!event.shiftKey && !event.ctrlKey && !event.metaKey)
        this.#editor.clearSelection()
      return
    }
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    const selected = this.#editor.selection.cards.includes(id)
    if (additive)
      this.#editor.select({ cards: [id] }, 'toggle')
    else if (!selected)
      this.#editor.select({ cards: [id] })
  }

  readonly #onDoubleClick = (event: MouseEvent): void => {
    const id = this.#cardAt(event.target)
    if (id !== undefined)
      emitEvent(this, 'card-dblclick', { id })
  }

  readonly #onContextMenu = (event: MouseEvent): void => {
    const id = this.#cardAt(event.target)
    if (id !== undefined && !this.getSelection().cards.includes(id))
      this.#editor?.select({ cards: [id] })
    const detail = { x: event.clientX, y: event.clientY }
    const proceed = id === undefined
      ? this.dispatchEvent(new CustomEvent('blank-contextmenu', { detail, bubbles: true, composed: true, cancelable: true }))
      : this.dispatchEvent(new CustomEvent('card-contextmenu', { detail: { id, ...detail }, bubbles: true, composed: true, cancelable: true }))
    if (!proceed)
      event.preventDefault()
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    const editor = this.#editor
    if (!editor || event.target !== this.#layers?.canvas)
      return
    const command = event.ctrlKey || event.metaKey
    let handled = true
    const key = event.key.toLowerCase()
    if (command && key === 's') {
      emitEvent(this, 'save', {})
    }
    else if (command && key === 'z') {
      if (event.shiftKey)
        this.redo()
      else
        this.undo()
    }
    else if (command && key === 'y') {
      this.redo()
    }
    else if (command && key === 'a') {
      editor.selectAll()
    }
    else if (command && key === 'd') {
      this.duplicate()
    }
    else if (!command && (event.key === 'Delete' || event.key === 'Backspace')) {
      this.deleteSelection()
    }
    else if (!command && event.key === 'Escape') {
      editor.clearSelection()
    }
    else if (!command && event.key.startsWith('Arrow')) {
      handled = this.#nudge(event.key, event.shiftKey)
    }
    else {
      handled = false
    }
    if (handled)
      event.preventDefault()
  }

  /** 方向键挪一格，Shift 加方向键改大小一格；连续按并成一步撤销。 */
  #nudge(key: string, resize: boolean): boolean {
    const editor = this.#editor
    const dashboard = this.#dashboard()
    if (!editor || !dashboard || this.readonly || editor.selection.cards.length === 0)
      return false
    const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
    const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
    const gesture = editor.startLayout()
    for (const id of editor.selection.cards) {
      const card = dashboard.cards.find(item => item.id === id)
      if (!card)
        continue
      const { x, y, w, h } = card.layout
      gesture.move(id, resize ? { w: Math.max(1, w + dx), h: Math.max(1, h + dy) } : { x: Math.max(0, x + dx), y: Math.max(0, y + dy) })
    }
    gesture.end()
    return true
  }

  #writeSystemClipboard(clipboard: ReportClipboard): void {
    this.ownerDocument.defaultView?.navigator.clipboard?.writeText(writeReportClipboard(clipboard)).catch(() => {})
  }

  /** 画布有焦点时，复制、剪切写入剪贴板事件的数据，粘贴读出报表的剪贴板内容；别的内容不处理。 */
  readonly #onClipboard = (event: ClipboardEvent): void => {
    const data = event.clipboardData
    const root = this.getRootNode() as Document | ShadowRoot
    if (!data || !this.#editor || !this.#layers || root.activeElement !== this.#layers.canvas)
      return
    if (event.type === 'paste') {
      const content = this.readonly ? undefined : readReportClipboardData(data)
      if (content) {
        this.paste(content)
        event.preventDefault()
      }
      return
    }
    const copied = event.type === 'copy' ? this.#editor.copy() : this.readonly ? undefined : this.#editor.cut()
    if (!copied)
      return
    writeReportClipboardData(data, copied)
    event.preventDefault()
  }
}

/** 注册 <xh-report-designer> 与它用到的 UI 元素、designer-shell 零件；import 时不注册。 */
export function defineReportDesigner(): void {
  defineViewerElements()
  defineDesignerShellElement('xh-designer-transform', XhDesignerTransformElement)
  registerElement(REPORT_DESIGNER_TAG, XhReportDesigner)
}

declare global {
  interface HTMLElementTagNameMap {
    'xh-report-designer': XhReportDesigner
  }
}
