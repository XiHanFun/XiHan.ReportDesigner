/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, expect, it } from 'vitest'
import { dateFormatCode, numberFormatCode } from '../src/xlsx'

describe('numberFormatCode', () => {
  it('没有格式、不舍入或不是数字类的格式为 General', () => {
    expect(numberFormatCode(undefined)).toBe('General')
    expect(numberFormatCode({ kind: 'number' })).toBe('General')
    expect(numberFormatCode({ kind: 'number', grouping: true })).toBe('General')
    expect(numberFormatCode({ kind: 'date', pattern: 'yyyy' })).toBe('General')
    expect(numberFormatCode({ kind: 'rmb-upper' })).toBe('General')
  })

  it('固定小数位与千分位', () => {
    expect(numberFormatCode({ kind: 'number', decimals: 2 })).toBe('0.00')
    expect(numberFormatCode({ kind: 'number', decimals: 2, grouping: true })).toBe('#,##0.00')
    expect(numberFormatCode({ kind: 'number', decimals: 0, grouping: true })).toBe('#,##0')
  })

  it('最少位不小于 1 时写可省位，为 0 时按最多位固定写出', () => {
    expect(numberFormatCode({ kind: 'number', minDecimals: 1, maxDecimals: 3 })).toBe('0.0##')
    expect(numberFormatCode({ kind: 'number', maxDecimals: 2, grouping: true })).toBe('#,##0.00')
    expect(numberFormatCode({ kind: 'number', minDecimals: 2, maxDecimals: 2 })).toBe('0.00')
  })

  it('百分比接 %，舍入方式不影响格式代码', () => {
    expect(numberFormatCode({ kind: 'percent' })).toBe('0%')
    expect(numberFormatCode({ kind: 'percent', decimals: 1, rounding: 'half-even' })).toBe('0.0%')
    expect(numberFormatCode({ kind: 'percent', minDecimals: 1, maxDecimals: 2, grouping: true })).toBe('#,##0.0#%')
  })
})

describe('dateFormatCode', () => {
  it('没有格式时按字段类型', () => {
    expect(dateFormatCode(undefined, 'date')).toBe('yyyy-mm-dd')
    expect(dateFormatCode(undefined, 'datetime')).toBe('yyyy-mm-dd hh:mm:ss')
  })

  it('占位符换成 Excel 写法', () => {
    expect(dateFormatCode({ kind: 'date', pattern: 'yyyy-MM-dd HH:mm:ss.SSS' }, 'datetime')).toBe('yyyy-mm-dd hh:mm:ss.000')
    expect(dateFormatCode({ kind: 'date', pattern: 'yy/M/d H:m:s' }, 'datetime')).toBe('yy/m/d h:m:s')
  })

  it('其余文字与单引号括起的内容写成字面文本', () => {
    expect(dateFormatCode({ kind: 'date', pattern: 'yyyy年M月d日' }, 'date')).toBe('yyyy"年"m"月"d"日"')
    expect(dateFormatCode({ kind: 'date', pattern: '\'Week\' dd' }, 'date')).toBe('"Week "dd')
    expect(dateFormatCode({ kind: 'date', pattern: 'HH \'o\'\'clock\'' }, 'datetime')).toBe('hh" o\'clock"')
    expect(dateFormatCode({ kind: 'date', pattern: 'd"x' }, 'date')).toBe('d"\\"x"')
  })
})
