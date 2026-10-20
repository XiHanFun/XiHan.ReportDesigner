/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// <xh-report-designer>：报表设计器元素。编辑模型（历史、选择、剪贴板、布局手势）在 createReportEditor 里，
// 画布内容复用查看器的计算与渲染；整体版式用 @xihan-ui/designer-shell 的外框，面板布局存进设置的 layout.panels，面板用 designer-shell 的零件。
// 卡片与视图种类、渲染、属性编辑器、命令、面板与物料都从 extensions 来，内置命令与物料也是一个扩展；
// 工具栏与菜单的排列可由 commandLayout 改写。设置对话框（openSettings()）里是基础分区与各扩展的分区，值经 settings 与
// settings-change 交给宿主。openJsonEditor() 编辑整份报表定义的 JSON，应用后记一步撤销；登记了导入器时 importTemplate()
// 选文件交给导入器，导入的模板同样整份换上、记一步撤销。

import type { DashboardCard, DashboardView, ExpressionEngine, ParameterValues, ReportDocument, ReportOperation, ReportStep, ValidationIssue } from '@xihan-report/core'
import type { ReportDataProvider, ReportDesignerTranslations, ReportFormatter, ReportHistoryStepText, ReportViewerTranslations, XhReportViewer } from '@xihan-report/runtime'
import type { JsonValue } from '@xihan-ui/core/json'
import type { VisualEnvironmentStorageError } from '@xihan-ui/core/visual-environment'
import type { DesignerImportSource, ExecuteOptions, ExtensionHost, GridRect, HistoryChangeKind, HistoryLabel, HistorySnapshot, Point, Rect, Viewport } from '@xihan-ui/designer-kit'
import type { PropertySwatchOption } from '@xihan-ui/designer-kit/properties'
import type { CommandToolbar, DesignerCommandLayout, DesignerCommandsTranslations, DesignerFieldImportEventMap, DesignerFrameEventMap, DesignerFrameRegion, DesignerHistoryTranslations, DesignerIssueItem, DesignerJsonEditorEventMap, DesignerLayout, DesignerLayoutPolicy, DesignerMeasureConvert, DesignerPaletteDragPayload, DesignerPaletteEventMap, DesignerPaletteGroup, DesignerPaletteItem, DesignerPaletteView, DesignerPanelActions, DesignerPanelHost, DesignerSettings, DesignerSettingsEventMap, DesignerSettingsHost, DesignerSettingsPolicy, DesignerStatusItem, DesignerTransformEventMap, DesignerTransformItem, DropOver, PanRequestDetail } from '@xihan-ui/designer-shell'
import type { PropertyValues } from '@xihan-ui/web-components/authoring'
import type { DialogService } from '@xihan-ui/web-components/services'
import type { DataRemoval } from './data-editing'
import type { DataAddKind } from './data-panel'
import type { LayoutGesture, ReportAddCardInit, ReportClipboard, ReportDataRef, ReportEditor, ReportItemRef, ReportSelection } from './editor'
import type { ReportCardTemplate, ReportDesignerContext, ReportDesignerExtension, ReportDesignerImporter, ReportDesignerModel, ReportMenuSubject, ReportPaletteDrop, ReportSelectionSubject } from './extensions'
import type { ReportDataImportKind } from './field-import'
import type { GridMetrics } from './grid-geometry'
import { cardTypeOf, describeReportStep, planAddCard, planAddFieldItem, resolveParameters, validateDocument } from '@xihan-report/core'
import { DEFAULT_REPORT_DESIGNER_TRANSLATIONS, DEFAULT_REPORT_VIEWER_TRANSLATIONS, defaultFormatter, defineReportViewer } from '@xihan-report/runtime'
import { createRenderContext } from '@xihan-report/runtime/design'
import { getLocalTimeZone } from '@xihan-ui/core/date'
import { detectKbdPlatform } from '@xihan-ui/core/hotkey'
import { clampZoom, commandForShortcut, createExtensionHost, createIdAllocator, DEFAULT_ZOOM_LIMITS, findImporter, importerAccept, selectInMarquee, snapshotHistory, wheelZoomFactor, zoomBy, zoomTo } from '@xihan-ui/designer-kit'
import {
  applyToolbarCustomization,
  arrangeCommands,
  createCommandToolbar,
  createDesignerSettingsHost,
  createPanelActions,
  createPanelHost,
  createStatusItem,
  defineDesignerShellElement,
  DESIGNER_COMMANDS_EN_US,
  DESIGNER_COMMON_KEYS,
  DESIGNER_FIELD_IMPORT_SOURCES,
  DESIGNER_FRAME_REGIONS,
  DESIGNER_HISTORY_EN_US,
  DESIGNER_SETTING_KEYS,
  DESIGNER_TOUR_DONE_KEY,
  designerLayoutPolicy,
  registerDropTarget,
  renderCommandMenu,
  resolvePaletteSources,
  resolveSettings,
  resolveTourSteps,
  runCommand,
  shortcutSettingsSource,
  toolbarCustomizationOf,
  toolbarDisplayOf,
  toolbarSettingsSource,
  toolbarVisibleOf,
  tourDoneOf,
  XhDesignerFieldImportElement,
  XhDesignerFrameElement,
  XhDesignerIssuesElement,
  XhDesignerJsonEditorElement,
  XhDesignerPaletteElement,
  XhDesignerPropertiesElement,
  XhDesignerSettingsElement,
  XhDesignerTourElement,
  XhDesignerTransformElement,
} from '@xihan-ui/designer-shell'
import { CircleAlertIcon, DatabaseIcon, FilterIcon, LayoutGridIcon, ListIcon, SlidersHorizontalIcon } from '@xihan-ui/icons'
import { BOOLEAN_CONVERTER, createAuthoredElement, createGeneratedElement, emitEvent, registerElement, XhConfigController, XhReactiveElement } from '@xihan-ui/web-components/authoring'
import { defineXhElement, XhButtonElement, XhContextMenuElement, XhSortableElement, XhTagElement, XhToolbarElement, XhTreeElement } from '@xihan-ui/web-components/define'
import { createDialogService } from '@xihan-ui/web-components/services'
import { CanvasContent } from './canvas'
import { readReportClipboardData, writeReportClipboardData } from './clipboard'
import { canEditData, cascadeCount, planDataAddition, planDataRemoval } from './data-editing'
import { dataFieldPayload, DataPanel } from './data-panel'
import { createReportEditor, writeReportClipboard } from './editor'
import { createReportDesignerModel, REPORT_DESIGNER_EXTENSION, REPORT_IMPORT_TEMPLATE_COMMAND, REPORT_MENU_LAYOUT, REPORT_SELECTION_LAYOUT, REPORT_TOOLBAR_LAYOUT } from './extensions'
import { planDatasetImport, planFieldImport, planParameterImport } from './field-import'
import { cellSize, cellToRect, centeredCell, clipCell, measureGrid, rectToCell } from './grid-geometry'
import { IssuesPanel, reportIssueItems } from './issues-panel'
import { PropertiesPanel } from './properties-panel'
import { REPORT_VERSION } from './version'
import { fieldList, Wells, wellsOwner, withFilledBindings } from './wells'

/** 设计器的标签名。 */
export const REPORT_DESIGNER_TAG = 'xh-report-designer'

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
  /**
   * 撤销历史变了：执行（含并入上一步）、撤销、重做、跳转、装载、清空与保存之后都派发，拖动等事务进行中不派发。
   * detail 是此刻的 historyState。
   */
  'history-change': CustomEvent<HistorySnapshot>
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
  /**
   * 在设置对话框里改了一条设置，或在外框上挪了面板（键是 layout.panels，值是整份布局）：设计器已换成新的 settings 并生效
   * （主题、主题色、扩展读的值与面板布局）；value 为 undefined 表示删掉这个键、回到缺省值。宿主存起来，下次赋回 settings。
   */
  'settings-change': CustomEvent<{ key: string, value: JsonValue | undefined, settings: DesignerSettings }>
  /** 读写 settingsStorageKey 指的本机存储失败（内容不是对象、无痕窗口、配额满）；设置留在内存里。 */
  'settings-storage-error': CustomEvent<VisualEnvironmentStorageError>
  /** 视口变了：缩放、适合窗口、setViewport 与滚动画布都会派发。 */
  'viewport-change': CustomEvent<{ viewport: Viewport }>
  /**
   * 导入模板没有成功：导入器抛了错，或给出的不是报表对象，importer 是导入器的 id；
   * 选中的文件没有导入器接下时也派发，此时没有 importer。
   */
  'import-error': CustomEvent<{ importer?: string, source: DesignerImportSource, error: unknown }>
}

/** 放大、缩小一档的倍数。 */
const ZOOM_STEP = 1.2

/** 缩放的上下限：10%–400%。 */
const ZOOM_LIMITS = DEFAULT_ZOOM_LIMITS

/** 缩放倍数差不到这么多时当作没变。 */
const ZOOM_EPSILON = 1e-3

/**
 * 外框的命名区：照外框的缺省区表，左侧在物料上面叠数据集与报表参数，右侧在属性上面叠字段栏。历史记录是内置扩展的面板，登记在这些之后。
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
  /** 选中卡片时浮在选中框上方的选中工具条；排列为空时不放进覆盖层。 */
  readonly selectionBar: CommandToolbar<ReportDesignerContext>
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
  /** 数据集与报表参数两块卡片面板头上的导入钮。 */
  readonly datasetActions: DesignerPanelActions<ReportDesignerContext>
  readonly parameterActions: DesignerPanelActions<ReportDesignerContext>
  /** 导入字段对话框。 */
  readonly fieldImport: XhDesignerFieldImportElement
  /** 编辑整份报表定义 JSON 的对话框。 */
  readonly jsonEditor: XhDesignerJsonEditorElement
  /** 新手引导。 */
  readonly tour: XhDesignerTourElement
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

/** 物料拖到看板上的落点：物料项 id 与请求的左上角格；sourced 时是物料来源的条目 id，格是指针所在的格。 */
interface CardDrop {
  readonly item: string
  readonly x: number
  readonly y: number
  readonly sourced?: true
}

/** 拖动工具开着时进行中的平移：按下时的滚动位置（取消时滚回去）与收尾。 */
interface CanvasPan {
  readonly scroll: Point
  readonly stop: () => void
}

/** 进行中的卡片拖动或改大小：编辑模型的布局手势与最近一次写进去的格坐标。 */
interface CardGesture {
  readonly layout: LayoutGesture
  readonly cells: Map<string, GridRect>
}

const EMPTY_SELECTION: ReportSelection = { cards: [] }

/** 没有报表时的历史快照。 */
const EMPTY_HISTORY: HistorySnapshot = { entries: [], position: 0, origin: 0, truncated: false, originSaved: false }

/** 撤销步数上限的缺省值。 */
const DEFAULT_HISTORY_LIMIT = 100

const NUMBER_CONVERTER = { fromAttribute: (value: string | null) => (value == null || value === '' ? undefined : Number(value)) }

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
    autoTour: { attribute: 'auto-tour', converter: BOOLEAN_CONVERTER },
    defaultLayout: { attribute: false },
    datasetEditing: { attribute: 'dataset-editing' },
    settings: { attribute: false },
    settingsPolicy: { attribute: false },
    settingsStorageKey: { attribute: 'settings-storage-key', converter: { fromAttribute: (value: string | null) => value ?? undefined } },
    brands: { attribute: false },
    registerBrand: { attribute: false },
    historyLimit: { attribute: 'history-limit', converter: NUMBER_CONVERTER },
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
  /** 工具栏、右键菜单（menu:card、menu:blank）与选中工具条（selection:card、selection:multiple）的命令排列；写了某个位置就只显示列出的命令。 */
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
   * 第一次铺好画布、设计器显示出来（画布有宽度）后自动开始新手引导，缺省开；设置里记过 help.tourDone（走完、跳过或关上过一次）时不再自动开始。
   * 写 false 关掉，start-tour 命令、帮助页的「开始引导」与 startTour() 照样能开始。同名 attribute auto-tour，写 "false" 是关。
   */
  declare autoTour: boolean | undefined
  /**
   * 面板布局的缺省：设置里还没有 layout.panels 时用它，「恢复默认布局」也回到它；不给时各面板停在登记的位置，全部显示。
   * 面板 id 见 REPORT_DESIGNER_PANELS，另有扩展登记的面板。用户挪了面板、改了显隐或大小，
   * 整份布局写进设置的 layout.panels（DESIGNER_SETTING_KEYS.layout）并派发 settings-change。
   */
  declare defaultLayout: DesignerLayout | undefined
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
  /** 撤销步数上限，缺省 100；在下一次装载（赋 schema）时生效。同名 attribute history-limit。 */
  declare historyLimit: number | undefined

  readonly #config = new XhConfigController(this)
  #editor: ReportEditor | undefined
  /** 编辑模型建出时用的撤销步数上限；historyLimit 换了，下一次装载时按新的重建。 */
  #editorLimit = DEFAULT_HISTORY_LIMIT
  #unsubscribe: (() => void) | undefined
  #layers: Layers | undefined
  #content: CanvasContent | undefined
  #issues: readonly ValidationIssue[] = []
  #dirty = false
  /** 事务里执行过的操作，提交时一起报出。 */
  #pending: ReportOperation[] = []
  #resize: ResizeObserver | undefined
  #gesture: CardGesture | undefined
  #pan: CanvasPan | undefined
  #hoverId: string | undefined
  #viewport: Viewport | undefined
  /** 尺寸徽标换算用的网格度量：每次画选中框时量一次。 */
  #measureMetrics: GridMetrics | undefined
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
  /** 这一轮物料面板的分组，以及按条目 id 交给物料来源插入。 */
  #paletteView: DesignerPaletteView<ReportDesignerContext, ReportPaletteDrop> | undefined
  /** 物料来源的条目 id（含下级）：拖到看板上时据此接收。 */
  #sourceItems: ReadonlySet<string> = new Set()
  #platform: 'mac' | 'other' | undefined
  #regionsKey = ''
  #regionsModel: ReportDesignerModel | undefined
  #regionList: readonly DesignerFrameRegion[] = FRAME_REGIONS
  #layoutPolicyKey = ''
  /** 上一次交给引导的步骤、交给设置对话框帮助、快捷键与关于三页的内容（JSON）：没变不重设。 */
  #tourStepsKey = ''
  #helpKey = ''
  /** 已经看过要不要自动开始引导：每个元素只看一次，在第一次铺好画布之后。 */
  #tourChecked = false
  /** 要自动开始引导，等设计器显示出来（画布有宽度）。 */
  #tourPending = false
  /** 导入对话框此刻为谁打开；导入字段时是那个数据集。 */
  #importTarget: { readonly kind: ReportDataImportKind, readonly dataset?: string } | undefined
  /** 上次交给设置对话框「工具栏」页的按钮表数据（JSON）：内容没变不重设，免得按钮表重铺。 */
  #toolbarSourceKey = ''
  #layoutPolicy: DesignerLayoutPolicy | undefined
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

  /** 撤销历史的快照：各步的说明按此刻的语言取好；还没有报表时只有起点。 */
  get historyState(): HistorySnapshot {
    return this.#editor ? snapshotHistory(this.#editor.history) : EMPTY_HISTORY
  }

  /** 跳到撤销历史里的一步或起点（historyState 里的位置号）；只读、预览、拖动中或位置号不认识时返回 false。 */
  goToHistory(position: number): boolean {
    const editor = this.#editor
    if (!editor || this.readonly || this.mode === 'preview' || editor.history.inTransaction)
      return false
    return editor.history.goTo(position)
  }

  /** 清空撤销与重做；报表与是否已保存不变。只读或拖动中时什么都不做。 */
  clearHistory(): void {
    const editor = this.#editor
    if (!editor || this.readonly || editor.history.inTransaction)
      return
    editor.history.clear()
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
   * 什么都不做，返回 undefined。点物料面板的条目时调它。
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

  /** 在画布上标出一张卡片（画悬停框），null 撤掉；不改选择、不滚动。页面结构面板悬停或聚焦到一行时用它。 */
  highlightCard(id: string | null): void {
    const next = id ?? undefined
    if (next === this.#hoverId)
      return
    this.#hoverId = next
    this.#renderSelection()
  }

  /**
   * 这种导入此刻能不能做：只读、预览态或 datasetEditing 不够时不能（导入数据集与字段要 full，导入参数要 fields 起）；
   * 导入字段还要在数据面板里选中一个数据集或它的字段。
   */
  canImportData(kind: ReportDataImportKind): boolean {
    if (!this.#canImport(kind))
      return false
    return kind !== 'fields' || this.#importDataset() !== undefined
  }

  /**
   * 打开导入对话框：dataset 从 JSON 样例或 JSON Schema 新建一个数据集，fields 往选中的数据集里加字段，parameters 从 JSON Schema
   * （也可以是样例）加报表参数。对话框里还有扩展登记的字段来源页（fieldSources）。导入的字段只取值字段，同名的保留现有的，
   * 一次导入记一步撤销。此刻不能做时返回 false。
   */
  openDataImport(kind: ReportDataImportKind): boolean {
    if (!this.canImportData(kind))
      return false
    const dialog = this.#ensureLayers().fieldImport
    const t = this.#translations()
    const dataset = kind === 'fields' ? this.#importDataset() : undefined
    this.#importTarget = dataset === undefined ? { kind } : { kind, dataset }
    dialog.sources = this.#model.extensions.flatMap(extension => extension.fieldSources ?? [])
    dialog.offerSample = false
    dialog.translations = kind === 'dataset' ? { title: t.importDataset } : kind === 'parameters' ? { title: t.importParameters } : undefined
    dialog.show(kind === 'parameters' ? DESIGNER_FIELD_IMPORT_SOURCES.jsonSchema : DESIGNER_FIELD_IMPORT_SOURCES.sample)
    return true
  }

  /**
   * 从头开始新手引导：通用步骤加报表与扩展的步骤；同一页别的设计器的引导开着时先收起那一个。
   * 预览态、还没有报表或没有能走的步骤时返回 false。
   */
  startTour(): boolean {
    if (this.#mode() === 'preview' || !this.#editor)
      return false
    return this.#ensureLayers().tour.start({ force: true })
  }

  /**
   * 打开编辑整份报表定义 JSON 的对话框：写出当前报表，边改边按当前扩展与表达式引擎校验、报问题（文字与问题列表的一致）；
   * 没有错误时「应用」整份换上，记一步撤销，说明是「编辑 JSON」。只读或预览态时只能看、不能应用。还没有报表时返回 false。
   */
  openJsonEditor(): boolean {
    const editor = this.#editor
    if (!editor)
      return false
    const dialog = this.#ensureLayers().jsonEditor
    dialog.value = editor.document as unknown as JsonValue
    dialog.validate = value => this.#jsonIssues(value)
    dialog.readonly = this.#jsonReadonly()
    dialog.show()
    return true
  }

  /** JSON 编辑框此刻只能看：只读或预览态。 */
  #jsonReadonly(): boolean {
    return this.readonly === true || this.#mode() === 'preview'
  }

  /** JSON 编辑框里的一份报表：按当前扩展与表达式引擎校验，问题的文字与所在对象的名字同问题列表，对象名按这一份取。 */
  #jsonIssues(value: JsonValue): DesignerIssueItem[] {
    return reportIssueItems(value, validateDocument(value, this.#validateOptions()), this.#panelTranslations(this.#translations()))
  }

  /** JSON 编辑框里按了「应用」：清空选择，整份换上（core 的 replaceDocument），记一步撤销。 */
  readonly #onJsonApply = (event: Event): void => {
    event.stopPropagation()
    const editor = this.#editor
    if (!editor || this.#jsonReadonly())
      return
    const { value } = (event as DesignerJsonEditorEventMap['json-apply']).detail
    editor.clearSelection()
    editor.execute([{ type: 'replaceDocument', document: value as unknown as ReportDocument }], { label: () => this.#commandTranslations().editJson })
  }

  /** 此刻能不能导入模板：登记了导入器、有报表、在设计态且不是只读。 */
  get canImportTemplate(): boolean {
    return !this.readonly && this.#mode() !== 'preview' && this.#editor !== undefined && this.#model.importers.length > 0
  }

  /**
   * 导入模板：弹出选文件对话框（accept 取各导入器的 fileTypes），选中的文件按扩展顺序交给第一个接下的导入器，
   * 给出的整份模板换上当前报表、清空选择，记一步撤销（说明是「导入模板」）。没有导入器接下、导入器抛错或给出的不是
   * 报表对象时派发 import-error。此刻不能导入（见 canImportTemplate）时什么都不做，返回 false。
   */
  importTemplate(): boolean {
    if (!this.canImportTemplate)
      return false
    const importers = this.#model.importers
    const input = this.ownerDocument.createElement('input')
    input.type = 'file'
    input.accept = importerAccept(importers)
    input.addEventListener('change', () => {
      const file = input.files?.[0]
      if (!file)
        return
      const source: DesignerImportSource = { kind: 'file', mime: file.type, name: file.name, file }
      const found = findImporter(importers, [source])
      if (found)
        void this.#runImport(found.importer, source)
      else
        emitEvent(this, 'import-error', { source, error: new RangeError(`[xh-report-designer] no importer accepts "${file.name}"`) })
    }, { once: true })
    input.click()
    return true
  }

  /** 交给导入器，给出的模板整份换上当前报表（core 的 replaceDocument），记一步撤销；导入器抛错或给出的不是报表对象时派发 import-error。 */
  async #runImport(importer: ReportDesignerImporter, source: DesignerImportSource): Promise<void> {
    try {
      const result = await importer.import(source, this.#context())
      const editor = this.#editor
      if (result === undefined || !editor || !this.canImportTemplate)
        return
      editor.clearSelection()
      editor.execute([{ type: 'replaceDocument', document: result.document }], { label: () => this.#translations().importTemplate })
    }
    catch (error) {
      emitEvent(this, 'import-error', { importer: importer.id, source, error })
    }
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
    this.#pan?.stop()
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
    layers.scroller.setAttribute('aria-label', t.canvas)
    if (changed.has('schema'))
      this.#load()
    const mode = this.#mode()
    this.dataset.mode = mode
    if (mode !== this.#lastMode) {
      this.#lastMode = mode
      emitEvent(this, 'mode-change', { mode })
    }
    // 拖动工具开着时不画控制柄、不起移动，在哪儿按下都是平移
    layers.overlay.readonly = this.readonly === true || this.#panTool()
    this.#syncPalette(layers.palette, t)
    this.#syncData()
    this.#renderCanvas()
    this.#checkTour(mode)
  }

  /**
   * 第一次有了报表、在设计态铺好画布之后，看要不要自动开始新手引导；每个元素只看一次。
   * autoTour 不为 false、设置里没记着走完时记下待开始，等设计器显示出来再开始。
   */
  #checkTour(mode: ReportDesignerMode): void {
    if (!this.#tourChecked && this.#editor && mode !== 'preview') {
      this.#tourChecked = true
      this.#tourPending = this.autoTour !== false && !tourDoneOf(this.settings)
    }
    this.#startPendingTour()
  }

  /**
   * 有待开始的引导、在设计态且设计器显示着（画布有宽度）时，等这一轮更新落定后开始；
   * 到那时 autoTour 关了、设置里记着走完或引导已经开着就不开。
   */
  #startPendingTour(): void {
    const layers = this.#layers
    if (!this.#tourPending || !layers || !this.isConnected || this.#mode() === 'preview' || layers.canvas.clientWidth === 0)
      return
    this.#tourPending = false
    void this.updateComplete.then(() => {
      if (this.isConnected && this.#mode() !== 'preview' && this.autoTour !== false && !tourDoneOf(this.settings) && !layers.tour.running)
        layers.tour.start()
    })
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
    return {
      designer: this,
      translations: t,
      commands: this.#commandTranslations(),
      historyTranslations: this.#historyTranslations(),
      history: this.#editor?.history,
      dialogs: this.#dialogService(),
      settings: this.#resolvedSettings,
      frame: this.#layers?.frame,
    }
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

  /** 没写说明的一步：按操作取说明素材，读的时候按此刻的语言拼成句子。 */
  #describeStep(operations: readonly ReportOperation[], before: ReportDocument): HistoryLabel | undefined {
    const step = describeReportStep(operations, before)
    return step && (() => this.#stepText(step))
  }

  /** 一步的说明：对象种类按此刻的语言取名字。 */
  #stepText(step: ReportStep & Omit<ReportHistoryStepText, 'kind' | 'action'>): string {
    const t = this.#translations()
    return t.historyStep({ ...step, kind: t.objectKinds[step.kind] ?? step.kind })
  }

  #historyTranslations(): DesignerHistoryTranslations {
    return this.#config.translations<DesignerHistoryTranslations>('xh-designer-history', DESIGNER_HISTORY_EN_US, undefined)
  }

  /** schema 换了一份时装载：首次建编辑模型，之后换文档并清空历史；historyLimit 换过时重建编辑模型。赋回当前文档不处理。 */
  #load(): void {
    const schema = this.schema
    if (!schema || schema === this.#editor?.document)
      return
    const limit = this.historyLimit ?? DEFAULT_HISTORY_LIMIT
    if (this.#editor && limit === this.#editorLimit) {
      this.#editor.load(schema)
      this.#fillMenu('blank')
      return
    }
    this.#unsubscribe?.()
    const editor = createReportEditor({ document: schema, historyLimit: limit, describe: (operations, before) => this.#describeStep(operations, before) })
    this.#editor = editor
    this.#editorLimit = limit
    this.#unsubscribe = editor.subscribe((change) => {
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
    // 清空、保存不改文档、不重画，历史记录面板在这里刷新
    this.#layers?.panels.update(this.#context())
    emitEvent(this, 'history-change', snapshotHistory(history))
  }

  /**
   * 新手引导的步骤与设置对话框的帮助、快捷键、关于三页，按此刻的语言与命令表现算，内容没变不重设：
   * 帮助页是几段操作说明与「开始引导」「帮助」两颗钮；快捷键表从命令表生成，另加本设计器不是命令的几个键（剪贴板三键、删除与保存），
   * 通用组里去掉看板上没有的按住空格拖动画布、Shift 加方向键改写成改卡片大小；
   * 关于页是报表设计器的版本与许可证，后面接扩展给的几行。
   */
  #syncHelp(layers: Layers, context: ReportDesignerContext): void {
    const steps = resolveTourSteps(this.#model.tourSteps, context)
    const stepsKey = JSON.stringify(steps)
    if (stepsKey !== this.#tourStepsKey) {
      this.#tourStepsKey = stepsKey
      layers.tour.steps = steps
    }
    const t = context.translations
    const { commands } = this.#model
    const help = {
      notes: t.helpNotes,
      actions: [{ command: 'start-tour', label: context.commands.startTour }, { command: 'help', label: context.commands.help }],
    }
    const shortcuts = shortcutSettingsSource(commands, context, {
      extensionCommands: (this.#extensions ?? NO_EXTENSIONS).flatMap(extension => (extension.commands ?? []).map(command => command.id)),
      keys: [
        { label: context.commands.copy, keys: [['Mod', 'C']] },
        { label: context.commands.cut, keys: [['Mod', 'X']] },
        { label: context.commands.paste, keys: [['Mod', 'V']] },
        { label: context.commands.delete, keys: [['Backspace']] },
        { label: t.shortcutSave, keys: [['Mod', 'S']] },
      ],
      // 看板上没有按住空格拖动画布；Shift 加方向键是把选中的卡片改大或改小一格
      commonKeys: DESIGNER_COMMON_KEYS.filter(key => key.id !== 'pan').map(key => key.id === 'nudgeLarge' ? { ...key, label: t.shortcutResize } : key),
    })
    const about = { product: t.label, version: REPORT_VERSION, license: 'MIT', rows: this.#model.extensions.flatMap(extension => extension.about ?? []) }
    const helpKey = JSON.stringify([help, shortcuts, about])
    if (helpKey !== this.#helpKey) {
      this.#helpKey = helpKey
      layers.settings.help = help
      layers.settings.shortcuts = shortcuts
      layers.settings.about = about
    }
  }

  /** 设置对话框帮助页里的钮：关上对话框，再跑那条命令（开始引导、打开帮助）。 */
  readonly #onSettingsCommand = (event: Event): void => {
    event.stopPropagation()
    const { command } = (event as DesignerSettingsEventMap['settings-command']).detail
    if (this.#layers)
      this.#layers.settings.open = false
    runCommand(this.#model.commands, command, this.#context())
  }

  /** 引导收起了（走完、跳过或关上）：设置里记下 help.tourDone，之后不再自动开始。 */
  readonly #onTourEnd = (): void => {
    if (tourDoneOf(this.settings))
      return
    const key = DESIGNER_TOUR_DONE_KEY
    this.#commitSettings({ key, value: true, settings: { ...this.settings, [key]: true } })
  }

  /** 选中工具条的主体：看板上选中一张卡片为 card，几张为 multiple；只读、预览态或没有选中卡片时为 undefined。 */
  #selectionSubject(): ReportSelectionSubject | undefined {
    const count = this.#editor?.selection.cards.length ?? 0
    if (this.readonly || this.#mode() === 'preview' || !this.#dashboard() || count === 0)
      return undefined
    return count === 1 ? 'card' : 'multiple'
  }

  /**
   * 选中工具条：按主体取 selection:<主体> 的排列（宿主经 commandLayout 改，扩展命令写上落点就追加成一组），
   * 有主体、排列不空时放进变换覆盖层（slot="toolbar"），否则拿掉；位置与手势中收起由覆盖层管。
   */
  #renderSelectionBar(layers: Layers, context: ReportDesignerContext): void {
    const subject = this.#selectionSubject()
    const { commands } = this.#model
    const groups = subject === undefined ? [] : arrangeCommands(`selection:${subject}`, commands, REPORT_SELECTION_LAYOUT[subject], this.commandLayout)
    if (groups.every(group => group.length === 0)) {
      layers.selectionBar.element.remove()
      return
    }
    layers.selectionBar.update(groups, commands, context, context.translations.selectionToolbar)
    if (!layers.selectionBar.element.isConnected)
      layers.overlay.append(layers.selectionBar.element)
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
    const selectionBar = createCommandToolbar<ReportDesignerContext>(doc, { platform: this.#kbdPlatform() })
    selectionBar.element.slot = 'toolbar'
    const toolbar = createAuthoredElement(doc, 'div', { 'slot': 'toolbar', 'data-part': 'command-bar' }, [commandBar.element])
    const content = createAuthoredElement(doc, 'div', { 'data-part': 'content' })
    const empty = createAuthoredElement(doc, 'div', { 'data-part': 'empty', 'hidden': true })
    const dropPreview = createAuthoredElement(doc, 'div', { 'data-part': 'drop-preview', 'hidden': true })
    const surface = createAuthoredElement(doc, 'div', { 'data-part': 'surface' }, [content, empty, dropPreview])
    const sizer = createAuthoredElement(doc, 'div', { 'data-part': 'sizer' }, [surface])
    const scroller = createAuthoredElement(doc, 'div', { 'data-part': 'scroller', 'role': 'group', 'tabindex': 0 }, [sizer])
    const overlay = createAuthoredElement(doc, 'xh-designer-transform', { 'data-part': 'overlay' }) as XhDesignerTransformElement
    overlay.addEventListener('transform', this.#onTransform)
    overlay.addEventListener('marquee', this.#onMarquee)
    overlay.addEventListener('measure-change', this.#onMeasureChange)
    overlay.measure = 'selection'
    const canvas = createAuthoredElement(doc, 'div', { 'data-part': 'canvas' }, [scroller, overlay])
    canvas.addEventListener('pan-request', this.#onPanRequest)
    const menuContent = createAuthoredElement(doc, 'div', { 'data-xh-part': 'content' })
    const menuTrigger = createAuthoredElement(doc, 'div', { 'data-xh-part': 'trigger', 'data-report-canvas': '' }, [canvas])
    const menu = createAuthoredElement(doc, 'xh-context-menu', { 'size': 'sm', 'data-report-canvas-menu': '' }, [
      createAuthoredElement(doc, 'div', { 'data-xh-part': 'root', 'data-report-canvas-root': '' }, [
        menuTrigger,
        createAuthoredElement(doc, 'div', { 'data-xh-part': 'positioner' }, [menuContent]),
      ]),
    ])
    menu.addEventListener('item-select', this.#onMenuSelect)
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
    const datasetActions = createPanelActions<ReportDesignerContext>(doc, 'datasets')
    const parameterActions = createPanelActions<ReportDesignerContext>(doc, 'parameters')
    const frame = createGeneratedElement(doc, 'xh-designer-frame', { 'data-part': 'frame' }, [toolbar, data.datasets, data.parameters, palette, workspace, wells.element, properties.element, issues.element, issueSummary, datasetActions.element, parameterActions.element]) as XhDesignerFrameElement
    frame.addEventListener('layout-change', this.#onLayoutChange)
    // 换了画布工具（拖动工具命令、写 canvasTool 或 Esc 退出）时重画，工具栏上拖动钮的按下态跟着变
    frame.addEventListener('canvas-tool-change', () => this.requestUpdate())
    const selectionStatus = createStatusItem(doc, { value: '' })
    selectionStatus.element.slot = 'status-start'
    const zoomStatus = createStatusItem(doc, { value: '', action: () => this.zoomToActual() })
    zoomStatus.element.slot = 'status-end'
    frame.append(selectionStatus.element, zoomStatus.element)
    const settings = createGeneratedElement(doc, 'xh-designer-settings', { 'data-part': 'settings' }) as XhDesignerSettingsElement
    settings.addEventListener('settings-change', this.#onSettingsChange)
    settings.addEventListener('settings-command', this.#onSettingsCommand)
    const fieldImport = createGeneratedElement(doc, 'xh-designer-field-import', { 'data-part': 'field-import' }) as XhDesignerFieldImportElement
    fieldImport.addEventListener('fields-import', this.#onFieldsImport)
    const jsonEditor = createGeneratedElement(doc, 'xh-designer-json-editor', { 'data-part': 'json-editor' }) as XhDesignerJsonEditorElement
    jsonEditor.addEventListener('json-apply', this.#onJsonApply)
    const tour = createGeneratedElement(doc, 'xh-designer-tour', { 'data-part': 'tour' }) as XhDesignerTourElement
    tour.frame = frame
    tour.addEventListener('tour-end', this.#onTourEnd)
    this.replaceChildren(frame, settings, fieldImport, jsonEditor, tour)
    this.#layers?.panels.dispose()
    const panels = createPanelHost<ReportDesignerContext>(frame, { regions: FRAME_REGIONS, commands: () => this.#model.commands })
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
        this.#startPendingTour()
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
    this.#layers = { frame, toolbar, commandBar, selectionBar, panels, menu, menuContent, menuTrigger, canvas, scroller, sizer, surface, content, overlay, empty, dropPreview, preview, palette, data, wells, properties, issues, datasetActions, parameterActions, fieldImport, jsonEditor, tour, settings, selectionStatus, zoomStatus }
    panels.assign(this.#model.extensions, this.#context())
    this.#fillMenu('blank')
    return this.#layers
  }

  /** 此刻是设计态还是预览态。 */
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
    if (dialog.frame !== layers.frame)
      dialog.frame = layers.frame
  }

  /** 设置对话框里改了一条：换成新的 settings。 */
  readonly #onSettingsChange = (event: Event): void => {
    event.stopPropagation()
    this.#commitSettings((event as DesignerSettingsEventMap['settings-change']).detail)
  }

  /** 换成新的 settings，给了存储键就存起来，再派发 settings-change。 */
  #commitSettings(detail: DesignerSettingsEventMap['settings-change']['detail']): void {
    this.settings = detail.settings
    this.#settingsHost?.save(detail.settings, this.#model.settings)
    emitEvent(this, 'settings-change', detail)
  }

  /** 不看选中的对象，这种导入的权限够不够。 */
  #canImport(kind: ReportDataImportKind): boolean {
    if (this.readonly || this.#mode() === 'preview' || !this.#editor)
      return false
    return canEditData(kind === 'parameters' ? 'parameter' : 'dataset', this.#datasetEditing())
  }

  /** 导入字段的目标：数据面板里选中的数据集，或选中的字段所在的数据集。 */
  #importDataset(): string | undefined {
    const data = this.#editor?.selection.data
    return data?.kind === 'dataset' || data?.kind === 'field' ? data.dataset : undefined
  }

  /** 导入对话框交来字段：按打开时的目标换成一批操作，记一步撤销；导入数据集后选中新数据集。 */
  readonly #onFieldsImport = (event: Event): void => {
    const { fields, annotations } = (event as DesignerFieldImportEventMap['fields-import']).detail
    const target = this.#importTarget
    this.#importTarget = undefined
    const editor = this.#editor
    if (!target || !editor || !this.#canImport(target.kind))
      return
    const document = editor.document
    const plan = target.kind === 'dataset'
      ? planDatasetImport(document, fields)
      : target.kind === 'fields'
        ? planFieldImport(document, target.dataset!, fields)
        : planParameterImport(document, fields, annotations)
    if (!plan)
      return
    editor.execute(plan.operations)
    if (plan.dataset !== undefined)
      editor.select({ data: { kind: 'dataset', dataset: plan.dataset } })
  }

  /** 外框改了面板布局：整份写进设置的 layout.panels。 */
  readonly #onLayoutChange = (event: Event): void => {
    event.stopPropagation()
    const value = (event as DesignerFrameEventMap['layout-change']).detail.layout as unknown as JsonValue
    const key = DESIGNER_SETTING_KEYS.layout
    this.#commitSettings({ key, value, settings: { ...this.settings, [key]: value } })
  }

  /** 设置里存的面板布局。 */
  #storedLayout(): DesignerLayout | undefined {
    const value = this.settings?.[DESIGNER_SETTING_KEYS.layout]
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as unknown as DesignerLayout : undefined
  }

  /** 宿主对布局的管控，从 settingsPolicy 换算；内容不变时沿用同一个对象。 */
  #frameLayoutPolicy(): DesignerLayoutPolicy | undefined {
    const policy = designerLayoutPolicy(this.settingsPolicy)
    const key = JSON.stringify(policy ?? null)
    if (key !== this.#layoutPolicyKey) {
      this.#layoutPolicyKey = key
      this.#layoutPolicy = policy
    }
    return this.#layoutPolicy
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
   * 这个区此刻登记不登记：预览态只登记工具栏与画布；没有报表参数又不能新增时不登记那块卡片，
   * 设置里关了状态栏或工具栏时不登记它们（命令照样能经快捷键与右键菜单执行）。
   */
  #registers(name: string): boolean {
    if (name === 'toolbar' && !toolbarVisibleOf(this.settings))
      return false
    if (this.#mode() === 'preview')
      return name === 'toolbar' || name === 'canvas'
    if (name === 'parameters')
      return this.#hasParameters()
    if (name === 'status')
      return this.#statusBarOn()
    return true
  }

  /**
   * 外框的区：工具栏与画布带上本地化的区名（分隔条的无障碍名称要用）；数据集、报表参数、物料、字段栏、属性与问题画成卡片，
   * 面板头写标题、图标与帮助，属性卡片的副标题是当前编辑的对象。设计态后面接扩展面板的区；内容与扩展都没变时不重设。
   * 面板布局取设置里的 layout.panels，缺省取 defaultLayout，管控从 settingsPolicy 换算。
   */
  #syncFrame(frame: XhDesignerFrameElement, t: ReportDesignerTranslations): void {
    const layers = this.#layers
    const regions: Readonly<Record<string, Partial<DesignerFrameRegion>>> = {
      toolbar: { label: this.#commandTranslations().toolbar },
      datasets: { title: t.datasets, icon: DatabaseIcon, help: t.datasetsHelp },
      parameters: { title: t.parameters, icon: FilterIcon, help: t.parametersHelp },
      palette: { title: t.palette, icon: LayoutGridIcon, help: t.paletteHelp },
      canvas: { label: t.canvas },
      wells: { title: t.wells, icon: ListIcon, help: t.wellsHelp },
      properties: { title: t.properties, icon: SlidersHorizontalIcon, help: t.propertiesHelp, ...(layers?.properties.element.heading === undefined ? {} : { subtitle: layers.properties.element.heading }) },
      issues: { title: t.issues, icon: CircleAlertIcon, help: t.issuesHelp },
    }
    const shown = FRAME_REGIONS.filter(region => this.#registers(region.name))
    const extensionRegions = this.#mode() === 'preview' ? [] : this.#model.extensions.flatMap(extension => (extension.panels ?? []).map(panel => panel.region))
    // 扩展面板的标题与帮助按语言现取，算进键里，换了语言才会重设区表
    const key = JSON.stringify([regions, shown.map(region => region.name), this.#mode(), extensionRegions])
    if (key !== this.#regionsKey || this.#regionsModel !== this.#model) {
      this.#regionsKey = key
      this.#regionsModel = this.#model
      this.#regionList = [
        ...shown.map(region => ({ ...region, ...regions[region.name] })),
        ...extensionRegions,
      ]
    }
    if (frame.regions !== this.#regionList)
      frame.regions = this.#regionList
    frame.layout = this.#storedLayout()
    frame.defaultLayout = this.defaultLayout
    frame.layoutPolicy = this.#frameLayoutPolicy()
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
    this.#measureMetrics = metrics
    this.#syncMeasure(layers.overlay)
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

  /** 尺寸徽标按格计：像素与格数按此刻的网格度量逐轴换算，单位文字取设计器文案，换了语言才重交。 */
  #syncMeasure(overlay: XhDesignerTransformElement): void {
    const label = this.#translations().sizeUnit
    if (overlay.measureOptions?.unitLabel !== label)
      overlay.measureOptions = { convert: this.#measureConvert, unitLabel: label, fractionDigits: 0 }
  }

  /** 卡片的像素宽高与格数互换：格数 = (像素 + 间隙) / 距；还没量出网格时原样返回。 */
  readonly #measureConvert: DesignerMeasureConvert = {
    toDisplay: (value, axis) => {
      const metrics = this.#measureMetrics
      if (!metrics)
        return value
      return axis === 'width' ? (value + metrics.columnGap) / metrics.column : (value + metrics.rowGap) / metrics.row
    },
    toModel: (value, axis) => {
      const metrics = this.#measureMetrics
      if (!metrics)
        return value
      return axis === 'width' ? value * metrics.column - metrics.columnGap : value * metrics.row - metrics.rowGap
    },
  }

  /** 在尺寸徽标里改了宽或高：换成格数改卡片大小；连续点加减钮或按方向键并成一步撤销（合并键按卡片与边），输入后确认的单独一步。 */
  readonly #onMeasureChange = (event: Event): void => {
    const { id, rect, axis, source } = (event as DesignerTransformEventMap['measure-change']).detail
    const editor = this.#editor
    const metrics = this.#measureMetrics
    const columns = this.#dashboard()?.grid.columns
    if (!editor || this.readonly || this.#mode() === 'preview' || !metrics || columns === undefined)
      return
    this.#autoFit = false
    const cell = clipCell(rectToCell(rect, metrics), columns)
    editor.layoutCard(id, axis === 'width' ? { w: cell.w } : { h: cell.h }, source === 'step' ? { merge: `measure:${id}:${axis}` } : {})
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
    scroller.focus({ preventScroll: true })
    this.#autoFit = false
    if (this.#panTool()) {
      this.#startPan(event)
      return
    }
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

  /** 外框的画布工具此刻是拖动。 */
  #panTool(): boolean {
    return this.#layers?.frame.canvasTool === 'pan'
  }

  /**
   * 拖动工具开着时按住拖动平移画布：滚动区跟着指针滚，不选中、不挪卡片，只点一下也不改选中；拖动中画布标 data-gesture="pan"。
   * cancelPan 滚回按下时的位置。
   */
  #startPan(event: PointerEvent): void {
    const layers = this.#layers!
    const { scroller, canvas } = layers
    const doc = this.ownerDocument
    const pointerId = event.pointerId
    const start = { x: event.clientX, y: event.clientY }
    const move = (next: PointerEvent): void => {
      if (next.pointerId !== pointerId)
        return
      scroller.scrollLeft = this.#pan!.scroll.x + start.x - next.clientX
      scroller.scrollTop = this.#pan!.scroll.y + start.y - next.clientY
      this.#renderSelection()
    }
    const end = (next: PointerEvent): void => {
      if (next.pointerId === pointerId)
        this.#pan?.stop()
    }
    const stop = (): void => {
      doc.removeEventListener('pointermove', move)
      doc.removeEventListener('pointerup', end)
      doc.removeEventListener('pointercancel', end)
      this.#pan = undefined
      delete canvas.dataset.gesture
    }
    this.#pan?.stop()
    this.#pan = { scroll: { x: scroller.scrollLeft, y: scroller.scrollTop }, stop }
    canvas.dataset.gesture = 'pan'
    doc.addEventListener('pointermove', move)
    doc.addEventListener('pointerup', end)
    doc.addEventListener('pointercancel', end)
  }

  /** 取消进行中的平移：滚回按下时的位置。 */
  #cancelPan(): void {
    const pan = this.#pan
    const layers = this.#layers
    if (!pan || !layers)
      return
    pan.stop()
    layers.scroller.scrollLeft = pan.scroll.x
    layers.scroller.scrollTop = pan.scroll.y
    this.#renderSelection()
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
   * 物料面板：内置分组与条目取合并后的物料，条目的 id 与 payload 都是物料项 id；各扩展的物料来源每轮现取，分组接在后面。
   * 只读或报表主体不是看板时只能浏览。内容没变不重设，变了时记下物料来源的条目。
   */
  #syncPalette(palette: XhDesignerPaletteElement, t: ReportDesignerTranslations): void {
    palette.readonly = this.readonly || !this.#dashboard()
    const context = this.#context(t)
    const text = (label: string | ((context: ReportDesignerContext) => string)): string => typeof label === 'function' ? label(context) : label
    const items = [...this.#model.palette.values()]
    const groups: DesignerPaletteGroup[] = this.#model.paletteGroups.map(group => ({
      id: group.id,
      label: text(group.label),
      items: items.filter(item => item.group === group.id).map(item => ({ id: item.id, label: text(item.label), ...(item.icon ? { icon: item.icon } : {}), payload: item.id })),
    }))
    const view = resolvePaletteSources(groups, this.#model.paletteSources, context)
    this.#paletteView = view
    const key = JSON.stringify([t.palette, view.groups])
    if (key === this.#paletteKey)
      return
    this.#paletteKey = key
    palette.translations = { title: t.palette }
    palette.groups = view.groups
    const ids = new Set<string>()
    const collect = (entries: readonly DesignerPaletteItem[]): void => {
      for (const entry of entries) {
        ids.add(entry.id)
        collect(entry.children ?? [])
      }
    }
    view.groups.slice(groups.length).forEach(group => collect(group.items))
    this.#sourceItems = ids
  }

  /** 物料面板拖出的物料来源条目 id；别的拖动为 undefined。 */
  #sourceItem(payload: unknown): string | undefined {
    const drag = payload as Partial<DesignerPaletteDragPayload> | null | undefined
    return drag?.source === 'palette' && typeof drag.id === 'string' && this.#sourceItems.has(drag.id) ? drag.id : undefined
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
      if (current && next) {
        const step = { action: 'remove', kind: ref.kind, name: next.label, count: 1, cascade: cascadeCount(next.cascade) } as const
        current.execute(next.operations, { label: () => this.#stepText(step) })
      }
    })
    return true
  }

  /** 确认框：用到时才建。 */
  #dialogService(): DialogService {
    this.#dialogs ??= createDialogService()
    return this.#dialogs
  }

  #confirmRemoval(removal: DataRemoval): Promise<boolean> {
    const t = this.#translations()
    return this.#dialogService().confirm({ title: t.removeTitle(removal.label), content: t.removeCascade(removal.cascade), tone: 'danger', okText: t.removeConfirm })
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
      // 工具栏先按 commandLayout 或缺省排列排出分组，再套用户在设置「工具栏」页的定制；同一份排列交给设置对话框列按钮表
      const defaults = this.#model.importers.length > 0 ? [[REPORT_IMPORT_TEMPLATE_COMMAND], ...REPORT_TOOLBAR_LAYOUT] : REPORT_TOOLBAR_LAYOUT
      const arranged = arrangeCommands('toolbar', commands, defaults, this.commandLayout)
      layers.commandBar.setDisplay(toolbarDisplayOf(this.#resolvedSettings))
      layers.commandBar.update(applyToolbarCustomization(arranged, toolbarCustomizationOf(this.settings)), commands, context, context.commands.toolbar)
      const source = toolbarSettingsSource(arranged, commands, context)
      const sourceKey = JSON.stringify(source)
      if (sourceKey !== this.#toolbarSourceKey) {
        this.#toolbarSourceKey = sourceKey
        layers.settings.toolbar = source
      }
      this.#renderSelectionBar(layers, context)
      // 面板头的导入钮：datasetEditing 不够或只读时不出现
      layers.datasetActions.update(this.#canImport('dataset') ? ['import-dataset', 'import-fields'] : [], commands, context, t.datasets)
      layers.parameterActions.update(this.#canImport('parameters') ? ['import-parameters'] : [], commands, context, t.parameters)
      this.#syncHelp(layers, context)
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

  /** 点物料：物料来源的条目交给来源插入（不给落点）；内置的新卡片放到第一个空位并选中。只读或主体不是看板时什么都不做。 */
  readonly #onPaletteActivate = (event: Event): void => {
    const { id, payload } = (event as DesignerPaletteEventMap['item-activate']).detail
    if (this.readonly || !this.#dashboard() || this.#paletteView?.insert(id, this.#context()) === true)
      return
    if (typeof payload === 'string')
      this.addPaletteItem(payload)
  }

  /**
   * 物料拖到看板上：以指针为中心放新卡片，落点画出压实之后它实际所在的格，隐藏跟随指针的预览；
   * 物料来源的条目落点是指针所在的那一格，画出这一格，跟随指针的预览照常显示。只读、不是看板或载荷不是登记过的物料时不接受。
   */
  #dropOver(point: Point, payload: unknown): DropOver {
    const field = dataFieldPayload(payload)
    if (field)
      return this.#fieldOver(point, field)
    const sourced = this.#sourceItem(payload)
    const item = sourced ?? this.#paletteItem(payload)
    const dashboard = this.#dashboard()
    const metrics = this.#gridMetrics()
    const layers = this.#layers
    if (item === undefined || this.readonly || !dashboard || !metrics || !layers) {
      this.#clearDrop()
      return { accept: false }
    }
    const origin = layers.surface.getBoundingClientRect()
    const at = { x: (point.x - origin.left) / this.#zoom, y: (point.y - origin.top) / this.#zoom }
    let landing: GridRect
    if (sourced !== undefined) {
      const cell = centeredCell(at, { w: 1, h: 1 }, metrics, dashboard.grid.columns)
      this.#drop = { item, ...cell, sourced: true }
      landing = { ...cell, w: 1, h: 1 }
    }
    else {
      const template = this.#template(item)
      const cell = centeredCell(at, template.layout, metrics, dashboard.grid.columns)
      this.#drop = { item, ...cell }
      const id = createIdAllocator(template.kind, dashboard.cards.map(card => card.id)).next()
      const added = planAddCard(dashboard, { ...template, id, layout: { ...template.layout, ...cell } }).find(operation => operation.type === 'addCard')
      landing = added?.type === 'addCard' ? added.card.layout : { ...template.layout, ...cell }
    }
    const rect = cellToRect(landing, metrics)
    const preview = layers.dropPreview
    preview.hidden = false
    preview.style.insetInlineStart = `${rect.x}px`
    preview.style.insetBlockStart = `${rect.y}px`
    preview.style.inlineSize = `${rect.width}px`
    preview.style.blockSize = `${rect.height}px`
    layers.canvas.dataset.gesture = 'drop'
    return sourced === undefined ? { accept: true, ghost: 'hide' } : { accept: true }
  }

  /** 在落点新建拖进来的卡片并选中它；物料来源的条目交给来源按落点格插入。 */
  #dropCard(): void {
    const drop = this.#drop
    this.#clearDrop()
    if (!drop || this.readonly || !this.#dashboard())
      return
    if (drop.sourced) {
      this.#paletteView?.insert(drop.item, this.#context(), { x: drop.x, y: drop.y })
      return
    }
    if (!this.#model.palette.has(drop.item))
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
    if (this.#panTool())
      return
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

  /** 焦点在画布（可聚焦的是滚动区）上，或在关闭菜单后接住焦点的菜单触发区上。 */
  #isCanvasFocus(target: EventTarget | null): boolean {
    const layers = this.#layers
    return layers !== undefined && (target === layers.scroller || target === layers.menuTrigger)
  }

  /** 选了右键菜单的条目：执行那条命令。 */
  readonly #onMenuSelect = (event: Event): void => {
    const { value } = (event as CustomEvent<{ value: string }>).detail
    runCommand(this.#model.commands, value, this.#context())
  }

  /**
   * 画布上的按键：Alt+F10 把焦点交给选中工具条；再找快捷键命中、此刻可用的命令；没有命令占用时，Ctrl / ⌘ + S 派发 save，
   * Backspace 删除选中的对象，= 与按着 Shift 的 + 放大，Escape 清空选择，方向键挪动或改大小卡片。
   */
  readonly #onKeyDown = (event: KeyboardEvent): void => {
    const editor = this.#editor
    if (!editor || !this.#isCanvasFocus(event.target) || this.#gesture)
      return
    if (event.key === 'Escape' && this.#pan) {
      // 拖动途中的 Esc 只取消这一次拖动，外框不退出拖动工具
      this.#cancelPan()
      event.preventDefault()
      return
    }
    // 拖动工具开着、没在拖动时 Esc 交给外框退出拖动工具
    if (event.key === 'Escape' && this.#panTool())
      return
    if (event.altKey && event.key === 'F10') {
      // Alt+F10 把焦点交给选中工具条（排列为空时交给尺寸徽标），在里面按 Esc 回到画布
      if (this.#layers?.overlay.focusToolbar() || this.#layers?.overlay.focusMeasure())
        event.preventDefault()
      return
    }
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

  /** 只选中一张卡片时，方向键挪一格，Shift 加方向键改大小一格；同一张卡片连续按、相隔不超过 1 秒的并成一步撤销。 */
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
    editor.nudge(id, resize ? { w: Math.max(1, w + dx), h: Math.max(1, h + dy) } : { x: Math.max(0, x + dx), y: Math.max(0, y + dy) })
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
  defineDesignerShellElement('xh-designer-field-import', XhDesignerFieldImportElement)
  defineDesignerShellElement('xh-designer-frame', XhDesignerFrameElement)
  defineDesignerShellElement('xh-designer-tour', XhDesignerTourElement)
  defineDesignerShellElement('xh-designer-issues', XhDesignerIssuesElement)
  defineDesignerShellElement('xh-designer-json-editor', XhDesignerJsonEditorElement)
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
