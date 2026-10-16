/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 演示用的四份报表：明细表、分组报表、交叉表与带联动的看板，都取同一份销售订单。

import type { FilterGroup, NumberFormatSpec, ReportDocument, ReportParameter } from '@xihan-report/core'
import { CATEGORIES, CHANNELS, REGIONS, salesDataset } from './data'

const money: NumberFormatSpec = { kind: 'number', decimals: 2, grouping: true }
const integer: NumberFormatSpec = { kind: 'number', decimals: 0, grouping: true }

const regionParameter: ReportParameter = { name: 'region', type: 'string', title: '区域', options: REGIONS.map(region => ({ value: region.name })) }
const channelParameter: ReportParameter = { name: 'channels', type: 'string', title: '渠道', multiple: true, options: CHANNELS.map(channel => ({ value: channel })) }

export const detailReport: ReportDocument = {
  schemaVersion: 1,
  id: 'detail',
  title: '销售明细',
  datasets: [salesDataset],
  parameters: [
    regionParameter,
    channelParameter,
    { name: 'since', type: 'date', title: '起始日期' },
    { name: 'minAmount', type: 'number', title: '最低金额' },
  ],
  body: {
    type: 'table',
    dataset: 'sales',
    columns: [
      { id: 'orderId', field: 'orderId', width: 110, sticky: 'start' },
      { id: 'date', field: 'date', width: 120 },
      { id: 'region', field: 'region', width: 80 },
      { id: 'city', field: 'city', width: 80 },
      { id: 'category', field: 'category', width: 100 },
      { id: 'product', field: 'product', width: 90 },
      { id: 'channel', field: 'channel', width: 80 },
      { id: 'quantity', field: 'quantity', width: 80, align: 'end', format: integer, summary: { aggregate: 'sum' } },
      { id: 'price', field: 'price', width: 100, align: 'end', format: money },
      { id: 'amount', field: 'amount', width: 120, align: 'end', format: money, summary: { aggregate: 'sum' } },
    ],
    filter: {
      logic: 'and',
      conditions: [
        { id: 'region', field: 'region', operator: 'eq', value: { parameter: 'region' } },
        { id: 'channels', field: 'channel', operator: 'in', value: { parameter: 'channels' } },
        { id: 'since', field: 'date', operator: 'gte', value: { parameter: 'since' } },
        { id: 'minAmount', field: 'amount', operator: 'gte', value: { parameter: 'minAmount' } },
      ],
    },
    sort: [{ field: 'date', direction: 'desc' }, { field: 'orderId', direction: 'desc' }],
  },
}

export const groupReport: ReportDocument = {
  schemaVersion: 1,
  id: 'group',
  title: '分区域销售汇总',
  datasets: [salesDataset],
  parameters: [
    { name: 'from', type: 'date', title: '开始日期', defaultValue: '2025-12-01' },
    { name: 'to', type: 'date', title: '结束日期', defaultValue: '2025-12-31' },
  ],
  body: {
    type: 'group',
    dataset: 'sales',
    groups: [
      { id: 'region', field: 'region', title: '区域', sort: { by: 'amount', direction: 'desc' } },
      { id: 'category', field: 'category', title: '品类' },
    ],
    columns: [
      { id: 'orderId', field: 'orderId', width: 110 },
      { id: 'date', field: 'date', width: 120 },
      { id: 'city', field: 'city', width: 80 },
      { id: 'product', field: 'product', width: 90 },
      { id: 'channel', field: 'channel', width: 80 },
      { id: 'quantity', field: 'quantity', width: 80, align: 'end', format: integer, summary: { aggregate: 'sum' } },
      { id: 'amount', field: 'amount', width: 120, align: 'end', format: money, summary: { aggregate: 'sum' } },
      { id: 'cost', field: 'cost', width: 120, align: 'end', format: money, summary: { aggregate: 'sum' } },
    ],
    filter: {
      logic: 'and',
      conditions: [
        { id: 'from', field: 'date', operator: 'gte', value: { parameter: 'from' } },
        { id: 'to', field: 'date', operator: 'lte', value: { parameter: 'to' } },
      ],
    },
    sort: [{ field: 'date' }, { field: 'orderId' }],
  },
}

export const crosstabReport: ReportDocument = {
  schemaVersion: 1,
  id: 'crosstab',
  title: '区域与季度交叉表',
  datasets: [salesDataset],
  parameters: [{ name: 'category', type: 'string', title: '品类', options: CATEGORIES.map(category => ({ value: category.name })) }],
  body: {
    type: 'crosstab',
    dataset: 'sales',
    rows: [
      { id: 'region', field: 'region', title: '区域' },
      { id: 'city', field: 'city', title: '城市' },
    ],
    columns: [{ id: 'quarter', field: 'date', bucket: 'quarter', title: '季度' }],
    measures: [
      { id: 'amount', field: 'amount', aggregate: 'sum', title: '金额', format: money },
      { id: 'avgPrice', field: 'price', aggregate: 'avg', title: '平均单价', format: money },
    ],
    filter: { logic: 'and', conditions: [{ id: 'category', field: 'category', operator: 'eq', value: { parameter: 'category' } }] },
    rowTotals: { subtotals: true },
    columnTotals: { grandTotal: true },
  },
}

const byChannel: FilterGroup = { logic: 'and', conditions: [{ id: 'channel', field: 'channel', operator: 'eq', value: { parameter: 'channel' } }] }
const amount = { id: 'amount', field: 'amount', aggregate: 'sum', title: '销售额', format: money } as const
const month = { id: 'month', field: 'date', bucket: 'month', title: '月份' } as const
const metricTargets = ['sales', 'orders', 'quantity', 'average'].map(card => ({ card, field: 'region' }))

export const dashboardReport: ReportDocument = {
  schemaVersion: 1,
  id: 'dashboard',
  title: '销售看板',
  datasets: [salesDataset],
  parameters: [{ name: 'channel', type: 'string', title: '渠道', options: CHANNELS.map(channel => ({ value: channel })) }],
  body: {
    type: 'dashboard',
    grid: { columns: 12, rowHeight: 40 },
    cards: [
      {
        id: 'sales',
        kind: 'metric',
        title: '销售额',
        layout: { x: 0, y: 0, w: 3, h: 3 },
        dataset: 'sales',
        query: { dimensions: [month], measures: [amount], filter: byChannel },
        metric: { value: 'amount', prefix: '¥', format: money, sparkline: { x: 'month', y: 'amount', variant: 'area', markers: 'last' } },
      },
      {
        id: 'orders',
        kind: 'metric',
        title: '订单数',
        layout: { x: 3, y: 0, w: 3, h: 3 },
        dataset: 'sales',
        query: { dimensions: [], measures: [{ id: 'orders', aggregate: 'count', title: '订单数' }], filter: byChannel },
        metric: { value: 'orders', format: integer },
      },
      {
        id: 'quantity',
        kind: 'metric',
        title: '销量',
        layout: { x: 6, y: 0, w: 3, h: 3 },
        dataset: 'sales',
        query: { dimensions: [], measures: [{ id: 'quantity', field: 'quantity', aggregate: 'sum', title: '销量' }], filter: byChannel },
        metric: { value: 'quantity', suffix: '件', format: integer },
      },
      {
        id: 'average',
        kind: 'metric',
        title: '平均订单金额',
        layout: { x: 9, y: 0, w: 3, h: 3 },
        dataset: 'sales',
        query: { dimensions: [], measures: [{ id: 'average', field: 'amount', aggregate: 'avg', title: '平均订单金额' }], filter: byChannel },
        metric: { value: 'average', prefix: '¥', format: money },
      },
      {
        id: 'byRegion',
        kind: 'chart',
        title: '各区域销售额（点选联动）',
        layout: { x: 0, y: 3, w: 4, h: 8 },
        dataset: 'sales',
        query: { dimensions: [{ id: 'region', field: 'region', title: '区域' }], measures: [amount], filter: byChannel },
        chart: { type: 'pie', nameField: 'region', valueField: 'amount', variant: 'donut', sort: 'descending' },
      },
      {
        id: 'trend',
        kind: 'chart',
        title: '按月趋势',
        layout: { x: 4, y: 3, w: 8, h: 8 },
        dataset: 'sales',
        query: { dimensions: [month, { id: 'category', field: 'category', title: '品类' }], measures: [amount], filter: byChannel },
        chart: { type: 'cartesian', splitBy: 'category', series: [{ id: 'amount', mark: 'line', x: 'month', y: 'amount', curve: 'monotone' }] },
      },
      {
        id: 'byCategory',
        kind: 'chart',
        title: '各品类销售额（点选联动）',
        layout: { x: 0, y: 11, w: 5, h: 8 },
        dataset: 'sales',
        query: { dimensions: [{ id: 'category', field: 'category', title: '品类' }], measures: [amount], filter: byChannel },
        chart: { type: 'cartesian', orientation: 'horizontal', series: [{ id: 'amount', mark: 'bar', x: 'category', y: 'amount', labels: 'end' }] },
      },
      {
        id: 'products',
        kind: 'table',
        title: '商品与渠道',
        layout: { x: 5, y: 11, w: 7, h: 8 },
        view: {
          type: 'crosstab',
          dataset: 'sales',
          rows: [{ id: 'product', field: 'product', title: '商品' }],
          columns: [{ id: 'channel', field: 'channel', title: '渠道' }],
          measures: [amount],
          filter: byChannel,
        },
      },
    ],
    links: [
      {
        id: 'region',
        card: 'byRegion',
        dimension: 'region',
        targets: [...metricTargets, { card: 'trend', field: 'region' }, { card: 'byCategory', field: 'region' }, { card: 'products', field: 'region' }],
      },
      {
        id: 'category',
        card: 'byCategory',
        dimension: 'category',
        targets: [...metricTargets.map(target => ({ ...target, field: 'category' })), { card: 'trend', field: 'category' }, { card: 'products', field: 'category' }],
      },
    ],
  },
}
