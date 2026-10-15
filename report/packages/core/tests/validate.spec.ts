/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ReportDocument, ValidationIssue } from '../src'
import { describe, expect, it } from 'vitest'
import { validateDocument } from '../src'
import { dashboardDocument, groupDocument } from './documents'
import { formulas, lookupEngine, salesDataset } from './fixtures'

type Mutable = Record<string, any>

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 深拷贝一份文档再改。 */
function edit(document: ReportDocument, change: (draft: Mutable) => void): unknown {
  const draft = clone(document) as Mutable
  change(draft)
  return draft
}

function codes(issues: readonly ValidationIssue[]): string[] {
  return issues.map(issue => issue.code)
}

const card = (draft: Mutable, id: string): Mutable => draft.body.cards.find((item: Mutable) => item.id === id)

describe('validateDocument：合法文档', () => {
  it('看板与分组报表没有问题', () => {
    expect(validateDocument(dashboardDocument)).toEqual([])
    expect(validateDocument(groupDocument)).toEqual([])
  })

  it('带上表达式引擎也没有问题', () => {
    expect(validateDocument(dashboardDocument, { expressionEngine: lookupEngine(formulas) })).toEqual([])
  })

  it('明细表与交叉表作为主体没有问题', () => {
    const detail = card(clone(dashboardDocument) as Mutable, 'detail').view
    const pivot = card(clone(dashboardDocument) as Mutable, 'pivot').view
    expect(validateDocument({ ...dashboardDocument, body: detail })).toEqual([])
    expect(validateDocument({ ...dashboardDocument, body: pivot })).toEqual([])
  })
})

describe('validateDocument：结构', () => {
  it('不是对象、缺版本或版本不支持', () => {
    expect(validateDocument(null)).toEqual([{ code: 'invalid-type', path: [], params: { expected: 'object' } }])
    const unversioned = edit(groupDocument, (d) => {
      delete d.schemaVersion
    })
    expect(validateDocument(unversioned)).toEqual([{ code: 'required', path: ['schemaVersion'] }])
    const future = edit(groupDocument, (d) => {
      d.schemaVersion = 2
    })
    expect(validateDocument(future)).toEqual([
      { code: 'unsupported-schema-version', path: ['schemaVersion'], params: { version: 2 } },
    ])
  })

  it('缺必填项、类型不对与取值越界都报出定位', () => {
    const issues = validateDocument(edit(groupDocument, (d) => {
      delete d.id
      d.body.columns[0].width = -1
      d.body.columns[1].align = 'left'
      d.body.detail = 'yes'
      delete d.body.groups[1].field
    }))
    expect(issues).toEqual([
      { code: 'required', path: ['id'] },
      { code: 'invalid-value', path: ['body', 'columns', 'product', 'width'], params: { min: 0 } },
      { code: 'invalid-value', path: ['body', 'columns', 'amount', 'align'], params: { expected: 'start|center|end' } },
      { code: 'required', path: ['body', 'groups', 'month', 'field'] },
      { code: 'invalid-type', path: ['body', 'detail'], params: { expected: 'boolean' } },
    ])
  })

  it('重复的键用下标定位，缺键的项也用下标', () => {
    const issues = validateDocument(edit(groupDocument, (d) => {
      d.body.columns.push({ id: 'amount', field: 'qty' })
      d.body.groups.push({ field: 'product' })
      d.datasets[0].fields.push({ name: 'qty', type: 'number' })
    }))
    expect(issues).toEqual(expect.arrayContaining([
      { code: 'duplicate-key', path: ['datasets', 'sales', 'fields', 5], params: { key: 'qty' } },
      { code: 'required', path: ['body', 'groups', 2, 'id'] },
      { code: 'duplicate-key', path: ['body', 'columns', 3], params: { key: 'amount' } },
    ]))
  })

  it('分组与列共用一个命名空间', () => {
    const issues = validateDocument(edit(groupDocument, (d) => {
      d.body.columns[0].id = 'region'
    }))
    expect(issues).toEqual([{ code: 'duplicate-key', path: ['body', 'columns', 0], params: { key: 'region' } }])
  })

  it('空集合', () => {
    const issues = validateDocument(edit(groupDocument, (d) => {
      d.body.groups = []
      d.datasets[0].fields = []
    }))
    expect(codes(issues)).toEqual(expect.arrayContaining(['empty']))
    expect(issues.find(issue => issue.path.join('/') === 'body/groups')?.code).toBe('empty')
    expect(issues.find(issue => issue.path.join('/') === 'datasets/sales/fields')?.code).toBe('empty')
  })

  it('格式说明：小数位越界、固定位与可省位同时给、最少多于最多、日期缺模式', () => {
    const issues = validateDocument(edit(groupDocument, (d) => {
      d.body.columns[0].format = { kind: 'number', decimals: 35, rounding: 'bankers' }
      d.body.columns[1].format = { kind: 'percent', decimals: 2, maxDecimals: 3 }
      d.body.columns[2].format = { kind: 'date' }
      d.body.groups[0].format = { kind: 'number', minDecimals: 3, maxDecimals: 1 }
    }))
    expect(issues).toEqual([
      { code: 'invalid-value', path: ['body', 'columns', 'product', 'format', 'decimals'], params: { min: 0, max: 34 } },
      { code: 'invalid-value', path: ['body', 'columns', 'product', 'format', 'rounding'], params: { expected: 'half-up|half-even|floor|ceil|down' } },
      { code: 'invalid-value', path: ['body', 'columns', 'amount', 'format', 'decimals'], params: { expected: 'decimals|minDecimals,maxDecimals' } },
      { code: 'required', path: ['body', 'columns', 'date', 'format', 'pattern'] },
      { code: 'invalid-value', path: ['body', 'groups', 'region', 'format', 'minDecimals'], params: { max: 1 } },
    ])
  })
})

describe('validateDocument：引用与类型', () => {
  it('未知的数据集、字段、参数与数据集参数', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      card(d, 'share').dataset = 'nope'
      card(d, 'funnel').query.dimensions[0].field = 'color'
      card(d, 'trend').parameters = { year: { parameter: 'era' }, extra: 1 }
      card(d, 'trend').query.filter.conditions[0].value = { parameter: 'missing' }
    }))
    expect(issues).toEqual(expect.arrayContaining([
      { code: 'unknown-dataset', path: ['body', 'cards', 'share', 'dataset'], params: { dataset: 'nope' } },
      { code: 'unknown-field', path: ['body', 'cards', 'funnel', 'query', 'dimensions', 'product', 'field'], params: { field: 'color' } },
      { code: 'unknown-parameter', path: ['body', 'cards', 'trend', 'parameters', 'year', 'parameter'], params: { parameter: 'era' } },
      { code: 'unknown-dataset-parameter', path: ['body', 'cards', 'trend', 'parameters', 'extra'], params: { parameter: 'extra' } },
      { code: 'unknown-parameter', path: ['body', 'cards', 'trend', 'query', 'filter', 'conditions', 'r', 'value', 'parameter'], params: { parameter: 'missing' } },
    ]))
    expect(issues).toHaveLength(5)
  })

  it('必填的数据集参数没有绑定', () => {
    const document = edit(groupDocument, (d) => {
      d.datasets[0].parameters = [{ name: 'year', type: 'number', required: true }]
    })
    expect(validateDocument(document)).toEqual([{ code: 'required', path: ['body', 'parameters', 'year'] }])
  })

  it('聚合、日期粒度与运算符的类型不符', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      card(d, 'share').query.measures[0].field = 'region'
      card(d, 'funnel').query.dimensions[0].bucket = 'month'
      card(d, 'trend').query.filter.conditions[1].conditions[1].operator = 'contains'
      card(d, 'detail').view.columns[1].summary = { aggregate: 'avg' }
      card(d, 'detail').view.columns[1].field = 'product'
    }))
    expect(issues).toEqual([
      { code: 'operator-type-mismatch', path: ['body', 'cards', 'trend', 'query', 'filter', 'conditions', 'g', 'conditions', 'q', 'operator'], params: { operator: 'contains', type: 'number' } },
      { code: 'operand-shape', path: ['body', 'cards', 'trend', 'query', 'filter', 'conditions', 'g', 'conditions', 'q', 'value'], params: { operator: 'contains' } },
      { code: 'aggregate-type-mismatch', path: ['body', 'cards', 'share', 'query', 'measures', 'amount', 'aggregate'], params: { aggregate: 'sum', type: 'string' } },
      { code: 'bucket-type-mismatch', path: ['body', 'cards', 'funnel', 'query', 'dimensions', 'product', 'bucket'], params: { type: 'string' } },
      { code: 'aggregate-type-mismatch', path: ['body', 'cards', 'detail', 'view', 'columns', 'amount', 'summary', 'aggregate'], params: { aggregate: 'avg', type: 'string' } },
    ])
  })

  it('筛选操作数缺失、形状与类型不对', () => {
    const issues = validateDocument(edit(groupDocument, (d) => {
      d.body.filter = {
        logic: 'and',
        conditions: [
          { id: 'a', field: 'amount', operator: 'gt' },
          { id: 'b', field: 'amount', operator: 'eq', value: [1, 2] },
          { id: 'c', field: 'amount', operator: 'between', value: [null, null] },
          { id: 'd', field: 'amount', operator: 'gt', value: '5' },
          { id: 'e', field: 'date', operator: 'gte', value: 'yesterday' },
          { id: 'f', field: 'date', bucket: 'month', operator: 'eq', value: 202601 },
          { id: 'g', field: 'region', operator: 'isEmpty', value: 'x' },
          { id: 'a', field: 'region', operator: 'eq', value: 'East' },
        ],
      }
    }))
    const at = (id: string | number): string[] => ['body', 'filter', 'conditions', String(id), 'value']
    expect(issues).toEqual([
      { code: 'duplicate-key', path: ['body', 'filter', 'conditions', 7], params: { key: 'a' } },
      { code: 'operand-required', path: at('a') },
      { code: 'operand-shape', path: at('b'), params: { operator: 'eq' } },
      { code: 'operand-required', path: at('c') },
      { code: 'operand-type-mismatch', path: at('d'), params: { expected: 'number' } },
      { code: 'operand-type-mismatch', path: at('e'), params: { expected: 'date' } },
      { code: 'operand-type-mismatch', path: at('f'), params: { expected: 'string' } },
      { code: 'operand-shape', path: at('g'), params: { operator: 'isEmpty' } },
    ])
  })

  it('多选参数不能配单值运算符', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      card(d, 'trend').query.filter.conditions[0].operator = 'eq'
    }))
    expect(issues).toEqual([
      { code: 'operand-shape', path: ['body', 'cards', 'trend', 'query', 'filter', 'conditions', 'r', 'value'], params: { operator: 'eq' } },
    ])
  })

  it('度量既有聚合又有公式，或排序引用不存在的键', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      card(d, 'trend').query.measures[2].aggregate = 'sum'
      card(d, 'trend').query.sort = [{ key: 'nope' }]
      card(d, 'share').query.dimensions[0].sort.by = 'nope'
    }))
    expect(issues).toEqual([
      { code: 'measure-definition', path: ['body', 'cards', 'trend', 'query', 'measures', 'unit'] },
      { code: 'unknown-key', path: ['body', 'cards', 'trend', 'query', 'sort', 0, 'key'], params: { key: 'nope' } },
      { code: 'unknown-measure', path: ['body', 'cards', 'share', 'query', 'dimensions', 'product', 'sort', 'by'], params: { key: 'nope' } },
    ])
  })
})

describe('validateDocument：看板', () => {
  it('卡片越界与重叠', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      card(d, 'kpi').layout = { x: 10, y: 0, w: 4, h: 3 }
      card(d, 'share').layout = { x: 2, y: 1, w: 2, h: 2 }
    }))
    expect(issues).toEqual([
      { code: 'layout-out-of-bounds', path: ['body', 'cards', 'kpi', 'layout'], params: { columns: 12 } },
      { code: 'layout-overlap', path: ['body', 'cards', 'share', 'layout'], params: { card: 'trend' } },
    ])
  })

  it('图表引用的键不存在或角色不对', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      card(d, 'share').chart.nameField = 'amount'
      card(d, 'funnel').chart.valueField = 'nope'
      card(d, 'trend').chart.series[0].y = ['amount', 'month']
      card(d, 'trend').chart.annotations[1].series = 'ghost'
      card(d, 'radar').chart.indicators = [{ key: 'amount' }]
      card(d, 'kpi').metric.sparkline.x = 'amount'
    }))
    expect(issues).toEqual(expect.arrayContaining([
      { code: 'chart-reference-role', path: ['body', 'cards', 'share', 'chart', 'nameField'], params: { key: 'amount', expected: 'dimension' } },
      { code: 'unknown-measure', path: ['body', 'cards', 'funnel', 'chart', 'valueField'], params: { key: 'nope' } },
      { code: 'chart-reference-role', path: ['body', 'cards', 'trend', 'chart', 'series', 'bars', 'y', 1], params: { key: 'month', expected: 'measure' } },
      { code: 'unknown-series', path: ['body', 'cards', 'trend', 'chart', 'annotations', 1, 'series'], params: { series: 'ghost' } },
      { code: 'invalid-value', path: ['body', 'cards', 'radar', 'chart', 'indicators'], params: { min: 3, max: 10 } },
      { code: 'chart-reference-role', path: ['body', 'cards', 'kpi', 'metric', 'sparkline', 'x'], params: { key: 'amount', expected: 'dimension' } },
    ]))
    expect(issues).toHaveLength(6)
  })

  it('图表取值越界', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      card(d, 'trend').chart.series[1].slot = 9
      card(d, 'calendar').chart.startDate = '2026/01/01'
      card(d, 'tree').chart.layout = 'grid'
      card(d, 'share').chart.format = { kind: 'date' }
    }))
    expect(issues).toEqual(expect.arrayContaining([
      { code: 'invalid-value', path: ['body', 'cards', 'trend', 'chart', 'series', 'line', 'slot'], params: { min: 1, max: 8 } },
      { code: 'invalid-value', path: ['body', 'cards', 'calendar', 'chart', 'startDate'], params: { expected: 'YYYY-MM-DD' } },
      { code: 'invalid-value', path: ['body', 'cards', 'tree', 'chart', 'layout'], params: { expected: 'treemap|sunburst|icicle|pack' } },
      { code: 'invalid-value', path: ['body', 'cards', 'share', 'chart', 'format', 'kind'], params: { expected: 'number|percent' } },
    ]))
    expect(issues).toHaveLength(4)
  })

  it('联动的源卡片、源维度、目标卡片与目标字段', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      d.body.links.push(
        { id: 'a', card: 'ghost', dimension: 'x', targets: [{ card: 'detail', field: 'date' }] },
        { id: 'b', card: 'trend', dimension: 'nope', targets: [{ card: 'ghost', field: 'date' }] },
        { id: 'c', card: 'trend', dimension: 'month', targets: [{ card: 'share', field: 'region' }, { card: 'share', field: 'color' }] },
        { id: 'd', card: 'trend', dimension: 'region', targets: [] },
      )
    }))
    expect(issues).toEqual([
      { code: 'unknown-card', path: ['body', 'links', 'a', 'card'], params: { card: 'ghost' } },
      { code: 'unknown-dimension', path: ['body', 'links', 'b', 'dimension'], params: { key: 'nope' } },
      { code: 'unknown-card', path: ['body', 'links', 'b', 'targets', 0, 'card'], params: { card: 'ghost' } },
      { code: 'link-target-type-mismatch', path: ['body', 'links', 'c', 'targets', 0, 'field'], params: { type: 'string' } },
      { code: 'unknown-field', path: ['body', 'links', 'c', 'targets', 1, 'field'], params: { field: 'color' } },
      { code: 'empty', path: ['body', 'links', 'd', 'targets'] },
    ])
  })
})

describe('validateDocument：公式', () => {
  const engine = lookupEngine(formulas)

  it('没有引擎时不检查公式', () => {
    const document = edit(dashboardDocument, (d) => {
      d.datasets[0].fields.push({ name: 'bad', type: 'number', formula: 'nonsense' })
    })
    expect(validateDocument(document)).toEqual([])
  })

  it('编译失败、引用不存在的名字与循环引用', () => {
    const document = {
      ...groupDocument,
      datasets: [{
        ...salesDataset,
        fields: [
          ...salesDataset.fields,
          { name: 'bad', type: 'number', formula: 'nonsense' },
          { name: 'a', type: 'number', formula: 'b + 1' },
          { name: 'b', type: 'number', formula: 'a + 1' },
          { name: 'twice', type: 'number', formula: 'double + 1' },
        ],
      }],
    }
    expect(validateDocument(document, { expressionEngine: engine })).toEqual([
      { code: 'formula-invalid', path: ['datasets', 'sales', 'fields', 'bad', 'formula'], params: { issue: 'XH_EXPR_UNEXPECTED_TOKEN' } },
      { code: 'formula-unknown-reference', path: ['datasets', 'sales', 'fields', 'twice', 'formula'], params: { name: 'double' } },
      { code: 'formula-cycle', path: ['datasets', 'sales', 'fields', 'b', 'formula'], params: { names: 'a,b' } },
    ])
  })

  it('公式度量只能引用同一查询的度量', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      card(d, 'trend').query.measures[2].formula = 'double + 1'
    }), { expressionEngine: engine })
    expect(issues).toEqual([
      { code: 'formula-unknown-reference', path: ['body', 'cards', 'trend', 'query', 'measures', 'unit', 'formula'], params: { name: 'double' } },
    ])
  })
})

describe('validateDocument：公式里的报表参数', () => {
  const engine = lookupEngine(formulas)

  it('$名字 引用已声明的报表参数，未声明的报出', () => {
    const declared = edit(groupDocument, (d) => {
      d.parameters = [{ name: 'rate', type: 'number' }, { name: 'target', type: 'number' }]
      d.datasets[0].fields.push({ name: 'taxed', type: 'number', formula: '$rate * amount' })
      d.body.columns.push({ id: 'gap', field: 'amount', summary: { formula: 'amount - $target' } })
    })
    expect(validateDocument(declared, { expressionEngine: engine })).toEqual([])
    const undeclared = edit(groupDocument, (d) => {
      d.datasets[0].fields.push({ name: 'taxed', type: 'number', formula: '$rate * amount' })
    })
    expect(validateDocument(undeclared, { expressionEngine: engine })).toEqual([
      { code: 'formula-unknown-reference', path: ['datasets', 'sales', 'fields', 'taxed', 'formula'], params: { name: '$rate' } },
    ])
  })

  it('字段名、度量 id 与列 id 不能以 $ 开头', () => {
    const issues = validateDocument(edit(dashboardDocument, (d) => {
      d.datasets[0].fields.push({ name: '$x', type: 'number' })
      card(d, 'share').query.measures[0].id = '$amount'
      card(d, 'share').chart.valueField = '$amount'
      card(d, 'detail').view.columns[0].id = '$region'
    }))
    expect(issues).toEqual([
      { code: 'reserved-name', path: ['datasets', 'sales', 'fields', '$x', 'name'], params: { key: '$x' } },
      { code: 'reserved-name', path: ['body', 'cards', 'share', 'query', 'measures', '$amount', 'id'], params: { key: '$amount' } },
      { code: 'unknown-measure', path: ['body', 'cards', 'share', 'query', 'dimensions', 'product', 'sort', 'by'], params: { key: 'amount' } },
      { code: 'reserved-name', path: ['body', 'cards', 'detail', 'view', 'columns', '$region', 'id'], params: { key: '$region' } },
    ])
  })
})
