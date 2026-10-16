/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// <xh-report-designer>：报表设计器元素。编辑模型（历史、选择、剪贴板、布局手势）在 createReportEditor 里，
// 画布内容复用查看器的计算与渲染；整体版式用 @xihan-ui/designer-shell 的外框，panels 决定显示哪些区，面板用 designer-shell 的零件。

import type { DashboardCard, DashboardView, ExpressionEngine, ParameterValues, ReportCardType, ReportDocument, ReportOperation, ValidationIssue } from '@xihan-report/core'
import type { ReportDataProvider, ReportDesignerTranslations, ReportFormatter, ReportViewerTranslations } from '@xihan-report/runtime'
import type { ExecuteOptions, GridRect, HistoryChangeKind, Point, Rect, Viewport } from '@xihan-ui/designer-kit'
import type { DesignerFrameRegion, DesignerPaletteEventMap, DesignerTransformEventMap, DesignerTransformItem, DropOver, PanRequestDetail } from '@xihan-ui/designer-shell'
import type { PropertyValues } from '@xihan-ui/web-components/authoring'
import type { LayoutGesture, ReportAddCardInit, ReportClipboard, ReportEditor, ReportItemRef, ReportSelection } from './editor'
import type { GridMetrics } from './grid-geometry'
import { cardTemplate, planAddCard, resolveParameters } from '@xihan-report/core'
import { DEFAULT_REPORT_DESIGNER_TRANSLATIONS, DEFAULT_REPORT_VIEWER_TRANSLATIONS, defaultFormatter } from '@xihan-report/runtime'
import { createRenderContext, defineViewerElements } from '@xihan-report/runtime/design'
import { getLocalTimeZone } from '@xihan-ui/core/date'
import { createIdAllocator, selectInMarquee } from '@xihan-ui/designer-kit'
import { defineDesignerShellElement, registerDropTarget, XhDesignerFrameElement, XhDesignerPaletteElement, XhDesignerTransformElement } from '@xihan-ui/designer-shell'
import { createAuthoredElement, createGeneratedElement, emitEvent, registerElement, XhConfigController, XhReactiveElement } from '@xihan-ui/web-components/authoring'
import { defineXhElement, XhSortableElement, XhTagElement, XhTreeElement } from '@xihan-ui/web-components/define'
import { CanvasContent } from './canvas'
import { readReportClipboardData, writeReportClipboardData } from './clipboard'
import { DataPanel } from './data-panel'
import { createReportEditor, writeReportClipboard } from './editor'
import { cellSize, cellToRect, centeredCell, clipCell, measureGrid, rectToCell } from './grid-geometry'
import { paletteCardType, paletteGroups } from './palette'
import { Wells } from './wells'

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

/** 外框的命名区：左侧上下是数据与物料，中间是画布，右侧是字段栏。 */
const FRAME_REGIONS: readonly DesignerFrameRegion[] = [
  { name: 'data', position: 'start', size: 18 },
  { name: 'palette', position: 'start' },
  { name: 'canvas', position: 'center' },
  { name: 'wells', position: 'end', size: 20 },
]

interface Layers {
  readonly frame: XhDesignerFrameElement
  readonly canvas: HTMLElement
  readonly scroller: HTMLElement
  readonly surface: HTMLElement
  readonly content: HTMLElement
  readonly overlay: XhDesignerTransformElement
  readonly empty: HTMLElement
  readonly dropPreview: HTMLElement
  readonly palette: XhDesignerPaletteElement
  readonly data: DataPanel
  readonly wells: Wells
}

/** 物料拖到看板上的落点：卡片种类与请求的左上角格。 */
interface CardDrop {
  readonly type: ReportCardType
  readonly x: number
  readonly y: number
}

/** 进行中的卡片拖动或改大小：编辑模型的布局手势与最近一次写进去的格坐标。 */
interface CardGesture {
  readonly layout: LayoutGesture
  readonly cells: Map<string, GridRect>
}

const EMPTY_SELECTION: ReportSelection = { cards: [] }

function sameCell(a: GridRect | undefined, b: GridRect): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function sameIssues(a: readonly ValidationIssue[], b: readonly ValidationIssue[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
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
    panels: { converter: { fromAttribute: (value: string | null) => value ?? undefined } },
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
  /** 空格分隔的可收起面板：toolbar data palette wells properties issues；不写即全部显示，写空串只留画布。 */
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
  #gesture: CardGesture | undefined
  #hoverId: string | undefined
  #viewport: Viewport | undefined
  #drop: CardDrop | undefined
  #paletteKey = ''

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
    const scroller = this.#layers?.scroller
    if (!card || !scroller)
      return
    const box = card.getBoundingClientRect()
    const view = scroller.getBoundingClientRect()
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
    this.#syncFrame(layers.frame, t)
    layers.overlay.readonly = this.readonly
    this.#syncPalette(layers.palette, t)
    this.#syncData()
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
        this.#syncData()
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
    if (this.#layers?.frame.parentElement === this)
      return this.#layers
    const doc = this.ownerDocument
    const content = createAuthoredElement(doc, 'div', { 'data-part': 'content' })
    const empty = createAuthoredElement(doc, 'div', { 'data-part': 'empty', 'hidden': true })
    const dropPreview = createAuthoredElement(doc, 'div', { 'data-part': 'drop-preview', 'hidden': true })
    const surface = createAuthoredElement(doc, 'div', { 'data-part': 'surface' }, [content, empty, dropPreview])
    const scroller = createAuthoredElement(doc, 'div', { 'data-part': 'scroller' }, [surface])
    const overlay = createAuthoredElement(doc, 'xh-designer-transform', { 'data-part': 'overlay' }) as XhDesignerTransformElement
    overlay.addEventListener('transform', this.#onTransform)
    overlay.addEventListener('marquee', this.#onMarquee)
    const canvas = createAuthoredElement(doc, 'div', { 'data-part': 'canvas', 'role': 'group', 'tabindex': 0 }, [scroller, overlay])
    canvas.addEventListener('pan-request', this.#onPanRequest)
    registerDropTarget(scroller, {
      over: (point, payload) => this.#dropOver(point, payload),
      drop: () => this.#dropCard(),
      leave: () => this.#clearDrop(),
    })
    const workspace = createAuthoredElement(doc, 'div', { 'data-part': 'workspace' }, [canvas])
    const palette = createGeneratedElement(doc, 'xh-designer-palette', { 'data-part': 'palette', 'slot': 'palette' }) as XhDesignerPaletteElement
    palette.addEventListener('item-activate', this.#onPaletteActivate)
    const data = new DataPanel({
      ownerDocument: doc,
      select: ref => this.#editor?.select({ data: ref }),
      isReadonly: () => this.readonly,
    })
    const wells = new Wells({
      ownerDocument: doc,
      document: () => this.#editor?.document,
      execute: operations => this.#editor?.execute(operations),
      selectItem: ref => this.#editor?.select({ cards: ref.card === undefined ? [] : [ref.card], item: ref }),
      isReadonly: () => this.readonly,
    })
    const frame = createGeneratedElement(doc, 'xh-designer-frame', { 'data-part': 'frame' }, [data.element, palette, workspace, wells.element]) as XhDesignerFrameElement
    this.replaceChildren(frame)
    canvas.addEventListener('pointerdown', this.#onPointerDown)
    canvas.addEventListener('pointermove', this.#onHover)
    canvas.addEventListener('pointerleave', this.#onHoverEnd)
    canvas.addEventListener('dblclick', this.#onDoubleClick)
    canvas.addEventListener('contextmenu', this.#onContextMenu)
    canvas.addEventListener('keydown', this.#onKeyDown)
    scroller.addEventListener('scroll', () => this.#renderSelection(), { passive: true })
    this.#resize?.disconnect()
    if (typeof ResizeObserver === 'function') {
      this.#resize = new ResizeObserver(() => this.#renderSelection())
      this.#resize.observe(surface)
      this.#resize.observe(scroller)
    }
    this.#content?.dispose()
    this.#content = new CanvasContent(content)
    this.#viewport = undefined
    this.#drop = undefined
    this.#paletteKey = ''
    this.#layers = { frame, canvas, scroller, surface, content, overlay, empty, dropPreview, palette, data, wells }
    return this.#layers
  }

  /** panels 原样交给外框；区名换成文案，供分隔条的无障碍名称使用，文案没变时不重设。 */
  #syncFrame(frame: XhDesignerFrameElement, t: ReportDesignerTranslations): void {
    frame.panels = this.panels
    const labels: Readonly<Record<string, string>> = { data: t.data, palette: t.palette, canvas: t.canvas, wells: t.wells }
    const regions = FRAME_REGIONS.map(region => ({ ...region, label: labels[region.name] ?? region.name }))
    const current = frame.regions
    if (current?.length === regions.length && current.every((region, index) => region.label === regions[index]!.label))
      return
    frame.regions = regions
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

  /** 看板网格的几何；不是看板或网格还没有布局时为 undefined。 */
  #gridMetrics(): GridMetrics | undefined {
    const dashboard = this.#dashboard()
    const grid = this.#content?.grid
    const surface = this.#layers?.surface
    if (!dashboard || !grid || !surface)
      return undefined
    return measureGrid(grid, surface, dashboard.grid.columns, dashboard.grid.rowHeight)
  }

  /**
   * 覆盖层叠在画布的可见区上，世界坐标是 surface 里的画布像素：视口的位移就是 surface 相对覆盖层的偏移，随滚动变化。
   * 选中的卡片交给覆盖层画选中框与控制柄，最小尺寸为一格；指针下没选中的卡片画悬停框。
   */
  #renderSelection(): void {
    const layers = this.#layers
    if (!layers)
      return
    const origin = layers.surface.getBoundingClientRect()
    const screen = layers.overlay.getBoundingClientRect()
    const viewport: Viewport = { x: origin.left - screen.left, y: origin.top - screen.top, zoom: 1 }
    if (this.#viewport?.x !== viewport.x || this.#viewport.y !== viewport.y) {
      this.#viewport = viewport
      layers.overlay.viewport = viewport
    }
    const selected = this.#editor?.selection.cards ?? []
    const metrics = this.#gridMetrics()
    const minSize = metrics ? cellSize(metrics) : undefined
    const items: DesignerTransformItem[] = []
    for (const id of selected) {
      const rect = this.#cardRect(id)
      if (rect)
        items.push(minSize ? { id, rect, minSize } : { id, rect })
    }
    layers.overlay.items = items
    const hover = this.#hoverId === undefined || selected.includes(this.#hoverId) ? undefined : this.#cardRect(this.#hoverId)
    if (hover !== layers.overlay.hover)
      layers.overlay.hover = hover
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

  /**
   * 按下卡片：Shift / Ctrl 切换它的选中；否则只选中它并交给覆盖层跑移动手势。按下空白：不带修饰键先清空选择，再开始框选。
   * 按在滚动条上不处理。
   */
  readonly #onPointerDown = (event: PointerEvent): void => {
    const editor = this.#editor
    const layers = this.#layers
    if (event.button !== 0 || !editor || !layers || this.#gesture)
      return
    const scroller = layers.scroller
    if (event.target === scroller && (event.offsetX >= scroller.clientWidth || event.offsetY >= scroller.clientHeight))
      return
    layers.canvas.focus({ preventScroll: true })
    const id = this.#cardAt(event.target)
    const additive = event.shiftKey || event.ctrlKey || event.metaKey
    if (id === undefined) {
      if (!additive)
        editor.clearSelection()
      layers.overlay.startMarquee(event, { additive })
      return
    }
    if (additive) {
      editor.select({ cards: [id] }, 'toggle')
      return
    }
    const cards = editor.selection.cards
    if (cards.length !== 1 || cards[0] !== id)
      editor.select({ cards: [id] })
    layers.overlay.startMove(event)
  }

  /**
   * 覆盖层的移动、改大小手势：开始时开布局手势，每一帧把矩形换成格坐标，格坐标变了才写进编辑模型，
   * 结束时提交为一步撤销，取消时回滚。移动只改位置，改大小连同位置一起改。
   */
  readonly #onTransform = (event: Event): void => {
    const { phase, kind, rects } = (event as DesignerTransformEventMap['transform']).detail
    const editor = this.#editor
    if (!editor || kind === 'rotate')
      return
    if (phase === 'start') {
      this.#gesture?.layout.cancel()
      this.#gesture = { layout: editor.startLayout(), cells: new Map() }
      return
    }
    const gesture = this.#gesture
    if (!gesture)
      return
    if (phase === 'cancel') {
      this.#gesture = undefined
      gesture.layout.cancel()
      return
    }
    const metrics = this.#gridMetrics()
    const columns = this.#dashboard()?.grid.columns
    if (metrics && columns !== undefined) {
      for (const [id, rect] of rects) {
        const cell = rectToCell(rect, metrics)
        if (sameCell(gesture.cells.get(id), cell))
          continue
        gesture.cells.set(id, cell)
        gesture.layout.move(id, kind === 'move' ? { x: Math.max(0, cell.x), y: Math.max(0, cell.y) } : clipCell(cell, columns))
      }
    }
    if (phase === 'end') {
      this.#gesture = undefined
      gesture.layout.end()
    }
  }

  /** 框选结束：选中落在选框里的卡片，带修饰键时追加。 */
  readonly #onMarquee = (event: Event): void => {
    const { phase, rect, mode, additive } = (event as DesignerTransformEventMap['marquee']).detail
    const editor = this.#editor
    const dashboard = this.#dashboard()
    if (phase !== 'end' || !editor || !dashboard)
      return
    const placed = dashboard.cards.flatMap((card) => {
      const box = this.#cardRect(card.id)
      return box ? [{ id: card.id, box }] : []
    })
    const ids = selectInMarquee(rect, placed.map(item => item.box), mode).map(index => placed[index]!.id)
    editor.select({ cards: ids }, additive ? 'add' : 'replace')
  }

  /** 手势贴到可见区边缘时滚动画布，并立即换上新的视口，同一帧接着算的位置随之对上。 */
  readonly #onPanRequest = (event: Event): void => {
    const { dx, dy } = (event as CustomEvent<PanRequestDetail>).detail
    this.#layers?.scroller.scrollBy({ left: dx, top: dy })
    this.#renderSelection()
  }

  readonly #onHover = (event: PointerEvent): void => {
    if (event.buttons !== 0)
      return
    const id = this.#cardAt(event.target)
    if (id === this.#hoverId)
      return
    this.#hoverId = id
    this.#renderSelection()
  }

  readonly #onHoverEnd = (): void => {
    if (this.#hoverId === undefined)
      return
    this.#hoverId = undefined
    this.#renderSelection()
  }

  /** 物料面板：只读或报表主体不是看板时只能浏览；文案变了才重排分组。 */
  #syncPalette(palette: XhDesignerPaletteElement, t: ReportDesignerTranslations): void {
    palette.readonly = this.readonly || !this.#dashboard()
    const key = JSON.stringify([t.palette, t.paletteGroups, t.cardTypes])
    if (key === this.#paletteKey)
      return
    this.#paletteKey = key
    palette.translations = { title: t.palette }
    palette.groups = paletteGroups(t)
  }

  /** 数据面板与字段栏随文档与选择更新。 */
  #syncData(): void {
    const editor = this.#editor
    if (!this.#layers || !editor)
      return
    const t = this.#translations()
    this.#layers.data.update(editor.document, editor.selection.data, t)
    this.#layers.wells.update(editor.document, editor.selection, t)
  }

  /** 新卡片的模板，取数用第一个数据集。 */
  #template(type: ReportCardType): ReturnType<typeof cardTemplate> {
    return cardTemplate(type, this.#editor?.document.datasets[0]?.id ?? '')
  }

  /** 新卡片画出来之后，不在可见区时滚动到它。 */
  #revealAdded(card: DashboardCard): void {
    void this.updateComplete.then(() => this.revealCard(card.id))
  }

  /** 点物料：新卡片放到第一个空位并选中。 */
  readonly #onPaletteActivate = (event: Event): void => {
    const type = (event as DesignerPaletteEventMap['item-activate']).detail.payload as ReportCardType
    if (this.readonly || !this.#dashboard())
      return
    this.#revealAdded(this.addCard(this.#template(type)))
  }

  /**
   * 物料拖到看板上：以指针为中心放新卡片，落点画出压实之后它实际所在的格；隐藏跟随指针的预览。
   * 只读、不是看板或载荷不是卡片种类时不接受。
   */
  #dropOver(point: Point, payload: unknown): DropOver {
    const type = paletteCardType(payload)
    const dashboard = this.#dashboard()
    const metrics = this.#gridMetrics()
    const layers = this.#layers
    if (type === undefined || this.readonly || !dashboard || !metrics || !layers) {
      this.#clearDrop()
      return { accept: false }
    }
    const template = this.#template(type)
    const origin = layers.surface.getBoundingClientRect()
    const cell = centeredCell({ x: point.x - origin.left, y: point.y - origin.top }, template.layout, metrics, dashboard.grid.columns)
    this.#drop = { type, ...cell }
    const id = createIdAllocator(template.kind, dashboard.cards.map(card => card.id)).next()
    const added = planAddCard(dashboard, { ...template, id, layout: { ...template.layout, ...cell } }).find(operation => operation.type === 'addCard')
    const landing = added?.type === 'addCard' ? added.card.layout : { ...template.layout, ...cell }
    const rect = cellToRect(landing, metrics)
    const preview = layers.dropPreview
    preview.hidden = false
    preview.style.insetInlineStart = `${rect.x}px`
    preview.style.insetBlockStart = `${rect.y}px`
    preview.style.inlineSize = `${rect.width}px`
    preview.style.blockSize = `${rect.height}px`
    layers.canvas.dataset.gesture = 'drop'
    return { accept: true, ghost: 'hide' }
  }

  /** 在落点新建拖进来的卡片并选中它。 */
  #dropCard(): void {
    const drop = this.#drop
    this.#clearDrop()
    if (!drop || this.readonly || !this.#dashboard())
      return
    const template = this.#template(drop.type)
    this.#revealAdded(this.addCard({ ...template, layout: { ...template.layout, x: drop.x, y: drop.y } }))
  }

  #clearDrop(): void {
    this.#drop = undefined
    const layers = this.#layers
    if (!layers)
      return
    layers.dropPreview.hidden = true
    delete layers.canvas.dataset.gesture
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
    if (!editor || event.target !== this.#layers?.canvas || this.#gesture)
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

  /** 只选中一张卡片时，方向键挪一格，Shift 加方向键改大小一格；每次按键一步撤销。 */
  #nudge(key: string, resize: boolean): boolean {
    const editor = this.#editor
    const dashboard = this.#dashboard()
    if (!editor || !dashboard || this.readonly || this.#gesture || editor.selection.cards.length !== 1)
      return false
    const id = editor.selection.cards[0]!
    const card = dashboard.cards.find(item => item.id === id)
    if (!card)
      return false
    const dx = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0
    const dy = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0
    const { x, y, w, h } = card.layout
    const gesture = editor.startLayout()
    gesture.move(id, resize ? { w: Math.max(1, w + dx), h: Math.max(1, h + dy) } : { x: Math.max(0, x + dx), y: Math.max(0, y + dy) })
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
  defineXhElement('xh-sortable', XhSortableElement)
  defineXhElement('xh-tag', XhTagElement)
  defineXhElement('xh-tree', XhTreeElement)
  defineDesignerShellElement('xh-designer-frame', XhDesignerFrameElement)
  defineDesignerShellElement('xh-designer-palette', XhDesignerPaletteElement)
  defineDesignerShellElement('xh-designer-transform', XhDesignerTransformElement)
  registerElement(REPORT_DESIGNER_TAG, XhReportDesigner)
}

declare global {
  interface HTMLElementTagNameMap {
    'xh-report-designer': XhReportDesigner
  }
}
