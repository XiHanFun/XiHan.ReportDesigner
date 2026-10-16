/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 编辑操作：带报表语义的增删改，全部是纯 JSON。

import type { OperationResult } from '@xihan-ui/designer-kit'
import type { DatasetField, DatasetSchema } from '../schema/dataset'
import type { ReportDocument, ReportParameter } from '../schema/document'
import type { JsonValue } from '../schema/value'
import type { CardLayout, DashboardCard, DashboardLink, ReportBody } from '../schema/view'

/**
 * 报表里的路径：字符串段是对象的属性名，或数组里带 id（没有 id 时取 name）的那一项；数字段是数组下标。
 */
export type ReportPath = readonly (string | number)[]

/** 一处属性修改：path 相对被修改的对象，写法同 ReportPath；value 不写表示删除该属性。 */
export interface PropertyChange {
  readonly path: ReportPath
  readonly value?: JsonValue
}

/**
 * 视图或查询里的列表：明细表的 columns；分组报表的 groups、columns；交叉表的 rows、columns、measures；
 * 图表与指标卡片查询的 dimensions、measures；直角坐标图的 series。
 */
export type ItemList = 'columns' | 'groups' | 'rows' | 'measures' | 'dimensions' | 'series'

/** 修改文档本身的属性；不能修改 schemaVersion、datasets、parameters 与 body。 */
export interface UpdateDocumentOperation {
  readonly type: 'updateDocument'
  readonly changes: readonly PropertyChange[]
}

/** 换掉报表主体，用来改报表的类型。 */
export interface SetBodyOperation {
  readonly type: 'setBody'
  readonly body: ReportBody
}

/** 新增数据集，index 缺省放在末尾。 */
export interface AddDatasetOperation {
  readonly type: 'addDataset'
  readonly dataset: DatasetSchema
  readonly index?: number
}

export interface RemoveDatasetOperation {
  readonly type: 'removeDataset'
  readonly id: string
}

export interface MoveDatasetOperation {
  readonly type: 'moveDataset'
  readonly id: string
  readonly index: number
}

/** 修改数据集；不能修改 id 与 fields（字段用字段的操作）。 */
export interface UpdateDatasetOperation {
  readonly type: 'updateDataset'
  readonly id: string
  readonly changes: readonly PropertyChange[]
}

/** 在数据集里新增字段，index 缺省放在末尾。 */
export interface AddFieldOperation {
  readonly type: 'addField'
  readonly dataset: string
  readonly field: DatasetField
  readonly index?: number
}

export interface RemoveFieldOperation {
  readonly type: 'removeField'
  readonly dataset: string
  readonly name: string
}

export interface MoveFieldOperation {
  readonly type: 'moveField'
  readonly dataset: string
  readonly name: string
  readonly index: number
}

/** 修改字段；可以改 name，同一数据集里不能重名。 */
export interface UpdateFieldOperation {
  readonly type: 'updateField'
  readonly dataset: string
  readonly name: string
  readonly changes: readonly PropertyChange[]
}

/** 新增报表参数，index 缺省放在末尾。 */
export interface AddParameterOperation {
  readonly type: 'addParameter'
  readonly parameter: ReportParameter
  readonly index?: number
}

export interface RemoveParameterOperation {
  readonly type: 'removeParameter'
  readonly name: string
}

export interface MoveParameterOperation {
  readonly type: 'moveParameter'
  readonly name: string
  readonly index: number
}

/** 修改报表参数；可以改 name，不能与别的参数重名。 */
export interface UpdateParameterOperation {
  readonly type: 'updateParameter'
  readonly name: string
  readonly changes: readonly PropertyChange[]
}

/** 修改看板本身（网格）；不能修改 type、cards 与 links。报表主体须是看板。 */
export interface UpdateDashboardOperation {
  readonly type: 'updateDashboard'
  readonly changes: readonly PropertyChange[]
}

/** 新增卡片，index 缺省放在末尾；位置大小写在卡片的 layout 里。 */
export interface AddCardOperation {
  readonly type: 'addCard'
  readonly card: DashboardCard
  readonly index?: number
}

/** 删除卡片；引用它的联动不随之改动，用 planRemoveCard 一并清理。 */
export interface RemoveCardOperation {
  readonly type: 'removeCard'
  readonly id: string
}

/** 修改卡片；不能修改 id、kind 与 layout（位置大小用 layoutCards）。 */
export interface UpdateCardOperation {
  readonly type: 'updateCard'
  readonly id: string
  readonly changes: readonly PropertyChange[]
}

/** 一次改多张卡片的位置大小。 */
export interface LayoutCardsOperation {
  readonly type: 'layoutCards'
  readonly layouts: Readonly<Record<string, CardLayout>>
}

/** 新增联动，index 缺省放在末尾。 */
export interface AddLinkOperation {
  readonly type: 'addLink'
  readonly link: DashboardLink
  readonly index?: number
}

export interface RemoveLinkOperation {
  readonly type: 'removeLink'
  readonly id: string
}

/** 修改联动；不能修改 id。 */
export interface UpdateLinkOperation {
  readonly type: 'updateLink'
  readonly id: string
  readonly changes: readonly PropertyChange[]
}

/**
 * 修改视图：card 缺省时是报表主体（须是明细表、分组报表或交叉表），否则是那张表格卡片的视图；不能修改 type。
 * 列表里的项用 addItem 等操作增删换序。
 */
export interface UpdateViewOperation {
  readonly type: 'updateView'
  readonly card?: string
  readonly changes: readonly PropertyChange[]
}

/**
 * 列表项的所在：card 缺省时是报表主体的视图；表格卡片是它的视图，图表与指标卡片是它的查询，
 * series 是直角坐标图的配置。
 */
export interface ItemOwner {
  readonly card?: string
}

/** 在列表里新增一项，index 缺省放在末尾。 */
export interface AddItemOperation extends ItemOwner {
  readonly type: 'addItem'
  readonly list: ItemList
  readonly item: JsonValue
  readonly index?: number
}

export interface RemoveItemOperation extends ItemOwner {
  readonly type: 'removeItem'
  readonly list: ItemList
  readonly id: string
}

/** 把列表项移到 index；写了 to 时移到同一视图的另一个列表，如交叉表的行维度换到列维度。 */
export interface MoveItemOperation extends ItemOwner {
  readonly type: 'moveItem'
  readonly list: ItemList
  readonly id: string
  readonly index: number
  readonly to?: ItemList
}

/** 修改列表项；可以改 id，同一列表里不能重复。 */
export interface UpdateItemOperation extends ItemOwner {
  readonly type: 'updateItem'
  readonly list: ItemList
  readonly id: string
  readonly changes: readonly PropertyChange[]
}

/** 编辑操作。 */
export type ReportOperation
  = | UpdateDocumentOperation
    | SetBodyOperation
    | AddDatasetOperation
    | RemoveDatasetOperation
    | MoveDatasetOperation
    | UpdateDatasetOperation
    | AddFieldOperation
    | RemoveFieldOperation
    | MoveFieldOperation
    | UpdateFieldOperation
    | AddParameterOperation
    | RemoveParameterOperation
    | MoveParameterOperation
    | UpdateParameterOperation
    | UpdateDashboardOperation
    | AddCardOperation
    | RemoveCardOperation
    | UpdateCardOperation
    | LayoutCardsOperation
    | AddLinkOperation
    | RemoveLinkOperation
    | UpdateLinkOperation
    | UpdateViewOperation
    | AddItemOperation
    | RemoveItemOperation
    | MoveItemOperation
    | UpdateItemOperation

/** 编辑操作的种类。 */
export type ReportOperationType = ReportOperation['type']

/**
 * 操作结果，即 @xihan-ui/designer-kit 的 OperationResult：新文档，以及按顺序作用于新文档即可还原出传入文档的逆操作。
 * 操作没有带来变化时 document 就是传入的文档，inverse 为空数组。
 */
export type ReportOperationResult = OperationResult<ReportDocument, ReportOperation>
