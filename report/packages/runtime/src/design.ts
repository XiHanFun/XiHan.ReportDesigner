/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// @xihan-report/runtime/design —— 设计器画布复用的计算与渲染：与查看器同一份代码，所见即所得。主入口不含这些。

export type { RenderedChart } from './viewer/charts'
export type { RenderContext } from './viewer/context'
export { createRenderContext } from './viewer/context'
export type { CardState } from './viewer/dashboard'
export { renderCard, renderDashboardFrame, renderView, tableLabel } from './viewer/dashboard'
export { defineViewerElements } from './viewer/elements'
export type { ParameterBarHandlers } from './viewer/parameters'
export { renderParameterControl } from './viewer/parameters'
export type { RenderedTable, TableCellRef } from './viewer/table'
