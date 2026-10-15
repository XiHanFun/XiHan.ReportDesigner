/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 日期值的解析、按粒度取键与墙上时间规范化。

import type { DateBucket } from '../schema'
import { isValidTimeZone, PlainDate, PlainDateTime, ZonedDateTime } from '@xihan-ui/core/date'
import { ReportComputeError } from './errors'
import { isMissing } from './value'

/**
 * 日期值的墙上时间各部分；字符串里没写到的部分为 null。
 */
export interface DateParts {
  readonly year: number
  readonly month: number | null
  readonly day: number | null
  readonly hour: number | null
  readonly minute: number | null
  readonly second: number | null
  readonly millisecond: number | null
}

/** 绑定了时区的日期工具。 */
export interface DateTools {
  /** 日期值的墙上时间各部分；缺失值为 null。 */
  readonly parts: (value: unknown) => DateParts | null
  /** 日期值按粒度取键；缺失值为 null。 */
  readonly bucket: (value: unknown, bucket: DateBucket) => string | null
  /**
   * 日期值写成可按字符串比较的墙上时间：date 写到日（YYYY-MM-DD），
   * datetime 写到毫秒（YYYY-MM-DDTHH:mm:ss.sss）；没写到的部分取最小值。缺失值为 null。
   */
  readonly wallClock: (value: unknown, type: 'date' | 'datetime') => string | null
}

const ISO_PATTERN = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?)?)?)?$/

function pad(value: number, length: number): string {
  return String(value).padStart(length, '0')
}

function offsetMilliseconds(zone: string): number {
  if (zone === 'Z')
    return 0
  const digits = zone.slice(1).replace(':', '')
  const minutes = Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2) || '0')
  return (zone.startsWith('-') ? -minutes : minutes) * 60_000
}

function invalid(value: unknown, params: Readonly<Record<string, unknown>> = {}): ReportComputeError {
  return new ReportComputeError('invalid-date-value', { value, ...params })
}

function bucketKey(parts: DateParts, bucket: DateBucket, value: unknown): string {
  const year = pad(parts.year, 4)
  if (bucket === 'year')
    return year
  if (parts.month === null)
    throw invalid(value, { bucket })
  if (bucket === 'quarter')
    return `${year}-Q${Math.ceil(parts.month / 3)}`
  const month = `${year}-${pad(parts.month, 2)}`
  if (bucket === 'month')
    return month
  if (parts.day === null)
    throw invalid(value, { bucket })
  if (bucket === 'week') {
    const date = new PlainDate(parts.year, parts.month, parts.day)
    return `${pad(date.yearOfWeek, 4)}-W${pad(date.weekOfYear, 2)}`
  }
  const day = `${month}-${pad(parts.day, 2)}`
  if (bucket === 'day')
    return day
  if (parts.hour === null)
    throw invalid(value, { bucket })
  return `${day}T${pad(parts.hour, 2)}`
}

/**
 * 建一组绑定时区的日期工具。
 * 日期值可以是 ISO 8601 字符串、毫秒时间戳或 Date：不带时区偏移的字符串按写下的墙上时间取，
 * 带偏移或 Z 的字符串、时间戳与 Date 是时刻，换算到 timeZone（IANA 名，缺省 UTC）的墙上时间。
 * 其它值抛出 invalid-date-value。
 */
export function createDateTools(timeZone = 'UTC'): DateTools {
  let zoneChecked = false

  function zonedParts(time: number): DateParts {
    if (!zoneChecked) {
      if (!isValidTimeZone(timeZone))
        throw new ReportComputeError('invalid-time-zone', { timeZone })
      zoneChecked = true
    }
    let wall: PlainDateTime
    try {
      wall = PlainDateTime.fromDate(time, timeZone)
    }
    catch (error) {
      throw new ReportComputeError('invalid-date-value', { value: time }, { cause: error })
    }
    return { year: wall.year, month: wall.month, day: wall.day, hour: wall.hour, minute: wall.minute, second: wall.second, millisecond: wall.millisecond }
  }

  function parseString(value: string): DateParts {
    const match = ISO_PATTERN.exec(value)
    if (!match)
      throw invalid(value)
    const [, y, mo, d, h, mi, s, ms, zone] = match
    const year = Number(y)
    const month = mo === undefined ? null : Number(mo)
    if (month !== null && (month < 1 || month > 12))
      throw invalid(value)
    if (d === undefined)
      return { year, month, day: null, hour: null, minute: null, second: null, millisecond: null }
    const local = zone === undefined ? value : value.slice(0, value.length - zone.length)
    let wall: PlainDateTime
    try {
      wall = PlainDateTime.from(local)
    }
    catch (error) {
      throw new ReportComputeError('invalid-date-value', { value }, { cause: error })
    }
    if (zone !== undefined)
      return zonedParts(ZonedDateTime.fromPlainDateTime(wall, 'UTC').epochMilliseconds - offsetMilliseconds(zone))
    return {
      year,
      month,
      day: wall.day,
      hour: h === undefined ? null : wall.hour,
      minute: mi === undefined ? null : wall.minute,
      second: s === undefined ? null : wall.second,
      millisecond: ms === undefined ? null : wall.millisecond,
    }
  }

  function parts(value: unknown): DateParts | null {
    if (isMissing(value))
      return null
    if (typeof value === 'string')
      return parseString(value)
    if (typeof value === 'number') {
      if (!Number.isFinite(value))
        throw invalid(value)
      return zonedParts(value)
    }
    if (value instanceof Date)
      return zonedParts(value.getTime())
    throw invalid(value)
  }

  return {
    parts,
    bucket(value, bucket) {
      const p = parts(value)
      return p === null ? null : bucketKey(p, bucket, value)
    },
    wallClock(value, type) {
      const p = parts(value)
      if (p === null)
        return null
      const date = `${pad(p.year, 4)}-${pad(p.month ?? 1, 2)}-${pad(p.day ?? 1, 2)}`
      if (type === 'date')
        return date
      return `${date}T${pad(p.hour ?? 0, 2)}:${pad(p.minute ?? 0, 2)}:${pad(p.second ?? 0, 2)}.${pad(p.millisecond ?? 0, 3)}`
    },
  }
}
