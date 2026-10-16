/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 数据面板的增删：datasetEditing 决定能动哪些对象；删除按 core 的计划函数级联，新增给缺省名。

import type { DataCascade, ReportDocument, ReportOperation } from '@xihan-report/core'
import type { DataAddKind } from './data-panel'
import type { ReportDataRef } from './editor'
import { datasetUsage, planRemoveDataset, planRemoveField, planRemoveParameter } from '@xihan-report/core'
import { createIdAllocator } from '@xihan-ui/designer-kit'

/** 数据集能改到什么程度。 */
export type DatasetEditing = 'none' | 'fields' | 'full'

/** 在这一档里能不能增删、改名这种对象：报表参数在 fields 起可动，数据集与字段只在 full 可动。 */
export function canEditData(kind: ReportDataRef['kind'], mode: DatasetEditing): boolean {
  return kind === 'parameter' ? mode !== 'none' : mode === 'full'
}

/** 删除一个数据面板对象：操作、一并删掉的别处与对象的名字（给确认框用）。 */
export interface DataRemoval {
  readonly operations: readonly ReportOperation[]
  readonly cascade: DataCascade
  readonly label: string
}

const NO_CASCADE: DataCascade = { items: 0, conditions: 0, sorts: 0, links: 0, bindings: 0 }

/** 一并删掉的别处的总数。 */
export function cascadeCount(cascade: DataCascade): number {
  return cascade.items + cascade.conditions + cascade.sorts + cascade.links + cascade.bindings
}

/** 删除计划；对象不存在或还在使用的数据集删不了时为 undefined。 */
export function planDataRemoval(document: ReportDocument, ref: ReportDataRef): DataRemoval | undefined {
  if (ref.kind === 'parameter') {
    const parameter = document.parameters?.find(item => item.name === ref.name)
    return parameter ? { ...planRemoveParameter(document, ref.name), label: parameter.title ?? parameter.name } : undefined
  }
  const dataset = document.datasets.find(item => item.id === ref.dataset)
  if (!dataset)
    return undefined
  if (ref.kind === 'dataset')
    return datasetUsage(document, ref.dataset) > 0 ? undefined : { operations: planRemoveDataset(document, ref.dataset), cascade: NO_CASCADE, label: dataset.title ?? dataset.id }
  const field = dataset.fields.find(item => item.name === ref.name)
  return field ? { ...planRemoveField(document, ref.dataset, ref.name), label: field.title ?? field.name } : undefined
}

/** 新增一个数据面板对象：缺省名依次编号，字段加进选中的数据集（或选中字段所在的数据集）；加不了时为 undefined。 */
export function planDataAddition(document: ReportDocument, kind: DataAddKind, selected: ReportDataRef | undefined): { readonly operations: readonly ReportOperation[], readonly select: ReportDataRef } | undefined {
  if (kind === 'parameter') {
    const name = createIdAllocator('parameter', (document.parameters ?? []).map(item => item.name)).next()
    return { operations: [{ type: 'addParameter', parameter: { name, type: 'string' } }], select: { kind: 'parameter', name } }
  }
  if (kind === 'dataset') {
    const id = createIdAllocator('dataset', document.datasets.map(item => item.id)).next()
    return { operations: [{ type: 'addDataset', dataset: { id, fields: [] } }], select: { kind: 'dataset', dataset: id } }
  }
  const target = selected?.kind === 'dataset' || selected?.kind === 'field' ? document.datasets.find(item => item.id === selected.dataset) : undefined
  if (!target)
    return undefined
  const name = createIdAllocator('field', target.fields.map(item => item.name)).next()
  return { operations: [{ type: 'addField', dataset: target.id, field: { name, type: 'string' } }], select: { kind: 'field', dataset: target.id, name } }
}
