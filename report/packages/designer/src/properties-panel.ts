/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 属性面板：按选择组出 <xh-designer-properties> 的编辑对象，属性描述取 core 的描述函数，再追加扩展登记在那类对象上的，
// 内层对象的描述经 nestProperties 加上前缀；报表自己的取值方式里，引用数据集、字段、维度、度量与卡片的换成带候选项的 select。
// 编辑器表是内建的参数取值编辑器之上按扩展顺序压上各扩展的。面板派发的写入换成对应的编辑操作，连续输入按合并键并成一步撤销，
// 一次编辑结束时封口。

import type { DashboardCard, DashboardView, DataView, ItemList, PropertyChange, ReportDocument, ReportOperation, ReportPropertyControl, ReportPropertyDescriptor, ReportPropertyTarget, ReportQuery, ValidationIssue } from '@xihan-report/core'
import type { ReportDesignerTranslations } from '@xihan-report/runtime'
import type { RenderContext } from '@xihan-report/runtime/design'
import type { JsonPath, JsonValue } from '@xihan-ui/core/json'
import type { PropertyEditorTable, PropertyOption } from '@xihan-ui/designer-kit/properties'
import type { DesignerPropertiesEventMap, DesignerPropertyDescriptor, DesignerPropertyEditor, DesignerPropertyError, DesignerPropertyTarget, XhDesignerPropertiesElement } from '@xihan-ui/designer-shell'
import type { DatasetEditing } from './data-editing'
import type { ReportDataRef, ReportEditor, ReportItemRef, ReportSelection } from './editor'
import type { ReportDesignerModel } from './extensions'
import {
  bodyQuery,
  cardDataset,
  cardProperties,
  cardQuery,
  cardView,
  chartProperties,
  dashboardProperties,
  datasetFieldProperties,
  dimensionProperties,
  documentProperties,
  extensionViewProperties,
  groupLevelProperties,
  isDataView,
  linkProperties,
  measureProperties,
  metricProperties,
  parameterProperties,
  planRenameField,
  planRenameParameter,
  REPORT_PROPERTY_GROUPS,
  seriesProperties,
  tableColumnProperties,
  viewProperties,
} from '@xihan-report/core'
import { formatJsonPath } from '@xihan-ui/core/json'
import { extensionEditors } from '@xihan-ui/designer-kit'
import { nestProperties } from '@xihan-ui/designer-kit/properties'
import { createGeneratedElement } from '@xihan-ui/web-components/authoring'
import { canEditData } from './data-editing'
import { linkableDimensions } from './link-sources'
import { parameterValueEditor } from './property-editors'

/** 属性面板需要设计器提供的能力。 */
export interface PropertiesHost {
  readonly ownerDocument: Document
  readonly editor: () => ReportEditor | undefined
  readonly isReadonly: () => boolean
  readonly datasetEditing: () => DatasetEditing
  readonly issues: () => readonly ValidationIssue[]
  /** 合并后的扩展：追加的属性、种类的取数形状与属性编辑器。 */
  readonly model: () => ReportDesignerModel
  /** 参数取值编辑器渲染查看器控件用的上下文。 */
  readonly renderContext: () => RenderContext
  /** 改名之后选中改了名的对象。 */
  readonly select: (selection: Partial<ReportSelection>) => void
}

/** 改名的结果：操作与改名后要选中的对象，或者名字不能用时的问题码。 */
type RenameResult = { readonly operations: readonly ReportOperation[], readonly select: Partial<ReportSelection> } | { readonly code: 'empty' | 'duplicate-key' }

/** 一个编辑对象：交给面板的 target、它在文档里的位置（换算问题的路径），以及把对它的修改换成操作。 */
interface Binding {
  readonly target: DesignerPropertyTarget
  readonly base: JsonPath
  readonly write: (changes: readonly PropertyChange[]) => ReportOperation[]
  /** 改名要级联到引用处：输入时先攒着，一次编辑结束（property-commit）时才改。 */
  readonly rename?: (next: string) => RenameResult
}

/** 描述原本相对的对象与路径：属性名、选项文案按它查。 */
interface Origin {
  readonly kind: string
  readonly path: JsonPath
}

/** 列表项的对象种类。 */
function itemKind(list: ItemList, view: DataView | undefined): string {
  switch (list) {
    case 'measures':
      return 'measure'
    case 'groups':
      return 'group'
    case 'series':
      return 'series'
    case 'columns':
      return view?.type === 'crosstab' ? 'dimension' : 'column'
    default:
      return 'dimension'
  }
}

function itemDescriptors(kind: string): ReportPropertyDescriptor[] {
  switch (kind) {
    case 'measure':
      return measureProperties()
    case 'group':
      return groupLevelProperties()
    case 'series':
      return seriesProperties()
    case 'column':
      return tableColumnProperties()
    default:
      return dimensionProperties()
  }
}

/** 列表项的对象种类在扩展属性里的键。 */
function itemTarget(kind: string): ReportPropertyTarget {
  return kind === 'group' ? 'group-level' : kind as ReportPropertyTarget
}

/** 取值方式所需的上下文：所在数据集与所在查询。 */
interface Scope {
  readonly dataset: string | undefined
  readonly query: ReportQuery | undefined
  /** 联动的源卡片：列出它能发出取值的维度。 */
  readonly card?: DashboardCard
}

export class PropertiesPanel {
  readonly element: XhDesignerPropertiesElement
  readonly #host: PropertiesHost
  readonly #origins = new WeakMap<object, Origin>()
  #bindings = new Map<string, Binding>()
  #t: ReportDesignerTranslations | undefined
  /** 输入中的改名，与名字不能用时的问题码。 */
  #rename: { readonly key: string, readonly value: string, readonly code?: string } | undefined
  readonly #builtin: Readonly<Record<string, DesignerPropertyEditor>>
  #editors: { readonly model: ReportDesignerModel, readonly table: PropertyEditorTable<DesignerPropertyEditor> } | undefined

  constructor(host: PropertiesHost) {
    this.#host = host
    const doc = host.ownerDocument
    this.#builtin = { parameterValue: parameterValueEditor(doc, host.renderContext) }
    this.element = createGeneratedElement(doc, 'xh-designer-properties', { 'data-part': 'properties', 'slot': 'properties', 'collapsible': true, 'toggle-limit': '3' }) as XhDesignerPropertiesElement
    this.element.groupOrder = REPORT_PROPERTY_GROUPS
    this.element.groupLabel = group => this.#t?.propertyGroups[group] ?? group
    this.element.labelOf = descriptor => this.#label(descriptor)
    this.element.optionLabel = (descriptor, option) => this.#optionLabel(descriptor, option)
    this.element.addEventListener('property-change', this.#onChange)
    this.element.addEventListener('property-commit', this.#onCommit)
  }

  /** 按文档与选择重组编辑对象，并把校验问题落到字段上。 */
  update(t: ReportDesignerTranslations): void {
    this.#t = t
    const editor = this.#host.editor()
    const bindings = editor ? this.#bind(editor.document, editor.selection) : []
    this.#bindings = new Map(bindings.map(binding => [`${binding.target.kind}\u0000${binding.target.id}`, binding]))
    const panel = this.element
    const data = editor?.selection.data
    panel.readonly = this.#host.isReadonly() || (data !== undefined && this.#host.datasetEditing() === 'none')
    panel.translations = { title: t.properties }
    panel.editors = this.#editorTable()
    panel.targets = bindings.map(binding => binding.target)
    panel.heading = bindings.length > 1 ? t.selected(bindings.length) : bindings[0] ? `${t.objectKinds[bindings[0].target.kind] ?? bindings[0].target.kind} · ${bindings[0].target.id}` : undefined
    const renaming = this.#rename
    if (renaming && !this.#bindings.has(renaming.key))
      this.#rename = undefined
    panel.errors = this.#errors(bindings, t)
  }

  /** 内建的参数取值编辑器之上按扩展顺序压上各扩展的编辑器；扩展没变时沿用上一张表。 */
  #editorTable(): PropertyEditorTable<DesignerPropertyEditor> {
    const model = this.#host.model()
    if (this.#editors?.model !== model)
      this.#editors = { model, table: extensionEditors({ byControl: this.#builtin }, model.extensions) }
    return this.#editors.table
  }

  /** 内置的属性加上扩展追加在这类对象上的。 */
  #with(target: ReportPropertyTarget, descriptors: readonly ReportPropertyDescriptor[]): ReportPropertyDescriptor[] {
    return [...descriptors, ...this.#host.model().runtime.properties(target)]
  }

  #bind(document: ReportDocument, selection: ReportSelection): Binding[] {
    if (selection.data)
      return this.#bindData(document, selection.data)
    const body = document.body
    if (selection.link !== undefined)
      return this.#bindLink(document, selection.link)
    if (selection.item)
      return this.#bindItem(document, selection.item)
    if (body.type === 'dashboard' && selection.cards.length > 0) {
      return selection.cards.flatMap((id) => {
        const index = body.cards.findIndex(card => card.id === id)
        return index < 0 ? [] : [this.#bindCard(document, body, index)]
      })
    }
    return [this.#bindDocument(document)]
  }

  /** 一条联动：源卡片、源维度与目标；源维度的候选项随源卡片变化。 */
  #bindLink(document: ReportDocument, id: string): Binding[] {
    const body = document.body
    if (body.type !== 'dashboard')
      return []
    const index = body.links?.findIndex(link => link.id === id) ?? -1
    const link = body.links?.[index]
    if (!link)
      return []
    const card = body.cards.find(item => item.id === link.card)
    const scope: Scope = { dataset: card ? cardDataset(card) : undefined, query: undefined, ...(card ? { card } : {}) }
    return [{
      target: { kind: 'link', id, value: link as unknown as JsonValue, descriptors: this.#nest([], 'link', this.#with('link', linkProperties()), document, scope) },
      base: ['body', 'links', index],
      write: changes => [{ type: 'updateLink', id, changes }],
    }]
  }

  /** 没有选中时：报表文档，连同看板网格或主体视图的属性；没登记的扩展视图只有文档的属性。 */
  #bindDocument(document: ReportDocument): Binding {
    const body = document.body
    const model = this.#host.model()
    const query = bodyQuery(body)
    const scope: Scope = isDataView(body) ? { dataset: body.dataset, query: undefined } : { dataset: query?.dataset, query: query?.query }
    const viewData = model.runtime.views.get(body.type)?.kind.data
    const inner = body.type === 'dashboard'
      ? this.#nest(['body'], 'dashboard', this.#with('dashboard', dashboardProperties()), document, scope)
      : isDataView(body)
        ? this.#nest(['body'], `view.${body.type}`, this.#with(`view:${body.type}`, viewProperties(body.type)), document, scope)
        : viewData === 'query' || viewData === 'none'
          ? this.#nest(['body'], `view.${body.type}`, this.#with(`view:${body.type}`, extensionViewProperties(viewData)), document, scope)
          : []
    const own = [...documentProperties(), ...model.runtime.documentProperties]
    return {
      target: { kind: 'document', id: document.id, value: document as unknown as JsonValue, descriptors: [...this.#nest([], 'document', own, document, scope), ...inner] },
      base: [],
      write: (changes) => {
        const own = changes.filter(change => change.path[0] !== 'body')
        const nested = changes.filter(change => change.path[0] === 'body').map(change => ({ ...change, path: change.path.slice(1) }))
        const operations: ReportOperation[] = []
        if (own.length > 0)
          operations.push({ type: 'updateDocument', changes: own })
        if (nested.length > 0)
          operations.push(body.type === 'dashboard' ? { type: 'updateDashboard', changes: nested } : { type: 'updateView', changes: nested })
        return operations
      },
    }
  }

  /**
   * 一张卡片：卡片自身的属性，连同图表、指标配置或所带视图的属性。扩展卡片的取数属性按种类声明的形状；
   * 没登记的种类只有标题与说明。
   */
  #bindCard(document: ReportDocument, dashboard: DashboardView, index: number): Binding {
    const card = dashboard.cards[index]!
    const view = cardView(card)
    const query = cardQuery(card)
    const scope: Scope = view ? { dataset: view.dataset, query: undefined } : { dataset: query?.dataset, query: query?.query }
    const data = this.#host.model().runtime.cards.get(card.kind)?.kind.data ?? 'none'
    const own = this.#nest([], 'card', this.#with(`card:${card.kind}`, cardProperties(card, data)), document, scope)
    const inner = card.kind === 'chart'
      ? this.#nest(['chart'], `chart.${card.chart.type}`, this.#with(`chart:${card.chart.type}`, chartProperties(card.chart.type)), document, scope)
      : card.kind === 'metric'
        ? this.#nest(['metric'], 'metric', this.#with('metric', metricProperties()), document, scope)
        : view ? this.#nest(['view'], `view.${view.type}`, this.#with(`view:${view.type}`, viewProperties(view.type)), document, scope) : []
    return {
      target: { kind: 'card', id: card.id, value: card as unknown as JsonValue, descriptors: [...own, ...inner] },
      base: ['body', 'cards', index],
      write: (changes) => {
        if (!view)
          return [{ type: 'updateCard', id: card.id, changes }]
        const own = changes.filter(change => change.path[0] !== 'view')
        const nested = changes.filter(change => change.path[0] === 'view').map(change => ({ ...change, path: change.path.slice(1) }))
        const operations: ReportOperation[] = []
        if (own.length > 0)
          operations.push({ type: 'updateCard', id: card.id, changes: own })
        if (nested.length > 0)
          operations.push({ type: 'updateView', card: card.id, changes: nested })
        return operations
      },
    }
  }

  /** 一个列表项：报表主体的视图或查询、卡片所带的视图、卡片查询里的项，或柱线图的系列。 */
  #bindItem(document: ReportDocument, ref: ReportItemRef): Binding[] {
    const body = document.body
    /** 列表所在的对象（视图、查询或柱线图配置）、它在文档里的位置与取值方式的上下文。 */
    let container: unknown
    let view: DataView | undefined
    let base: JsonPath
    let scope: Scope
    if (ref.card === undefined) {
      if (isDataView(body)) {
        container = view = body
        base = ['body']
        scope = { dataset: body.dataset, query: undefined }
      }
      else {
        const query = bodyQuery(body)
        if (!query)
          return []
        container = query.query
        base = ['body', 'query']
        scope = { dataset: query.dataset, query: query.query }
      }
    }
    else {
      if (body.type !== 'dashboard')
        return []
      const index = body.cards.findIndex(card => card.id === ref.card)
      const card = body.cards[index]
      if (!card)
        return []
      const cardOwn = cardView(card)
      const query = cardQuery(card)
      if (cardOwn) {
        container = view = cardOwn
        base = ['body', 'cards', index, 'view']
        scope = { dataset: cardOwn.dataset, query: undefined }
      }
      else if (query) {
        const series = ref.list === 'series' && card.kind === 'chart'
        container = series ? card.chart : query.query
        base = ['body', 'cards', index, series ? 'chart' : 'query']
        scope = { dataset: query.dataset, query: query.query }
      }
      else {
        return []
      }
    }
    const list = (container as Record<string, unknown>)[ref.list]
    const items = Array.isArray(list) ? list as readonly { readonly id: string }[] : []
    const position = items.findIndex(item => item.id === ref.id)
    if (position < 0)
      return []
    const kind = itemKind(ref.list, view)
    const item = items[position]!
    return [{
      target: { kind, id: ref.id, value: item as unknown as JsonValue, descriptors: this.#nest([], kind, this.#with(itemTarget(kind), itemDescriptors(kind)), document, scope) },
      base: [...base, ref.list, position],
      write: changes => [ref.card === undefined
        ? { type: 'updateItem', list: ref.list, id: ref.id, changes }
        : { type: 'updateItem', card: ref.card, list: ref.list, id: ref.id, changes }],
    }]
  }

  /**
   * 数据面板里的对象：字段与报表参数。datasetEditing 允许时名字可改，改名经 planRenameField / planRenameParameter
   * 级联到引用处与公式；不允许时不显示名字。数据集暂无属性。
   */
  #bindData(document: ReportDocument, ref: ReportDataRef): Binding[] {
    const scope: Scope = { dataset: ref.kind === 'parameter' ? undefined : ref.dataset, query: undefined }
    const renamable = canEditData(ref.kind, this.#host.datasetEditing())
    if (ref.kind === 'field') {
      const datasetIndex = document.datasets.findIndex(dataset => dataset.id === ref.dataset)
      const fieldIndex = document.datasets[datasetIndex]?.fields.findIndex(field => field.name === ref.name) ?? -1
      const field = document.datasets[datasetIndex]?.fields[fieldIndex]
      if (!field)
        return []
      const descriptors = this.#with('field', datasetFieldProperties()).filter(descriptor => renamable || descriptor.path[0] !== 'name')
      const names = new Set(document.datasets[datasetIndex]!.fields.map(item => item.name))
      return [{
        target: { kind: 'field', id: field.name, value: field as unknown as JsonValue, descriptors: this.#nest([], 'field', descriptors, document, scope) },
        base: ['datasets', datasetIndex, 'fields', fieldIndex],
        write: changes => [{ type: 'updateField', dataset: ref.dataset, name: ref.name, changes }],
        rename: next => next === ''
          ? { code: 'empty' }
          : next !== ref.name && names.has(next)
            ? { code: 'duplicate-key' }
            : { operations: planRenameField(document, ref.dataset, ref.name, next), select: { data: { kind: 'field', dataset: ref.dataset, name: next } } },
      }]
    }
    if (ref.kind === 'parameter') {
      const index = document.parameters?.findIndex(parameter => parameter.name === ref.name) ?? -1
      const parameter = document.parameters?.[index]
      if (!parameter)
        return []
      const descriptors = this.#with('parameter', parameterProperties()).filter(descriptor => renamable || descriptor.path[0] !== 'name')
      const names = new Set(document.parameters!.map(item => item.name))
      return [{
        target: { kind: 'parameter', id: parameter.name, value: parameter as unknown as JsonValue, descriptors: this.#nest([], 'parameter', descriptors, document, scope) },
        base: ['parameters', index],
        write: changes => [{ type: 'updateParameter', name: ref.name, changes }],
        rename: next => next === ''
          ? { code: 'empty' }
          : next !== ref.name && names.has(next)
            ? { code: 'duplicate-key' }
            : { operations: planRenameParameter(document, ref.name, next), select: { data: { kind: 'parameter', name: next } } },
      }]
    }
    return []
  }

  /** 给描述加前缀，引用类的取值方式换成带候选项的 select，并记下描述原本的对象与路径。 */
  #nest(prefix: JsonPath, kind: string, descriptors: readonly ReportPropertyDescriptor[], document: ReportDocument, scope: Scope): DesignerPropertyDescriptor[] {
    const nested = nestProperties(prefix, descriptors.map(descriptor => ({ ...descriptor, control: this.#control(descriptor.control, document, scope) })))
    nested.forEach((descriptor, index) => this.#origins.set(descriptor, { kind, path: descriptors[index]!.path }))
    return nested as DesignerPropertyDescriptor[]
  }

  #control(control: ReportPropertyControl, document: ReportDocument, scope: Scope): ReportPropertyControl {
    const select = (options: readonly PropertyOption[]): ReportPropertyControl => ({ kind: 'select', options })
    const dataset = document.datasets.find(item => item.id === scope.dataset)
    const fieldTitle = (name: string): string => dataset?.fields.find(field => field.name === name)?.title ?? name
    const keyed = (items: readonly { readonly id: string, readonly title?: string, readonly field?: string }[]): PropertyOption[] =>
      items.map(item => ({ value: item.id, label: item.title ?? (item.field === undefined ? item.id : fieldTitle(item.field)) }))
    switch (control.kind) {
      case 'dataset':
        return select(document.datasets.map(item => ({ value: item.id, label: item.title ?? item.id })))
      case 'field':
        return select((dataset?.fields ?? []).filter(field => control.types === undefined || control.types.includes(field.type)).map(field => ({ value: field.name, label: field.title ?? field.name })))
      case 'dimension':
        return select(keyed(scope.query?.dimensions ?? []))
      case 'measure':
        return select(keyed(scope.query?.measures ?? []))
      case 'queryKey':
        return select(keyed([...(scope.query?.dimensions ?? []), ...(scope.query?.measures ?? [])]))
      case 'card': {
        const body = document.body
        return select(body.type === 'dashboard' ? body.cards.map(card => ({ value: card.id, label: card.title ?? card.id })) : [])
      }
      case 'cardDimension': {
        const source = scope.card
        const fields = source ? cardDataset(source) : undefined
        const fieldTitle = (name: string): string => document.datasets.find(item => item.id === fields)?.fields.find(field => field.name === name)?.title ?? name
        return select(linkableDimensions(source).map(item => ({ value: item.id, label: item.title ?? (item.field === undefined ? item.id : fieldTitle(item.field)) })))
      }
      default:
        return control
    }
  }

  #label(descriptor: DesignerPropertyDescriptor): string {
    const origin = this.#origins.get(descriptor)
    const t = this.#t
    const key = formatJsonPath(origin?.path ?? descriptor.path)
    const labels = t?.propertyLabels ?? {}
    const own = origin ? labels[`${origin.kind}:${key}`] ?? labels[`${origin.kind.split('.')[0]}:${key}`] : undefined
    return own ?? labels[key] ?? descriptor.label ?? key
  }

  #optionLabel(descriptor: DesignerPropertyDescriptor, option: PropertyOption): string {
    if (option.label !== undefined)
      return option.label
    const origin = this.#origins.get(descriptor)
    const labels = this.#t?.optionLabels ?? {}
    const value = String(option.value)
    return labels[`${formatJsonPath(origin?.path ?? descriptor.path)}=${value}`] ?? labels[value] ?? value
  }

  /** 一次编辑结束：有攒着的改名就按计划函数改名（合为一步撤销）并选中改了名的对象；名字不能用时落一条错误。 */
  readonly #onCommit = (): void => {
    const editor = this.#host.editor()
    const pending = this.#rename
    editor?.seal()
    if (!editor || !pending || pending.code !== undefined)
      return
    const binding = this.#bindings.get(pending.key)
    const result = binding?.rename?.(pending.value)
    if (!result)
      return
    if ('code' in result) {
      this.#rename = { ...pending, code: result.code }
      if (this.#t)
        this.update(this.#t)
      return
    }
    this.#rename = undefined
    if (result.operations.length > 0)
      editor.execute(result.operations)
    this.#host.select(result.select)
  }

  /** 校验问题落到字段上：问题路径落在某个编辑对象之内时，换成相对它的路径；改名的名字不能用时也落在名字上。 */
  #errors(bindings: readonly Binding[], t: ReportDesignerTranslations): DesignerPropertyError[] {
    const errors: DesignerPropertyError[] = []
    const renaming = this.#rename
    if (renaming?.code !== undefined) {
      const binding = this.#bindings.get(renaming.key)
      if (binding)
        errors.push({ target: { kind: binding.target.kind, id: binding.target.id }, path: ['name'], message: t.issue({ code: renaming.code }) })
    }
    for (const issue of this.#host.issues()) {
      for (const binding of bindings) {
        const { base } = binding
        if (issue.path.length <= base.length || !base.every((segment, index) => issue.path[index] === segment))
          continue
        errors.push({ target: { kind: binding.target.kind, id: binding.target.id }, path: issue.path.slice(base.length), message: t.issue(issue) })
      }
    }
    return errors
  }

  readonly #onChange = (event: Event): void => {
    const { path, value, targets, merge } = (event as DesignerPropertiesEventMap['property-change']).detail
    const editor = this.#host.editor()
    if (!editor || this.#host.isReadonly())
      return
    const key = targets.length === 1 ? `${targets[0]!.kind}\u0000${targets[0]!.id}` : undefined
    if (key !== undefined && path.length === 1 && path[0] === 'name' && this.#bindings.get(key)?.rename) {
      this.#rename = { key, value: typeof value === 'string' ? value.trim() : '' }
      return
    }
    const change: PropertyChange = value === undefined ? { path } : { path, value }
    const operations = targets.flatMap(ref => this.#bindings.get(`${ref.kind}\u0000${ref.id}`)?.write([change]) ?? [])
    if (operations.length > 0)
      editor.execute(operations, { merge, mergeWithin: Number.POSITIVE_INFINITY })
  }
}
