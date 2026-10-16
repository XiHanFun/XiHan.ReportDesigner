/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表运行时的中文语言包：宿主用 mergeXhConfig 与 UI 的语言包合并后交给 setXhConfig 或 <xh-config>。

import type { XhConfig } from '@xihan-ui/web-components'
import type {} from './translations'

/** 报表运行时的简体中文文案。 */
export const reportZhCN: XhConfig = {
  translations: {
    'xh-report-viewer': {
      label: '报表',
      loading: '正在加载…',
      empty: '没有数据',
      error: '数据加载失败',
      invalid: '报表定义有问题，无法显示',
      parametersInvalid: '报表参数缺少或取值不合格',
      unsupported: '暂不支持这种视图',
      total: '总计',
      subtotal: '小计',
      missing: '（空）',
      parameters: '报表参数',
      clearSelections: '清除联动',
    },
  },
}
