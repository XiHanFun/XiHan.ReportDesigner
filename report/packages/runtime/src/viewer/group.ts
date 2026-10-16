/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 分组报表：排成 <xh-table>，每级分组占一列（行首冻结），组头、明细与组小计依次成行，组头的键横跨其后各列，总计写进表尾。

import type { DatasetSchema, GroupNode, GroupReportResult, GroupView } from '@xihan-report/core'
import type { XhTableElement } from '@xihan-ui/web-components/define'
import type { RenderContext } from './context'
import type { TableColumnDef } from './table'
import { dimensionType, fieldLabel } from '../labels'
import { fieldType } from './context'
import { columnDef, headerRow, summaryCells, summaryType, tableRow, tableShell } from './table'

/** 分组报表里一行的种类。 */
type GroupRowKind = 'group' | 'detail' | 'subtotal'

interface GroupRow {
  readonly kind: GroupRowKind
  readonly level: number
  readonly cells: readonly { readonly id: string, readonly text: string }[]
}

/** 分组列的 id。 */
function groupColumnId(index: number): string {
  return `g${index}`
}

/** 把分组报表排成行：组头（可关）、明细或下一级、组小计（可关）；只列小计时最后一级每组一行。 */
function groupRows(view: GroupView, dataset: DatasetSchema, result: GroupReportResult, ctx: RenderContext): GroupRow[] {
  const { groups, columns } = view
  const detail = view.detail !== false
  const rows: GroupRow[] = []
  const blank = (): { id: string, text: string }[] => [...groups.map((_, index) => ({ id: groupColumnId(index), text: '' })), ...columns.map(column => ({ id: column.id, text: '' }))]

  const keyText = (node: GroupNode): string => {
    const group = groups[node.level]!
    return ctx.member(node.key, group.format, dimensionType(group, dataset))
  }

  const withSummaries = (cells: { id: string, text: string }[], node: GroupNode): { id: string, text: string }[] => cells.map((cell) => {
    const column = columns.find(item => item.id === cell.id)
    return column?.summary ? { id: cell.id, text: ctx.text(node.summary[column.id], column.format, summaryType(column, dataset)) } : cell
  })

  const walk = (nodes: readonly GroupNode[]): void => {
    for (const node of nodes) {
      const group = groups[node.level]!
      const leaf = node.level === groups.length - 1
      if (leaf && !detail) {
        const cells = blank()
        cells[node.level] = { id: groupColumnId(node.level), text: keyText(node) }
        rows.push({ kind: 'subtotal', level: node.level, cells: withSummaries(cells, node) })
        continue
      }
      if (group.header !== false) {
        const cells = blank()
        cells[node.level] = { id: groupColumnId(node.level), text: keyText(node) }
        rows.push({ kind: 'group', level: node.level, cells })
      }
      if (leaf) {
        for (const row of node.rows) {
          const cells = blank()
          columns.forEach((column, index) => {
            cells[groups.length + index] = { id: column.id, text: ctx.text(row[column.field], column.format, fieldType(dataset, column.field)) }
          })
          rows.push({ kind: 'detail', level: node.level, cells })
        }
      }
      else {
        walk(node.children)
      }
      if (group.subtotal !== false) {
        const cells = blank()
        cells[node.level] = { id: groupColumnId(node.level), text: group.header === false ? keyText(node) : ctx.translations.subtotal }
        rows.push({ kind: 'subtotal', level: node.level, cells: withSummaries(cells, node) })
      }
    }
  }
  walk(result.groups)
  return rows
}

/** 把分组报表排进 container，返回表格元素。 */
export function renderGroupReport(container: HTMLElement, view: GroupView, dataset: DatasetSchema, result: GroupReportResult, ctx: RenderContext): XhTableElement {
  const { groups, columns } = view
  const groupColumns: TableColumnDef[] = groups.map((group, index) => ({ id: groupColumnId(index), label: fieldLabel(dataset, group.field, group.title), sticky: 'start' }))
  const definitions = [...groupColumns, ...columns.map(column => columnDef(column, dataset))]
  const shell = tableShell(ctx, result.total !== null)
  shell.header.append(headerRow(definitions.map(column => ({ id: column.id, label: column.label ?? '' }))))

  const rows = groupRows(view, dataset, result, ctx)
  shell.body.append(...rows.map((row, index) => tableRow(`r${index}`, row.cells, { 'data-kind': row.kind })))
  if (result.total) {
    const total = result.total
    const summary = summaryCells(columns, dataset, total, '', ctx)
    shell.footer!.append(tableRow(undefined, [
      ...groups.map((_, index) => ({ id: groupColumnId(index), text: index === 0 ? ctx.translations.total : '' })),
      ...summary,
    ], { 'data-kind': 'total' }))
  }

  const width = definitions.length
  shell.table.columns = definitions
  shell.table.rows = rows.map((_, index) => ({ id: `r${index}` }))
  shell.table.cellSpan = ({ rowIndex, columnIndex }) => {
    const row = rows[rowIndex]
    return row?.kind === 'group' && columnIndex === row.level ? { colSpan: width - row.level } : null
  }
  container.replaceChildren(shell.table)
  return shell.table
}
