/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ReportDocument } from '@xihan-report/core'
import { dataFieldsFromJsonSchema, inferDataFields } from '@xihan-ui/designer-kit/field-inference'
import { describe, expect, it } from 'vitest'
import { importedRowFields, planDatasetImport, planFieldImport, planParameterImport } from '../src/field-import'

const document: ReportDocument = {
  schemaVersion: 1,
  id: 'r',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }] }],
  parameters: [{ name: 'year', type: 'number' }],
  body: { type: 'table', dataset: 'sales', columns: [] },
}

describe('导入字段换成报表的操作', () => {
  it('一行的字段：根是数组时取它的项，{ data: [...] } 这类外包取第一个带子字段的列表的项，否则顶层就是一行；只取值字段，名字以 $ 开头的跳过', () => {
    const names = (sample: unknown): string[] => importedRowFields(inferDataFields(sample as never).fields).map(field => field.name)
    expect(names([{ no: 'SO-1', amount: 3, lines: [{ sku: 'a' }] }])).toEqual(['no', 'amount'])
    expect(names({ total: 2, data: [{ region: '华东', amount: 1 }] })).toEqual(['region', 'amount'])
    expect(names({ region: '华东', amount: 1, tags: ['a'], owner: { name: 'x' }, $hidden: 1 })).toEqual(['region', 'amount'])
  })

  it('导入数据集：新建一个数据集，字段按推断的类型，显示名与字段名不同时写进 title；没有可用的字段时什么都不做', () => {
    const { fields } = inferDataFields([{ region: '华东', amount: 1.5, day: '2026-10-19', paid: true }])
    const labelled = fields.map(field => field.kind === 'list' ? { ...field, children: field.children!.map(child => child.name === 'amount' ? { ...child, label: '金额' } : child) } : field)
    expect(planDatasetImport(document, labelled)).toEqual({
      dataset: 'dataset1',
      operations: [{ type: 'addDataset', dataset: { id: 'dataset1', fields: [
        { name: 'region', type: 'string' },
        { name: 'amount', type: 'number', title: '金额' },
        { name: 'day', type: 'date' },
        { name: 'paid', type: 'boolean' },
      ] } }],
    })
    expect(planDatasetImport(document, inferDataFields([[1, 2]]).fields)).toBeUndefined()
  })

  it('往数据集里导入字段：只加还没有的字段，同名的保留现有的；都已有或数据集不在时什么都不做', () => {
    const { fields } = inferDataFields({ region: '华东', amount: 1 })
    expect(planFieldImport(document, 'sales', fields)).toEqual({ operations: [{ type: 'addField', dataset: 'sales', field: { name: 'amount', type: 'number' } }] })
    expect(planFieldImport(document, 'sales', inferDataFields({ region: 'x' }).fields)).toBeUndefined()
    expect(planFieldImport(document, 'missing', fields)).toBeUndefined()
  })

  it('导入参数：顶层的值字段各是一个参数，标量数组是多值参数，对象跳过；JSON Schema 的 required、enum、default 换成必填、候选项与缺省值；同名的保留现有的', () => {
    const schema = {
      type: 'object',
      required: ['region'],
      properties: {
        region: { type: 'string', title: '区域', enum: ['华东', '华北'], default: '华东' },
        day: { type: 'string', format: 'date' },
        channels: { type: 'array', items: { type: 'string' }, default: ['线上'] },
        owner: { type: 'object', properties: { name: { type: 'string' } } },
        year: { type: 'number' },
      },
    }
    const { fields, annotations } = dataFieldsFromJsonSchema(schema)
    expect(planParameterImport(document, fields, annotations)).toEqual({ operations: [
      { type: 'addParameter', parameter: { name: 'region', type: 'string', title: '区域', required: true, defaultValue: '华东', options: [{ value: '华东' }, { value: '华北' }] } },
      { type: 'addParameter', parameter: { name: 'day', type: 'date' } },
      { type: 'addParameter', parameter: { name: 'channels', type: 'string', multiple: true, defaultValue: ['线上'] } },
    ] })
    expect(planParameterImport(document, inferDataFields({ year: 2026 }).fields, new Map())).toBeUndefined()
  })
})
