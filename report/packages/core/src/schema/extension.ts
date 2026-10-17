/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义模板里各扩展自己的数据，以及扩展登记的种类名。

import type { JsonObject } from '@xihan-ui/core/json'

/** 扩展登记的卡片与视图种类名：扩展 id 的末段、一个点、名字，如 gantt.timeline。内置种类不带点。 */
export type ReportExtensionKind = `${string}.${string}`

/** 对象上各扩展自己的数据：键是扩展 id，值归那个扩展；校验只查它与每一块都是对象，里面不看。 */
export type ReportExtensionData = Readonly<Record<string, JsonObject>>

/** 能带扩展数据的对象：文档、数据集、字段、参数、视图、卡片、各列表项与联动。 */
export interface ReportExtensible {
  /** 各扩展自己的数据：键是扩展 id，值是 JSON 对象；编辑与剪贴板原样带过去。 */
  readonly extensions?: ReportExtensionData
}
