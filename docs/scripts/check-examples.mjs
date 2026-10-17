/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 校验 examples/reports/ 下的示例报表：每个文件导出 schema 与 rows，报表不能有校验问题，参数按缺省值要能取到值，
// 再像查看器那样为报表主体或看板的每张卡片生成取数请求，把 rows 当明细行交回，算出结果。只检查能算出来，不核对数值。

import { readdir } from 'node:fs/promises'
import process from 'node:process'
import { cardQuery, cardView, computeCard, computeView, createDatasetRequest, findDataset, isDataView, resolveParameters, validateDocument } from '@xihan-report/core'
import { createExpressionEngine } from '@xihan-ui/expression'

const reportsDir = new URL('../examples/reports/', import.meta.url)

function describe(result) {
  if (result.type === 'table')
    return `明细表 ${result.result.rows.length} 行`
  if (result.type === 'group')
    return '分组报表'
  if (result.type === 'crosstab')
    return '交叉表'
  return result.type
}

const failures = []
const files = (await readdir(reportsDir)).filter(name => name.endsWith('.ts')).sort()
for (const name of files) {
  const { schema, rows } = await import(new URL(name, reportsDir).href)
  const expressionEngine = createExpressionEngine()
  const issues = validateDocument(schema, { expressionEngine })
  if (issues.length > 0) {
    failures.push(`${name}：校验问题 ${issues.map(issue => `${issue.code} @ ${issue.path.join('.')}`).join('，')}`)
    continue
  }
  const parameters = resolveParameters(schema.parameters, {})
  if (parameters.issues.length > 0) {
    failures.push(`${name}：参数 ${parameters.issues.map(issue => `${issue.code} @ ${issue.path.join('.')}`).join('，')}`)
    continue
  }
  const options = { parameters: parameters.values, timeZone: 'Asia/Shanghai', expressionEngine }
  const data = { kind: 'rows', rows }
  try {
    const body = schema.body
    if (isDataView(body)) {
      const dataset = findDataset(schema, body.dataset)
      createDatasetRequest(body, dataset, { parameters: parameters.values })
      console.log(`${name}：${describe(computeView(body, dataset, data, options))}`)
      continue
    }
    if (body.type !== 'dashboard')
      throw new Error(`主体 ${body.type} 不是内置视图`)
    for (const card of body.cards) {
      const source = cardView(card) ?? cardQuery(card)
      const dataset = source === undefined ? undefined : findDataset(schema, source.dataset)
      if (source !== undefined)
        createDatasetRequest(source, dataset, { parameters: parameters.values })
      computeCard(card, dataset, source === undefined ? undefined : data, options)
    }
    console.log(`${name}：看板 ${body.cards.length} 张卡片`)
  }
  catch (error) {
    failures.push(`${name}：计算出错 ${error instanceof Error ? `${error.message} ${JSON.stringify(error.params ?? {})}` : String(error)}`)
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'))
  process.exit(1)
}
