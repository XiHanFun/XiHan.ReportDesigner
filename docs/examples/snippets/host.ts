/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 与宿主集成：取数回调把请求交给自己的接口。

import type { DatasetData } from '@xihan-report/core'
import type { ReportDataProvider } from '@xihan-report/runtime'

// #region provider
export const dataProvider: ReportDataProvider = async (request, { signal }) => {
  const response = await fetch(`/api/reports/datasets/${encodeURIComponent(request.dataset)}/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  })
  if (!response.ok)
    throw new Error(`取数失败：${response.status}`)
  return await response.json() as DatasetData
}
// #endregion provider
