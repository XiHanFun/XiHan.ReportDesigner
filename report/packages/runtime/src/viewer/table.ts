/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 明细表：排成 <xh-table>，合计写进表尾；行数多时表体交给 <xh-virtualizer>，只渲染窗口里的行。

import type { DatasetSchema, TableColumn, TableResult, TableView } from '@xihan-report/core'
import type { XhTableElement, XhVirtualizerElement } from '@xihan-ui/web-components/define'
import type { RenderContext } from './context'
import { fieldTitle, fieldType } from './context'
import { uiPart } from './dom'

/** 超过这个行数时虚拟滚动。 */
export const VIRTUAL_ROW_THRESHOLD = 200

/** 虚拟滚动时每行的估算高度（px），只用于首帧排布，之后按实测。 */
const ESTIMATED_ROW_SIZE = 36

/** xh-table 的列定义。 */
export type TableColumnDef = NonNullable<XhTableElement['columns']>[number]

/** xh-table 的外壳。 */
export interface TableShell {
  readonly table: XhTableElement
  readonly root: HTMLElement
  readonly header: HTMLElement
  readonly body: HTMLElement
  readonly footer: HTMLElement | undefined
}

/** 建一行：row 部件与各列的 cell 部件。 */
export function tableRow(value: string | undefined, cells: readonly { readonly id: string, readonly text: string }[], attributes: Readonly<Record<string, string>> = {}): HTMLElement {
  const row = uiPart('div', 'row', value === undefined ? attributes : { ...attributes, value })
  row.append(...cells.map(cell => uiPart('div', 'cell', { value: cell.id }, cell.text)))
  return row
}

/** 一层表头行。 */
export function headerRow(columns: readonly { readonly id: string, readonly label: string }[], level?: number): HTMLElement {
  const row = uiPart('div', 'row', level === undefined ? {} : { level: String(level) })
  row.append(...columns.map((column) => {
    const header = uiPart('div', 'column-header', { value: column.id })
    header.append(uiPart('span', 'column-label', {}, column.label))
    return header
  }))
  return row
}

/** xh-table 的外壳：root 里依次是 header、body、footer 与加载、空态占位。 */
export function tableShell(ctx: RenderContext, footer: boolean): TableShell {
  const table = document.createElement('xh-table') as XhTableElement
  table.setAttribute('sticky-header', '')
  if (footer)
    table.setAttribute('footer', '')
  const root = uiPart('div', 'root')
  const header = uiPart('div', 'header')
  const body = uiPart('div', 'body')
  const foot = footer ? uiPart('div', 'footer') : undefined
  root.append(header, body, ...(foot ? [foot] : []), uiPart('div', 'loading', {}, ctx.translations.loading), uiPart('div', 'empty', {}, ctx.translations.empty))
  table.append(root)
  return { table, root, header, body, footer: foot }
}

function columnLabel(column: TableColumn, dataset: DatasetSchema): string {
  return column.title ?? fieldTitle(dataset, column.field)
}

/** 报表的列换成 xh-table 的列定义。 */
export function columnDef(column: TableColumn, dataset: DatasetSchema): TableColumnDef {
  return {
    id: column.id,
    label: columnLabel(column, dataset),
    ...(column.width === undefined ? {} : { width: column.width }),
    ...(column.align === undefined ? {} : { align: column.align }),
    ...(column.sticky === undefined ? {} : { sticky: column.sticky }),
  }
}

/** 汇总值的字段类型：min / max 沿用字段类型，其余汇总是数值。 */
export function summaryType(column: TableColumn, dataset: DatasetSchema): ReturnType<typeof fieldType> {
  const summary = column.summary
  return summary && 'aggregate' in summary && (summary.aggregate === 'min' || summary.aggregate === 'max') ? fieldType(dataset, column.field) : undefined
}

/** 汇总行的各格：带汇总的列写汇总值，第一个不带汇总的列写 label。 */
export function summaryCells(columns: readonly TableColumn[], dataset: DatasetSchema, values: Readonly<Record<string, unknown>>, label: string, ctx: RenderContext): { id: string, text: string }[] {
  const first = columns.findIndex(column => column.summary === undefined)
  return columns.map((column, index) => ({
    id: column.id,
    text: column.summary ? ctx.text(values[column.id], column.format, summaryType(column, dataset)) : index === first ? label : '',
  }))
}

/** 把明细表排进 container，返回表格元素。 */
export function renderDetailTable(container: HTMLElement, view: TableView, dataset: DatasetSchema, result: TableResult, ctx: RenderContext): XhTableElement {
  const columns = view.columns
  const shell = tableShell(ctx, result.summary !== null)
  shell.header.append(headerRow(columns.map(column => ({ id: column.id, label: columnLabel(column, dataset) }))))
  if (result.summary)
    shell.footer!.append(tableRow(undefined, summaryCells(columns, dataset, result.summary, ctx.translations.total, ctx)))

  const rowCells = (index: number): { id: string, text: string }[] => {
    const row = result.rows[index]!
    return columns.map(column => ({ id: column.id, text: ctx.text(row[column.field], column.format, fieldType(dataset, column.field)) }))
  }
  shell.table.columns = columns.map(column => columnDef(column, dataset))
  shell.table.rows = result.rows.map((_, index) => ({ id: `r${index}` }))

  if (result.rows.length <= VIRTUAL_ROW_THRESHOLD) {
    shell.body.append(...result.rows.map((_, index) => tableRow(`r${index}`, rowCells(index))))
    container.replaceChildren(shell.table)
    return shell.table
  }

  shell.root.dataset.virtual = ''
  const virtualizer = document.createElement('xh-virtualizer') as XhVirtualizerElement
  virtualizer.setAttribute('count', String(result.rows.length))
  virtualizer.setAttribute('estimate-size', String(ESTIMATED_ROW_SIZE))
  virtualizer.setAttribute('viewport-tab-index', '-1')
  const virtualRoot = uiPart('div', 'root')
  const viewport = uiPart('div', 'viewport')
  const content = uiPart('div', 'content')
  viewport.append(content)
  virtualRoot.append(viewport)
  virtualizer.append(virtualRoot)
  shell.body.append(virtualizer)
  container.replaceChildren(shell.table)

  const render = (items: readonly { readonly index: number }[]): void => {
    content.replaceChildren(...items.map((item) => {
      const slot = uiPart('div', 'item', { value: String(item.index), measure: '' })
      slot.append(tableRow(`r${item.index}`, rowCells(item.index), { 'data-xh-part-owner': 'table' }))
      return slot
    }))
    virtualizer.requestUpdate()
    shell.table.virtualizer = virtualizer.collectionVirtualizer ?? undefined
    shell.table.requestUpdate()
  }
  if (virtualizer.isConnected && typeof virtualizer.requestUpdate === 'function')
    render(virtualizer.virtualItems)
  virtualizer.addEventListener('range-change', event => render((event as CustomEvent<{ virtualItems: readonly { index: number }[] }>).detail.virtualItems))
  return shell.table
}
