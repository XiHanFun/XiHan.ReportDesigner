/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 交叉表：排成 <xh-table>。列轴的表头树写成列定义的 children（多级表头由表格的 headerRows 逐层铺），
// 行维度各占一列冻结在行首，相同的上层成员与小计的标签经 cellSpan 合并；行轴的总计（度量排在行轴上时每个度量一行）写进表尾。
// 行数多时表体交给 <xh-virtualizer>，合并区按在场的行铺开。

import type { CrosstabAxisNode, CrosstabLabel, CrosstabLeaf, CrosstabResult, CrosstabView, DatasetSchema } from '@xihan-report/core'
import type { XhTableElement } from '@xihan-ui/web-components/define'
import type { RenderContext } from './context'
import type { RenderedTable, TableCellRef, TableCellSpec, TableColumnDef } from './table'
import { crosstabAxes } from '@xihan-report/core'
import { dimensionType, fieldLabel, measureLabel, measureType } from '../labels'
import { COLUMN_WIDTH, fillTableBody, headerRow, rowIndex, tableRow, tableShell } from './table'

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

/** 一个叶子上各维度成员的取值，键是维度 id。 */
function memberValues(leaf: CrosstabLeaf): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  for (const label of leaf.labels) {
    if (label?.kind === 'member')
      values[label.dimension.id] = label.value
  }
  return values
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

/** 把交叉表排进 container。 */
export function renderCrosstab(container: HTMLElement, view: CrosstabView, dataset: DatasetSchema, result: CrosstabResult, ctx: RenderContext, label: string): RenderedTable {
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

  const leaves = axes.rows.leaves
  const totalStart = leaves.findIndex(leaf => leaf.labels[0]?.kind === 'total')
  const bodyLeaves = totalStart < 0 ? leaves : leaves.slice(0, totalStart)
  const totalLeaves = totalStart < 0 ? [] : leaves.slice(totalStart)
  // 表体里被纵向合并掉的格子也写标签：只渲一段行时由它接替起点；表尾不合并，被跨过的格子留空
  const cells = (rowLeaf: CrosstabLeaf, r: number, footer: boolean): TableCellSpec[] => [
    ...rowColumns.map((column, level) => {
      const label = rowLeaf.labels[level]
      return { id: column.id, text: label && !(footer && covered.has(`${r}:${level}`)) ? labelText(label, dataset, ctx) : '' }
    }),
    ...valueLeaves.map((columnLeaf, c) => {
      const index = columnLeaf.measure ?? rowLeaf.measure ?? 0
      const measure = view.measures[index]!
      const value = result.cells[rowLeaf.header]?.[columnLeaf.header]?.[index]
      return { id: `c${c}`, text: ctx.text(value, measure.format, measureType(measure, dataset)) }
    }),
  ]

  const shell = tableShell(ctx, totalLeaves.length, label)
  shell.footer?.append(...totalLeaves.map((rowLeaf, index) => tableRow(undefined, cells(rowLeaf, totalStart + index, true), { 'data-kind': 'total', 'level': String(index + 1) })))

  shell.table.columns = [...rowColumns, ...columnTree(axes.columns.tree, dataset, ctx)]
  shell.table.rows = bodyLeaves.map((_, index) => ({ id: `r${index}` }))
  shell.table.cellSpan = ({ rowIndex, columnIndex }) => (columnIndex < rowLevels ? spans.get(`${rowIndex}:${columnIndex}`) ?? null : null)
  container.replaceChildren(shell.table)
  fillTableBody(shell, bodyLeaves.length, (r) => {
    const rowLeaf = bodyLeaves[r]!
    return tableRow(`r${r}`, cells(rowLeaf, r, false), rowLeaf.emphasis ? { 'data-kind': 'subtotal' } : {})
  })
  fillHeader(shell.table, shell.header)
  return {
    element: shell.table,
    cellOf(row, column): TableCellRef | undefined {
      const rowLeaf = bodyLeaves[rowIndex(row)]
      if (!rowLeaf)
        return undefined
      const kind = rowLeaf.labels.some(label => label?.kind === 'subtotal') ? 'subtotal' : 'detail'
      const columnLeaf = column !== null && /^c\d+$/.test(column) ? valueLeaves[Number(column.slice(1))] : undefined
      if (columnLeaf) {
        const measure = view.measures[columnLeaf.measure ?? rowLeaf.measure ?? 0]
        return { kind, column: measure?.id ?? null, values: { ...memberValues(columnLeaf), ...memberValues(rowLeaf) } }
      }
      const level = column !== null && /^row\d+$/.test(column) ? Number(column.slice(3)) : -1
      return { kind, column: view.rows[level]?.id ?? null, values: memberValues(rowLeaf) }
    },
  }
}
