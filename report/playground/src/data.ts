/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 演示用的内存数据源：按固定种子生成一年的销售订单，取数回调可以返回明细行，也可以模拟后端按请求聚合。

import type { DataRow, DatasetData, DatasetRequest, DatasetRollup, DatasetSchema, ReportQuery } from '@xihan-report/core'
import type { ReportDataProvider } from '@xihan-report/runtime'
import { runQuery } from '@xihan-report/core'

export const REGIONS: readonly { readonly name: string, readonly cities: readonly string[] }[] = [
  { name: '华东', cities: ['上海', '杭州', '南京', '苏州'] },
  { name: '华北', cities: ['北京', '天津', '石家庄'] },
  { name: '华南', cities: ['广州', '深圳', '厦门'] },
  { name: '华中', cities: ['武汉', '长沙', '郑州'] },
  { name: '西南', cities: ['成都', '重庆', '昆明'] },
]

export const CATEGORIES: readonly { readonly name: string, readonly products: readonly (readonly [string, number])[] }[] = [
  { name: '办公用品', products: [['签字笔', 6], ['笔记本', 18], ['文件夹', 12]] },
  { name: '电子产品', products: [['耳机', 299], ['键盘', 189], ['显示器', 1299]] },
  { name: '家居用品', products: [['台灯', 129], ['收纳箱', 59], ['靠垫', 45]] },
]

export const CHANNELS: readonly string[] = ['线上', '门店', '分销']

export const ORDER_COUNT = 5000

export const salesDataset: DatasetSchema = {
  id: 'sales',
  title: '销售订单',
  fields: [
    { name: 'orderId', type: 'string', title: '订单号' },
    { name: 'date', type: 'date', title: '日期' },
    { name: 'region', type: 'string', title: '区域' },
    { name: 'city', type: 'string', title: '城市' },
    { name: 'category', type: 'string', title: '品类' },
    { name: 'product', type: 'string', title: '商品' },
    { name: 'channel', type: 'string', title: '渠道' },
    { name: 'quantity', type: 'number', title: '数量' },
    { name: 'price', type: 'number', title: '单价' },
    { name: 'amount', type: 'number', title: '金额' },
    { name: 'cost', type: 'number', title: '成本' },
  ],
}

function random(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(next: () => number, items: readonly T[]): T {
  return items[Math.floor(next() * items.length)]!
}

function cents(value: number): number {
  return Math.round(value * 100) / 100
}

function generate(): readonly DataRow[] {
  const next = random(20251231)
  const start = Date.UTC(2025, 0, 1)
  const rows: DataRow[] = []
  for (let index = 0; index < ORDER_COUNT; index++) {
    const region = pick(next, REGIONS)
    const category = pick(next, CATEGORIES)
    const [product, price] = pick(next, category.products)
    const quantity = 1 + Math.floor(next() * 20)
    const amount = cents(quantity * price * (0.85 + next() * 0.15))
    rows.push({
      orderId: `SO${String(index + 1).padStart(5, '0')}`,
      date: new Date(start + Math.floor(next() * 365) * 86_400_000).toISOString().slice(0, 10),
      region: region.name,
      city: pick(next, region.cities),
      category: category.name,
      product,
      channel: pick(next, CHANNELS),
      quantity,
      price,
      amount,
      cost: cents(amount * (0.55 + next() * 0.25)),
    })
  }
  return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.orderId).localeCompare(String(b.orderId)))
}

export const salesRows: readonly DataRow[] = generate()

/** 取数方式：明细行交给查看器计算，或者模拟后端按请求的 query 聚合。 */
export interface DataSourceOptions {
  readonly aggregate: () => boolean
  readonly timeZone: string
  /** 模拟的网络延迟（毫秒）。 */
  readonly latency?: number
}

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted)
      return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

/** 按请求在内存里聚合并筛选，并给出不可累加度量需要的汇总行。 */
function aggregateOnServer(request: DatasetRequest, dataset: DatasetSchema, timeZone: string): DatasetData {
  const query = request.query!
  const filter = request.filter ?? undefined
  const run = (ids: readonly string[]): ReturnType<typeof runQuery> => {
    const reportQuery: ReportQuery = { dimensions: query.dimensions.filter(dimension => ids.includes(dimension.id)), measures: query.measures, filter }
    return runQuery(reportQuery, dataset, { kind: 'rows', rows: salesRows }, { timeZone })
  }
  const leaf = run(query.dimensions.map(dimension => dimension.id))
  const rollups: DatasetRollup[] = []
  for (const ids of query.rollups) {
    if (ids.length === 0)
      rollups.push({ dimensions: [], row: leaf.total })
    else
      rollups.push(...run(ids).rows.map(row => ({ dimensions: ids, row })))
  }
  return { kind: 'aggregated', rows: leaf.rows, rollups }
}

export function createDataProvider(options: DataSourceOptions): ReportDataProvider {
  return async (request, { signal }) => {
    await wait(options.latency ?? 240, signal)
    if (request.dataset !== salesDataset.id)
      throw new Error(`unknown dataset ${request.dataset}`)
    if (options.aggregate() && request.query)
      return aggregateOnServer(request, salesDataset, options.timeZone)
    return { kind: 'rows', rows: salesRows }
  }
}
