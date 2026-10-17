/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 文档示例共用的销售订单：三个区域、两个品类、两个渠道，2026 年上半年每月一单，金额按固定规则算出，不含随机数。

import type { DataRow, DatasetSchema } from '@xihan-report/core'

// #region dataset
export const salesDataset: DatasetSchema = {
  id: 'sales',
  title: '销售订单',
  fields: [
    { name: 'orderId', type: 'string', title: '订单号' },
    { name: 'date', type: 'date', title: '日期' },
    { name: 'region', type: 'string', title: '区域' },
    { name: 'category', type: 'string', title: '品类' },
    { name: 'channel', type: 'string', title: '渠道' },
    { name: 'quantity', type: 'number', title: '数量' },
    { name: 'amount', type: 'number', title: '金额' },
  ],
}
// #endregion dataset

const REGIONS = ['华东', '华北', '华南']
const CATEGORIES = ['办公用品', '电子产品']
const CHANNELS = ['线上', '门店']

function buildRows(): DataRow[] {
  const rows: DataRow[] = []
  for (let month = 1; month <= 6; month++) {
    REGIONS.forEach((region, r) => {
      CATEGORIES.forEach((category, c) => {
        CHANNELS.forEach((channel, h) => {
          const quantity = 10 + ((month * 7 + r * 5 + c * 3 + h * 2) % 23)
          const price = c === 0 ? 18 : 260
          rows.push({
            orderId: `SO-2026${String(month).padStart(2, '0')}-${String(rows.length + 1).padStart(3, '0')}`,
            date: `2026-${String(month).padStart(2, '0')}-${String(3 + r * 7 + h * 3).padStart(2, '0')}`,
            region,
            category,
            channel,
            quantity,
            amount: quantity * price,
          })
        })
      })
    })
  }
  return rows
}

/** 72 行订单。 */
export const salesRows: readonly DataRow[] = buildRows()
