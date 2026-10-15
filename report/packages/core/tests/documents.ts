/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 测试共用的报表文档。

import type { ReportDocument } from '../src'
import { salesDataset } from './fixtures'

const layout = (x: number, y: number, w = 4, h = 3): { x: number, y: number, w: number, h: number } => ({ x, y, w, h })

/** 一份合法的看板文档，用到全部卡片与图表类型。 */
export const dashboardDocument: ReportDocument = {
  schemaVersion: 1,
  id: 'sales-board',
  title: '销售看板',
  parameters: [
    { name: 'year', type: 'number', defaultValue: 2026 },
    { name: 'regions', type: 'string', multiple: true },
    { name: 'from', type: 'date' },
  ],
  datasets: [
    {
      ...salesDataset,
      fields: [...salesDataset.fields, { name: 'unit', type: 'number', formula: 'amount / qty' }],
    },
  ],
  body: {
    type: 'dashboard',
    grid: { columns: 12, rowHeight: 48 },
    cards: [
      {
        id: 'trend',
        kind: 'chart',
        title: '月度走势',
        layout: layout(0, 0, 8),
        dataset: 'sales',
        parameters: { year: { parameter: 'year' } },
        query: {
          dimensions: [
            { id: 'month', field: 'date', bucket: 'month' },
            { id: 'region', field: 'region' },
          ],
          measures: [
            { id: 'amount', aggregate: 'sum', field: 'amount', format: { kind: 'number', maxDecimals: 1, grouping: true } },
            { id: 'qty', aggregate: 'sum', field: 'qty' },
            { id: 'unit', formula: 'amount / qty' },
          ],
          filter: {
            logic: 'and',
            conditions: [
              { id: 'r', field: 'region', operator: 'in', value: { parameter: 'regions' } },
              { id: 'g', logic: 'or', conditions: [
                { id: 'd', field: 'date', operator: 'gte', value: { parameter: 'from' } },
                { id: 'q', field: 'qty', operator: 'between', value: [1, null] },
              ] },
            ],
          },
          sort: [{ key: 'month' }],
        },
        chart: {
          type: 'cartesian',
          splitBy: 'region',
          series: [
            { id: 'bars', mark: 'bar', x: 'month', y: 'amount', stack: 'all', labels: 'end' },
            { id: 'line', mark: 'line', x: 'month', y: 'unit', curve: 'monotone', slot: 2 },
          ],
          xAxis: { scale: 'band', title: '月份' },
          yAxis: { format: { kind: 'number', decimals: 2, grouping: true }, zero: true },
          annotations: [
            { kind: 'line', axis: 'y', value: 100, label: '目标' },
            { kind: 'point', series: 'bars', at: 'max' },
            { kind: 'trend', series: 'line', method: 'moving-average', window: 3 },
          ],
          brush: 'x',
        },
      },
      {
        id: 'kpi',
        kind: 'metric',
        layout: layout(8, 0),
        dataset: 'sales',
        query: {
          dimensions: [{ id: 'day', field: 'date', bucket: 'day' }],
          measures: [
            { id: 'amount', aggregate: 'sum', field: 'amount' },
            { id: 'target', aggregate: 'max', field: 'qty' },
          ],
        },
        metric: { value: 'amount', baseline: 'target', suffix: '元', tone: 'brand', sparkline: { x: 'day', y: 'amount', reference: 'mean', band: [0, 100] } },
      },
      {
        id: 'share',
        kind: 'chart',
        layout: layout(0, 3),
        dataset: 'sales',
        query: { dimensions: [{ id: 'product', field: 'product', sort: { by: 'amount', direction: 'desc' } }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }], limit: 5 },
        chart: { type: 'pie', nameField: 'product', valueField: 'amount', variant: 'donut', format: { kind: 'percent', decimals: 1 } },
      },
      {
        id: 'funnel',
        kind: 'chart',
        layout: layout(4, 3),
        dataset: 'sales',
        query: { dimensions: [{ id: 'product', field: 'product' }], measures: [{ id: 'n', aggregate: 'count' }] },
        chart: { type: 'funnel', nameField: 'product', valueField: 'n', conversion: 'first' },
      },
      {
        id: 'radar',
        kind: 'chart',
        layout: layout(8, 3),
        dataset: 'sales',
        query: {
          dimensions: [{ id: 'region', field: 'region' }],
          measures: [
            { id: 'amount', aggregate: 'sum', field: 'amount' },
            { id: 'qty', aggregate: 'avg', field: 'qty' },
            { id: 'products', aggregate: 'distinctCount', field: 'product' },
          ],
        },
        chart: { type: 'radar', nameField: 'region', indicators: [{ key: 'amount' }, { key: 'qty', label: '均量' }, { key: 'products', min: 0 }], rings: 5 },
      },
      {
        id: 'flow',
        kind: 'chart',
        layout: layout(0, 6),
        dataset: 'sales',
        query: { dimensions: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
        chart: { type: 'sankey', sourceField: 'region', targetField: 'product', valueField: 'amount', linkColor: 'source' },
      },
      {
        id: 'calendar',
        kind: 'chart',
        layout: layout(4, 6),
        dataset: 'sales',
        query: { dimensions: [{ id: 'day', field: 'date', bucket: 'day' }], measures: [{ id: 'n', aggregate: 'count' }] },
        chart: { type: 'heatmap', variant: 'calendar', dateField: 'day', valueField: 'n', startDate: '2026-01-01', firstDayOfWeek: 1, palette: 'green' },
      },
      {
        id: 'tree',
        kind: 'chart',
        layout: layout(8, 6),
        dataset: 'sales',
        query: { dimensions: [{ id: 'region', field: 'region' }, { id: 'product', field: 'product' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
        chart: { type: 'hierarchy', levels: ['region', 'product'], valueField: 'amount', layout: 'sunburst' },
      },
      {
        id: 'detail',
        kind: 'table',
        layout: layout(0, 9, 6, 4),
        view: {
          type: 'table',
          dataset: 'sales',
          columns: [
            { id: 'region', field: 'region', title: '区域', sticky: 'start' },
            { id: 'amount', field: 'amount', summary: { aggregate: 'sum' }, align: 'end', width: 120 },
            { id: 'qty', field: 'qty', summary: { aggregate: 'sum' } },
            { id: 'unit', field: 'unit', summary: { formula: 'amount / qty' } },
          ],
          sort: [{ field: 'date', direction: 'desc', nulls: 'first' }],
          limit: 50,
        },
      },
      {
        id: 'pivot',
        kind: 'table',
        layout: layout(6, 9, 6, 4),
        view: {
          type: 'crosstab',
          dataset: 'sales',
          rows: [{ id: 'region', field: 'region' }],
          columns: [{ id: 'quarter', field: 'date', bucket: 'quarter' }],
          measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }],
          rowTotals: { subtotals: true },
          measuresOn: 'columns',
        },
      },
    ],
    links: [
      { id: 'byMonth', card: 'trend', dimension: 'month', targets: [{ card: 'detail', field: 'date' }, { card: 'pivot', field: 'date' }] },
      { id: 'byRegion', card: 'pivot', dimension: 'region', targets: [{ card: 'share', field: 'region' }] },
    ],
  },
}

/** 一份合法的分组报表文档。 */
export const groupDocument: ReportDocument = {
  schemaVersion: 1,
  id: 'sales-groups',
  datasets: [salesDataset],
  body: {
    type: 'group',
    dataset: 'sales',
    groups: [
      { id: 'region', field: 'region', sort: { by: 'amount', direction: 'desc' } },
      { id: 'month', field: 'date', bucket: 'month', subtotal: false },
    ],
    columns: [
      { id: 'product', field: 'product' },
      { id: 'amount', field: 'amount', summary: { aggregate: 'sum' }, format: { kind: 'percent', minDecimals: 1, maxDecimals: 2, rounding: 'half-even' } },
      { id: 'date', field: 'date', format: { kind: 'date', pattern: 'yyyy年M月d日' } },
    ],
    sort: [{ field: 'amount', direction: 'desc' }],
    grandTotal: true,
  },
}
