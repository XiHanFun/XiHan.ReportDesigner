/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义计算过程中抛出的错误：错误码与参数，不带文案。

/** 计算错误码。 */
export type ComputeErrorCode
  = | 'aggregated-input-unsupported'
    | 'duplicate-card'
    | 'formula-compile-failed'
    | 'formula-cycle'
    | 'formula-engine-missing'
    | 'formula-evaluation-failed'
    | 'invalid-date-value'
    | 'invalid-filter-operand'
    | 'invalid-layout'
    | 'invalid-time-zone'
    | 'unknown-card'
    | 'unknown-dimension'
    | 'unknown-sort-key'

/** 计算错误：message 即错误码，定位与取值放在 params 里。 */
export class ReportComputeError extends Error {
  readonly code: ComputeErrorCode
  readonly params: Readonly<Record<string, unknown>>

  constructor(code: ComputeErrorCode, params: Readonly<Record<string, unknown>> = {}, options?: { cause?: unknown }) {
    super(code, options)
    this.name = 'ReportComputeError'
    this.code = code
    this.params = params
  }
}
