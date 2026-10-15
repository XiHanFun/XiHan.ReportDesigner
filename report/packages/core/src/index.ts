/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导出 @xihan-report/core 的公共接口。

export * from './engine'
export { clampToGrid, compactLayout, gridCollides, gridItems, layoutOperations, moveGridItem, placeGridItem, removeGridItem } from './grid'
export type { GridItem, GridOptions, GridPlacement } from './grid'
export type { ReportIssue, ReportPath } from './issue'
export { applyOperation, applyOperations, itemKey, readPath, ReportOperationError } from './operations'
export type { ReportOperation, ReportOperationErrorCode, ReportOperationResult } from './operations'
export * from './schema'
export * from './validate'
