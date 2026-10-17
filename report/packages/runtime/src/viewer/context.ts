/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 渲染各视图与卡片时共用的上下文：文案、显示文字与字段类型。

import type { DatasetSchema, FieldType, FormatSpec } from '@xihan-report/core'
import type { ReportViewerTranslations } from '../translations'
import type { ReportFormatContext, ReportFormatter } from './format'
import { displayText } from './format'

/** 渲染上下文。 */
export interface RenderContext {
  /** 查看器此刻生效的文案。 */
  readonly translations: ReportViewerTranslations
  /** 值的显示文字：缺失值写成 missing（缺省空串）。 */
  readonly text: (value: unknown, format: FormatSpec | undefined, type: FieldType | undefined, missing?: string) => string
  /** 维度成员的显示文字：缺失值写成语言包里的 missing。 */
  readonly member: (value: unknown, format: FormatSpec | undefined, type: FieldType | undefined) => string
}

/** 字段在数据集里的类型。 */
export function fieldType(dataset: DatasetSchema, field: string): FieldType | undefined {
  return dataset.fields.find(item => item.name === field)?.type
}

/** 字段的显示标题：数据集里写的标题，没有时为字段名。 */
export function fieldTitle(dataset: DatasetSchema, field: string): string {
  return dataset.fields.find(item => item.name === field)?.title ?? field
}

/** 建渲染上下文。 */
export function createRenderContext(translations: ReportViewerTranslations, formatter: ReportFormatter, locale: string | undefined, timeZone: string): RenderContext {
  const context = (type: FieldType | undefined): ReportFormatContext => ({ locale, timeZone, type })
  return {
    translations,
    text: (value, format, type, missing = '') => displayText(value, format, context(type), formatter, missing),
    member: (value, format, type) => displayText(value, format, context(type), formatter, translations.missing),
  }
}
