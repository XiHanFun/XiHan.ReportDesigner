/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, expect, it } from 'vitest'
import { createDateTools, ReportComputeError } from '../src'

const utc = createDateTools()
const shanghai = createDateTools('Asia/Shanghai')

function failure(run: () => unknown): [string, unknown] | undefined {
  try {
    run()
  }
  catch (error) {
    return error instanceof ReportComputeError ? [error.code, error.params] : ['other', error]
  }
  return undefined
}

describe('createDateTools', () => {
  it('缺省按 UTC，时刻换算到绑定的时区', () => {
    const instant = Date.UTC(2026, 9, 15, 20)
    expect(utc.bucket(instant, 'day')).toBe('2026-10-15')
    expect(shanghai.bucket(instant, 'day')).toBe('2026-10-16')
    expect(shanghai.wallClock(instant, 'datetime')).toBe('2026-10-16T04:00:00.000')
    expect(shanghai.parts('2026-10')).toMatchObject({ year: 2026, month: 10, day: null })
  })

  it('不带偏移的字符串按写下的墙上时间取，与时区无关', () => {
    expect(shanghai.bucket('2026-10-16T23:30:00', 'day')).toBe('2026-10-16')
    expect(utc.bucket('2026-10-16', 'week')).toBe('2026-W42')
  })

  it('缺失值为 null', () => {
    expect(utc.bucket(null, 'day')).toBeNull()
    expect(utc.wallClock(new Date('invalid'), 'date')).toBeNull()
    expect(utc.parts(undefined)).toBeNull()
  })

  it('不是日期的值与精度不够的字符串抛出 invalid-date-value，带上值与粒度', () => {
    expect(failure(() => utc.bucket('abc', 'day'))).toEqual(['invalid-date-value', { value: 'abc', bucket: 'day' }])
    expect(failure(() => utc.bucket(true, 'day'))?.[0]).toBe('invalid-date-value')
    expect(failure(() => utc.parts('2026-02-30'))).toEqual(['invalid-date-value', { value: '2026-02-30' }])
    expect(failure(() => utc.wallClock(Number.POSITIVE_INFINITY, 'date'))?.[0]).toBe('invalid-date-value')
    expect(failure(() => utc.bucket('2026-10', 'day'))).toEqual(['invalid-date-value', { value: '2026-10', bucket: 'day' }])
    expect(utc.bucket('2026-10', 'quarter')).toBe('2026-Q4')
  })

  it('不认识的时区抛出 invalid-time-zone', () => {
    expect(failure(() => createDateTools('Mars/Olympus').bucket(0, 'day'))).toEqual(['invalid-time-zone', { timeZone: 'Mars/Olympus' }])
    expect(failure(() => createDateTools('Mars/Olympus').parts('2026-10-16'))?.[0]).toBe('invalid-time-zone')
  })
})
