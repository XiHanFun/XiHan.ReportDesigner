/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ReportOperation } from './types'

/**
 * 操作失败的原因：
 * - not-found：操作指向的数据集、字段、参数、卡片、联动或列表项不存在；
 * - not-dashboard：看板操作而报表主体不是看板；
 * - invalid-target：视图操作指向的不是视图，或列表不属于这个视图、查询或图表；
 * - protected-path：修改了只能用专门操作改的属性（如 id、kind、layout）；
 * - duplicate-key：新增、改名或替换使同一数组里出现重复的 id / name；
 * - 其余同 designer-kit 的路径编辑操作：invalid-operation、invalid-path、path-not-found、invalid-value、
 *   not-an-array、index-out-of-range。
 */
export type ReportOperationErrorCode
  = | 'not-found'
    | 'not-dashboard'
    | 'invalid-target'
    | 'protected-path'
    | 'duplicate-key'
    | 'invalid-operation'
    | 'invalid-path'
    | 'path-not-found'
    | 'invalid-value'
    | 'not-an-array'
    | 'index-out-of-range'

/** 操作无法应用时抛出的错误：message 即错误码，输入文档保持不变。 */
export class ReportOperationError extends Error {
  readonly code: ReportOperationErrorCode
  readonly operation: ReportOperation

  constructor(code: ReportOperationErrorCode, operation: ReportOperation, options?: ErrorOptions) {
    super(code, options)
    this.name = 'ReportOperationError'
    this.code = code
    this.operation = operation
  }
}
