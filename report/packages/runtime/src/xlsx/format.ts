/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表的值格式换成 Excel 数字格式代码，日期换成 Excel 序列值。

import type { DateFormat, DateParts, NumberFormat } from '@xihan-report/core'

const CURRENCY_SYMBOLS: Readonly<Record<string, string>> = {
  CNY: '¥',
  JPY: '¥',
  USD: '$',
  EUR: '€',
  GBP: '£',
  HKD: 'HK$',
  TWD: 'NT$',
  KRW: '₩',
}

const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW'])

const UNIT_SYMBOLS: Readonly<Record<string, string>> = {
  percent: '%',
  kilogram: 'kg',
  gram: 'g',
  meter: 'm',
  kilometer: 'km',
  centimeter: 'cm',
  liter: 'L',
  byte: 'B',
  kilobyte: 'kB',
  megabyte: 'MB',
  gigabyte: 'GB',
  second: 's',
  minute: 'min',
  hour: 'h',
  day: 'd',
}

function quote(text: string): string {
  return `"${text.replace(/"/g, '""')}"`
}

function decimals(digits: number): string {
  return digits > 0 ? `.${'0'.repeat(digits)}` : ''
}

function fixedDigits(format: NumberFormat): number | null {
  const precision = format.precision
  return precision !== undefined && precision !== 'auto' && precision.type === 'fixed' ? precision.digits : null
}

function body(format: NumberFormat): string | null {
  const digits = fixedDigits(format)
  if (format.notation === 'scientific')
    return `0${decimals(digits ?? 2)}E+00`
  if (format.notation === 'engineering')
    return `##0${decimals(digits ?? 1)}E+0`
  switch (format.style ?? 'decimal') {
    case 'percent':
      return `0${decimals(digits ?? 0)}%`
    case 'currency': {
      const code = (format.currency ?? '').toUpperCase()
      const symbol = CURRENCY_SYMBOLS[code] ?? `${code} `
      return `${quote(symbol)}#,##0${decimals(digits ?? (ZERO_DECIMAL_CURRENCIES.has(code) ? 0 : 2))}`
    }
    case 'unit': {
      const unit = format.unit ?? ''
      const number = digits === null ? 'General' : `#,##0${decimals(digits)}`
      return unit === 'percent' ? `${number}%` : `${number}${quote(` ${UNIT_SYMBOLS[unit] ?? unit}`)}`
    }
    default:
      return digits === null ? null : `#,##0${decimals(digits)}`
  }
}

/**
 * 数字格式换成 Excel 格式代码；没有格式时为 General。
 * 小数位按 precision 的 fixed 取，其余按样式缺省（百分比 0 位、货币 2 位，日元、韩元 0 位）；
 * 紧凑记数与有效数字在 Excel 里没有对应写法，按普通数字写出；signDisplay 换成正负零三段格式。
 */
export function numberFormatCode(format: NumberFormat | undefined): string {
  if (!format)
    return 'General'
  const main = body(format) ?? 'General'
  switch (format.signDisplay) {
    case 'always':
      return `+${main};-${main};+${main}`
    case 'exceptZero':
      return `+${main};-${main};${main}`
    case 'never':
      return `${main};${main};${main}`
    default:
      return main
  }
}

function datePart(format: DateFormat): string {
  const parts: string[] = []
  if (format.year !== undefined || format.month !== undefined || format.day !== undefined) {
    if (format.year !== undefined)
      parts.push(format.year === '2-digit' ? 'yy' : 'yyyy')
    if (format.month !== undefined)
      parts.push({ 'numeric': 'm', '2-digit': 'mm', 'short': 'mmm', 'narrow': 'mmmmm', 'long': 'mmmm' }[format.month])
    if (format.day !== undefined)
      parts.push(format.day === '2-digit' ? 'dd' : 'd')
    return parts.join('-')
  }
  return format.dateStyle !== undefined ? 'yyyy-mm-dd' : ''
}

function timePart(format: DateFormat): string {
  if (format.hour !== undefined || format.minute !== undefined || format.second !== undefined) {
    const parts: string[] = []
    if (format.hour !== undefined)
      parts.push(format.hour === '2-digit' || !format.hour12 ? 'hh' : 'h')
    if (format.minute !== undefined)
      parts.push('mm')
    if (format.second !== undefined)
      parts.push('ss')
    return parts.join(':') + (format.hour12 ? ' AM/PM' : '')
  }
  if (format.timeStyle === undefined)
    return ''
  return (format.timeStyle === 'short' ? 'hh:mm' : 'hh:mm:ss') + (format.hour12 ? ' AM/PM' : '')
}

/**
 * 日期格式换成 Excel 格式代码。年月日按 year / month / day 拼成 yyyy-mm-dd 次序，时分秒按 hour / minute / second
 * 或 timeStyle 取；什么都没写时 date 字段为 yyyy-mm-dd，datetime 字段为 yyyy-mm-dd hh:mm:ss。
 */
export function dateFormatCode(format: DateFormat | undefined, type: 'date' | 'datetime'): string {
  const fallback = type === 'date' ? 'yyyy-mm-dd' : 'yyyy-mm-dd hh:mm:ss'
  if (!format)
    return fallback
  const date = datePart(format)
  const time = timePart(format)
  const weekday = format.weekday === undefined ? '' : format.weekday === 'long' ? 'dddd ' : 'ddd '
  const code = [date, time].filter(part => part !== '').join(' ')
  return code === '' ? (weekday === '' ? fallback : weekday.trim()) : weekday + code
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
