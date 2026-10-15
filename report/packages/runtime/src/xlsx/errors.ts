/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义 xlsx 写出时抛出的错误：错误码与参数，不带文案。

/** xlsx 写出的错误码。 */
export type XlsxErrorCode
  = | 'compression-unavailable'
    | 'duplicate-sheet-name'
    | 'empty-workbook'
    | 'invalid-merge'
    | 'invalid-sheet-name'

/** xlsx 写出错误：message 即错误码，定位放在 params 里。 */
export class XlsxError extends Error {
  readonly code: XlsxErrorCode
  readonly params: Readonly<Record<string, unknown>>

  constructor(code: XlsxErrorCode, params: Readonly<Record<string, unknown>> = {}) {
    super(code)
    this.name = 'XlsxError'
    this.code = code
    this.params = params
  }
}
