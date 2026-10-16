/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 查看器与 xlsx 导出共用的标题与类型推断：度量的标题、度量值与维度成员按哪种字段类型显示。

import type { DatasetSchema, Dimension, FieldType, Measure } from '@xihan-report/core'
import { isAggregateMeasure } from '@xihan-report/core'

function field(dataset: DatasetSchema, name: string): { readonly type: FieldType, readonly title?: string } | undefined {
  return dataset.fields.find(item => item.name === name)
}

/** 字段的标题：给了 title 用它，否则用数据集里的字段标题，再没有用字段名。 */
export function fieldLabel(dataset: DatasetSchema, name: string, title: string | undefined): string {
  return title ?? field(dataset, name)?.title ?? name
}

/** 度量的标题：度量的 title，聚合度量缺省取字段标题，其余取度量 id。 */
export function measureLabel(measure: Measure, dataset: DatasetSchema): string {
  if (measure.title !== undefined)
    return measure.title
  if (isAggregateMeasure(measure) && measure.field !== undefined)
    return fieldLabel(dataset, measure.field, undefined)
  return measure.id
}

/** 度量值按哪种字段类型显示：min / max 沿用字段类型，其余是数值（undefined）。 */
export function measureType(measure: Measure, dataset: DatasetSchema): FieldType | undefined {
  if (isAggregateMeasure(measure) && (measure.aggregate === 'min' || measure.aggregate === 'max') && measure.field !== undefined)
    return field(dataset, measure.field)?.type
  return undefined
}

/** 维度成员按哪种字段类型显示：按日期粒度取键的成员是文本（undefined）。 */
export function dimensionType(dimension: Dimension | { readonly field: string, readonly bucket?: unknown }, dataset: DatasetSchema): FieldType | undefined {
  return dimension.bucket ? undefined : field(dataset, dimension.field)?.type
}
