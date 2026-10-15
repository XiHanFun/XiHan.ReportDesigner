/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义值的显示格式：数字格式与日期格式，取值与 XiHan.UI 图表的格式参数一致。

/** 数字格式，去掉 kind 即是图表的数字格式参数。 */
export interface NumberFormat {
  readonly kind: 'number'
  readonly style?: 'decimal' | 'percent' | 'currency' | 'unit'
  /** compact 即紧凑记数。 */
  readonly notation?: 'standard' | 'compact' | 'scientific' | 'engineering'
  /** ISO 4217 货币代码，style 为 currency 时必填。 */
  readonly currency?: string
  /** Intl 单位名，style 为 unit 时必填。 */
  readonly unit?: string
  /** 缺省 auto。 */
  readonly precision?: 'auto' | { readonly type: 'fixed' | 'significant', readonly digits: number }
  readonly signDisplay?: 'auto' | 'always' | 'exceptZero' | 'never'
}

/** 日期格式，去掉 kind 即是 Intl 日期格式参数。 */
export interface DateFormat {
  readonly kind: 'date'
  readonly dateStyle?: 'full' | 'long' | 'medium' | 'short'
  readonly timeStyle?: 'full' | 'long' | 'medium' | 'short'
  readonly year?: 'numeric' | '2-digit'
  readonly month?: 'numeric' | '2-digit' | 'long' | 'short' | 'narrow'
  readonly day?: 'numeric' | '2-digit'
  readonly weekday?: 'long' | 'short' | 'narrow'
  readonly hour?: 'numeric' | '2-digit'
  readonly minute?: 'numeric' | '2-digit'
  readonly second?: 'numeric' | '2-digit'
  readonly hour12?: boolean
  /** IANA 时区名。 */
  readonly timeZone?: string
}

export type ValueFormat = NumberFormat | DateFormat
