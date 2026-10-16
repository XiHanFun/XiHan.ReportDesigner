/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 交叉表：排成 <xh-table>。列轴的表头树写成列定义的 children（多级表头由表格的 headerRows 逐层铺），
// 行维度各占一列冻结在行首，相同的上层成员与小计、总计的标签经 cellSpan 合并。

import type { CrosstabAxisNode, CrosstabLabel, CrosstabResult, CrosstabView, DatasetSchema } from '@xihan-report/core'
import type { XhTableElement } from '@xihan-ui/web-components/define'
import type { RenderContext } from './context'
import type { TableColumnDef } from './table'
import { crosstabAxes } from '@xihan-report/core'
import { dimensionType, fieldLabel, measureLabel, measureType } from '../labels'
import { COLUMN_WIDTH, headerRow, tableRow, tableShell } from './table'

function labelText(label: CrosstabLabel, dataset: DatasetSchema, ctx: RenderContext): string {
  switch (label.kind) {
    case 'member':
      return ctx.member(label.value, label.dimension.format, dimensionType(label.dimension, dataset))
    case 'subtotal':
      return ctx.translations.subtotal
    case 'total':
      return ctx.translations.total
    case 'measure':
      return measureLabel(label.measure, dataset)
  }
}

function columnTree(nodes: readonly CrosstabAxisNode[], dataset: DatasetSchema, ctx: RenderContext): TableColumnDef[] {
  return nodes.map(node => node.children.length > 0
    ? { id: `h${node.level}:${node.start}`, label: labelText(node.label, dataset, ctx), children: columnTree(node.children, dataset, ctx) }
    : { id: `c${node.start}`, label: labelText(node.label, dataset, ctx), width: COLUMN_WIDTH, align: 'end' })
}

function forEachNode(nodes: readonly CrosstabAxisNode[], visit: (node: CrosstabAxisNode) => void): void {
  for (const node of nodes) {
    visit(node)
    forEachNode(node.children, visit)
  }
}

/** 按表格算出的 headerRows 逐层写表头行；表格还没升级时等它注册后再写。 */
function fillHeader(table: XhTableElement, header: HTMLElement): void {
  const fill = (): void => {
    if (!table.isConnected)
      return
    header.replaceChildren(...table.headerRows.map((cells, index) => headerRow(cells.map(cell => ({ id: cell.id, label: cell.label ?? '' })), index + 1)))
    table.requestUpdate()
  }
  if (typeof table.requestUpdate === 'function')
    fill()
  else
    void customElements.whenDefined('xh-table').then(() => queueMicrotask(fill))
}

/** 把交叉表排进 container，返回表格元素。 */
export function renderCrosstab(container: HTMLElement, view: CrosstabView, dataset: DatasetSchema, result: CrosstabResult, ctx: RenderContext): XhTableElement {
  const axes = crosstabAxes(view, result)
  const rowLevels = axes.rows.levels
  const rowColumns: TableColumnDef[] = Array.from({ length: rowLevels }, (_, level) => {
    const dimension = view.rows[level]
    return { id: `row${level}`, label: dimension ? fieldLabel(dataset, dimension.field, dimension.title) : '', width: COLUMN_WIDTH, sticky: 'start' }
  })
  const valueLeaves = axes.columns.leaves

  const spans = new Map<string, { rowSpan: number, colSpan: number }>()
  const covered = new Set<string>()
  forEachNode(axes.rows.tree, (node) => {
    if (node.count === 1 && node.span === 1)
      return
    spans.set(`${node.start}:${node.level}`, { rowSpan: node.count, colSpan: node.span })
    for (let row = node.start; row < node.start + node.count; row++) {
      for (let level = node.level; level < node.level + node.span; level++) {
        if (row !== node.start || level !== node.level)
          covered.add(`${row}:${level}`)
      }
    }
  })

  const shell = tableShell(ctx, false)
  const rows = axes.rows.leaves.map((rowLeaf, r) => tableRow(`r${r}`, [
    ...rowColumns.map((column, level) => {
      const label = rowLeaf.labels[level]
      return { id: column.id, text: label && !covered.has(`${r}:${level}`) ? labelText(label, dataset, ctx) : '' }
    }),
    ...valueLeaves.map((columnLeaf, c) => {
      const index = columnLeaf.measure ?? rowLeaf.measure ?? 0
      const measure = view.measures[index]!
      const value = result.cells[rowLeaf.header]?.[columnLeaf.header]?.[index]
      return { id: `c${c}`, text: ctx.text(value, measure.format, measureType(measure, dataset)) }
    }),
  ], rowLeaf.emphasis ? { 'data-kind': 'subtotal' } : {}))
  shell.body.append(...rows)

  shell.table.columns = [...rowColumns, ...columnTree(axes.columns.tree, dataset, ctx)]
  shell.table.rows = axes.rows.leaves.map((_, index) => ({ id: `r${index}` }))
  shell.table.cellSpan = ({ rowIndex, columnIndex }) => (columnIndex < rowLevels ? spans.get(`${rowIndex}:${columnIndex}`) ?? null : null)
  container.replaceChildren(shell.table)
  fillHeader(shell.table, shell.header)
  return shell.table
}
