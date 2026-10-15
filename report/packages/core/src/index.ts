/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导出 @xihanfun/report-core 的公共接口。

export * from './engine'
export type { ReportIssue, ReportPath } from './issue'
export { applyOperation, applyOperations, itemKey, readPath, ReportOperationError } from './operations'
export type { ReportOperation, ReportOperationErrorCode, ReportOperationResult } from './operations'
export * from './schema'
export * from './validate'
