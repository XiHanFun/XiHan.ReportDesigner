/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 交叉表两条轴的表头结构：每个叶子（一行或一列）各层的标签，以及相邻同一标签合成的表头树；显示文字交给使用方。

import type { CrosstabView, Dimension, Measure } from '../schema'
import type { CrosstabHeader, CrosstabResult } from './crosstab'
import { valueKey } from '@xihan-ui/viz'

/** 表头上的一个标签；id 相同的相邻标签合成一格。 */
export type CrosstabLabel
  = | { readonly kind: 'member', readonly id: string, readonly dimension: Dimension, readonly value: unknown }
    | { readonly kind: 'subtotal', readonly id: string }
    | { readonly kind: 'total', readonly id: string }
    | { readonly kind: 'measure', readonly id: string, readonly measure: Measure }

/** 轴上的一个叶子：交叉表的一行或一列。 */
export interface CrosstabLeaf {
  /** 在 CrosstabResult.rows 或 columns 里的下标。 */
  readonly header: number
  /** 度量在视图 measures 里的下标；度量不排在这条轴上时为 null。 */
  readonly measure: number | null
  /** 小计或总计。 */
  readonly emphasis: boolean
  /** 由外到内各层的标签；null 表示被上一层的标签纵向合并。 */
  readonly labels: readonly (CrosstabLabel | null)[]
}

/** 表头树的一个节点：一个标签占一格或合并的一片。 */
export interface CrosstabAxisNode {
  readonly label: CrosstabLabel
  /** 标签所在的第一层。 */
  readonly level: number
  /** 标签纵向占的层数（含被它合并的层）。 */
  readonly span: number
  /** 覆盖的第一个叶子的下标。 */
  readonly start: number
  /** 覆盖的叶子数。 */
  readonly count: number
  readonly children: readonly CrosstabAxisNode[]
}

/** 一条轴的表头结构。 */
export interface CrosstabAxis {
  readonly leaves: readonly CrosstabLeaf[]
  /** 层数：这条轴上的维度数，度量排在这条轴上时再加一。 */
  readonly levels: number
  readonly tree: readonly CrosstabAxisNode[]
}

/** 交叉表两条轴的表头结构。 */
export interface CrosstabAxes {
  readonly rows: CrosstabAxis
  readonly columns: CrosstabAxis
}

function prefixId(keys: readonly unknown[], length: number): string {
  return `m${JSON.stringify(keys.slice(0, length).map(valueKey))}`
}

function axisLeaves(headers: readonly CrosstabHeader[], dimensions: readonly Dimension[], measures: readonly Measure[] | null): CrosstabLeaf[] {
  const leaves: CrosstabLeaf[] = []
  headers.forEach((header, index) => {
    const labels: (CrosstabLabel | null)[] = dimensions.map((dimension, level) => {
      const member = (): CrosstabLabel => ({ kind: 'member', id: prefixId(header.keys, level + 1), dimension, value: header.keys[level] })
      if (header.kind === 'member')
        return member()
      if (header.kind === 'total')
        return level === 0 ? { kind: 'total', id: 't' } : null
      const depth = header.keys.length
      if (level < depth)
        return member()
      return level === depth ? { kind: 'subtotal', id: `s${prefixId(header.keys, depth)}` } : null
    })
    const emphasis = header.kind !== 'member'
    if (!measures) {
      leaves.push({ header: index, measure: null, emphasis, labels })
      return
    }
    measures.forEach((measure, position) => {
      leaves.push({ header: index, measure: position, emphasis, labels: [...labels, { kind: 'measure', id: `${index}|${position}`, measure }] })
    })
  })
  return leaves
}

function axisTree(leaves: readonly CrosstabLeaf[], offset: number, level: number, levels: number): CrosstabAxisNode[] {
  const nodes: CrosstabAxisNode[] = []
  if (level >= levels)
    return nodes
  let i = 0
  while (i < leaves.length) {
    const label = leaves[i]!.labels[level]!
    let j = i
    while (j + 1 < leaves.length && leaves[j + 1]!.labels[level]?.id === label.id)
      j++
    let span = 1
    while (level + span < levels && leaves[i]!.labels[level + span] === null)
      span++
    const group = leaves.slice(i, j + 1)
    nodes.push({ label, level, span, start: offset + i, count: group.length, children: axisTree(group, offset + i, level + span, levels) })
    i = j + 1
  }
  return nodes
}

function axis(headers: readonly CrosstabHeader[], dimensions: readonly Dimension[], measures: readonly Measure[] | null): CrosstabAxis {
  const leaves = axisLeaves(headers, dimensions, measures)
  const levels = dimensions.length + (measures ? 1 : 0)
  return { leaves, levels, tree: axisTree(leaves, 0, 0, levels) }
}

/**
 * 交叉表两条轴的表头结构。度量有多个且 measuresOn 为 rows 时排在行轴的最内层，否则排在列轴的最内层；
 * 没有列维度时列轴只有度量一层。相同的上层成员合成一个节点，小计、总计的标签向内合并（下方各层为 null）。
 */
export function crosstabAxes(view: CrosstabView, result: CrosstabResult): CrosstabAxes {
  const measuresOnRows = view.measuresOn === 'rows' && view.measures.length > 1
  const measureColumns = !measuresOnRows && (view.measures.length > 1 || view.columns.length === 0)
  return {
    rows: axis(result.rows, view.rows, measuresOnRows ? view.measures : null),
    columns: axis(result.columns, view.columns, measureColumns ? view.measures : null),
  }
}
