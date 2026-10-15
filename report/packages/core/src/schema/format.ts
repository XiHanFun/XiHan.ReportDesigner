/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 值的格式说明：使用 @xihan-ui/expression 的 formatValue 规格，core 只保存格式说明，格式化由使用方调用 formatValue。

import type { FormatRounding, NumberFormatSpec, PercentFormatSpec } from '@xihan-ui/expression'

export type {
  DateFormatSpec,
  FormatRounding,
  FormatSpec,
  NumberFormatSpec,
  PercentFormatSpec,
  RmbUpperFormatSpec,
} from '@xihan-ui/expression'

/** 图表数值用的格式说明：数字或百分比。 */
export type NumericFormatSpec = NumberFormatSpec | PercentFormatSpec

/** 全部舍入方式。 */
export const FORMAT_ROUNDINGS: readonly FormatRounding[] = ['half-up', 'half-even', 'floor', 'ceil', 'down']

/** 小数位数的上限。 */
export const FORMAT_DECIMALS_LIMIT = 34
