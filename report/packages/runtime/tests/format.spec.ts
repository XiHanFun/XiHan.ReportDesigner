/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, expect, it } from 'vitest'
import { dateFormatCode, excelSerial, numberFormatCode } from '../src/xlsx'

describe('numberFormatCode', () => {
  it('没有格式或自动精度的普通数字为 General', () => {
    expect(numberFormatCode(undefined)).toBe('General')
    expect(numberFormatCode({ kind: 'number' })).toBe('General')
    expect(numberFormatCode({ kind: 'number', notation: 'compact' })).toBe('General')
    expect(numberFormatCode({ kind: 'number', precision: { type: 'significant', digits: 3 } })).toBe('General')
  })

  it('固定小数位、百分比、货币与单位', () => {
    expect(numberFormatCode({ kind: 'number', precision: { type: 'fixed', digits: 2 } })).toBe('#,##0.00')
    expect(numberFormatCode({ kind: 'number', precision: { type: 'fixed', digits: 0 } })).toBe('#,##0')
    expect(numberFormatCode({ kind: 'number', style: 'percent' })).toBe('0%')
    expect(numberFormatCode({ kind: 'number', style: 'percent', precision: { type: 'fixed', digits: 1 } })).toBe('0.0%')
    expect(numberFormatCode({ kind: 'number', style: 'currency', currency: 'CNY' })).toBe('"¥"#,##0.00')
    expect(numberFormatCode({ kind: 'number', style: 'currency', currency: 'jpy' })).toBe('"¥"#,##0')
    expect(numberFormatCode({ kind: 'number', style: 'currency', currency: 'CHF' })).toBe('"CHF "#,##0.00')
    expect(numberFormatCode({ kind: 'number', style: 'unit', unit: 'kilogram', precision: { type: 'fixed', digits: 1 } })).toBe('#,##0.0" kg"')
    expect(numberFormatCode({ kind: 'number', style: 'unit', unit: 'furlong' })).toBe('General" furlong"')
  })

  it('科学记数与符号显示', () => {
    expect(numberFormatCode({ kind: 'number', notation: 'scientific' })).toBe('0.00E+00')
    expect(numberFormatCode({ kind: 'number', notation: 'engineering' })).toBe('##0.0E+0')
    expect(numberFormatCode({ kind: 'number', style: 'percent', signDisplay: 'always' })).toBe('+0%;-0%;+0%')
    expect(numberFormatCode({ kind: 'number', precision: { type: 'fixed', digits: 1 }, signDisplay: 'exceptZero' })).toBe('+#,##0.0;-#,##0.0;#,##0.0')
    expect(numberFormatCode({ kind: 'number', signDisplay: 'never' })).toBe('General;General;General')
  })
})

describe('dateFormatCode', () => {
  it('没有格式时按字段类型', () => {
    expect(dateFormatCode(undefined, 'date')).toBe('yyyy-mm-dd')
    expect(dateFormatCode(undefined, 'datetime')).toBe('yyyy-mm-dd hh:mm:ss')
    expect(dateFormatCode({ kind: 'date' }, 'date')).toBe('yyyy-mm-dd')
  })

  it('按年月日时分秒与样式拼出格式', () => {
    expect(dateFormatCode({ kind: 'date', year: 'numeric', month: '2-digit' }, 'date')).toBe('yyyy-mm')
    expect(dateFormatCode({ kind: 'date', month: 'long', day: 'numeric' }, 'date')).toBe('mmmm-d')
    expect(dateFormatCode({ kind: 'date', dateStyle: 'medium', timeStyle: 'short' }, 'datetime')).toBe('yyyy-mm-dd hh:mm')
    expect(dateFormatCode({ kind: 'date', hour: 'numeric', minute: '2-digit', hour12: true }, 'datetime')).toBe('h:mm AM/PM')
    expect(dateFormatCode({ kind: 'date', weekday: 'long', dateStyle: 'short' }, 'date')).toBe('dddd yyyy-mm-dd')
  })
})

describe('excelSerial', () => {
  it('按 1900 日期系统换算，时刻是小数部分', () => {
    expect(excelSerial({ year: 2026, month: 10, day: 16, hour: null, minute: null, second: null, millisecond: null })).toBe(46311)
    expect(excelSerial({ year: 2026, month: 10, day: 16, hour: 12, minute: 0, second: 0, millisecond: 0 })).toBe(46311.5)
    expect(excelSerial({ year: 2026, month: 1, day: null, hour: null, minute: null, second: null, millisecond: null })).toBe(46023)
  })

  it('1900-03-01 之前减一，1900 年之前没有序列值', () => {
    expect(excelSerial({ year: 1900, month: 1, day: 1, hour: null, minute: null, second: null, millisecond: null })).toBe(1)
    expect(excelSerial({ year: 1900, month: 2, day: 28, hour: null, minute: null, second: null, millisecond: null })).toBe(59)
    expect(excelSerial({ year: 1900, month: 3, day: 1, hour: null, minute: null, second: null, millisecond: null })).toBe(61)
    expect(excelSerial({ year: 1899, month: 12, day: 31, hour: null, minute: null, second: null, millisecond: null })).toBeNull()
  })
})
