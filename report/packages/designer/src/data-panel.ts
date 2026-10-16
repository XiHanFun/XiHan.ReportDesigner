/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 数据面板：数据集与字段一棵树、报表参数一棵树，都用 <xh-tree> 画。点选的对象交给编辑模型的选择，
// 字段按下拖动时经 designer-shell 的 startDrag 拖向字段栏与看板卡片。两棵树下各有新增按钮，树上按 Delete 删除选中的对象。

import type { ReportDocument } from '@xihan-report/core'
import type { ReportDesignerTranslations } from '@xihan-report/runtime'
import type { XhTreeElement } from '@xihan-ui/web-components/define'
import type { ReportDataRef } from './editor'
import { startDrag } from '@xihan-ui/designer-shell'
import { createAuthoredElement, createGeneratedElement, setText } from '@xihan-ui/web-components/authoring'

/** 从数据面板拖出的字段。 */
export interface DataFieldDragPayload {
  readonly source: 'data'
  readonly dataset: string
  readonly field: string
}

/** 数据面板拖出的字段；不是数据面板的载荷时为 undefined。 */
export function dataFieldPayload(payload: unknown): DataFieldDragPayload | undefined {
  const drag = payload as Partial<DataFieldDragPayload> | undefined
  return drag?.source === 'data' && typeof drag.dataset === 'string' && typeof drag.field === 'string' ? drag as DataFieldDragPayload : undefined
}

/** 树上的一个节点：value 是对象引用，description 显示在行尾。 */
interface DataNode {
  readonly value: string
  readonly label: string
  readonly description?: string
  readonly children?: readonly DataNode[]
}

/** 树节点的 value：对象引用写成 JSON。 */
function valueOf(ref: ReportDataRef): string {
  return JSON.stringify(ref.kind === 'parameter' ? [ref.kind, ref.name] : ref.kind === 'dataset' ? [ref.kind, ref.dataset] : [ref.kind, ref.dataset, ref.name])
}

function refOf(value: string | null): ReportDataRef | undefined {
  if (!value)
    return undefined
  const parts = JSON.parse(value) as string[]
  if (parts[0] === 'parameter')
    return { kind: 'parameter', name: parts[1]! }
  if (parts[0] === 'dataset')
    return { kind: 'dataset', dataset: parts[1]! }
  return parts[0] === 'field' ? { kind: 'field', dataset: parts[1]!, name: parts[2]! } : undefined
}

/** 数据面板里能新增的对象。 */
export type DataAddKind = 'dataset' | 'field' | 'parameter'

/** 数据面板需要设计器提供的能力。 */
export interface DataPanelHost {
  readonly ownerDocument: Document
  readonly select: (ref: ReportDataRef) => void
  /** 只读时字段不能拖出。 */
  readonly isReadonly: () => boolean
  /** 按只读与 datasetEditing 能不能新增这种对象。 */
  readonly canAdd: (kind: DataAddKind) => boolean
  readonly add: (kind: DataAddKind) => void
  /** 删除选中的对象（树上按 Delete 或 Backspace）。 */
  readonly remove: () => void
}

interface AddButton {
  readonly element: HTMLElement
  readonly button: HTMLButtonElement
}

interface TreeParts {
  readonly element: XhTreeElement
  readonly label: HTMLElement
  readonly tree: HTMLElement
}

export class DataPanel {
  readonly element: HTMLElement
  readonly #host: DataPanelHost
  readonly #datasets: TreeParts
  readonly #parameters: TreeParts
  readonly #buttons: Readonly<Record<DataAddKind, AddButton>>
  #key = ''
  #expanded: string[] = []
  #datasetValues = new Set<string>()
  #revealed: string | undefined

  constructor(host: DataPanelHost) {
    this.#host = host
    const doc = host.ownerDocument
    this.#datasets = this.#tree(doc, 'datasets')
    this.#parameters = this.#tree(doc, 'parameters')
    this.#buttons = { dataset: this.#button(doc, 'dataset'), field: this.#button(doc, 'field'), parameter: this.#button(doc, 'parameter') }
    this.element = createGeneratedElement(doc, 'div', { 'data-part': 'data', 'slot': 'data' }, [
      this.#datasets.element,
      createAuthoredElement(doc, 'div', { 'data-part': 'data-actions' }, [this.#buttons.dataset.element, this.#buttons.field.element]),
      this.#parameters.element,
      createAuthoredElement(doc, 'div', { 'data-part': 'data-actions' }, [this.#buttons.parameter.element]),
    ])
    this.#datasets.element.addEventListener('expanded-value-change', (event) => {
      this.#expanded = (event as CustomEvent<{ value: string[] }>).detail.value
      this.#datasets.element.expandedValue = this.#expanded
    })
    this.#datasets.tree.addEventListener('pointerdown', this.#onPointerDown)
  }

  /** 按文档重排两棵树（结构或文案变了才重建标记），选中项随选择同步；新出现的数据集与选中字段所在的数据集展开。 */
  update(document: ReportDocument, data: ReportDataRef | undefined, t: ReportDesignerTranslations): void {
    const typeLabel = (type: string): string => t.optionLabels[`type=${type}`] ?? t.optionLabels[type] ?? type
    const datasets: DataNode[] = document.datasets.map(dataset => ({
      value: valueOf({ kind: 'dataset', dataset: dataset.id }),
      label: dataset.title ?? dataset.id,
      children: dataset.fields.map(field => ({ value: valueOf({ kind: 'field', dataset: dataset.id, name: field.name }), label: field.title ?? field.name, description: typeLabel(field.type) })),
    }))
    const parameters: DataNode[] = (document.parameters ?? []).map(parameter => ({
      value: valueOf({ kind: 'parameter', name: parameter.name }),
      label: parameter.title ?? parameter.name,
      description: typeLabel(parameter.type),
    }))
    const key = JSON.stringify([datasets, parameters, t.datasets, t.parameters])
    if (key !== this.#key) {
      this.#key = key
      this.#fill(this.#datasets, t.datasets, datasets)
      this.#fill(this.#parameters, t.parameters, parameters)
      const values = datasets.map(node => node.value)
      const added = values.filter(value => !this.#datasetValues.has(value))
      this.#datasetValues = new Set(values)
      this.#expanded = [...this.#expanded.filter(value => this.#datasetValues.has(value)), ...added]
      this.#datasets.element.expandedValue = this.#expanded
    }
    const selected = data === undefined ? [] : [valueOf(data)]
    if (selected[0] !== this.#revealed) {
      this.#revealed = selected[0]
      const owner = data?.kind === 'field' ? valueOf({ kind: 'dataset', dataset: data.dataset }) : undefined
      if (owner !== undefined && !this.#expanded.includes(owner)) {
        this.#expanded = [...this.#expanded, owner]
        this.#datasets.element.expandedValue = this.#expanded
      }
    }
    this.#datasets.element.selection = data?.kind === 'parameter' ? [] : selected
    this.#parameters.element.selection = data?.kind === 'parameter' ? selected : []
    const labels: Readonly<Record<DataAddKind, string>> = { dataset: t.addDataset, field: t.addField, parameter: t.addParameter }
    for (const kind of ['dataset', 'field', 'parameter'] as const) {
      const { element, button } = this.#buttons[kind]
      setText(button, labels[kind])
      element.hidden = !this.#host.canAdd(kind)
      button.disabled = kind === 'field' && data?.kind !== 'dataset' && data?.kind !== 'field'
    }
    this.#parameters.element.hidden = parameters.length === 0 && !this.#host.canAdd('parameter')
  }

  #button(doc: Document, kind: DataAddKind): AddButton {
    const button = createAuthoredElement(doc, 'button', { 'data-xh-part': 'root', 'type': 'button' }) as HTMLButtonElement
    button.addEventListener('click', () => this.#host.add(kind))
    return { element: createAuthoredElement(doc, 'xh-button', { 'variant': 'ghost', 'size': 'sm', 'data-part': 'data-add', 'data-kind': kind }, [button]), button }
  }

  #tree(doc: Document, name: string): TreeParts {
    const label = createAuthoredElement(doc, 'span', { 'data-xh-part': 'label' })
    const tree = createAuthoredElement(doc, 'div', { 'data-xh-part': 'tree' })
    const element = createAuthoredElement(doc, 'xh-tree', { 'variant': 'ghost', 'size': 'sm', 'data-part': name }, [
      createAuthoredElement(doc, 'div', { 'data-xh-part': 'root' }, [label, tree]),
    ]) as XhTreeElement
    element.addEventListener('keydown', (event) => {
      if ((event.key === 'Delete' || event.key === 'Backspace') && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault()
        this.#host.remove()
      }
    })
    element.addEventListener('selection-change', (event) => {
      const value = (event as CustomEvent<{ value: string[] }>).detail.value[0]
      const ref = value === undefined ? undefined : refOf(value)
      if (ref)
        this.#host.select(ref)
    })
    return { element, label, tree }
  }

  #fill(parts: TreeParts, label: string, nodes: readonly DataNode[]): void {
    const doc = this.#host.ownerDocument
    parts.label.textContent = label
    const leaf = (node: DataNode): HTMLElement => createAuthoredElement(doc, 'div', { 'data-xh-part': 'item', 'value': node.value }, [
      createAuthoredElement(doc, 'span', { 'data-xh-part': 'item-text' }, [node.label]),
      createAuthoredElement(doc, 'span', { 'data-xh-part': 'item-suffix' }, [node.description ?? '']),
      createAuthoredElement(doc, 'span', { 'data-xh-part': 'item-indicator' }),
    ])
    parts.tree.replaceChildren(...nodes.map(node => node.children === undefined
      ? leaf(node)
      : createAuthoredElement(doc, 'div', { 'data-xh-part': 'branch', 'value': node.value }, [
          createAuthoredElement(doc, 'div', { 'data-xh-part': 'branch-control' }, [
            createAuthoredElement(doc, 'span', { 'data-xh-part': 'branch-trigger' }),
            createAuthoredElement(doc, 'span', { 'data-xh-part': 'branch-text' }, [node.label]),
            createAuthoredElement(doc, 'span', { 'data-xh-part': 'item-indicator' }),
          ]),
          createAuthoredElement(doc, 'div', { 'data-xh-part': 'branch-content' }, node.children.map(leaf)),
        ])))
    parts.element.collection = nodes.map(node => node.children === undefined
      ? { value: node.value, label: node.label }
      : { value: node.value, label: node.label, children: node.children.map(child => ({ value: child.value, label: child.label })) })
  }

  /** 按下字段开始拖动，载荷是数据集与字段名；只读时不拖。 */
  readonly #onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0 || this.#host.isReadonly())
      return
    const item = (event.target as Element | null)?.closest<HTMLElement>('[data-xh-part="item"]')
    const ref = item ? refOf(item.getAttribute('value')) : undefined
    if (!item || ref?.kind !== 'field')
      return
    startDrag<DataFieldDragPayload>(event, { payload: { source: 'data', dataset: ref.dataset, field: ref.name }, source: item })
  }
}
