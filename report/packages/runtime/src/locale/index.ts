/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// @xihan-report/runtime/locale —— 报表的内建语言包，语言与 UI 的内建语言包一一对应。
//
// 每份含查看器、设计器与设计器零件（designer-shell）的文案，宿主用 mergeXhConfig 与 UI 同一语言的
// 语言包合并后交给 setXhConfig 或 <xh-config>。每种语言是独立的具名导出，打包器按引用摇树。

import type {} from '../designer-translations'
import type {} from '../translations'

export { reportDeDE } from './de-DE'
export { reportEnUS } from './en-US'
export { reportEsES } from './es-ES'
export { reportFrFR } from './fr-FR'
export { reportJaJP } from './ja-JP'
export { reportKoKR } from './ko-KR'
export { reportPtBR } from './pt-BR'
export { reportRuRU } from './ru-RU'
export { reportZhCN } from './zh-CN'
export { reportZhTW } from './zh-TW'
