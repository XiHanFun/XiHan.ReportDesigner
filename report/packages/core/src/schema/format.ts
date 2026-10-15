/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义值的格式说明：与 @xihan-ui/expression 的 formatValue 规格一致，这里只有类型，格式化由使用方调用 formatValue。

/** 舍入方式：四舍五入（缺省）、四舍六入五成双、向下、向上、截断。 */
export type FormatRounding = 'half-up' | 'half-even' | 'floor' | 'ceil' | 'down'

/**
 * 数字格式：
 * - decimals：固定小数位，不足补 0，不能与 minDecimals / maxDecimals 同时给；
 * - 或 minDecimals / maxDecimals：舍入到最多 maxDecimals 位，再去掉末尾的 0，至少保留 minDecimals 位；
 * - 都不给时不舍入。
 */
export interface NumberFormatSpec {
  readonly kind: 'number'
  readonly decimals?: number
  readonly minDecimals?: number
  readonly maxDecimals?: number
  /** 每三位加千分位，缺省 false。 */
  readonly grouping?: boolean
  readonly rounding?: FormatRounding
}

/** 百分比：先乘 100，再按数字格式输出并接上 %。 */
export interface PercentFormatSpec extends Omit<NumberFormatSpec, 'kind'> {
  readonly kind: 'percent'
}

/** 日期：按模式输出，占位符为 yyyy yy MM M dd d HH H mm m ss s SSS，单引号括起的内容原样输出。 */
export interface DateFormatSpec {
  readonly kind: 'date'
  readonly pattern: string
}

/** 人民币大写：舍入到分。 */
export interface RmbUpperFormatSpec {
  readonly kind: 'rmb-upper'
  readonly rounding?: FormatRounding
}

/** 格式说明。 */
export type FormatSpec = NumberFormatSpec | PercentFormatSpec | DateFormatSpec | RmbUpperFormatSpec

/** 图表数值用的格式说明：数字或百分比。 */
export type NumericFormatSpec = NumberFormatSpec | PercentFormatSpec

/** 全部舍入方式。 */
export const FORMAT_ROUNDINGS: readonly FormatRounding[] = ['half-up', 'half-even', 'floor', 'ceil', 'down']

/** 小数位数的上限。 */
export const FORMAT_DECIMALS_LIMIT = 34
