/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 值的显示文字：缺省格式化器按格式说明调 formatValue，日期字段写成时区里的墙上时间，其余写成文本。

import type { FieldType, FormatSpec } from '@xihan-report/core'
import { wallClock } from '@xihan-ui/core/date'
import { formatValue } from '@xihan-ui/expression'
import { isMissing } from '@xihan-ui/viz'

/** 格式化时的上下文。 */
export interface ReportFormatContext {
  /** BCP 47 语言标记；没有时按运行环境。 */
  readonly locale: string | undefined
  /** IANA 时区：日期按它的墙上时间写。 */
  readonly timeZone: string
  /** 值所在字段的类型；度量、按粒度取键的维度等没有字段类型时为 undefined。 */
  readonly type: FieldType | undefined
}

/** 把一个值写成显示文字；缺失值由查看器先行处理，不会传进来。 */
export type ReportFormatter = (value: unknown, format: FormatSpec | undefined, context: ReportFormatContext) => string

function plain(value: unknown): string {
  if (typeof value === 'string')
    return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint')
    return String(value)
  if (value instanceof Date)
    return value.toISOString()
  try {
    return JSON.stringify(value) ?? String(value)
  }
  catch {
    return String(value)
  }
}

/**
 * 缺省格式化器：有格式说明时用 formatValue（它拒绝的值退回原样文字）；date / datetime 字段写成 timeZone 里的墙上时间
 * （YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss）；数值按 locale 写千分位；其余写成文本。
 */
export const defaultFormatter: ReportFormatter = (value, format, context) => {
  if (format) {
    try {
      return formatValue(value, format, context.locale === undefined ? {} : { locale: context.locale })
    }
    catch {
      return plain(value)
    }
  }
  if (context.type === 'date' || context.type === 'datetime') {
    try {
      const text = wallClock(value, context.type, { timeZone: context.timeZone })
      if (text !== null)
        return context.type === 'date' ? text : text.slice(0, 19).replace('T', ' ')
    }
    catch {
      return plain(value)
    }
  }
  if (typeof value === 'number' && Number.isFinite(value))
    return value.toLocaleString(context.locale)
  return plain(value)
}

/** 值的显示文字，缺失值写成 missing。 */
export function displayText(value: unknown, format: FormatSpec | undefined, context: ReportFormatContext, formatter: ReportFormatter, missing: string): string {
  return isMissing(value) ? missing : formatter(value, format, context)
}
