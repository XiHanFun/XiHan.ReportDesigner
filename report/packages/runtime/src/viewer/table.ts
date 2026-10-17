/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 明细表：排成 <xh-table>，合计写进表尾；三类表格共用的外壳、行与表体铺法也在这里，行数多时表体交给 <xh-virtualizer>，只渲染窗口里的行。

import type { DatasetSchema, TableColumn, TableResult, TableView } from '@xihan-report/core'
import type { XhTableElement, XhVirtualizerElement } from '@xihan-ui/web-components/define'
import type { RenderContext } from './context'
import { fieldTitle, fieldType } from './context'
import { uiPart } from './dom'

/** 超过这个行数时虚拟滚动。 */
export const VIRTUAL_ROW_THRESHOLD = 200

/** 没写宽度的列取的列宽：各行的单元格按同一列宽排，表头与表体对齐。 */
export const COLUMN_WIDTH = '8rem'

/** 虚拟滚动时每行的估算高度（px），只用于首帧排布，之后按实测。 */
const ESTIMATED_ROW_SIZE = 36

/** xh-table 的列定义。 */
export type TableColumnDef = NonNullable<XhTableElement['columns']>[number]

/** 表格里被行主操作点中的那一格在报表里的含义。 */
export interface TableCellRef {
  /** 行的种类：明细行（交叉表是成员行）、组头、小计；总计在表尾，不报行主操作。 */
  readonly kind: 'detail' | 'group' | 'subtotal'
  /**
   * 点中那一格所在的报表列：明细表与分组报表是列 id 或分组 id，交叉表的值格是度量 id、行表头格是行维度 id；
   * 焦点行上按 Enter 时为 null。
   */
  readonly column: string | null
  /**
   * 这一行（与点中那一列）在各维度上的取值，键与看板联动的 dimension 同一套写法：
   * 明细表是列 id，分组报表是分组 id（明细行另带各列 id），交叉表是行、列维度 id。
   */
  readonly values: Readonly<Record<string, unknown>>
}

/** 渲染好的表格：按 xh-table 行主操作报出的行 id 与列 id 查出点中的那一格。 */
export interface RenderedTable {
  readonly element: XhTableElement
  readonly cellOf: (row: string, column: string | null) => TableCellRef | undefined
}

/** 行 id（r 加下标）里的下标；对不上时为 -1。 */
export function rowIndex(id: string): number {
  return /^r\d+$/.test(id) ? Number(id.slice(1)) : -1
}

/** xh-table 的外壳。 */
export interface TableShell {
  readonly table: XhTableElement
  readonly root: HTMLElement
  readonly header: HTMLElement
  readonly body: HTMLElement
  readonly footer: HTMLElement | undefined
}

/** 一行里的一格：expand 为真时格子里先放开合钮。 */
export interface TableCellSpec {
  readonly id: string
  readonly text: string
  readonly expand?: boolean
}

/** 建一行：row 部件与各列的 cell 部件。 */
export function tableRow(value: string | undefined, cells: readonly TableCellSpec[], attributes: Readonly<Record<string, string>> = {}): HTMLElement {
  const row = uiPart('div', 'row', value === undefined ? attributes : { ...attributes, value })
  row.append(...cells.map((cell) => {
    if (!cell.expand)
      return uiPart('div', 'cell', { value: cell.id }, cell.text)
    const element = uiPart('div', 'cell', { value: cell.id })
    element.append(uiPart('span', 'expand-trigger'), cell.text)
    return element
  }))
  return row
}

/** 铺好的表体：行数变了（树形表开合）时按新的行重铺。 */
export interface TableBody {
  readonly refresh: (count: number) => void
}

/**
 * 铺表体：rowAt 给出第几行的节点。行数不超过阈值时直接铺；超过时交给 <xh-virtualizer>，只铺窗口里的行，
 * 行节点归表格（data-xh-part-owner）。是否虚拟按第一次的行数定，之后行数变了只换 count。表格须已在文档里。
 */
export function fillTableBody(shell: TableShell, count: number, rowAt: (index: number) => HTMLElement): TableBody {
  if (count <= VIRTUAL_ROW_THRESHOLD) {
    const refresh = (rows: number): void => {
      shell.body.replaceChildren(...Array.from({ length: rows }, (_, index) => rowAt(index)))
    }
    refresh(count)
    return { refresh }
  }
  shell.root.dataset.virtual = ''
  const virtualizer = document.createElement('xh-virtualizer') as XhVirtualizerElement
  virtualizer.setAttribute('count', String(count))
  virtualizer.setAttribute('estimate-size', String(ESTIMATED_ROW_SIZE))
  virtualizer.setAttribute('viewport-tab-index', '-1')
  const virtualRoot = uiPart('div', 'root')
  const viewport = uiPart('div', 'viewport')
  const content = uiPart('div', 'content')
  viewport.append(content)
  virtualRoot.append(viewport)
  virtualizer.append(virtualRoot)
  shell.body.replaceChildren(virtualizer)

  // 条目按下标复用：窗口没变就不动节点，只增删进出窗口的那几条，实测过的条目高度不会因重建而反复变化
  let slots = new Map<number, HTMLElement>()
  let shown = ''
  const render = (items: readonly { readonly index: number }[]): void => {
    const key = items.map(item => item.index).join(',')
    if (key === shown)
      return
    shown = key
    const next = new Map<number, HTMLElement>()
    const nodes = items.map((item) => {
      let slot = slots.get(item.index)
      if (!slot) {
        slot = uiPart('div', 'item', { value: String(item.index), measure: '' })
        const row = rowAt(item.index)
        row.setAttribute('data-xh-part-owner', 'table')
        slot.append(row)
      }
      next.set(item.index, slot)
      return slot
    })
    for (const [index, slot] of slots) {
      if (!next.has(index))
        slot.remove()
    }
    nodes.forEach((slot, position) => {
      if (content.children[position] !== slot)
        content.insertBefore(slot, content.children[position] ?? null)
    })
    slots = next
    virtualizer.requestUpdate()
    shell.table.virtualizer = virtualizer.collectionVirtualizer ?? undefined
    shell.table.requestUpdate()
  }
  if (virtualizer.isConnected && typeof virtualizer.requestUpdate === 'function')
    render(virtualizer.virtualItems)
  virtualizer.addEventListener('range-change', event => render((event as CustomEvent<{ virtualItems: readonly { index: number }[] }>).detail.virtualItems))
  return {
    refresh: (rows) => {
      for (const slot of slots.values())
        slot.remove()
      slots = new Map()
      shown = ''
      virtualizer.setAttribute('count', String(rows))
      if (typeof virtualizer.requestUpdate === 'function')
        render(virtualizer.virtualItems)
    },
  }
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

/**
 * xh-table 的外壳：root 里依次是 header、body、footer 与加载、空态占位；表头吸顶，有表尾时表尾占 footerRows 行并吸底。
 * 表格不放标题，可及名写在 root 上。
 */
export function tableShell(ctx: RenderContext, footerRows: number, label: string): TableShell {
  const table = document.createElement('xh-table') as XhTableElement
  table.setAttribute('sticky-header', '')
  if (footerRows > 0) {
    table.setAttribute('footer-rows', String(footerRows))
    table.setAttribute('sticky-footer', '')
  }
  const root = uiPart('div', 'root', { 'aria-label': label })
  const header = uiPart('div', 'header')
  const body = uiPart('div', 'body')
  const foot = footerRows > 0 ? uiPart('div', 'footer') : undefined
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
    width: column.width ?? COLUMN_WIDTH,
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
export function summaryCells(columns: readonly TableColumn[], dataset: DatasetSchema, values: Readonly<Record<string, unknown>>, label: string, ctx: RenderContext): TableCellSpec[] {
  const first = columns.findIndex(column => column.summary === undefined)
  return columns.map((column, index) => ({
    id: column.id,
    text: column.summary ? ctx.text(values[column.id], column.format, summaryType(column, dataset)) : index === first ? label : '',
  }))
}

/** 把明细表排进 container。 */
export function renderDetailTable(container: HTMLElement, view: TableView, dataset: DatasetSchema, result: TableResult, ctx: RenderContext, label: string): RenderedTable {
  const columns = view.columns
  const cellOf = (row: string, column: string | null): TableCellRef | undefined => {
    const data = result.rows[rowIndex(row)]
    if (!data)
      return undefined
    return {
      kind: 'detail',
      column: columns.some(item => item.id === column) ? column : null,
      values: Object.fromEntries(columns.map(item => [item.id, data[item.field]])),
    }
  }
  const shell = tableShell(ctx, result.summary === null ? 0 : 1, label)
  shell.header.append(headerRow(columns.map(column => ({ id: column.id, label: columnLabel(column, dataset) }))))
  if (result.summary)
    shell.footer!.append(tableRow(undefined, summaryCells(columns, dataset, result.summary, ctx.translations.total, ctx), { level: '1' }))

  const rowCells = (index: number): TableCellSpec[] => {
    const row = result.rows[index]!
    return columns.map(column => ({ id: column.id, text: ctx.text(row[column.field], column.format, fieldType(dataset, column.field)) }))
  }
  shell.table.columns = columns.map(column => columnDef(column, dataset))
  shell.table.rows = result.rows.map((_, index) => ({ id: `r${index}` }))
  container.replaceChildren(shell.table)
  fillTableBody(shell, result.rows.length, index => tableRow(`r${index}`, rowCells(index)))
  return { element: shell.table, cellOf }
}
