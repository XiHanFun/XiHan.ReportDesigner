/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 绑定报表时区的日期工具：读法与分桶键取自 @xihan-ui/core/date，报错换成报表的错误码。

import type { WallClockParts } from '@xihan-ui/core/date'
import type { DateBucket } from '../schema'
import { bucketKey, isValidTimeZone, wallClock, wallClockParts } from '@xihan-ui/core/date'
import { ReportComputeError } from './errors'

/** 绑定了时区的日期工具。 */
export interface DateTools {
  /** 日期值的墙上时间各部分，字符串里没写到的部分为 null；缺失值为 null。 */
  readonly parts: (value: unknown) => WallClockParts | null
  /** 日期值按粒度取键；缺失值为 null。 */
  readonly bucket: (value: unknown, bucket: DateBucket) => string | null
  /**
   * 日期值写成可按字符串比较的墙上时间：date 写到日（YYYY-MM-DD），
   * datetime 写到毫秒（YYYY-MM-DDTHH:mm:ss.sss）；没写到的部分取最小值。缺失值为 null。
   */
  readonly wallClock: (value: unknown, type: 'date' | 'datetime') => string | null
}

/**
 * 建一组绑定时区的日期工具。
 * 日期值可以是 ISO 8601 字符串（可只写到年或月）、毫秒时间戳或 Date：不带时区偏移的字符串按写下的墙上时间取，
 * 带偏移或 Z 的字符串、时间戳与 Date 是时刻，换算到 timeZone（IANA 名，缺省 UTC）的墙上时间。
 * 时区不认识时抛出 invalid-time-zone；值不是日期、或字符串没写到粒度所需的部分时抛出 invalid-date-value。
 */
export function createDateTools(timeZone = 'UTC'): DateTools {
  const options = { timeZone }
  let zoneChecked = false

  function guard<T>(value: unknown, read: () => T, params: Readonly<Record<string, unknown>> = {}): T {
    if (!zoneChecked) {
      if (!isValidTimeZone(timeZone))
        throw new ReportComputeError('invalid-time-zone', { timeZone })
      zoneChecked = true
    }
    try {
      return read()
    }
    catch (error) {
      throw new ReportComputeError('invalid-date-value', { value, ...params }, { cause: error })
    }
  }

  return {
    parts: value => guard(value, () => wallClockParts(value, options)),
    bucket: (value, bucket) => guard(value, () => bucketKey(value, bucket, options), { bucket }),
    wallClock: (value, type) => guard(value, () => wallClock(value, type, options)),
  }
}
