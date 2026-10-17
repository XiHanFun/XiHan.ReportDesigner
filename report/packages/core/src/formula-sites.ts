/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表里的公式所在处：计算字段、公式度量与列的汇总公式；改名时按引用改写它们。

import type { ReportOperation } from './operations'
import type { DataView, ReportDocument, ReportQuery } from './schema'
import { renameReferences } from '@xihan-ui/expression'
import { bodyQuery, cardQuery, cardView, isDataView } from './card-data'

/** 一处公式与改写它的操作。 */
export interface FormulaSite {
  readonly source: string
  readonly write: (next: string) => ReportOperation
}

/** 数据集里计算字段的公式；skip 给出的字段不列（它自己正在改名）。 */
export function fieldFormulaSites(document: ReportDocument, dataset?: string, skip?: string): FormulaSite[] {
  const sites: FormulaSite[] = []
  for (const schema of document.datasets) {
    if (dataset !== undefined && schema.id !== dataset)
      continue
    for (const field of schema.fields) {
      if (field.formula !== undefined && field.name !== skip)
        sites.push({ source: field.formula, write: next => ({ type: 'updateField', dataset: schema.id, name: field.name, changes: [{ path: ['formula'], value: next }] }) })
    }
  }
  return sites
}

/** 公式度量与明细表、分组报表列的汇总公式。 */
export function viewFormulaSites(document: ReportDocument): FormulaSite[] {
  const sites: FormulaSite[] = []
  const body = document.body
  type Owner = { readonly card: string | undefined, readonly view: DataView } | { readonly card: string | undefined, readonly query: ReportQuery }
  const ownerOf = (card: string, view: DataView | undefined, query: ReportQuery | undefined): Owner[] =>
    view ? [{ card, view }] : query ? [{ card, query }] : []
  const views: Owner[] = body.type === 'dashboard'
    ? body.cards.flatMap(card => ownerOf(card.id, cardView(card), cardQuery(card)?.query))
    : isDataView(body)
      ? [{ card: undefined, view: body }]
      : bodyQuery(body) ? [{ card: undefined, query: bodyQuery(body)!.query }] : []
  for (const owner of views) {
    if ('query' in owner) {
      owner.query.measures.forEach((measure, index) => {
        if (!('formula' in measure))
          return
        const path = ['query', 'measures', index, 'formula']
        sites.push({
          source: measure.formula,
          write: next => owner.card === undefined
            ? { type: 'updateView', changes: [{ path, value: next }] }
            : { type: 'updateCard', id: owner.card, changes: [{ path, value: next }] },
        })
      })
      continue
    }
    const view = owner.view
    const update = (path: readonly (string | number)[], next: string): ReportOperation => owner.card === undefined
      ? { type: 'updateView', changes: [{ path, value: next }] }
      : { type: 'updateView', card: owner.card, changes: [{ path, value: next }] }
    if (view.type === 'crosstab') {
      view.measures.forEach((measure, index) => {
        if ('formula' in measure)
          sites.push({ source: measure.formula, write: next => update(['measures', index, 'formula'], next) })
      })
    }
    else {
      view.columns.forEach((column, index) => {
        if (column.summary && 'formula' in column.summary)
          sites.push({ source: column.summary.formula, write: next => update(['columns', index, 'summary', 'formula'], next) })
      })
    }
  }
  return sites
}

/** 按 rename 改写公式：只出改了的那几处；解析不了的公式原样留着（交给校验报出）。 */
export function renameFormulas(sites: readonly FormulaSite[], rename: (path: readonly string[]) => readonly string[] | undefined): ReportOperation[] {
  const operations: ReportOperation[] = []
  for (const site of sites) {
    const result = renameReferences(site.source, rename)
    if (result.ok && result.renamed > 0)
      operations.push(site.write(result.source))
  }
  return operations
}
