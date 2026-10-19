/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导入字段：把导入对话框交来的字段树（designer-kit 的 DataField）换成报表的编辑操作。报表的数据集与参数是扁平的，
// 只取值字段；同名的保留现有的，不改不删。一次导入是一批操作，由设计器记成一步撤销。

import type { DatasetField, FieldType, ParameterOption, ReportDocument, ReportOperation, ReportParameter } from '@xihan-report/core'
import type { JsonValue } from '@xihan-ui/core/json'
import type { DataField } from '@xihan-ui/designer-kit'
import type { FieldAnnotation } from '@xihan-ui/designer-kit/field-inference'
import { formatJsonPath } from '@xihan-ui/core/json'
import { createIdAllocator } from '@xihan-ui/designer-kit'

/** 导入对话框为谁打开：新建一个数据集、往一个数据集里加字段，或加报表参数。 */
export type ReportDataImportKind = 'dataset' | 'fields' | 'parameters'

/** 一次导入的操作，与导入后要选中的对象。 */
export interface DataImportPlan {
  readonly operations: readonly ReportOperation[]
  /** 新建的数据集 id（导入数据集时）。 */
  readonly dataset?: string
}

/** 报表的字段名不能为空，也不能以 $ 开头（$ 留给参数）。 */
function usableName(name: string): boolean {
  return name !== '' && !name.startsWith('$')
}

function fieldType(field: DataField): FieldType {
  return field.type ?? 'string'
}

/**
 * 字段树里的一行：顶层有带子字段的列表时（根是数组时推断包在 items 里，或 { data: [...] } 这类外包），取第一个这样的列表的项，
 * 否则顶层就是一行；只取名字可用的值字段，嵌套的对象与列表跳过。
 */
export function importedRowFields(fields: readonly DataField[]): DataField[] {
  const list = fields.find(field => field.kind === 'list' && (field.children?.length ?? 0) > 0)
  return (list?.children ?? fields).filter(field => field.kind === 'value' && usableName(field.name))
}

function datasetField(field: DataField): DatasetField {
  const type = fieldType(field)
  return field.label === undefined || field.label === field.name ? { name: field.name, type } : { name: field.name, type, title: field.label }
}

/** 导入数据集：新建一个数据集，字段是一行的值字段；没有可用的字段时为 undefined。 */
export function planDatasetImport(document: ReportDocument, fields: readonly DataField[]): DataImportPlan | undefined {
  const row = importedRowFields(fields)
  if (row.length === 0)
    return undefined
  const id = createIdAllocator('dataset', document.datasets.map(item => item.id)).next()
  return { operations: [{ type: 'addDataset', dataset: { id, fields: row.map(datasetField) } }], dataset: id }
}

/** 往数据集里导入字段：只加数据集里还没有的字段，同名的保留现有的；没有要加的或数据集不在时为 undefined。 */
export function planFieldImport(document: ReportDocument, dataset: string, fields: readonly DataField[]): DataImportPlan | undefined {
  const target = document.datasets.find(item => item.id === dataset)
  if (!target)
    return undefined
  const existing = new Set(target.fields.map(field => field.name))
  const added = importedRowFields(fields).filter(field => !existing.has(field.name))
  if (added.length === 0)
    return undefined
  return { operations: added.map(field => ({ type: 'addField', dataset, field: datasetField(field) })) }
}

function isScalar(value: JsonValue | undefined): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
}

/** 一个导入的字段换成报表参数：值字段是单值参数，标量数组是多值参数；注解里的 required、enum、default 换成必填、候选项与缺省值。 */
function reportParameter(field: DataField, annotation: FieldAnnotation | undefined): ReportParameter | undefined {
  const multiple = field.kind === 'list' && (field.children?.length ?? 0) === 0 && field.type !== undefined
  if (field.kind !== 'value' && !multiple)
    return undefined
  const options: ParameterOption[] = (annotation?.enum ?? []).filter(isScalar).map(value => ({ value }))
  const defaultValue = annotation?.default
  const defaults = multiple ? (Array.isArray(defaultValue) && defaultValue.every(isScalar) ? defaultValue : undefined) : (isScalar(defaultValue) ? defaultValue : undefined)
  return {
    name: field.name,
    type: fieldType(field),
    ...(field.label === undefined || field.label === field.name ? {} : { title: field.label }),
    ...(annotation?.required ? { required: true } : {}),
    ...(multiple ? { multiple: true } : {}),
    ...(defaults === undefined ? {} : { defaultValue: defaults }),
    ...(options.length > 0 ? { options } : {}),
  }
}

/**
 * 导入报表参数：顶层的值字段各是一个参数，标量数组是多值参数，对象与对象数组跳过；同名的保留现有的。
 * annotations 是导入对话框交来的注解（JSON Schema 的 required、enum、default），键是字段路径。没有要加的时为 undefined。
 */
export function planParameterImport(document: ReportDocument, fields: readonly DataField[], annotations: ReadonlyMap<string, FieldAnnotation>): DataImportPlan | undefined {
  const existing = new Set((document.parameters ?? []).map(parameter => parameter.name))
  const added = fields
    .filter(field => usableName(field.name) && !existing.has(field.name))
    .flatMap((field) => {
      const parameter = reportParameter(field, annotations.get(formatJsonPath([field.name])))
      return parameter ? [parameter] : []
    })
  if (added.length === 0)
    return undefined
  return { operations: added.map(parameter => ({ type: 'addParameter', parameter })) }
}
