/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 用代码编辑报表：新增一张饼图卡片，给它加上区域维度与金额度量并补全绑定，后三步合为一步撤销；
// 再删掉一个用着的字段，引用它的列表项与条件一并删掉。

import type { XhReportDesigner } from '@xihan-report/designer'
import { applyOperations, cardTemplate, planAddFieldItem, planFillBindings, planRemoveField } from '@xihan-report/core'

export function addRegionChart(designer: XhReportDesigner): void {
  // #region add
  const card = designer.addCard(cardTemplate('chart.pie', 'sales'))
  const owner = { card: card.id }
  const start = designer.schema!
  const dimension = planAddFieldItem(start, owner, 'dimensions', 'region')
  const withDimension = applyOperations(start, dimension).document
  const measure = planAddFieldItem(withDimension, owner, 'measures', 'amount')
  const withMeasure = applyOperations(withDimension, measure).document
  designer.execute([...dimension, ...measure, ...planFillBindings(withMeasure, card.id)])
  // #endregion add
}

export function removeChannel(designer: XhReportDesigner): void {
  // #region remove
  const removal = planRemoveField(designer.schema!, 'sales', 'channel')
  designer.execute(removal.operations)
  // #endregion remove
}
