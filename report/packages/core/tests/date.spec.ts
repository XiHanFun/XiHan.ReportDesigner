/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, expect, it } from 'vitest'
import { createDateTools, ReportComputeError } from '../src'

const utc = createDateTools()
const shanghai = createDateTools('Asia/Shanghai')

function codeOf(run: () => unknown): string | undefined {
  try {
    run()
  }
  catch (error) {
    return error instanceof ReportComputeError ? error.code : 'other'
  }
  return undefined
}

describe('bucket', () => {
  it('不带偏移的字符串按写下的墙上时间取键', () => {
    expect(utc.bucket('2026-10-16', 'year')).toBe('2026')
    expect(utc.bucket('2026-10-16', 'quarter')).toBe('2026-Q4')
    expect(utc.bucket('2026-10-16', 'month')).toBe('2026-10')
    expect(utc.bucket('2026-10-16', 'week')).toBe('2026-W42')
    expect(utc.bucket('2026-10-16', 'day')).toBe('2026-10-16')
    expect(utc.bucket('2026-10-16T08:30:00', 'hour')).toBe('2026-10-16T08')
    expect(shanghai.bucket('2026-10-16T23:30:00', 'day')).toBe('2026-10-16')
  })

  it('跨年的 ISO 周归到周四所在的年', () => {
    expect(utc.bucket('2021-01-01', 'week')).toBe('2020-W53')
    expect(utc.bucket('2024-12-30', 'week')).toBe('2025-W01')
    expect(utc.bucket('2026-01-01', 'week')).toBe('2026-W01')
  })

  it('带偏移的字符串、时间戳与 Date 是时刻，换算到时区的墙上时间', () => {
    expect(utc.bucket('2026-10-15T20:00:00Z', 'day')).toBe('2026-10-15')
    expect(shanghai.bucket('2026-10-15T20:00:00Z', 'day')).toBe('2026-10-16')
    expect(utc.bucket('2026-10-16T01:00:00+08:00', 'day')).toBe('2026-10-15')
    expect(utc.bucket('2026-10-16T01:00:00+0800', 'hour')).toBe('2026-10-15T17')
    const instant = Date.UTC(2026, 9, 15, 20)
    expect(shanghai.bucket(instant, 'day')).toBe('2026-10-16')
    expect(shanghai.bucket(new Date(instant), 'hour')).toBe('2026-10-16T04')
    expect(utc.bucket(new Date(instant), 'month')).toBe('2026-10')
  })

  it('缺失值取键为 null', () => {
    expect(utc.bucket(null, 'day')).toBeNull()
    expect(utc.bucket(undefined, 'month')).toBeNull()
    expect(utc.bucket(new Date('invalid'), 'month')).toBeNull()
  })

  it('不是日期的值与精度不够的字符串抛出 invalid-date-value', () => {
    expect(codeOf(() => utc.bucket('abc', 'day'))).toBe('invalid-date-value')
    expect(codeOf(() => utc.bucket(true, 'day'))).toBe('invalid-date-value')
    expect(codeOf(() => utc.bucket('2026-13-01', 'day'))).toBe('invalid-date-value')
    expect(codeOf(() => utc.bucket('2026-02-30', 'day'))).toBe('invalid-date-value')
    expect(codeOf(() => utc.bucket(Number.POSITIVE_INFINITY, 'day'))).toBe('invalid-date-value')
    expect(codeOf(() => utc.bucket('2026-10', 'day'))).toBe('invalid-date-value')
    expect(utc.bucket('2026-10', 'quarter')).toBe('2026-Q4')
  })

  it('不认识的时区抛出 invalid-time-zone', () => {
    expect(codeOf(() => createDateTools('Mars/Olympus').bucket(0, 'day'))).toBe('invalid-time-zone')
  })
})

describe('wallClock', () => {
  it('写成可比较的墙上时间，没写到的部分取最小值', () => {
    expect(utc.wallClock('2026-10', 'date')).toBe('2026-10-01')
    expect(utc.wallClock('2026-10-16', 'datetime')).toBe('2026-10-16T00:00:00.000')
    expect(utc.wallClock('2026-10-16T08:30:05.12', 'datetime')).toBe('2026-10-16T08:30:05.120')
    expect(shanghai.wallClock(Date.UTC(2026, 9, 15, 20, 0, 0, 7), 'datetime')).toBe('2026-10-16T04:00:00.007')
    expect(utc.wallClock(null, 'date')).toBeNull()
  })
})
