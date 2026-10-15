/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表的格式说明换成 Excel 数字格式代码，日期换成 Excel 序列值。

import type { DateFormatSpec, DateParts, FormatSpec } from '@xihan-report/core'

const DATE_TOKENS: readonly (readonly [string, string])[] = [
  ['yyyy', 'yyyy'],
  ['SSS', '000'],
  ['yy', 'yy'],
  ['MM', 'mm'],
  ['dd', 'dd'],
  ['HH', 'hh'],
  ['mm', 'mm'],
  ['ss', 'ss'],
  ['M', 'm'],
  ['d', 'd'],
  ['H', 'h'],
  ['m', 'm'],
  ['s', 's'],
]

const PLAIN_LITERALS = new Set(['-', '/', ':', '.', ',', ' '])

function digits(count: number, char: string): string {
  return char.repeat(Math.max(0, count))
}

function quote(text: string): string {
  return `"${text.replace(/"/g, '\\"')}"`
}

/**
 * 数字与百分比格式换成 Excel 格式代码；其余格式说明或没有格式时为 General。
 * - decimals 固定小数位；
 * - maxDecimals：minDecimals 不小于 1 时写成必显位加可省位（如 0.0##），为 0 时按 maxDecimals 位固定写出，
 *   因为 Excel 在可省位全部省去时会留下小数点；
 * - 都不给（不舍入）时为 General，此时不写千分位；
 * - 舍入方式在 Excel 里不可选，Excel 一律四舍五入。
 */
export function numberFormatCode(format: FormatSpec | undefined): string {
  if (!format || (format.kind !== 'number' && format.kind !== 'percent'))
    return 'General'
  const suffix = format.kind === 'percent' ? '%' : ''
  const integer = format.grouping ? '#,##0' : '0'
  let fraction: string
  if (format.decimals !== undefined)
    fraction = digits(format.decimals, '0')
  else if (format.maxDecimals !== undefined && (format.minDecimals ?? 0) >= 1)
    fraction = digits(format.minDecimals!, '0') + digits(format.maxDecimals - format.minDecimals!, '#')
  else if (format.maxDecimals !== undefined)
    fraction = digits(format.maxDecimals, '0')
  else
    return format.kind === 'percent' ? '0%' : 'General'
  return `${integer}${fraction === '' ? '' : `.${fraction}`}${suffix}`
}

function datePattern(pattern: string): string {
  let out = ''
  let literal = ''
  const flush = (): void => {
    if (literal !== '') {
      out += [...literal].every(char => PLAIN_LITERALS.has(char)) ? literal : quote(literal)
      literal = ''
    }
  }
  let index = 0
  while (index < pattern.length) {
    const char = pattern[index]!
    if (char === '\'') {
      if (pattern[index + 1] === '\'') {
        literal += '\''
        index += 2
        continue
      }
      let end = index + 1
      while (end < pattern.length) {
        if (pattern[end] === '\'' && pattern[end + 1] === '\'') {
          literal += '\''
          end += 2
          continue
        }
        if (pattern[end] === '\'')
          break
        literal += pattern[end]
        end++
      }
      index = end + 1
      continue
    }
    const token = DATE_TOKENS.find(([name]) => pattern.startsWith(name, index))
    if (token) {
      flush()
      out += token[1]
      index += token[0].length
    }
    else {
      literal += char
      index++
    }
  }
  flush()
  return out
}

/**
 * 日期格式换成 Excel 格式代码：模式串的占位符换成 Excel 的写法（MM → mm、HH → hh、SSS → 000），
 * 单引号括起的内容与其余文字写成 Excel 的字面文本。没有格式时 date 字段为 yyyy-mm-dd，datetime 字段为 yyyy-mm-dd hh:mm:ss。
 */
export function dateFormatCode(format: DateFormatSpec | undefined, type: 'date' | 'datetime'): string {
  if (!format)
    return type === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm:ss'
  return datePattern(format.pattern)
}

/**
 * 墙上时间换成 Excel 序列值（1900 日期系统，1899-12-30 为 0，小数部分是一天里的时刻）。
 * 1900-03-01 之前的日期按 Excel 的计数减一；1900-01-01 之前的日期没有序列值，返回 null。
 */
export function excelSerial(parts: DateParts): number | null {
  const time = Date.UTC(2000, (parts.month ?? 1) - 1, parts.day ?? 1, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0, parts.millisecond ?? 0)
  const date = new Date(time)
  date.setUTCFullYear(parts.year, (parts.month ?? 1) - 1, parts.day ?? 1)
  const serial = date.getTime() / 86_400_000 + 25_569
  if (serial < 2)
    return null
  return serial < 61 ? serial - 1 : serial
}
