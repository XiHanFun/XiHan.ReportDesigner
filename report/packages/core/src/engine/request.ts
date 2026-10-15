/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 由视图或卡片与参数取值算出取数请求。

import type {
  ChartCard,
  DatasetQuery,
  DatasetQueryDimension,
  DatasetQueryMeasure,
  DatasetRequest,
  DatasetSchema,
  DataView,
  FilterCondition,
  FilterGroup,
  FilterNode,
  MetricCard,
  ParameterValue,
  ParameterValues,
  ReportDocument,
  RowSortRule,
} from '../schema'
import { isAdditive } from './aggregate'
import { isAggregateMeasure } from './cube'
import { isEmptyOperand, resolveOperand } from './filter'

/** 能取数的来源：明细表、分组报表、交叉表，或看板上的图表与指标卡片。 */
export type RequestSource = DataView | ChartCard | MetricCard

/** 生成取数请求的选项。 */
export interface RequestOptions {
  /** 报表参数的取值。 */
  readonly parameters?: ParameterValues
  /** 追加的筛选条件（如看板联动）。 */
  readonly filters?: readonly FilterCondition[]
}

/** 按 id 找数据集。 */
export function findDataset(document: ReportDocument, id: string): DatasetSchema | undefined {
  return document.datasets.find(dataset => dataset.id === id)
}

function bindFilter(group: FilterGroup, parameters: ParameterValues): FilterNode[] {
  const nodes: FilterNode[] = []
  for (const node of group.conditions) {
    if ('conditions' in node) {
      const conditions = bindFilter(node, parameters)
      if (conditions.length > 0)
        nodes.push({ ...node, conditions })
      continue
    }
    if (node.operator === 'isEmpty' || node.operator === 'isNotEmpty') {
      nodes.push(node)
      continue
    }
    const value = resolveOperand(node.value, parameters)
    if (!isEmptyOperand(value))
      nodes.push({ ...node, value: value as ParameterValue })
  }
  return nodes
}

function filterFields(group: FilterGroup, fields: Set<string>): Set<string> {
  for (const node of group.conditions) {
    if ('conditions' in node)
      filterFields(node, fields)
    else
      fields.add(node.field)
  }
  return fields
}

function rollupSets(ids: string[][], needed: boolean): string[][] {
  return needed ? ids : []
}

function aggregation(source: RequestSource): { dimensions: DatasetQueryDimension[], measures: DatasetQueryMeasure[], rollups: string[][] } | null {
  if ('kind' in source) {
    const dimensions = source.query.dimensions.map(({ id, field, bucket }) => ({ id, field, bucket }))
    const measures = source.query.measures.filter(isAggregateMeasure).map(({ id, field, aggregate }) => ({ id, field, aggregate }))
    return { dimensions, measures, rollups: rollupSets([[]], measures.some(m => !isAdditive(m.aggregate))) }
  }
  switch (source.type) {
    case 'table':
      return null
    case 'group': {
      if (source.detail !== false)
        return null
      const dimensions = source.groups.map(({ id, field, bucket }) => ({ id, field, bucket }))
      const measures: DatasetQueryMeasure[] = []
      for (const column of source.columns) {
        if (column.summary && 'aggregate' in column.summary)
          measures.push({ id: column.id, field: column.field, aggregate: column.summary.aggregate })
      }
      const prefixes: string[][] = []
      for (let length = source.grandTotal === false ? 1 : 0; length < dimensions.length; length++)
        prefixes.push(dimensions.slice(0, length).map(dimension => dimension.id))
      return { dimensions, measures, rollups: rollupSets(prefixes, measures.some(m => !isAdditive(m.aggregate))) }
    }
    case 'crosstab': {
      const rows = source.rows.map(({ id, field, bucket }) => ({ id, field, bucket }))
      const columns = source.columns.map(({ id, field, bucket }) => ({ id, field, bucket }))
      const measures = source.measures.filter(isAggregateMeasure).map(({ id, field, aggregate }) => ({ id, field, aggregate }))
      const sets: string[][] = []
      for (let r = 0; r <= rows.length; r++) {
        for (let c = 0; c <= columns.length; c++) {
          if (r < rows.length || c < columns.length)
            sets.push([...rows.slice(0, r), ...columns.slice(0, c)].map(dimension => dimension.id))
        }
      }
      return { dimensions: [...rows, ...columns], measures, rollups: rollupSets(sets, measures.some(m => !isAdditive(m.aggregate))) }
    }
  }
}

function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

/**
 * 生成取数请求。
 * - parameters：按视图的参数绑定解析，未给值的参数不出现；
 * - filter：视图筛选与追加条件，参数已代入、操作数为空的条件已去掉；引用了计算字段时为 null；
 * - sort / limit：只有明细（明细表与列明细的分组报表）才有；
 * - query：聚合视图需要的维度、度量与不可累加度量的汇总分组；明细视图，或筛选、维度、度量引用了计算字段时为 null。
 */
export function createDatasetRequest(source: RequestSource, dataset: DatasetSchema, options: RequestOptions = {}): DatasetRequest {
  const parameters: Record<string, ParameterValue> = {}
  for (const [name, operand] of Object.entries(source.parameters ?? {})) {
    const value = resolveOperand(operand, options.parameters ?? {})
    if (!isEmptyOperand(value))
      parameters[name] = value as ParameterValue
  }

  const base = 'kind' in source ? source.query.filter : source.filter
  const baseNodes = base ? bindFilter(base, options.parameters ?? {}) : []
  const extraNodes = bindFilter({ logic: 'and', conditions: options.filters ?? [] }, {})
  let merged: FilterGroup | null = null
  if (base && baseNodes.length > 0 && (extraNodes.length === 0 || base.logic === 'and'))
    merged = { logic: base.logic, conditions: [...baseNodes, ...extraNodes] }
  else if (base && baseNodes.length > 0)
    merged = { logic: 'and', conditions: [{ id: '$view', logic: base.logic, conditions: baseNodes }, ...extraNodes] }
  else if (extraNodes.length > 0)
    merged = { logic: 'and', conditions: extraNodes }

  const calculated = new Set(dataset.fields.filter(field => field.formula !== undefined).map(field => field.name))
  const filterUsesCalculated = merged !== null && [...filterFields(merged, new Set())].some(field => calculated.has(field))
  const plan = aggregation(source)
  const planUsesCalculated = plan !== null && [...plan.dimensions.map(d => d.field), ...plan.measures.map(m => m.field)].some(field => field !== undefined && calculated.has(field))
  const query: DatasetQuery | null = plan === null || filterUsesCalculated || planUsesCalculated
    ? null
    : {
        dimensions: plan.dimensions.map(stripUndefined),
        measures: plan.measures.map(stripUndefined),
        rollups: plan.rollups,
      }

  let sort: readonly RowSortRule[] | null = null
  let limit: number | null = null
  if (!('kind' in source) && (source.type === 'table' || (source.type === 'group' && source.detail !== false)))
    sort = source.sort ?? []
  if (!('kind' in source) && source.type === 'table')
    limit = source.limit ?? null
  return {
    dataset: dataset.id,
    parameters,
    filter: filterUsesCalculated ? null : merged,
    sort,
    limit,
    query,
  }
}
