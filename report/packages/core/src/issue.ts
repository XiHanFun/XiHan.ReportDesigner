/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义问题的统一形状：问题码、定位与参数，不带文案。

import type { ScalarValue } from './schema'

/**
 * 定位路径：字符串段是对象的属性名，或数组里带 id（没有 id 时取 name）的那一项；
 * 数字段是数组里不带 id 与 name 的项的下标。
 */
export type ReportPath = readonly (string | number)[]

/** 一个问题。 */
export interface ReportIssue<Code extends string = string> {
  readonly code: Code
  readonly path: ReportPath
  readonly params?: Readonly<Record<string, ScalarValue>>
}
