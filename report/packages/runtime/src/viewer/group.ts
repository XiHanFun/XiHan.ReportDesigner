/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 分组报表：排成树形的 <xh-table>，每级分组占一列（行首冻结），组头、明细与组小计依次成行，组头的键横跨其后各列，总计写进表尾。
// 组头是可开合的父行，组里的明细与下一级挂在它下面，组小计与组头同级，收起后留组头与小计；表体按表格给的可见行铺。

import type { DatasetSchema, GroupNode, GroupReportResult, GroupView } from '@xihan-report/core'
import type { RenderContext } from './context'
import type { RenderedTable, TableCellRef, TableCellSpec, TableColumnDef } from './table'
import { dimensionType, fieldLabel } from '../labels'
import { fieldType } from './context'
import { COLUMN_WIDTH, columnDef, fillTableBody, headerRow, rowIndex, summaryCells, summaryType, tableRow, tableShell } from './table'

/** 分组报表里一行的种类。 */
type GroupRowKind = 'group' | 'detail' | 'subtotal'

interface GroupRow {
  readonly id: string
  /** 所在组的组头行；顶层或所在组不出组头时为 undefined。 */
  readonly parentId: string | undefined
  readonly kind: GroupRowKind
  readonly level: number
  readonly cells: readonly TableCellSpec[]
  /** 这一行的组键（分组 id 到键），明细行另带各列 id 到字段值。 */
  readonly values: Readonly<Record<string, unknown>>
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
  const blank = (): TableCellSpec[] => [...groups.map((_, index) => ({ id: groupColumnId(index), text: '' })), ...columns.map(column => ({ id: column.id, text: '' }))]
  const push = (row: Omit<GroupRow, 'id'>): string => {
    const id = `r${rows.length}`
    rows.push({ id, ...row })
    return id
  }

  const keyText = (node: GroupNode): string => {
    const group = groups[node.level]!
    return ctx.member(node.key, group.format, dimensionType(group, dataset))
  }

  const withSummaries = (cells: TableCellSpec[], node: GroupNode): TableCellSpec[] => cells.map((cell) => {
    const column = columns.find(item => item.id === cell.id)
    return column?.summary ? { id: cell.id, text: ctx.text(node.summary[column.id], column.format, summaryType(column, dataset)) } : cell
  })

  const walk = (nodes: readonly GroupNode[], path: Readonly<Record<string, unknown>>, parentId: string | undefined): void => {
    for (const node of nodes) {
      const group = groups[node.level]!
      const leaf = node.level === groups.length - 1
      const values = { ...path, [group.id]: node.key }
      if (leaf && !detail) {
        const cells = blank()
        cells[node.level] = { id: groupColumnId(node.level), text: keyText(node) }
        push({ parentId, kind: 'subtotal', level: node.level, cells: withSummaries(cells, node), values })
        continue
      }
      let inner = parentId
      if (group.header !== false) {
        const cells = blank()
        cells[node.level] = { id: groupColumnId(node.level), text: keyText(node), expand: true }
        inner = push({ parentId, kind: 'group', level: node.level, cells, values })
      }
      if (leaf) {
        for (const row of node.rows) {
          const cells = blank()
          columns.forEach((column, index) => {
            cells[groups.length + index] = { id: column.id, text: ctx.text(row[column.field], column.format, fieldType(dataset, column.field)) }
          })
          push({ parentId: inner, kind: 'detail', level: node.level, cells, values: { ...Object.fromEntries(columns.map(column => [column.id, row[column.field]])), ...values } })
        }
      }
      else {
        walk(node.children, values, inner)
      }
      if (group.subtotal !== false) {
        const cells = blank()
        cells[node.level] = { id: groupColumnId(node.level), text: group.header === false ? keyText(node) : ctx.translations.subtotal }
        push({ parentId, kind: 'subtotal', level: node.level, cells: withSummaries(cells, node), values })
      }
    }
  }
  walk(result.groups, {}, undefined)
  return rows
}

/** 展开集合下看得见的行：父行看得见且展开了，子行才看得见；父行排在子行之前。 */
function visibleRows(rows: readonly GroupRow[], expanded: ReadonlySet<string>): GroupRow[] {
  const shown = new Set<string>()
  return rows.filter((row) => {
    const visible = row.parentId === undefined || (shown.has(row.parentId) && expanded.has(row.parentId))
    if (visible)
      shown.add(row.id)
    return visible
  })
}

/** 把分组报表排进 container。 */
export function renderGroupReport(container: HTMLElement, view: GroupView, dataset: DatasetSchema, result: GroupReportResult, ctx: RenderContext, label: string): RenderedTable {
  const { groups, columns } = view
  const groupColumns: TableColumnDef[] = groups.map((group, index) => ({ id: groupColumnId(index), label: fieldLabel(dataset, group.field, group.title), width: COLUMN_WIDTH, sticky: 'start' }))
  const definitions = [...groupColumns, ...columns.map(column => columnDef(column, dataset))]
  const shell = tableShell(ctx, result.total === null ? 0 : 1, label)
  shell.header.append(headerRow(definitions.map(column => ({ id: column.id, label: column.label ?? '' }))))

  const rows = groupRows(view, dataset, result, ctx)
  const byId = new Map(rows.map(row => [row.id, row]))
  const parents = new Set(rows.flatMap(row => (row.parentId === undefined ? [] : [row.parentId])))
  const rowElement = (row: GroupRow): HTMLElement => tableRow(row.id, row.cells.map(cell => (cell.expand && !parents.has(row.id) ? { id: cell.id, text: cell.text } : cell)), { 'data-kind': row.kind })
  if (result.total) {
    const total = result.total
    const summary = summaryCells(columns, dataset, total, '', ctx)
    shell.footer!.append(tableRow(undefined, [
      ...groups.map((_, index) => ({ id: groupColumnId(index), text: index === 0 ? ctx.translations.total : '' })),
      ...summary,
    ], { 'data-kind': 'total', 'level': '1' }))
  }

  shell.table.columns = definitions
  shell.table.rows = rows.map(row => (row.parentId === undefined ? { id: row.id } : { id: row.id, parentId: row.parentId }))
  shell.table.expandedValue = [...parents]
  shell.table.cellSpan = ({ row: current, columnIndex }) => {
    const row = byId.get(current.id)
    return row?.kind === 'group' && columnIndex === row.level && row.level < groups.length - 1 ? { colSpan: groups.length - row.level } : null
  }
  container.replaceChildren(shell.table)
  let order = rows
  const body = fillTableBody(shell, order.length, index => rowElement(order[index]!))
  // 展开集合受控：先按新集合铺表体（虚拟滚动时先换条数），再交给表格，表格重排时条数已对得上
  shell.table.addEventListener('expanded-value-change', (event) => {
    const value = (event as CustomEvent<{ value: string[] }>).detail.value
    order = visibleRows(rows, new Set(value))
    body.refresh(order.length)
    shell.table.expandedValue = value
  })
  const columnOf = (column: string | null): string | null => {
    const level = column?.startsWith('g') ? groups.findIndex((_, index) => groupColumnId(index) === column) : -1
    if (level >= 0)
      return groups[level]!.id
    return columns.some(item => item.id === column) ? column : null
  }
  return {
    element: shell.table,
    cellOf(row, column): TableCellRef | undefined {
      const item = rows[rowIndex(row)]
      return item ? { kind: item.kind, column: columnOf(column), values: item.values } : undefined
    },
  }
}
