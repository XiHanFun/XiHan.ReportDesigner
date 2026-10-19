/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 设计器层的扩展：在运行时层之上加属性编辑器、命令、面板、物料与装上时的回调。内置命令与内置物料也写成一个扩展。

import type { ReportCardType, ReportDocument, ReportRuleContext } from '@xihan-report/core'
import type { ReportDesignerTranslations, ReportRuntimeExtension, ReportRuntimeModel } from '@xihan-report/runtime'
import type { IconRecord } from '@xihan-ui/core'
import type { DesignerCommand, DesignerExtensionCore, ExtensionKeySpaces } from '@xihan-ui/designer-kit'
import type { DesignerCommandsTranslations, DesignerCommandTable, DesignerHistoryCommandTarget, DesignerHistoryTranslations, DesignerPropertyEditor, DesignerSettings, DesignerSettingsSection, DesignerShellExtension, XhDesignerFrameElement } from '@xihan-ui/designer-shell'
import type { DialogService } from '@xihan-ui/web-components/services'
import type { ReportAddCardInit } from './editor'
import type { XhReportDesigner } from './report-designer'
import { cardTemplate, REPORT_CARD_TYPES } from '@xihan-report/core'
import { createReportRuntimeModel } from '@xihan-report/runtime'
import { extensionCommands, mergeExtensions } from '@xihan-ui/designer-kit'
import { collectSettingsSections, createHistoryPanel, createOutlinePanel, designerHistoryCommands, designerPanelCommands, designerShellCommands } from '@xihan-ui/designer-shell'
import { CircleHelpIcon, ClipboardIcon, CopyIcon, CopyPlusIcon, EraserIcon, EyeIcon, FilePlusIcon, HistoryIcon, ListTreeIcon, MaximizeIcon, PanelLeftIcon, PencilIcon, RedoIcon, ScissorsIcon, SettingsIcon, SquareDashedIcon, TrashIcon, UndoIcon, UploadIcon, ZoomInIcon, ZoomOutIcon, ZoomResetIcon } from '@xihan-ui/icons'
import { REPORT_CARD_TYPE_ICONS } from './card-icons'
import { REPORT_OUTLINE_ADAPTER } from './outline'

/** 命令、面板、物料与扩展装上时拿到的上下文。 */
export interface ReportDesignerContext {
  /** 所在的设计器元素。 */
  readonly designer: XhReportDesigner
  /** 此刻生效的设计器文案。 */
  readonly translations: ReportDesignerTranslations
  /** 四款设计器共用的命令文案，取 designer-shell 语言包的 xh-designer-commands。 */
  readonly commands: DesignerCommandsTranslations
  /** 历史记录的文案，取 designer-shell 语言包的 xh-designer-history；撤销、重做与清空历史的确认框与播报用。 */
  readonly historyTranslations: DesignerHistoryTranslations
  /** 撤销历史；还没有报表时为 undefined。内置的撤销、重做与清空历史命令经它读写。 */
  readonly history: DesignerHistoryCommandTarget | undefined
  /** 确认框；内置的清空历史命令清空前用它。 */
  readonly dialogs: Pick<DialogService, 'confirm'>
  /** 此刻生效的设置：键是「分区 id.条目 id」，各分区没写的条目取了缺省值。 */
  readonly settings: DesignerSettings
  /** 设计器的外框；还没建出来时为 undefined。内置的「面板」命令经它开关面板。 */
  readonly frame: XhDesignerFrameElement | undefined
}

/** 设计器的命令。 */
export type ReportDesignerCommand = DesignerCommand<ReportDesignerContext>

/** 属性编辑器。 */
export type ReportPropertyEditor = DesignerPropertyEditor

/** 新卡片的模板：不写 id，新建时按种类分配；layout 只需写大小。 */
export type ReportCardTemplate = ReportAddCardInit & { readonly id?: never }

/** 物料面板的一组。 */
export interface ReportPaletteGroup {
  /** 全局唯一；扩展的写扩展 id 末段加点加名字。 */
  readonly id: string
  /** 组名，可以按此刻的文案生成。 */
  readonly label: string | ((context: ReportDesignerContext) => string)
}

/** 物料面板里的一项：拖到看板上或激活时按模板新建卡片。 */
export interface ReportPaletteItem {
  /** 全局唯一；扩展的写扩展 id 末段加点加名字，如 gantt.timeline。 */
  readonly id: string
  /** 所在的组：内置的 charts、metrics、tables，或某个扩展登记的组。 */
  readonly group: string
  /** 物料名，可以按此刻的文案生成。 */
  readonly label: string | ((context: ReportDesignerContext) => string)
  /** 物料名前的图标；内置的取卡片种类的图标。 */
  readonly icon?: IconRecord
  /** 新卡片；dataset 是报表的第一个数据集，没有数据集时为空串。 */
  readonly template: (dataset: string) => ReportCardTemplate
}

/** 报表设计器层的扩展：运行时层的全部字段，加上属性编辑器、命令、面板、物料与 setup。导出器在运行时层，导入暂不支持。 */
export interface ReportDesignerExtension extends ReportRuntimeExtension, Omit<DesignerShellExtension<ReportDesignerContext, ReportPropertyEditor, ReportDocument, ReportRuleContext>, keyof DesignerExtensionCore | 'exporters' | 'importers'> {
  /** 物料面板的组，排在内置的图表、指标、表格之后。 */
  readonly paletteGroups?: readonly ReportPaletteGroup[]
  /** 物料面板里的项。 */
  readonly palette?: readonly ReportPaletteItem[]
}

/** 命令文案桶里取值是文字的那些键。 */
type SharedLabelKey = { [K in keyof DesignerCommandsTranslations]: DesignerCommandsTranslations[K] extends string ? K : never }[keyof DesignerCommandsTranslations]

function shared(key: SharedLabelKey): (context: ReportDesignerContext) => string {
  return context => context.commands[key]
}

function designing({ designer }: ReportDesignerContext): boolean {
  return designer.mode !== 'preview'
}

/** 设计态、非只读且 test 成立时可用。 */
function editable(test: (designer: XhReportDesigner) => boolean): (context: ReportDesignerContext) => boolean {
  return context => designing(context) && !context.designer.readonly && test(context.designer)
}

function selectedCards(designer: XhReportDesigner): number {
  return designer.getSelection().cards.length
}

function isDashboard(designer: XhReportDesigner): boolean {
  return designer.schema?.body.type === 'dashboard'
}

/** 顶栏插入钮的常用物料，按钮依次排开；钮上写物料名，图标取卡片种类的图标。 */
const QUICK_INSERT: readonly ReportCardType[] = ['chart.cartesian', 'chart.pie', 'metric', 'table.table', 'table.crosstab']

/** 顶栏的插入命令：点一下照点物料的做法新建卡片；只读、预览态或主体不是看板时不可用。 */
const QUICK_INSERT_COMMANDS: readonly ReportDesignerCommand[] = QUICK_INSERT.map((type): ReportDesignerCommand => ({
  id: `insert:${type}`,
  label: ({ translations }) => translations.insertCard(translations.cardTypes[type] ?? type),
  shortLabel: ({ translations }) => translations.cardTypes[type] ?? type,
  icon: REPORT_CARD_TYPE_ICONS[type],
  placement: ['header'],
  enabled: editable(isDashboard),
  run: ({ designer }) => void designer.addPaletteItem(type),
}))

/** 内置命令 help 打开的帮助页：报表文档站的设计器一页。 */
export const REPORT_DESIGNER_HELP_URL = 'https://report.docs.xihanfun.com/guide/designer'

/** 设计器的面板 id：宿主写 defaultLayout、settingsPolicy（layout.panels.<面板 id>）与 commandLayout（panel:<面板 id>）时用。 */
export const REPORT_DESIGNER_PANELS = {
  datasets: 'datasets',
  parameters: 'parameters',
  palette: 'palette',
  wells: 'wells',
  properties: 'properties',
  issues: 'issues',
  history: 'history',
  outline: 'outline',
} as const

/**
 * 内置命令：撤销、重做与清空历史，剪贴板、创建副本与删除、全选、缩放、设计与预览，designer-shell 内置的面板、显示或隐藏所有面板、
 * 还原面板显隐、恢复默认布局、设置、帮助与导入字段，导入数据集与导入参数，以及每块内置面板一条开关命令 panel:<面板 id>。
 */
const BUILTIN_COMMANDS: readonly ReportDesignerCommand[] = [
  ...designerHistoryCommands<ReportDesignerContext>({
    history: context => context.history,
    disabled: context => !designing(context) || context.designer.readonly === true,
    translations: context => context.commands,
    historyTranslations: context => context.historyTranslations,
    confirm: (context, options) => context.dialogs.confirm(options),
    announce: (context, message) => context.frame?.announce(message),
    icons: { undo: UndoIcon, redo: RedoIcon, clearHistory: EraserIcon },
  }),
  { id: 'cut', label: shared('cut'), icon: ScissorsIcon, enabled: editable(d => selectedCards(d) > 0), run: ({ designer }) => designer.cut() },
  { id: 'copy', label: shared('copy'), icon: CopyIcon, enabled: context => designing(context) && selectedCards(context.designer) > 0, run: ({ designer }) => designer.copy() },
  { id: 'paste', label: shared('paste'), icon: ClipboardIcon, enabled: editable(d => d.canPaste && isDashboard(d)), run: ({ designer }) => designer.paste() },
  { id: 'duplicate', label: shared('duplicate'), icon: CopyPlusIcon, shortcut: ['Mod', 'D'], enabled: editable(d => selectedCards(d) > 0), run: ({ designer }) => designer.duplicate() },
  { id: 'delete', label: shared('delete'), icon: TrashIcon, tone: 'danger', shortcut: ['Delete'], enabled: editable(d => d.canDelete), run: ({ designer }) => designer.deleteSelection() },
  { id: 'select-all', label: shared('selectAll'), icon: SquareDashedIcon, shortcut: ['Mod', 'A'], enabled: context => designing(context) && isDashboard(context.designer), run: ({ designer }) => designer.selectAll() },
  { id: 'zoom-out', label: shared('zoomOut'), icon: ZoomOutIcon, shortcut: ['-'], enabled: designing, run: ({ designer }) => designer.zoomOut() },
  { id: 'zoom-in', label: shared('zoomIn'), icon: ZoomInIcon, shortcut: ['+'], enabled: designing, run: ({ designer }) => designer.zoomIn() },
  { id: 'zoom-to-fit', label: shared('zoomToFit'), icon: MaximizeIcon, shortcut: ['0'], enabled: designing, run: ({ designer }) => designer.zoomToFit() },
  { id: 'zoom-to-actual', label: shared('zoomToActual'), icon: ZoomResetIcon, enabled: designing, run: ({ designer }) => designer.zoomToActual() },
  { id: 'design', label: shared('design'), icon: PencilIcon, checked: ({ designer }) => designer.mode !== 'preview', run: (context) => {
    context.designer.mode = 'design'
  } },
  { id: 'preview', label: shared('preview'), icon: EyeIcon, checked: ({ designer }) => designer.mode === 'preview', run: (context) => {
    context.designer.mode = 'preview'
  } },
  ...designerShellCommands<ReportDesignerContext>({
    translations: context => context.commands,
    frame: context => context.frame,
    openSettings: ({ designer }) => designer.openSettings(),
    helpUrl: () => REPORT_DESIGNER_HELP_URL,
    openFieldImport: ({ designer }) => void designer.openDataImport('fields'),
    fieldImportDisabled: ({ designer }) => !designer.canImportData('fields'),
    icons: { panels: PanelLeftIcon, settings: SettingsIcon, help: CircleHelpIcon, importFields: UploadIcon },
  }),
  { id: 'import-dataset', label: ({ translations }) => translations.importDataset, icon: FilePlusIcon, enabled: ({ designer }) => designer.canImportData('dataset'), run: ({ designer }) => void designer.openDataImport('dataset') },
  { id: 'import-parameters', label: ({ translations }) => translations.importParameters, icon: UploadIcon, enabled: ({ designer }) => designer.canImportData('parameters'), run: ({ designer }) => void designer.openDataImport('parameters') },
  ...designerPanelCommands<ReportDesignerContext>({ panels: Object.values(REPORT_DESIGNER_PANELS), frame: context => context.frame }),
  ...QUICK_INSERT_COMMANDS,
]

const BUILTIN_GROUPS = ['charts', 'metrics', 'tables'] as const

function groupOf(type: ReportCardType): (typeof BUILTIN_GROUPS)[number] {
  return type === 'metric' ? 'metrics' : type.startsWith('chart.') ? 'charts' : 'tables'
}

/** 内置物料：每种内置卡片一项，模板取 cardTemplate。 */
const BUILTIN_PALETTE: readonly ReportPaletteItem[] = REPORT_CARD_TYPES.map(type => ({
  id: type,
  group: groupOf(type),
  label: ({ translations }: ReportDesignerContext) => translations.cardTypes[type] ?? type,
  icon: REPORT_CARD_TYPE_ICONS[type],
  template: (dataset: string) => cardTemplate(type, dataset),
}))

/** 历史记录面板：缺省隐藏，打开后在右栏属性下面，面板头是清空历史；只读时只能看。 */
const HISTORY_PANEL = createHistoryPanel<ReportDesignerContext>({
  snapshot: ({ designer }) => designer.historyState,
  goTo: ({ designer }, position) => void designer.goToHistory(position),
  announce: ({ frame }, message) => frame?.announce(message),
}, { region: { icon: HistoryIcon }, readonly: ({ designer }) => designer.readonly === true })

/** 页面结构面板：停在左栏物料下面，列出卡片、卡片的列表与列表项；只读时只能看。 */
const OUTLINE_PANEL = createOutlinePanel<ReportDesignerContext>(REPORT_OUTLINE_ADAPTER, {
  region: { icon: ListTreeIcon },
  readonly: ({ designer }) => designer.readonly === true,
})

/** 设计器的内置扩展：内置命令、物料、页面结构与历史记录面板。卡片种类、渲染与导出等内置部分在 core 与 runtime 的内置扩展里。 */
export const REPORT_DESIGNER_EXTENSION: ReportDesignerExtension = {
  id: '@xihan-report/designer',
  commands: BUILTIN_COMMANDS,
  panels: [OUTLINE_PANEL, HISTORY_PANEL],
  paletteGroups: BUILTIN_GROUPS.map(group => ({ id: group, label: ({ translations }: ReportDesignerContext) => translations.paletteGroups[group] ?? group })),
  palette: BUILTIN_PALETTE,
}

/** 工具栏的缺省排列；commandLayout 没写 toolbar 时用它，再把 placement 含 toolbar 的扩展命令追加成一组。 */
export const REPORT_TOOLBAR_LAYOUT: readonly (readonly string[])[] = [
  ['undo', 'redo'],
  ['cut', 'copy', 'paste', 'duplicate', 'delete'],
  ['zoom-out', 'zoom-in', 'zoom-to-fit', 'zoom-to-actual'],
  ['design', 'preview'],
  ['panels', 'settings', 'help'],
]

/** 选中工具条落在哪类选中上：看板上的一张卡片，或几张卡片。 */
export type ReportSelectionSubject = 'card' | 'multiple'

/** 选中工具条（命令落点 selection:<主体>）的缺省排列：创建副本、复制与删除。 */
export const REPORT_SELECTION_LAYOUT: Readonly<Record<ReportSelectionSubject, readonly (readonly string[])[]>> = {
  card: [['duplicate', 'copy', 'delete']],
  multiple: [['duplicate', 'copy', 'delete']],
}

/** 右键菜单落在哪类对象上。 */
export type ReportMenuSubject = 'card' | 'blank'

/** 右键菜单的缺省排列。 */
export const REPORT_MENU_LAYOUT: Readonly<Record<ReportMenuSubject, readonly (readonly string[])[]>> = {
  card: [['cut', 'copy', 'paste', 'duplicate'], ['delete']],
  blank: [['paste'], ['select-all'], ['zoom-to-fit']],
}

const DESIGNER_SPACES: ExtensionKeySpaces<ReportDesignerExtension> = {
  'palette-group': extension => (extension.paletteGroups ?? []).map(group => group.id),
  'palette-item': extension => (extension.palette ?? []).map(item => item.id),
}

/** 一组设计器扩展合出的东西。 */
export interface ReportDesignerModel {
  /** 设计器内置扩展在前、传入的在后；校验、计算与查看器都拿这一份。 */
  readonly list: readonly ReportDesignerExtension[]
  /** 再加上 core 与 runtime 层内置扩展的全部扩展，面板与命令按它的顺序。 */
  readonly extensions: readonly ReportDesignerExtension[]
  /** 运行时层的模型：种类、渲染、导出器与取数中间件。 */
  readonly runtime: ReportRuntimeModel
  /** 命令 id 到命令的对照：内置的在前，扩展的按登记顺序。 */
  readonly commands: DesignerCommandTable<ReportDesignerContext>
  /** 物料面板的组，内置的在前。 */
  readonly paletteGroups: readonly ReportPaletteGroup[]
  /** 物料项 id 到物料项的对照。 */
  readonly palette: ReadonlyMap<string, ReportPaletteItem>
  /** 各扩展登记的设置分区，按登记顺序；分区 id 不与基础分区或彼此重名。 */
  readonly settings: readonly DesignerSettingsSection[]
}

const MODELS = new WeakMap<readonly ReportDesignerExtension[], ReportDesignerModel>()

/**
 * 合出设计器用的模型；任何一处重名都抛 DesignerExtensionError，物料项指向没登记的组时抛 TypeError。
 * 同一个数组只合一次。
 */
export function createReportDesignerModel(extensions: readonly ReportDesignerExtension[]): ReportDesignerModel {
  const cached = MODELS.get(extensions)
  if (cached)
    return cached
  const list = [REPORT_DESIGNER_EXTENSION, ...extensions]
  mergeExtensions([REPORT_DESIGNER_EXTENSION], extensions, DESIGNER_SPACES)
  const runtime = createReportRuntimeModel(list)
  const all = runtime.extensions as readonly ReportDesignerExtension[]
  const paletteGroups = all.flatMap(extension => extension.paletteGroups ?? [])
  const groups = new Set(paletteGroups.map(group => group.id))
  const palette = new Map(all.flatMap(extension => (extension.palette ?? []).map((item) => {
    if (!groups.has(item.group))
      throw new TypeError(`[report] palette item ${item.id} of ${extension.id} is in an unregistered group ${item.group}`)
    return [item.id, item] as const
  })))
  const model: ReportDesignerModel = {
    list,
    extensions: all,
    runtime,
    commands: extensionCommands(all),
    paletteGroups,
    palette,
    settings: collectSettingsSections(all),
  }
  MODELS.set(extensions, model)
  return model
}
