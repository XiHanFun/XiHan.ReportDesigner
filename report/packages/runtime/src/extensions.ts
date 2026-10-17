/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表运行时层的扩展：在 core 层之上加卡片与主体视图的渲染、导出与取数中间件。查看器只引这一层，打包里没有设计器代码。
// 内置三种卡片的渲染与 xlsx 导出也写成一个内置扩展，与传入的走同一条路。

import type { CardResult, ExtensionViewResult, FilterCondition, LinkSelections, ParameterValues, ReportCoreExtension, ReportDocument, ReportModel, ViewResult } from '@xihan-report/core'
import type { DesignerExporter, ExtensionKeySpaces } from '@xihan-ui/designer-kit'
import type { ReportViewerTranslations } from './translations'
import type { RenderedChart } from './viewer/charts'
import type { RenderContext } from './viewer/context'
import type { ReportDataProvider } from './viewer/report-viewer'
import type { RenderedTable } from './viewer/table'
import { createReportModel } from '@xihan-report/core'
import { mergeExtensions } from '@xihan-ui/designer-kit'
import { renderChartCard, renderMetricCard, renderTableCard } from './viewer/dashboard'

/** 渲染出的、能接联动与下钻的内容：图表或表格；别的内容为 undefined。 */
export type ReportRendered = RenderedChart | RenderedTable

/**
 * 卡片的渲染：把计算结果画进卡片的内容区。上一轮画过的元素还在 body 里，同种卡片可以复用它们只换数据。
 * 返回图表或表格时查看器给它接联动与下钻。
 */
export type ReportCardRenderer = (body: HTMLElement, result: CardResult, context: RenderContext) => ReportRendered | undefined

/** 作主体的扩展视图的渲染，规则同卡片。 */
export type ReportViewRenderer = (container: HTMLElement, result: ExtensionViewResult, context: RenderContext) => ReportRendered | undefined

/** 取数中间件：拿到下一层的取数回调，返回包在它外面的一层。 */
export type ReportDataMiddleware = (next: ReportDataProvider) => ReportDataProvider

/** 查看器此刻的计算结果，只读快照。 */
export interface ReportResults {
  /** 这一轮取数用到的报表参数取值。 */
  readonly parameters: ParameterValues
  /** 看板联动的选中值。 */
  readonly selections: LinkSelections
  /** 主体视图的结果；主体是看板或还没算好时为 undefined。 */
  readonly body: ViewResult | ExtensionViewResult | undefined
  /** 看板上已算好的卡片，按卡片的先后；filters 是它当时收到的联动筛选。 */
  readonly cards: readonly { readonly result: CardResult, readonly filters: readonly FilterCondition[] }[]
}

/** 导出时交给导出器的上下文。 */
export interface ReportExportContext {
  readonly schema: ReportDocument
  readonly results: ReportResults
  readonly translations: ReportViewerTranslations
  readonly timeZone: string
  /** 调用方给的选项，如文件里的表名。 */
  readonly options: Readonly<Record<string, unknown>>
}

/** 报表运行时层的扩展。 */
export interface ReportRuntimeExtension extends ReportCoreExtension {
  /** 卡片的渲染，键是卡片种类名。 */
  readonly cardRenderers?: Readonly<Record<string, ReportCardRenderer>>
  /** 作主体的扩展视图的渲染，键是视图种类名。 */
  readonly viewRenderers?: Readonly<Record<string, ReportViewRenderer>>
  /** 导出成文件；内置的 xlsx 在最前。 */
  readonly exporters?: readonly DesignerExporter<ReportExportContext>[]
  /** 取数中间件，按扩展顺序一层层包在宿主的 dataProvider 外面，后登记的在最外。 */
  readonly dataProvider?: ReportDataMiddleware
}

/** 运行时内置扩展的 id。 */
export const REPORT_RUNTIME_EXTENSION_ID = '@xihan-report/runtime'

/** xlsx 导出：表格主体导出一张表，看板按已算好的表格卡片各导一张（表名取卡片标题）。写出部分按需加载。 */
const XLSX_EXPORTER: DesignerExporter<ReportExportContext> = {
  id: `${REPORT_RUNTIME_EXTENSION_ID}.xlsx`,
  label: context => context.translations.exportXlsx,
  formats: ['xlsx'],
  export: async (_format, context) => {
    const { exportResultsXlsx } = await import('./xlsx-export')
    return exportResultsXlsx(context)
  },
}

/** 运行时内置扩展：三种内置卡片的渲染与 xlsx 导出。内置的明细表、分组报表与交叉表主体由查看器直接画。 */
export const REPORT_RUNTIME_EXTENSION: ReportRuntimeExtension = {
  id: REPORT_RUNTIME_EXTENSION_ID,
  cardRenderers: { chart: renderChartCard, metric: renderMetricCard, table: renderTableCard },
  exporters: [XLSX_EXPORTER],
}

/** 运行时用的报表模型：core 的模型加上渲染、导出与取数中间件。 */
export interface ReportRuntimeModel extends ReportModel {
  readonly cardRenderers: ReadonlyMap<string, ReportCardRenderer>
  readonly viewRenderers: ReadonlyMap<string, ReportViewRenderer>
  /** 内置在前，传入的按顺序在后。 */
  readonly exporters: readonly DesignerExporter<ReportExportContext>[]
  /** 把宿主的取数回调包上各扩展的中间件。 */
  readonly provider: (base: ReportDataProvider) => ReportDataProvider
}

const RUNTIME_SPACES: ExtensionKeySpaces<ReportRuntimeExtension> = {
  'card-renderer': extension => Object.keys(extension.cardRenderers ?? {}),
  'view-renderer': extension => Object.keys(extension.viewRenderers ?? {}),
}

const MODELS = new WeakMap<readonly ReportRuntimeExtension[], ReportRuntimeModel>()
const NO_EXTENSIONS: readonly ReportRuntimeExtension[] = []

/**
 * 合出运行时用的报表模型：core 的合并与查重照旧；渲染、导出器重名时抛 DesignerExtensionError。
 * 扩展登记的卡片与视图种类必须有渲染（同一个扩展或别的扩展给的都行），没有时抛 TypeError。同一个数组只合一次。
 */
export function createReportRuntimeModel(extensions: readonly ReportRuntimeExtension[] = NO_EXTENSIONS): ReportRuntimeModel {
  const cached = MODELS.get(extensions)
  if (cached)
    return cached
  const model = createReportModel(extensions)
  const list = mergeExtensions([REPORT_RUNTIME_EXTENSION], extensions, RUNTIME_SPACES)
  const cardRenderers = new Map(list.flatMap(extension => Object.entries(extension.cardRenderers ?? {})))
  const viewRenderers = new Map(list.flatMap(extension => Object.entries(extension.viewRenderers ?? {})))
  for (const [name, entry] of model.cards) {
    if (!entry.builtin && !cardRenderers.has(name))
      throw new TypeError(`[report] card kind ${name} registered by ${entry.owner} has no renderer`)
  }
  for (const [name, entry] of model.views) {
    if (!entry.builtin && !viewRenderers.has(name))
      throw new TypeError(`[report] view kind ${name} registered by ${entry.owner} has no renderer`)
  }
  for (const extension of list) {
    for (const name of Object.keys(extension.cardRenderers ?? {})) {
      if (!model.cards.has(name))
        throw new TypeError(`[report] ${extension.id} renders card kind ${name} that no extension registers`)
    }
    for (const name of Object.keys(extension.viewRenderers ?? {})) {
      if (!model.views.has(name) || ['table', 'group', 'crosstab', 'dashboard'].includes(name))
        throw new TypeError(`[report] ${extension.id} renders view kind ${name} that no extension registers`)
    }
  }
  const middlewares = list.flatMap(extension => extension.dataProvider ? [extension.dataProvider] : [])
  const runtime: ReportRuntimeModel = {
    ...model,
    cardRenderers,
    viewRenderers,
    exporters: list.flatMap(extension => extension.exporters ?? []),
    provider: base => middlewares.reduce((next, wrap) => wrap(next), base),
  }
  MODELS.set(extensions, runtime)
  return runtime
}
