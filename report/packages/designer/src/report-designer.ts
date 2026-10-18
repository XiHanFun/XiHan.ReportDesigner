/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// <xh-report-designer>：报表设计器元素。编辑模型（历史、选择、剪贴板、布局手势）在 createReportEditor 里，
// 画布内容复用查看器的计算与渲染；整体版式用 @xihan-ui/designer-shell 的外框，panels 决定显示哪些区，面板用 designer-shell 的零件。
// 卡片与视图种类、渲染、属性编辑器、命令、面板与物料都从 extensions 来，内置命令与物料也是一个扩展；
// 工具栏与菜单的排列可由 commandLayout 改写。设置对话框（openSettings()）里是基础分区与各扩展的分区，值经 settings 与
// settings-change 交给宿主。

import type { DashboardCard, DashboardView, ExpressionEngine, ParameterValues, ReportDocument, ReportOperation, ValidationIssue } from '@xihan-report/core'
import type { ReportDataProvider, ReportDesignerTranslations, ReportFormatter, ReportViewerTranslations, XhReportViewer } from '@xihan-report/runtime'
import type { JsonValue } from '@xihan-ui/core/json'
import type { VisualEnvironmentStorageError } from '@xihan-ui/core/visual-environment'
import type { ExecuteOptions, ExtensionHost, GridRect, HistoryChangeKind, Point, Rect, Viewport } from '@xihan-ui/designer-kit'
import type { PropertySwatchOption } from '@xihan-ui/designer-kit/properties'
import type { CommandToolbar, DesignerCommandLayout, DesignerCommandsTranslations, DesignerFrameEventMap, DesignerFrameRegion, DesignerPaletteDragPayload, DesignerPaletteEventMap, DesignerPaletteGroup, DesignerPanelHost, DesignerSettings, DesignerSettingsEventMap, DesignerSettingsHost, DesignerSettingsPolicy, DesignerStatusItem, DesignerTransformEventMap, DesignerTransformItem, DropOver, PanRequestDetail } from '@xihan-ui/designer-shell'
import type { PropertyValues } from '@xihan-ui/web-components/authoring'
import type { DialogService } from '@xihan-ui/web-components/services'
import type { DataRemoval } from './data-editing'
import type { DataAddKind } from './data-panel'
import type { LayoutGesture, ReportAddCardInit, ReportClipboard, ReportDataRef, ReportEditor, ReportItemRef, ReportSelection } from './editor'
import type { ReportCardTemplate, ReportDesignerContext, ReportDesignerExtension, ReportDesignerModel, ReportMenuSubject } from './extensions'
import type { GridMetrics } from './grid-geometry'
import { cardTypeOf, planAddCard, planAddFieldItem, resolveParameters } from '@xihan-report/core'
import { DEFAULT_REPORT_DESIGNER_TRANSLATIONS, DEFAULT_REPORT_VIEWER_TRANSLATIONS, defaultFormatter, defineReportViewer } from '@xihan-report/runtime'
import { createRenderContext } from '@xihan-report/runtime/design'
import { getLocalTimeZone } from '@xihan-ui/core/date'
import { detectKbdPlatform } from '@xihan-ui/core/hotkey'
import { clampZoom, commandForShortcut, createExtensionHost, createIdAllocator, DEFAULT_ZOOM_LIMITS, selectInMarquee, wheelZoomFactor, zoomBy, zoomTo } from '@xihan-ui/designer-kit'
import {
  arrangeCommands,
  createCommandToolbar,
  createDesignerSettingsHost,
  createPanelHost,
  createStatusItem,
  defineDesignerShellElement,
  DESIGNER_COMMANDS_EN_US,
  DESIGNER_FRAME_REGIONS,
  DESIGNER_SETTING_KEYS,
  parseDesignerPanels,
  registerDropTarget,
  renderCommandMenu,
  resolveSettings,
  runCommand,
  toolbarDisplayOf,
  XhDesignerFrameElement,
  XhDesignerIssuesElement,
  XhDesignerPaletteElement,
  XhDesignerPropertiesElement,
  XhDesignerSettingsElement,
  XhDesignerTransformElement,
} from '@xihan-ui/designer-shell'
import { BOOLEAN_CONVERTER, createAuthoredElement, createGeneratedElement, emitEvent, registerElement, XhConfigController, XhReactiveElement } from '@xihan-ui/web-components/authoring'
import { defineXhElement, XhButtonElement, XhContextMenuElement, XhSortableElement, XhTagElement, XhToolbarElement, XhTreeElement } from '@xihan-ui/web-components/define'
import { createDialogService } from '@xihan-ui/web-components/services'
import { CanvasContent } from './canvas'
import { readReportClipboardData, writeReportClipboardData } from './clipboard'
import { canEditData, cascadeCount, planDataAddition, planDataRemoval } from './data-editing'
import { dataFieldPayload, DataPanel } from './data-panel'
import { createReportEditor, writeReportClipboard } from './editor'
import { createReportDesignerModel, REPORT_DESIGNER_EXTENSION, REPORT_MENU_LAYOUT, REPORT_TOOLBAR_LAYOUT } from './extensions'
import { cellSize, cellToRect, centeredCell, clipCell, measureGrid, rectToCell } from './grid-geometry'
import { IssuesPanel } from './issues-panel'
import { PropertiesPanel } from './properties-panel'
import { fieldList, Wells, wellsOwner, withFilledBindings } from './wells'

/** 设计器的标签名。 */
export const REPORT_DESIGNER_TAG = 'xh-report-designer'

/** 可以收起的面板，画布常驻、不在其中。 */
export const REPORT_DESIGNER_PANELS = ['toolbar', 'datasets', 'parameters', 'palette', 'wells', 'properties', 'issues', 'status'] as const

/** 可以收起的面板之一。 */
export type ReportDesignerPanel = (typeof REPORT_DESIGNER_PANELS)[number]

/** 设计或预览。 */
export type ReportDesignerMode = 'design' | 'preview'

/** 数据集能改到什么程度：none 只读；fields 能改字段的标题、类型与计算字段公式，增删报表参数；full 另能增删数据集与字段。 */
export type ReportDatasetEditing = 'none' | 'fields' | 'full'

/** schema-change 的来由。 */
export type ReportSchemaChangeKind = 'execute' | 'undo' | 'redo' | 'load'

/** 设计器派发的事件。 */
export interface ReportDesignerEventMap {
  /** 报表变了：schema 是新的报表，operations 是这一步的操作，kind 说明是执行、撤销、重做还是装载。 */
  'schema-change': CustomEvent<{ schema: ReportDocument, operations: readonly ReportOperation[], kind: ReportSchemaChangeKind }>
  /** 选择变了，detail 是新的选择。 */
  'selection-change': CustomEvent<ReportSelection>
  /** 与保存点相比有没有改动变了。 */
  'dirty-change': CustomEvent<{ dirty: boolean }>
  /** 报表的校验问题变了。 */
  'issues-change': CustomEvent<{ issues: readonly ValidationIssue[] }>
  /** 在画布上按了 Ctrl+S（macOS 上 ⌘S）；保存由宿主做，存好后调 markSaved()。 */
  'save': CustomEvent<Record<string, never>>
  /** 在设计与预览之间切换了。 */
  'mode-change': CustomEvent<{ mode: ReportDesignerMode }>
  /** 双击了一张卡片。 */
  'card-dblclick': CustomEvent<{ id: string }>
  /** 可取消；不取消时弹内建右键菜单。 */
  'card-contextmenu': CustomEvent<{ id: string, x: number, y: number }>
  /** 可取消；不取消时弹内建右键菜单。 */
  'blank-contextmenu': CustomEvent<{ x: number, y: number }>
  /** 点了面板头的关闭钮，设计器已收起这块面板：panels 是收起之后要显示的面板（空格分隔），设计器的 panels 已换成它。 */
  'panels-change': CustomEvent<{ panels: string }>
  /**
   * 在设置对话框里改了一条设置：设计器已换成新的 settings 并生效（主题、主题色与扩展读的值）；
   * value 为 undefined 表示删掉这个键、回到缺省值。宿主存起来，下次赋回 settings。
   */
  'settings-change': CustomEvent<{ key: string, value: JsonValue | undefined, settings: DesignerSettings }>
  /** 读写 settingsStorageKey 指的本机存储失败（内容不是对象、无痕窗口、配额满）；设置留在内存里。 */
  'settings-storage-error': CustomEvent<VisualEnvironmentStorageError>
  /** 视口变了：缩放、适合窗口、setViewport 与滚动画布都会派发。 */
  'viewport-change': CustomEvent<{ viewport: Viewport }>
}

/** 放大、缩小一档的倍数。 */
const ZOOM_STEP = 1.2

/** 缩放的上下限：10%–400%。 */
const ZOOM_LIMITS = DEFAULT_ZOOM_LIMITS

/** 缩放倍数差不到这么多时当作没变。 */
const ZOOM_EPSILON = 1e-3

/**
 * 外框的命名区：照外框的缺省区表，左侧在物料上面叠数据集与报表参数，右侧在属性上面叠字段栏。
 * 同一侧的宽度取该侧第一个区的，所以挪到叠在最上面的那块上。
 */
const FRAME_REGIONS: readonly DesignerFrameRegion[] = DESIGNER_FRAME_REGIONS.flatMap((region): DesignerFrameRegion[] => {
  const { size, ...rest } = region
  if (region.name === 'palette')
    return [{ name: 'datasets', position: 'start', ...(size === undefined ? {} : { size }) }, { name: 'parameters', position: 'start' }, rest]
  if (region.name === 'properties')
    return [{ name: 'wells', position: 'end', ...(size === undefined ? {} : { size }) }, rest]
  return [region]
})

interface Layers {
  readonly frame: XhDesignerFrameElement
  readonly toolbar: HTMLElement
  readonly commandBar: CommandToolbar<ReportDesignerContext>
  /** 顶栏中段的插入钮：图标在上、短文字在下；没有 header 命令时不放进外框。 */
  readonly headerBar: CommandToolbar<ReportDesignerContext>
  /** 扩展登记的面板。 */
  readonly panels: DesignerPanelHost<ReportDesignerContext>
  /** 包着画布的 <xh-context-menu> 与它的菜单内容。 */
  readonly menu: HTMLElement
  readonly menuContent: HTMLElement
  /** 菜单的触发区：关闭菜单后焦点回到这里，键盘与剪贴板把它当作画布。 */
  readonly menuTrigger: HTMLElement
  readonly canvas: HTMLElement
  readonly scroller: HTMLElement
  /** 包着 surface、取 surface 缩放之后的大小，滚动范围随它走。 */
  readonly sizer: HTMLElement
  readonly surface: HTMLElement
  readonly content: HTMLElement
  readonly overlay: XhDesignerTransformElement
  readonly empty: HTMLElement
  readonly dropPreview: HTMLElement
  /** mode = preview 时显示的查看器容器。 */
  readonly preview: HTMLElement
  readonly palette: XhDesignerPaletteElement
  readonly data: DataPanel
  readonly wells: Wells
  readonly properties: PropertiesPanel
  readonly issues: IssuesPanel
  /** 设置对话框。 */
  readonly settings: XhDesignerSettingsElement
  /** 状态栏左段：选中对象的信息，没选中时是报表的概况。 */
  readonly selectionStatus: DesignerStatusItem
  /** 状态栏右段：缩放倍数，点了回到实际大小。 */
  readonly zoomStatus: DesignerStatusItem
}

/** 数据面板的字段拖到画布上的落点：卡片（缺省为报表主体的视图）与字段。 */
interface FieldDrop {
  readonly card?: string
  readonly dataset: string
  readonly field: string
}

/** 物料拖到看板上的落点：物料项 id 与请求的左上角格。 */
interface CardDrop {
  readonly item: string
  readonly x: number
  readonly y: number
}

/** 进行中的卡片拖动或改大小：编辑模型的布局手势与最近一次写进去的格坐标。 */
interface CardGesture {
  readonly layout: LayoutGesture
  readonly cells: Map<string, GridRect>
}

const EMPTY_SELECTION: ReportSelection = { cards: [] }

const NO_EXTENSIONS: readonly ReportDesignerExtension[] = []

function sameCell(a: GridRect | undefined, b: GridRect): boolean {
  return a !== undefined && a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h
}

function sameIssues(a: readonly ValidationIssue[], b: readonly ValidationIssue[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** 报表设计器 <xh-report-designer>：编辑报表定义，画布与预览按 dataProvider 取数显示示例数据。 */
export class XhReportDesigner extends XhReactiveElement {
  static override properties = {
    schema: { attribute: false },
    dataProvider: { attribute: false },
    expressionEngine: { attribute: false },
    formatter: { attribute: false },
    parameters: { attribute: false },
    commandLayout: { attribute: false },
    translations: { attribute: false },
    locale: { attribute: 'locale' },
    timeZone: { attribute: 'time-zone' },
    readonly: { converter: BOOLEAN_CONVERTER },
    mode: { attribute: 'mode' },
    panels: { converter: { fromAttribute: (value: string | null) => value ?? undefined } },
    datasetEditing: { attribute: 'dataset-editing' },
    settings: { attribute: false },
    settingsPolicy: { attribute: false },
    settingsStorageKey: { attribute: 'settings-storage-key', converter: { fromAttribute: (value: string | null) => value ?? undefined } },
    brands: { attribute: false },
    registerBrand: { attribute: false },
  }

  /** 报表定义：赋值即装载（清空历史与选择）；赋回当前这一份不重新装载。读取得到当前报表。 */
  declare schema: ReportDocument | undefined
  /** 与查看器同一个取数回调，画布与预览用；不给时画布画占位。 */
  declare dataProvider: ReportDataProvider | undefined
  /** 表达式引擎：计算字段与公式度量要用，校验公式也用它。 */
  declare expressionEngine: ExpressionEngine | undefined
  /** 值的显示文字；缺省按格式说明调 formatValue。 */
  declare formatter: ReportFormatter | undefined
  /** 预览与画布取数用的报表参数取值。 */
  declare parameters: ParameterValues | undefined
  /** 工具栏与右键菜单（menu:card、menu:blank）的命令排列；写了某个位置就只显示列出的命令。 */
  declare commandLayout: DesignerCommandLayout | undefined
  /** 元素自己的文案，压在全局配置之上。 */
  declare translations: Partial<ReportDesignerTranslations> | undefined
  /** BCP 47 语言标记；缺省取全局配置。 */
  declare locale: string | undefined
  /** IANA 时区；缺省取运行环境所在的时区。 */
  declare timeZone: string | undefined
  /** 只读：可选择、浏览与预览，不能修改；缺省可修改。attribute 写 "false" 是可修改，其余写法是只读。 */
  declare readonly: boolean | undefined
  /** design 或 preview，缺省 design。 */
  declare mode: ReportDesignerMode | undefined
  /**
   * 空格分隔的可收起面板：toolbar datasets parameters palette wells properties issues status；不写即全部显示，写空串只留画布。
   * 点了面板头的关闭钮时设计器改写它并派发 panels-change。
   */
  declare panels: string | undefined
  /** 缺省 fields。 */
  declare datasetEditing: ReportDatasetEditing | undefined
  /**
   * 设置的值：扁平的键值，键是「分区 id.条目 id」，如 general.theme；没写的键取条目的缺省值。
   * 赋值即生效；用户在设置对话框里改了以后设计器换成新的一份并派发 settings-change。
   */
  declare settings: DesignerSettings | undefined
  /** 宿主对设置条目的管控：键是条目键或分区 id，hidden 不显示，locked 只读、说明换成「由所在系统管理」。 */
  declare settingsPolicy: DesignerSettingsPolicy | undefined
  /**
   * 设置存在根所在窗口 localStorage 的哪个键下：给了，连上文档时若没赋 settings 就从这里读，用户改了设置就写回去，
   * 标了 secret 的条目不存；读写失败派发 settings-storage-error。不给就不读写。同名 attribute settings-storage-key。
   */
  declare settingsStorageKey: string | undefined
  /** 设置里主题色的预设：value 是品牌 id（写成设计器根上的 data-brand），color 是色板格子的颜色。不给且没给 registerBrand 时没有主题色这一项。 */
  declare brands: readonly PropertySwatchOption[] | undefined
  /** 注册自定义主题色，形状与 @xihan-ui/tokens 的 registerBrand 相同；给了才许在设置里自定义主题色。 */
  declare registerBrand: ((id: string, color: string) => () => void) | undefined

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
  /** 画布的缩放倍数，1 为实际尺寸；是视图状态，不进报表。 */
  #zoom = 1
  /** 适合窗口之后画布或内容的尺寸变了就重新适配，直到改了缩放、设置视口或在画布上按下指针。 */
  #autoFit = false
  #lastMode: ReportDesignerMode = 'design'
  #dialogs: DialogService | undefined
  #viewer: XhReportViewer | undefined
  #drop: CardDrop | undefined
  #fieldDrop: FieldDrop | undefined
  #paletteKey = ''
  #platform: 'mac' | 'other' | undefined
  #regionsKey = ''
  #regionsModel: ReportDesignerModel | undefined
  #regionList: readonly DesignerFrameRegion[] = FRAME_REGIONS
  #settingsHost: DesignerSettingsHost | undefined
  #settingsHostOptions: readonly unknown[] = []
  #settingsDialogKey = ''
  /** 此刻生效的设置：各分区没写的条目取了缺省值。 */
  #resolvedSettings: DesignerSettings = {}
  #extensions: readonly ReportDesignerExtension[] | undefined
  /** 包好各扩展取数中间件的取数回调，扩展与 dataProvider 都没变时沿用。 */
  #wrapped: { readonly model: ReportDesignerModel, readonly base: ReportDataProvider, readonly provider: ReportDataProvider } | undefined
  #model: ReportDesignerModel = createReportDesignerModel(NO_EXTENSIONS)
  readonly #host: ExtensionHost<ReportDesignerExtension> = createExtensionHost<ReportDesignerExtension, ReportDesignerContext>({
    builtins: [REPORT_DESIGNER_EXTENSION],
    context: () => this.#context(),
  })

  /**
   * 扩展：卡片与视图种类、渲染、属性编辑器、命令、面板与物料都从这里来，内置扩展自动排在最前。
   * 赋值时当场合并查重，冲突抛 DesignerExtensionError、什么都不变；各扩展的 setup 在元素连上文档时调用、断开时清理。
   * 同一个扩展对象换了引用当作卸下再装上，宿主要保持引用稳定。去掉的扩展登记的种类在报表里原样保留，画布上画占位。
   */
  get extensions(): readonly ReportDesignerExtension[] | undefined {
    return this.#extensions
  }

  set extensions(value: readonly ReportDesignerExtension[] | undefined) {
    if (value === this.#extensions)
      return
    const model = createReportDesignerModel(value ?? NO_EXTENSIONS)
    this.#ensureLayers().panels.assign(model.extensions, this.#context())
    if (this.isConnected)
      this.#host.assign(value ?? NO_EXTENSIONS)
    const old = this.#extensions
    this.#extensions = value
    this.#model = model
    this.#paletteKey = ''
    this.#refreshIssues()
    this.#fillMenu('blank')
    this.requestUpdate('extensions', old)
  }

  /** 能不能撤销；只读时为 false。 */
  get canUndo(): boolean {
    return !this.readonly && (this.#editor?.history.canUndo ?? false)
  }

  /** 能不能重做；只读时为 false。 */
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

  /** deleteSelection() 此刻能删掉东西：选中了卡片、列表项或联动，或 datasetEditing 允许删的数据面板对象。 */
  get canDelete(): boolean {
    const selection = this.#editor?.selection
    if (this.readonly || !selection)
      return false
    if (selection.data)
      return this.#canRemoveData(selection.data)
    return selection.cards.length > 0 || selection.item !== undefined || selection.link !== undefined
  }

  /** 执行一组操作并记为一步撤销；返回新文档。还没有报表时抛错。 */
  execute(operations: readonly ReportOperation[], options?: ExecuteOptions): ReportDocument {
    return this.#requireEditor().execute(operations, options)
  }

  /** 撤销一步；只读或没有可撤销的时返回 false。 */
  undo(): boolean {
    return !this.readonly && (this.#editor?.undo() ?? false)
  }

  /** 重做一步；只读或没有可重做的时返回 false。 */
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

  /**
   * 照点物料的做法新建一张卡片：放到第一个空位、选中它并滚到看得见的地方，返回新卡片；只读、主体不是看板或没有这个物料项时
   * 什么都不做，返回 undefined。顶栏的插入钮调它。
   */
  addPaletteItem(id: string): DashboardCard | undefined {
    if (this.readonly || !this.#dashboard() || !this.#model.palette.has(id))
      return undefined
    const card = this.addCard(this.#template(id))
    this.#revealAdded(card)
    return card
  }

  /** 换成给出的选择：给了 data 只选数据面板里的对象，否则选 cards，再带 item 或 link 之一。 */
  select(selection: Partial<ReportSelection>): void {
    this.#editor?.select(selection)
  }

  /** 选中看板上的全部卡片；主体不是看板时清空选择。 */
  selectAll(): void {
    this.#editor?.selectAll()
  }

  /** 当前的选择。 */
  getSelection(): ReportSelection {
    return this.#editor?.selection ?? EMPTY_SELECTION
  }

  /**
   * 删除选中的对象：卡片、列表项或联动直接删；数据面板里的字段、参数与数据集按 datasetEditing 能删时删，
   * 会一并删掉别处时先弹确认框，确认后合为一步撤销。返回是否删除（或已弹出确认框）。
   */
  deleteSelection(): boolean {
    const editor = this.#editor
    if (this.readonly || !editor)
      return false
    const data = editor.selection.data
    return data ? this.#removeData(data) : editor.deleteSelection()
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

  /** 复制选中的卡片并当场粘贴，不经剪贴板；返回新的选择。 */
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

  /**
   * 视口：屏幕坐标（画布可见区的左上角为原点）= 画布坐标 × zoom + (x, y)；画布坐标是实际尺寸下画布里的像素，
   * zoom 为 1 时是实际尺寸。画布还没有布局时 x、y 为 0。
   */
  getViewport(): Viewport {
    return this.#measureViewport() ?? { x: 0, y: 0, zoom: this.#zoom }
  }

  /** 设置视口：缩放夹进 10%–400%，平移落在画布能滚到的范围里；此后尺寸变化不再自动适配。 */
  setViewport(viewport: Viewport): void {
    this.#autoFit = false
    this.#moveTo(viewport)
  }

  /**
   * 缩放到整块内容的高度落进可见区，宽度总是铺满可见区，不放大到实际尺寸以上；此后画布或内容的尺寸变了就重新适配，
   * 直到改了缩放、设置视口或在画布上按下指针。
   */
  zoomToFit(): void {
    this.#autoFit = true
    this.#fit()
  }

  /** 以可见区中心放大一档。 */
  zoomIn(): void {
    this.#zoomAtCenter(this.#zoom * ZOOM_STEP)
  }

  /** 以可见区中心缩小一档。 */
  zoomOut(): void {
    this.#zoomAtCenter(this.#zoom / ZOOM_STEP)
  }

  /** 以可见区中心缩放到实际尺寸。 */
  zoomToActual(): void {
    this.#zoomAtCenter(1)
  }

  override connectedCallback(): void {
    super.connectedCallback()
    const doc = this.ownerDocument
    doc.addEventListener('copy', this.#onClipboard)
    doc.addEventListener('cut', this.#onClipboard)
    doc.addEventListener('paste', this.#onClipboard)
    this.#host.assign(this.#extensions ?? NO_EXTENSIONS)
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
    this.#dialogs?.dispose()
    this.#dialogs = undefined
    this.#settingsHost?.dispose()
    this.#settingsHost = undefined
    this.#host.dispose()
  }

  protected override update(changed: PropertyValues): void {
    super.update(changed)
    const layers = this.#ensureLayers()
    const t = this.#translations()
    this.#syncSettings(layers, changed)
    this.setAttribute('aria-label', t.label)
    layers.canvas.setAttribute('aria-label', t.canvas)
    if (changed.has('schema'))
      this.#load()
    const mode = this.#mode()
    this.dataset.mode = mode
    if (mode !== this.#lastMode) {
      this.#lastMode = mode
      emitEvent(this, 'mode-change', { mode })
    }
    layers.overlay.readonly = this.readonly === true
    this.#syncPalette(layers.palette, t)
    this.#syncData()
    this.#renderCanvas()
  }

  #translations(): ReportDesignerTranslations {
    return this.#config.translations<ReportDesignerTranslations>('xh-report-designer', DEFAULT_REPORT_DESIGNER_TRANSLATIONS, this.translations)
  }

  #commandTranslations(): DesignerCommandsTranslations {
    return this.#config.translations<DesignerCommandsTranslations>('xh-designer-commands', DESIGNER_COMMANDS_EN_US, undefined)
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

  #validateOptions(): { readonly extensions: readonly ReportDesignerExtension[], readonly expressionEngine?: ExpressionEngine } {
    const extensions = this.#model.list
    return this.expressionEngine ? { extensions, expressionEngine: this.expressionEngine } : { extensions }
  }

  /** 交给命令、面板、物料与扩展 setup 的上下文。 */
  #context(t: ReportDesignerTranslations = this.#translations()): ReportDesignerContext {
    return { designer: this, translations: t, commands: this.#commandTranslations(), settings: this.#resolvedSettings, frame: this.#layers?.frame }
  }

  /** 面板用的文案：问题的说明先问扩展，扩展不给时用设计器的文案。 */
  #panelTranslations(t: ReportDesignerTranslations): ReportDesignerTranslations {
    const issueText = this.#model.runtime.issueText
    return { ...t, issue: issue => issueText(issue as ValidationIssue) ?? t.issue(issue) }
  }

  /** 画布用的取数回调：dataProvider 包上各扩展的中间件；没给 dataProvider 时为 undefined。 */
  #provider(): ReportDataProvider | undefined {
    const base = this.dataProvider
    if (!base)
      return undefined
    if (this.#wrapped?.model !== this.#model || this.#wrapped.base !== base)
      this.#wrapped = { model: this.#model, base, provider: this.#model.runtime.provider(base) }
    return this.#wrapped.provider
  }

  #kbdPlatform(): 'mac' | 'other' {
    this.#platform ??= detectKbdPlatform()
    return this.#platform
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
      this.#fillMenu('blank')
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
    this.#fillMenu('blank')
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
    const commandBar = createCommandToolbar<ReportDesignerContext>(doc, { platform: this.#kbdPlatform() })
    const headerBar = createCommandToolbar<ReportDesignerContext>(doc, { display: 'stacked', platform: this.#kbdPlatform() })
    headerBar.element.slot = 'header-center'
    const toolbar = createAuthoredElement(doc, 'div', { 'slot': 'toolbar', 'data-part': 'command-bar' }, [commandBar.element])
    const content = createAuthoredElement(doc, 'div', { 'data-part': 'content' })
    const empty = createAuthoredElement(doc, 'div', { 'data-part': 'empty', 'hidden': true })
    const dropPreview = createAuthoredElement(doc, 'div', { 'data-part': 'drop-preview', 'hidden': true })
    const surface = createAuthoredElement(doc, 'div', { 'data-part': 'surface' }, [content, empty, dropPreview])
    const sizer = createAuthoredElement(doc, 'div', { 'data-part': 'sizer' }, [surface])
    const scroller = createAuthoredElement(doc, 'div', { 'data-part': 'scroller' }, [sizer])
    const overlay = createAuthoredElement(doc, 'xh-designer-transform', { 'data-part': 'overlay' }) as XhDesignerTransformElement
    overlay.addEventListener('transform', this.#onTransform)
    overlay.addEventListener('marquee', this.#onMarquee)
    const canvas = createAuthoredElement(doc, 'div', { 'data-part': 'canvas', 'role': 'group', 'tabindex': 0 }, [scroller, overlay])
    canvas.addEventListener('pan-request', this.#onPanRequest)
    const menuContent = createAuthoredElement(doc, 'div', { 'data-xh-part': 'content' })
    const menuTrigger = createAuthoredElement(doc, 'div', { 'data-xh-part': 'trigger', 'data-report-canvas': '' }, [canvas])
    const menu = createAuthoredElement(doc, 'xh-context-menu', { 'size': 'sm', 'data-report-canvas-menu': '' }, [
      createAuthoredElement(doc, 'div', { 'data-xh-part': 'root', 'data-report-canvas-root': '' }, [
        menuTrigger,
        createAuthoredElement(doc, 'div', { 'data-xh-part': 'positioner' }, [menuContent]),
      ]),
    ])
    menu.addEventListener('select', this.#onMenuSelect)
    registerDropTarget(scroller, {
      over: (point, payload) => this.#dropOver(point, payload),
      drop: () => this.#fieldDrop ? this.#dropField() : this.#dropCard(),
      leave: () => this.#clearDrop(),
    })
    const preview = createAuthoredElement(doc, 'div', { 'data-part': 'preview', 'hidden': true })
    const workspace = createAuthoredElement(doc, 'div', { 'data-part': 'workspace' }, [menu, preview])
    const palette = createGeneratedElement(doc, 'xh-designer-palette', { 'data-part': 'palette', 'slot': 'palette' }) as XhDesignerPaletteElement
    palette.headless = true
    palette.addEventListener('item-activate', this.#onPaletteActivate)
    const data = new DataPanel({
      ownerDocument: doc,
      select: ref => this.#editor?.select({ data: ref }),
      isReadonly: () => this.readonly === true,
      canAdd: kind => !this.readonly && canEditData(kind, this.#datasetEditing()),
      add: kind => this.#addData(kind),
      remove: () => {
        this.deleteSelection()
      },
    })
    const wells = new Wells({
      ownerDocument: doc,
      document: () => this.#editor?.document,
      execute: operations => this.#editor?.execute(operations),
      selectItem: ref => this.#editor?.select({ cards: ref.card === undefined ? [] : [ref.card], item: ref }),
      selectLink: (card, id) => this.#editor?.select({ cards: [card], link: id }),
      isReadonly: () => this.readonly === true,
      extensions: () => this.#extensions ?? NO_EXTENSIONS,
    })
    const properties = new PropertiesPanel({
      ownerDocument: doc,
      editor: () => this.#editor,
      isReadonly: () => this.readonly === true,
      datasetEditing: () => this.#datasetEditing(),
      issues: () => this.#issues,
      model: () => this.#model,
      renderContext: () => createRenderContext(this.#viewerTranslations(), this.formatter ?? defaultFormatter, this.#locale(), this.#timeZone()),
      select: selection => this.#editor?.select(selection),
    })
    const issues = new IssuesPanel({
      ownerDocument: doc,
      document: () => this.#editor?.document,
      locate: (selection) => {
        this.#editor?.select(selection)
        const card = selection.cards[0]
        if (card !== undefined)
          this.revealCard(card)
      },
    })
    properties.element.headless = true
    issues.element.headless = true
    // 问题列表带计数的严重程度开关放进它所在卡片的面板头
    const issueSummary = issues.element.summary
    issueSummary.slot = 'issues-actions'
    const frame = createGeneratedElement(doc, 'xh-designer-frame', { 'data-part': 'frame' }, [toolbar, data.datasets, data.parameters, palette, workspace, wells.element, properties.element, issues.element, issueSummary]) as XhDesignerFrameElement
    frame.addEventListener('panels-change', this.#onPanelsChange)
    const selectionStatus = createStatusItem(doc, { value: '' })
    selectionStatus.element.slot = 'status-start'
    const zoomStatus = createStatusItem(doc, { value: '', action: () => this.zoomToActual() })
    zoomStatus.element.slot = 'status-end'
    frame.append(selectionStatus.element, zoomStatus.element)
    const settings = createGeneratedElement(doc, 'xh-designer-settings', { 'data-part': 'settings' }) as XhDesignerSettingsElement
    settings.addEventListener('settings-change', this.#onSettingsChange)
    this.replaceChildren(frame, settings)
    this.#layers?.panels.dispose()
    const panels = createPanelHost<ReportDesignerContext>(frame, { regions: FRAME_REGIONS })
    canvas.addEventListener('pointerdown', this.#onPointerDown)
    canvas.addEventListener('pointermove', this.#onHover)
    canvas.addEventListener('pointerleave', this.#onHoverEnd)
    canvas.addEventListener('dblclick', this.#onDoubleClick)
    canvas.addEventListener('contextmenu', this.#onContextMenu)
    canvas.addEventListener('wheel', this.#onWheel, { passive: false })
    menuTrigger.addEventListener('keydown', this.#onKeyDown)
    scroller.addEventListener('scroll', () => this.#renderSelection(), { passive: true })
    this.#resize?.disconnect()
    if (typeof ResizeObserver === 'function') {
      this.#resize = new ResizeObserver(() => {
        this.#layoutZoom()
        if (this.#autoFit)
          this.#fit()
        else
          this.#renderSelection()
      })
      this.#resize.observe(surface)
      this.#resize.observe(scroller)
    }
    this.#content?.dispose()
    this.#content = new CanvasContent(content)
    this.#viewport = undefined
    this.#drop = undefined
    this.#paletteKey = ''
    this.#regionsKey = ''
    this.#viewer = undefined
    this.#settingsDialogKey = ''
    this.#layers = { frame, toolbar, commandBar, headerBar, panels, menu, menuContent, menuTrigger, canvas, scroller, sizer, surface, content, overlay, empty, dropPreview, preview, palette, data, wells, properties, issues, settings, selectionStatus, zoomStatus }
    panels.assign(this.#model.extensions, this.#context())
    this.#fillMenu('blank')
    return this.#layers
  }

  /** panels 原样交给外框；区名换成文案，供分隔条的无障碍名称使用，文案没变时不重设。 */
  #mode(): ReportDesignerMode {
    return this.mode === 'preview' ? 'preview' : 'design'
  }

  /** 打开设置对话框，给了分区 id 就显示那一页：基础是 general，扩展的是它登记的分区 id。 */
  openSettings(section?: string): void {
    this.#ensureLayers().settings.show(section)
  }

  /**
   * 设置：建好设置宿主（主题色预设、注册函数或存储键变了就重建），给了存储键又没赋 settings 时从存储读；settings 变了
   * 把主题与主题色落到设计器上；算出此刻生效的设置，交给设置对话框。
   */
  #syncSettings(layers: Layers, changed: PropertyValues): void {
    const options = [this.brands, this.registerBrand, this.settingsStorageKey]
    let fresh = false
    if (!this.#settingsHost || options.some((value, index) => value !== this.#settingsHostOptions[index])) {
      this.#settingsHost?.dispose()
      this.#settingsHostOptions = options
      const storageKey = this.settingsStorageKey
      this.#settingsHost = storageKey === undefined
        ? createDesignerSettingsHost({ root: this, brands: this.brands, registerBrand: this.registerBrand })
        : createDesignerSettingsHost({
            root: this,
            brands: this.brands,
            registerBrand: this.registerBrand,
            storageKey,
            onStorageError: detail => emitEvent(this, 'settings-storage-error', detail),
          })
      if (storageKey !== undefined && this.settings === undefined)
        this.settings = this.#settingsHost.load()
      fresh = true
    }
    if (fresh || changed.has('settings'))
      this.#settingsHost.apply(this.settings ?? {})
    const sections = this.#model.settings
    this.#resolvedSettings = resolveSettings(sections, this.settings)
    const dialog = layers.settings
    const general = { brands: this.brands, customBrand: this.registerBrand !== undefined }
    const policy: DesignerSettingsPolicy = { ...this.settingsPolicy }
    const dialogKey = JSON.stringify([general.brands, general.customBrand, policy])
    if (dialogKey !== this.#settingsDialogKey) {
      this.#settingsDialogKey = dialogKey
      dialog.general = general
      dialog.policy = policy
    }
    if (dialog.sections !== sections)
      dialog.sections = sections
    if (dialog.settings !== this.settings)
      dialog.settings = this.settings
  }

  /** 设置对话框里改了一条：换成新的 settings，给了存储键就存起来，再派发 settings-change。 */
  readonly #onSettingsChange = (event: Event): void => {
    event.stopPropagation()
    const detail = (event as DesignerSettingsEventMap['settings-change']).detail
    this.settings = detail.settings
    this.#settingsHost?.save(detail.settings, this.#model.settings)
    emitEvent(this, 'settings-change', detail)
  }

  /** panels 列出了这块面板（不写 panels 即全部显示）。 */
  #shows(panel: string): boolean {
    const shown = parseDesignerPanels(this.panels)
    return shown === undefined || shown.has(panel)
  }

  /** 报表参数那块卡片有没有东西可看可做：有参数，或者能新增参数。 */
  #hasParameters(): boolean {
    return (this.#editor?.document.parameters?.length ?? 0) > 0 || (!this.readonly && canEditData('parameter', this.#datasetEditing()))
  }

  /** 设置里的状态栏开关，缺省开。 */
  #statusBarOn(): boolean {
    return this.#resolvedSettings[DESIGNER_SETTING_KEYS.statusBar] !== false
  }

  /**
   * 交给外框的 panels：设计态原样转交，没有报表参数又不能新增时收起那块卡片，设置里关了状态栏时去掉 status；
   * 预览态只留工具栏。
   */
  #framePanels(): string | undefined {
    if (this.#mode() === 'preview')
      return this.#shows('toolbar') ? 'toolbar' : ''
    const hidden = [...(this.#hasParameters() ? [] : ['parameters']), ...(this.#statusBarOn() ? [] : ['status'])]
    if (hidden.length === 0)
      return this.panels
    const names = this.panels === undefined ? this.#regionList.map(region => region.name) : this.panels.split(/\s+/)
    return names.filter(name => name !== '' && !hidden.includes(name)).join(' ')
  }

  /**
   * 外框的区：工具栏与画布带上本地化的区名（分隔条的无障碍名称要用）；数据集、报表参数、物料、字段栏、属性与问题画成卡片，
   * 面板头写标题与帮助，属性卡片的副标题是当前编辑的对象。后面接扩展面板的区；内容与扩展都没变时不重设。
   */
  #syncFrame(frame: XhDesignerFrameElement, t: ReportDesignerTranslations): void {
    const layers = this.#layers
    const regions: Readonly<Record<string, Partial<DesignerFrameRegion>>> = {
      toolbar: { label: this.#commandTranslations().toolbar },
      datasets: { title: t.datasets, help: t.datasetsHelp },
      parameters: { title: t.parameters, help: t.parametersHelp },
      palette: { title: t.palette, help: t.paletteHelp },
      canvas: { label: t.canvas },
      wells: { title: t.wells, help: t.wellsHelp },
      properties: { title: t.properties, help: t.propertiesHelp, ...(layers?.properties.element.heading === undefined ? {} : { subtitle: layers.properties.element.heading }) },
      issues: { title: t.issues, help: t.issuesHelp },
    }
    const key = JSON.stringify(regions)
    if (key !== this.#regionsKey || this.#regionsModel !== this.#model) {
      this.#regionsKey = key
      this.#regionsModel = this.#model
      this.#regionList = [
        ...FRAME_REGIONS.map(region => ({ ...region, ...regions[region.name] })),
        ...this.#model.extensions.flatMap(extension => (extension.panels ?? []).map(panel => panel.region)),
      ]
    }
    if (frame.regions !== this.#regionList)
      frame.regions = this.#regionList
    frame.panels = this.#framePanels()
  }

  /** 外框收起了一块面板：外框没在显示的报表参数卡片（没有参数又不能新增）与被设置关掉的状态栏照 panels 原样留着。 */
  readonly #onPanelsChange = (event: Event): void => {
    event.stopPropagation()
    const names = (event as DesignerFrameEventMap['panels-change']).detail.panels.split(' ').filter(Boolean)
    if (!this.#hasParameters() && this.#shows('parameters'))
      names.push('parameters')
    if (!this.#statusBarOn() && this.#shows('status'))
      names.push('status')
    const panels = names.join(' ')
    this.panels = panels
    emitEvent(this, 'panels-change', { panels })
  }

  /** 设计态画画布；预览态把当前报表交给查看器，画布不取数。 */
  #renderCanvas(): void {
    const layers = this.#layers
    const document = this.#editor?.document
    if (!layers || !document || !this.#content)
      return
    const preview = this.#mode() === 'preview'
    layers.menu.hidden = preview
    layers.canvas.hidden = preview
    layers.preview.hidden = !preview
    if (preview) {
      this.#syncPreview(layers, document)
      return
    }
    const t = this.#translations()
    const values = resolveParameters(document.parameters, this.parameters ?? {}).values
    const context = createRenderContext(this.#viewerTranslations(), this.formatter ?? defaultFormatter, this.#locale(), this.#timeZone())
    const runtime = this.#model.runtime
    this.#content.update({
      document,
      provider: this.#provider(),
      values,
      runtime,
      options: {
        extensions: this.#model.list,
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

  /** 预览区的 <xh-report-viewer>：取数、格式、参数、语言与时区都与设计器相同。 */
  #syncPreview(layers: Layers, document: ReportDocument): void {
    let viewer = this.#viewer
    if (!viewer) {
      viewer = layers.preview.ownerDocument.createElement('xh-report-viewer')
      layers.preview.replaceChildren(viewer)
      this.#viewer = viewer
    }
    if (viewer.schema !== document)
      viewer.schema = document
    viewer.extensions = this.#model.list
    viewer.dataProvider = this.dataProvider
    viewer.expressionEngine = this.expressionEngine
    viewer.formatter = this.formatter
    viewer.parameters = this.parameters
    viewer.locale = this.locale
    viewer.timeZone = this.timeZone
  }

  /** 卡片在 surface 里的位置与大小（实际尺寸下的画布像素，即世界坐标）：屏幕上量出的偏移与尺寸除以缩放倍数。 */
  #cardRect(id: string): Rect | undefined {
    const card = this.#content?.cardElement(id)
    const surface = this.#layers?.surface
    if (!card || !surface)
      return undefined
    const box = card.getBoundingClientRect()
    const origin = surface.getBoundingClientRect()
    const zoom = this.#zoom
    return { x: (box.left - origin.left) / zoom, y: (box.top - origin.top) / zoom, width: box.width / zoom, height: box.height / zoom }
  }

  /** 看板网格的几何；不是看板或网格还没有布局时为 undefined。 */
  #gridMetrics(): GridMetrics | undefined {
    const dashboard = this.#dashboard()
    const grid = this.#content?.grid
    const surface = this.#layers?.surface
    if (!dashboard || !grid || !surface)
      return undefined
    return measureGrid(grid, surface, dashboard.grid.columns, dashboard.grid.rowHeight, this.#zoom)
  }

  /** surface 的原点相对覆盖层（画布可见区）的屏幕偏移与缩放倍数；还没建出画布时为 undefined。 */
  #measureViewport(): Viewport | undefined {
    const layers = this.#layers
    if (!layers)
      return undefined
    const origin = layers.surface.getBoundingClientRect()
    const screen = layers.overlay.getBoundingClientRect()
    return { x: origin.left - screen.left, y: origin.top - screen.top, zoom: this.#zoom }
  }

  /** 可见区的大小（覆盖层的屏幕像素）；还没布局时为 undefined。 */
  #size(): { readonly width: number, readonly height: number } | undefined {
    const box = this.#layers?.overlay.getBoundingClientRect()
    return box && box.width > 0 && box.height > 0 ? { width: box.width, height: box.height } : undefined
  }

  /**
   * 缩放倍数落到 surface 上：surface 按倍数缩放，宽除以倍数，缩放之后仍铺满可见区的宽；再按新的倍数排一次画布的高，
   * 当场刷新状态栏的缩放那一项。
   */
  #applyZoom(zoom: number): void {
    this.#zoom = zoom
    this.style.setProperty('--xh-report-designer-zoom', String(zoom))
    this.#layoutZoom()
    if (this.#layers)
      this.#renderZoomStatus(this.#layers, this.#translations())
  }

  /** 滚动区的内容区（去掉内边距）的高；还没布局时为 0。 */
  #visibleHeight(): number {
    const scroller = this.#layers?.scroller
    if (!scroller)
      return 0
    const style = getComputedStyle(scroller)
    return scroller.clientHeight - (Number.parseFloat(style.paddingTop) || 0) - (Number.parseFloat(style.paddingBottom) || 0)
  }

  /**
   * 画布的高：surface 的最小高是可见区的高除以倍数，缩放之后铺满可见区；sizer 的高是 surface 缩放之后的高，
   * 缩放前的布局盒被 sizer 裁掉，不撑大滚动范围。还没布局时都不写。
   */
  #layoutZoom(): void {
    const layers = this.#layers
    if (!layers)
      return
    const { sizer, surface } = layers
    const visible = this.#visibleHeight()
    if (!(visible > 0)) {
      surface.style.removeProperty('min-block-size')
      sizer.style.removeProperty('block-size')
      return
    }
    surface.style.minBlockSize = `${visible / this.#zoom}px`
    sizer.style.blockSize = `${surface.getBoundingClientRect().height}px`
  }

  /**
   * 换到给定的视口：先落缩放倍数，再按缩放之后量出的偏移滚动画布，让 surface 的原点落在 (x, y)；
   * 滚动越出画布能滚到的范围时停在边上。
   */
  #moveTo(target: Viewport): void {
    this.#applyZoom(clampZoom(target.zoom, ZOOM_LIMITS))
    const layers = this.#layers
    const now = this.#measureViewport()
    if (layers && now) {
      layers.scroller.scrollLeft += now.x - target.x
      layers.scroller.scrollTop += now.y - target.y
    }
    this.#renderSelection()
  }

  /** 以可见区中心缩放到 zoom，中心对着的画布点不动；此后尺寸变化不再自动适配。 */
  #zoomAtCenter(zoom: number): void {
    this.#autoFit = false
    const size = this.#size()
    const viewport = this.#measureViewport() ?? { x: 0, y: 0, zoom: this.#zoom }
    this.#moveTo(zoomTo(viewport, zoom, size ? { x: size.width / 2, y: size.height / 2 } : { x: 0, y: 0 }, ZOOM_LIMITS))
  }

  /**
   * 适合窗口：缩放倍数 = 可见区的内容高度 ÷ 实际尺寸下的内容高度，不超过 1；内容高度随宽度变化时再量几次直到稳定。
   * 适配之后滚回左上角。
   */
  #fit(): void {
    const layers = this.#layers
    if (!layers || this.#mode() === 'preview')
      return
    const scroller = layers.scroller
    const available = this.#visibleHeight()
    if (!(available > 0))
      return
    for (let pass = 0; pass < 3; pass++) {
      const height = layers.content.offsetHeight
      const zoom = clampZoom(height > 0 ? Math.min(1, available / height) : 1, ZOOM_LIMITS)
      if (Math.abs(zoom - this.#zoom) < ZOOM_EPSILON)
        break
      this.#applyZoom(zoom)
    }
    scroller.scrollLeft = 0
    scroller.scrollTop = 0
    this.#renderSelection()
  }

  /**
   * 覆盖层叠在画布的可见区上，世界坐标是 surface 里实际尺寸下的画布像素：视口的位移是 surface 相对覆盖层的偏移，
   * 随滚动变化，倍数是画布的缩放倍数；视口变了派发 viewport-change。
   * 选中的卡片交给覆盖层画选中框与控制柄，最小尺寸为一格；指针下没选中的卡片画悬停框。
   */
  #renderSelection(): void {
    const layers = this.#layers
    const viewport = this.#measureViewport()
    if (!layers || !viewport)
      return
    const previous = this.#viewport
    if (previous?.x !== viewport.x || previous.y !== viewport.y || previous.zoom !== viewport.zoom) {
      this.#viewport = viewport
      layers.overlay.viewport = viewport
      if (previous)
        emitEvent(this, 'viewport-change', { viewport })
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
    this.#autoFit = false
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

  /** Ctrl / ⌘ 加滚轮以指针为中心缩放；不带修饰键时照常滚动画布。此后尺寸变化不再自动适配。 */
  readonly #onWheel = (event: WheelEvent): void => {
    const layers = this.#layers
    const viewport = this.#measureViewport()
    if (!(event.ctrlKey || event.metaKey) || !layers || !viewport)
      return
    event.preventDefault()
    this.#autoFit = false
    const box = layers.overlay.getBoundingClientRect()
    this.#moveTo(zoomBy(viewport, wheelZoomFactor(event.deltaY, event.deltaMode), { x: event.clientX - box.left, y: event.clientY - box.top }, ZOOM_LIMITS))
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

  /**
   * 物料面板：分组与条目取合并后的物料，条目的 id 与 payload 都是物料项 id；只读或报表主体不是看板时只能浏览。
   * 文案或扩展变了才重排分组。
   */
  #syncPalette(palette: XhDesignerPaletteElement, t: ReportDesignerTranslations): void {
    palette.readonly = this.readonly || !this.#dashboard()
    const context = this.#context(t)
    const text = (label: string | ((context: ReportDesignerContext) => string)): string => typeof label === 'function' ? label(context) : label
    const items = [...this.#model.palette.values()]
    const groups: DesignerPaletteGroup[] = this.#model.paletteGroups.map(group => ({
      id: group.id,
      label: text(group.label),
      items: items.filter(item => item.group === group.id).map(item => ({ id: item.id, label: text(item.label), payload: item.id })),
    }))
    const key = JSON.stringify([t.palette, groups])
    if (key === this.#paletteKey)
      return
    this.#paletteKey = key
    palette.translations = { title: t.palette }
    palette.groups = groups
  }

  /** 物料面板拖出的物料项 id；不是物料面板的载荷或不是登记过的物料时为 undefined。 */
  #paletteItem(payload: unknown): string | undefined {
    const drag = payload as Partial<DesignerPaletteDragPayload> | undefined
    return drag?.source === 'palette' && typeof drag.payload === 'string' && this.#model.palette.has(drag.payload) ? drag.payload : undefined
  }

  #datasetEditing(): ReportDatasetEditing {
    return this.datasetEditing === 'none' || this.datasetEditing === 'full' ? this.datasetEditing : 'fields'
  }

  #canRemoveData(ref: ReportDataRef): boolean {
    const editor = this.#editor
    return editor !== undefined && canEditData(ref.kind, this.#datasetEditing()) && planDataRemoval(editor.document, ref) !== undefined
  }

  /** 删除数据面板对象：不涉及别处时直接删，否则确认后按当时的报表重新算一遍再删。 */
  #removeData(ref: ReportDataRef): boolean {
    const editor = this.#editor
    if (!editor || !this.#canRemoveData(ref))
      return false
    const removal = planDataRemoval(editor.document, ref)!
    if (cascadeCount(removal.cascade) === 0) {
      editor.execute(removal.operations)
      return true
    }
    void this.#confirmRemoval(removal).then((confirmed) => {
      const current = this.#editor
      const next = confirmed && current && this.#canRemoveData(ref) ? planDataRemoval(current.document, ref) : undefined
      if (current && next)
        current.execute(next.operations)
    })
    return true
  }

  #confirmRemoval(removal: DataRemoval): Promise<boolean> {
    const t = this.#translations()
    this.#dialogs ??= createDialogService()
    return this.#dialogs.confirm({ title: t.removeTitle(removal.label), content: t.removeCascade(removal.cascade), tone: 'danger', okText: t.removeConfirm })
  }

  /** 新增数据面板对象并选中它。 */
  #addData(kind: DataAddKind): void {
    const editor = this.#editor
    if (!editor || this.readonly || !canEditData(kind, this.#datasetEditing()))
      return
    const plan = planDataAddition(editor.document, kind, editor.selection.data)
    if (!plan)
      return
    editor.execute(plan.operations)
    editor.select({ data: plan.select })
  }

  /** 数据面板、字段栏与各面板随文档与选择更新，最后按这一轮的结果设外框的区。 */
  #syncData(): void {
    const layers = this.#layers
    if (!layers)
      return
    const t = this.#translations()
    const editor = this.#editor
    if (editor) {
      const shown = this.#panelTranslations(t)
      layers.data.update(editor.document, editor.selection.data, t)
      const context = this.#context(t)
      layers.wells.update(editor.document, editor.selection, t, context.commands.delete)
      layers.properties.update(shown)
      layers.issues.update(editor.document, this.#issues, shown)
      const { commands } = this.#model
      layers.commandBar.setDisplay(toolbarDisplayOf(this.#resolvedSettings))
      layers.commandBar.update(arrangeCommands('toolbar', commands, REPORT_TOOLBAR_LAYOUT, this.commandLayout), commands, context, context.commands.toolbar)
      // 顶栏：有 header 命令才放进外框，没有时拿出来，顶栏随之收起
      const header = arrangeCommands('header', commands, [], this.commandLayout)
      if (header.length > 0) {
        layers.headerBar.update(header, commands, context, t.insertToolbar)
        if (!layers.headerBar.element.isConnected)
          layers.frame.append(layers.headerBar.element)
      }
      else {
        layers.headerBar.element.remove()
      }
      layers.panels.update(context)
      this.#renderStatus(layers, t)
    }
    this.#syncFrame(layers.frame, t)
  }

  /**
   * 状态栏左段：选中一张卡片写它的种类与所在的格，选中几张写「已选中 N 个」；选中列表项、联动或数据面板里的对象时写属性卡片
   * 的那句（对象种类与名字）；什么都没选时写报表的数据集数与卡片数。右段是缩放倍数。
   */
  #renderStatus(layers: Layers, t: ReportDesignerTranslations): void {
    const editor = this.#editor
    if (!editor)
      return
    const { document, selection } = editor
    const body = document.body
    const cards = body.type === 'dashboard' ? selection.cards.flatMap(id => body.cards.filter(card => card.id === id)) : []
    const heading = layers.properties.element.heading
    if (cards.length > 1) {
      layers.selectionStatus.update({ value: t.selected(cards.length) })
    }
    else if (cards.length === 1 && selection.item === undefined && selection.link === undefined) {
      const card = cards[0]!
      const type = cardTypeOf(card)
      const { x, y, w, h } = card.layout
      layers.selectionStatus.update({ label: t.cardTypes[type] ?? type, value: t.statusCell(x + 1, y + 1, w, h) })
    }
    else if ((selection.item !== undefined || selection.link !== undefined || selection.data !== undefined) && heading !== undefined) {
      layers.selectionStatus.update({ value: heading })
    }
    else {
      layers.selectionStatus.update({ label: t.objectKinds.document ?? 'document', value: t.statusDocument(document.datasets.length, body.type === 'dashboard' ? body.cards.length : undefined) })
    }
    this.#renderZoomStatus(layers, t)
  }

  /** 状态栏右段的缩放倍数，按百分数取整。 */
  #renderZoomStatus(layers: Layers, t: ReportDesignerTranslations): void {
    layers.zoomStatus.update({ label: t.statusZoom, value: `${Math.round(this.#zoom * 100)}%` })
  }

  /** 物料项的新卡片模板，取数用第一个数据集。 */
  #template(item: string): ReportCardTemplate {
    return this.#model.palette.get(item)!.template(this.#editor?.document.datasets[0]?.id ?? '')
  }

  /** 新卡片画出来之后，不在可见区时滚动到它。 */
  #revealAdded(card: DashboardCard): void {
    void this.updateComplete.then(() => this.revealCard(card.id))
  }

  /** 点物料：新卡片放到第一个空位并选中。 */
  readonly #onPaletteActivate = (event: Event): void => {
    const item = (event as DesignerPaletteEventMap['item-activate']).detail.payload
    if (typeof item === 'string')
      this.addPaletteItem(item)
  }

  /**
   * 物料拖到看板上：以指针为中心放新卡片，落点画出压实之后它实际所在的格；隐藏跟随指针的预览。
   * 只读、不是看板或载荷不是登记过的物料时不接受。
   */
  #dropOver(point: Point, payload: unknown): DropOver {
    const field = dataFieldPayload(payload)
    if (field)
      return this.#fieldOver(point, field)
    const item = this.#paletteItem(payload)
    const dashboard = this.#dashboard()
    const metrics = this.#gridMetrics()
    const layers = this.#layers
    if (item === undefined || this.readonly || !dashboard || !metrics || !layers) {
      this.#clearDrop()
      return { accept: false }
    }
    const template = this.#template(item)
    const origin = layers.surface.getBoundingClientRect()
    const zoom = this.#zoom
    const cell = centeredCell({ x: (point.x - origin.left) / zoom, y: (point.y - origin.top) / zoom }, template.layout, metrics, dashboard.grid.columns)
    this.#drop = { item, ...cell }
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
    if (!drop || this.readonly || !this.#dashboard() || !this.#model.palette.has(drop.item))
      return
    const template = this.#template(drop.item)
    this.#revealAdded(this.addCard({ ...template, layout: { ...template.layout, x: drop.x, y: drop.y } }))
  }

  #clearDrop(): void {
    this.#drop = undefined
    this.#fieldDrop = undefined
    const layers = this.#layers
    if (!layers)
      return
    layers.dropPreview.hidden = true
    delete layers.canvas.dataset.gesture
    for (const marked of layers.content.querySelectorAll('[data-drop]'))
      marked.removeAttribute('data-drop')
    layers.content.removeAttribute('data-drop')
  }

  /**
   * 字段拖到画布上：看板上落在指针下的卡片，不是看板时落在主体的视图；数据集要与字段的一致，只读时不接受。
   * 接受时目标带 data-drop。
   */
  #fieldOver(point: Point, field: { readonly dataset: string, readonly field: string }): DropOver {
    const editor = this.#editor
    const layers = this.#layers
    const dashboard = this.#dashboard()
    let card: string | undefined
    if (dashboard) {
      card = dashboard.cards.find((item) => {
        const box = this.#content?.cardElement(item.id)?.getBoundingClientRect()
        return box !== undefined && point.x >= box.left && point.x <= box.right && point.y >= box.top && point.y <= box.bottom
      })?.id
    }
    const owner = editor && (!dashboard || card !== undefined) ? wellsOwner(editor.document, { cards: card === undefined ? [] : [card] }) : undefined
    this.#clearDrop()
    if (this.readonly || !layers || !owner || owner.dataset !== field.dataset)
      return { accept: false }
    this.#fieldDrop = card === undefined ? field : { ...field, card }
    const marked = card === undefined ? layers.content : this.#content?.cardElement(card)
    marked?.setAttribute('data-drop', '')
    return { accept: true }
  }

  /** 把字段加进落点卡片或主体视图的对应列表，补全卡片的必填绑定，合为一步撤销；落在卡片上时选中它。 */
  #dropField(): void {
    const drop = this.#fieldDrop
    this.#clearDrop()
    const editor = this.#editor
    if (!drop || !editor || this.readonly)
      return
    const document = editor.document
    const owner = wellsOwner(document, { cards: drop.card === undefined ? [] : [drop.card] })
    const type = document.datasets.find(dataset => dataset.id === drop.dataset)?.fields.find(item => item.name === drop.field)?.type
    if (!owner || type === undefined)
      return
    const target = drop.card === undefined ? {} : { card: drop.card }
    editor.execute(withFilledBindings(document, target, planAddFieldItem(document, target, fieldList(owner, type), drop.field), this.#extensions ?? NO_EXTENSIONS))
    if (drop.card !== undefined)
      editor.select({ cards: [drop.card] })
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
    if (!proceed) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    this.#fillMenu(id === undefined ? 'blank' : 'card')
  }

  /** 内建右键菜单的条目：按 commandLayout 的 menu:<对象> 或缺省排列，条目的可用状态取此刻设计器的状态。 */
  #fillMenu(subject: ReportMenuSubject): void {
    const layers = this.#layers
    if (!layers)
      return
    const { commands } = this.#model
    const groups = arrangeCommands(`menu:${subject}`, commands, REPORT_MENU_LAYOUT[subject], this.commandLayout)
    renderCommandMenu(layers.menuContent, groups, commands, this.#context(), { platform: this.#kbdPlatform() })
  }

  /** 焦点在画布上，或在关闭菜单后接住焦点的菜单触发区上。 */
  #isCanvasFocus(target: EventTarget | null): boolean {
    const layers = this.#layers
    return layers !== undefined && (target === layers.canvas || target === layers.menuTrigger)
  }

  readonly #onMenuSelect = (event: Event): void => {
    const { value } = (event as CustomEvent<{ value: string }>).detail
    runCommand(this.#model.commands, value, this.#context())
  }

  /**
   * 画布上的按键：先找快捷键命中、此刻可用的命令；没有命令占用时，Ctrl / ⌘ + S 派发 save，Ctrl / ⌘ + Y 重做，
   * Backspace 删除选中的对象，= 与按着 Shift 的 + 放大，Escape 清空选择，方向键挪动或改大小卡片。
   */
  readonly #onKeyDown = (event: KeyboardEvent): void => {
    const editor = this.#editor
    if (!editor || !this.#isCanvasFocus(event.target) || this.#gesture)
      return
    const context = this.#context()
    const hit = commandForShortcut(this.#model.commands.values(), event, context, this.#kbdPlatform())
    if (hit) {
      hit.run(context)
      event.preventDefault()
      return
    }
    const command = event.ctrlKey || event.metaKey
    let handled = true
    const key = event.key.toLowerCase()
    if (command && key === 's') {
      emitEvent(this, 'save', {})
    }
    else if (command && key === 'y') {
      this.redo()
    }
    else if (!command && event.key === 'Backspace') {
      this.deleteSelection()
    }
    else if (!command && (event.key === '+' || event.key === '=')) {
      this.zoomIn()
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
    if (!data || !this.#editor || !this.#isCanvasFocus(root.activeElement))
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

/** 注册 <xh-report-designer> 与它用到的查看器、UI 元素与 designer-shell 零件；import 时不注册。 */
export function defineReportDesigner(): void {
  defineReportViewer()
  defineXhElement('xh-button', XhButtonElement)
  defineXhElement('xh-context-menu', XhContextMenuElement)
  defineXhElement('xh-sortable', XhSortableElement)
  defineXhElement('xh-tag', XhTagElement)
  defineXhElement('xh-toolbar', XhToolbarElement)
  defineXhElement('xh-tree', XhTreeElement)
  defineDesignerShellElement('xh-designer-frame', XhDesignerFrameElement)
  defineDesignerShellElement('xh-designer-issues', XhDesignerIssuesElement)
  defineDesignerShellElement('xh-designer-palette', XhDesignerPaletteElement)
  defineDesignerShellElement('xh-designer-properties', XhDesignerPropertiesElement)
  defineDesignerShellElement('xh-designer-settings', XhDesignerSettingsElement)
  defineDesignerShellElement('xh-designer-transform', XhDesignerTransformElement)
  registerElement(REPORT_DESIGNER_TAG, XhReportDesigner)
}

declare global {
  interface HTMLElementTagNameMap {
    'xh-report-designer': XhReportDesigner
  }
}
