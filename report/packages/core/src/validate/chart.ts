/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 图表与指标卡片配置的校验：取值范围与对查询维度、度量的引用。

import type { JsonPath } from '@xihan-ui/core/json'
import type { Checker, JsonObject } from './checker'
import { SYMBOL_NAMES } from '@xihan-ui/viz'
import {
  ANNOTATION_AXES,
  ANNOTATION_KINDS,
  ANNOTATION_POINTS,
  AXIS_FITS,
  AXIS_LABEL_OVERFLOWS,
  AXIS_SCALES,
  BAR_LABELS,
  BAR_SHAPES,
  BAR_STACK_OFFSETS,
  CARTESIAN_ORIENTATIONS,
  CHART_INTERACTION_AXES,
  CHART_PALETTES,
  CHART_RENDERERS,
  CHART_SIZES,
  CHART_TONES,
  CHART_TRIGGERS,
  CHART_TYPES,
  FUNNEL_ALIGNS,
  FUNNEL_CONVERSIONS,
  FUNNEL_DIRECTIONS,
  FUNNEL_LABELS,
  FUNNEL_SHAPES,
  HEATMAP_SCALES,
  HEATMAP_VARIANTS,
  HIERARCHY_COLOR_BY,
  HIERARCHY_LAYOUTS,
  HIERARCHY_ORIENTATIONS,
  HIERARCHY_TILES,
  LINE_CURVES,
  LINE_LABELS,
  LINE_STACK_OFFSETS,
  LINE_SYMBOLS,
  PIE_LABEL_CONTENTS,
  PIE_LABELS,
  PIE_SORTS,
  PIE_SWEEPS,
  PIE_VARIANTS,
  RADAR_CURVES,
  RADAR_SCALES,
  RADAR_SHAPES,
  SANKEY_LINK_COLORS,
  SANKEY_NODE_ALIGNS,
  SANKEY_NODE_SORTS,
  SANKEY_ORIENTATIONS,
  SERIES_MARKS,
  SPARKLINE_CURVES,
  SPARKLINE_MARKERS,
  SPARKLINE_VARIANTS,
  TOOLTIP_ORDERS,
  TREND_METHODS,
} from '../schema'
import { checkFormat } from './common'

/** 卡片查询的输出键。 */
export interface QueryKeys {
  readonly dimensions: ReadonlySet<string>
  readonly measures: ReadonlySet<string>
}

type Role = 'dimension' | 'measure' | 'any'

const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function checkKey(c: Checker, value: string, path: JsonPath, keys: QueryKeys, role: Role): void {
  const isDimension = keys.dimensions.has(value)
  const isMeasure = keys.measures.has(value)
  if (role === 'any') {
    if (!isDimension && !isMeasure)
      c.report('unknown-key', path, { key: value })
    return
  }
  const matches = role === 'dimension' ? isDimension : isMeasure
  if (matches)
    return
  if (isDimension || isMeasure)
    c.report('chart-reference-role', path, { key: value, expected: role })
  else
    c.report(role === 'dimension' ? 'unknown-dimension' : 'unknown-measure', path, { key: value })
}

function reference(c: Checker, owner: JsonObject, key: string, path: JsonPath, keys: QueryKeys, role: Role, required = true): string | undefined {
  const value = c.string(owner, key, path, required)
  if (value !== undefined)
    checkKey(c, value, [...path, key], keys, role)
  return value
}

function measureOrRange(c: Checker, owner: JsonObject, key: string, path: JsonPath, keys: QueryKeys): void {
  const value = owner[key]
  if (Array.isArray(value)) {
    if (value.length !== 2) {
      c.report('invalid-value', [...path, key], { min: 2, max: 2 })
      return
    }
    value.forEach((item, index) => {
      if (typeof item !== 'string')
        c.report('invalid-type', [...path, key, index], { expected: 'string' })
      else
        checkKey(c, item, [...path, key, index], keys, 'measure')
    })
    return
  }
  reference(c, owner, key, path, keys, 'measure')
}

function numberOrString(c: Checker, owner: JsonObject, key: string, path: JsonPath, required: boolean): void {
  const value = owner[key]
  if (value === undefined) {
    if (required)
      c.report('required', [...path, key])
    return
  }
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))
    c.report('invalid-type', [...path, key], { expected: 'number|string' })
}

function checkAxis(c: Checker, owner: JsonObject, key: string, path: JsonPath): void {
  const axis = c.objectAt(owner, key, path)
  if (!axis)
    return
  const at = [...path, key]
  c.oneOf(axis, 'scale', at, AXIS_SCALES)
  const domain = c.array(axis, 'domain', at)
  domain?.forEach((item, index) => {
    if (typeof item !== 'string' && (typeof item !== 'number' || !Number.isFinite(item)))
      c.report('invalid-type', [...at, 'domain', index], { expected: 'number|string' })
  })
  numberOrString(c, axis, 'min', at, false)
  numberOrString(c, axis, 'max', at, false)
  c.boolean(axis, 'nice', at)
  c.boolean(axis, 'zero', at)
  c.number(axis, 'ticks', at, { integer: true, min: 1 })
  checkFormat(c, axis, 'format', at)
  c.string(axis, 'title', at)
  c.boolean(axis, 'grid', at)
  c.oneOf(axis, 'labelOverflow', at, AXIS_LABEL_OVERFLOWS)
  c.boolean(axis, 'reverse', at)
  c.number(axis, 'exponent', at, { min: 0, exclusiveMin: true })
  c.number(axis, 'constant', at, { min: 0, exclusiveMin: true })
  c.string(axis, 'timeZone', at)
  c.number(axis, 'minSize', at, { min: 0 })
  c.boolean(axis, 'ordinal', at)
  c.oneOf(axis, 'fit', at, AXIS_FITS)
}

function checkCartesian(c: Checker, chart: JsonObject, path: JsonPath, keys: QueryKeys): void {
  const series = c.keyed(chart, 'series', path, 'id', { required: true, nonEmpty: true })
  const seriesIds = new Set<string>()
  for (const { item, path: at, key } of series) {
    if (key !== undefined)
      seriesIds.add(key)
    const mark = c.oneOf(item, 'mark', at, SERIES_MARKS, true)
    c.string(item, 'name', at)
    c.number(item, 'slot', at, { integer: true, min: 1, max: 8 })
    c.oneOf(item, 'tone', at, CHART_TONES)
    if (mark === 'bar' || mark === 'line') {
      reference(c, item, 'x', at, keys, 'dimension')
      measureOrRange(c, item, 'y', at, keys)
      c.string(item, 'stack', at)
    }
    if (mark === 'bar') {
      c.oneOf(item, 'shape', at, BAR_SHAPES)
      c.oneOf(item, 'stackOffset', at, BAR_STACK_OFFSETS)
      c.oneOf(item, 'labels', at, BAR_LABELS)
    }
    else if (mark === 'line') {
      c.oneOf(item, 'curve', at, LINE_CURVES)
      c.boolean(item, 'area', at)
      c.oneOf(item, 'stackOffset', at, LINE_STACK_OFFSETS)
      c.oneOf(item, 'symbols', at, LINE_SYMBOLS)
      c.boolean(item, 'connectNulls', at)
      c.oneOf(item, 'labels', at, LINE_LABELS)
      c.boolean(item, 'endLabel', at)
    }
    else if (mark === 'scatter') {
      reference(c, item, 'x', at, keys, 'any')
      reference(c, item, 'y', at, keys, 'measure')
      reference(c, item, 'size', at, keys, 'measure', false)
      reference(c, item, 'color', at, keys, 'measure', false)
      c.oneOf(item, 'symbol', at, SYMBOL_NAMES)
      c.number(item, 'jitter', at, { min: 0, max: 1 })
    }
  }
  reference(c, chart, 'splitBy', path, keys, 'dimension', false)
  c.oneOf(chart, 'orientation', path, CARTESIAN_ORIENTATIONS)
  checkAxis(c, chart, 'xAxis', path)
  checkAxis(c, chart, 'yAxis', path)
  c.oneOf(chart, 'renderer', path, CHART_RENDERERS)
  c.oneOf(chart, 'trigger', path, CHART_TRIGGERS)
  c.boolean(chart, 'totals', path)
  c.oneOf(chart, 'tooltipOrder', path, TOOLTIP_ORDERS)
  c.oneOf(chart, 'palette', path, CHART_PALETTES)
  c.oneOf(chart, 'zoom', path, CHART_INTERACTION_AXES)
  c.oneOf(chart, 'brush', path, CHART_INTERACTION_AXES)
  const annotations = c.array(chart, 'annotations', path)
  annotations?.forEach((value, index) => {
    const at = [...path, 'annotations', index]
    const annotation = c.object(value, at)
    if (!annotation)
      return
    const kind = c.oneOf(annotation, 'kind', at, ANNOTATION_KINDS, true)
    c.string(annotation, 'label', at)
    if (kind === 'line' || kind === 'band')
      c.oneOf(annotation, 'axis', at, ANNOTATION_AXES, true)
    if (kind === 'line')
      numberOrString(c, annotation, 'value', at, true)
    if (kind === 'band') {
      numberOrString(c, annotation, 'from', at, true)
      numberOrString(c, annotation, 'to', at, true)
    }
    if (kind === 'point' || kind === 'average' || kind === 'trend') {
      const id = c.string(annotation, 'series', at, true)
      if (id !== undefined && !seriesIds.has(id))
        c.report('unknown-series', [...at, 'series'], { series: id })
    }
    if (kind === 'point') {
      const target = annotation.at
      if (target === undefined)
        c.report('required', [...at, 'at'])
      else if (typeof target === 'string')
        c.oneOf(annotation, 'at', at, ANNOTATION_POINTS)
      else if (c.object(target, [...at, 'at']))
        numberOrString(c, target as JsonObject, 'x', [...at, 'at'], true)
    }
    if (kind === 'trend') {
      c.oneOf(annotation, 'method', at, TREND_METHODS, true)
      c.number(annotation, 'window', at, { integer: true, min: 1 })
    }
  })
}

function checkDay(c: Checker, owner: JsonObject, key: string, path: JsonPath): void {
  const value = c.string(owner, key, path)
  if (value !== undefined && !DAY_PATTERN.test(value))
    c.report('invalid-value', [...path, key], { expected: 'YYYY-MM-DD' })
}

/** 校验图表卡片的 chart。 */
export function checkChart(c: Checker, owner: JsonObject, path: JsonPath, keys: QueryKeys): void {
  const chart = c.objectAt(owner, 'chart', path, true)
  if (!chart)
    return
  const at = [...path, 'chart']
  const type = c.oneOf(chart, 'type', at, CHART_TYPES, true)
  switch (type) {
    case 'cartesian':
      checkCartesian(c, chart, at, keys)
      break
    case 'pie':
      reference(c, chart, 'nameField', at, keys, 'dimension')
      reference(c, chart, 'valueField', at, keys, 'measure')
      c.oneOf(chart, 'variant', at, PIE_VARIANTS)
      c.boolean(chart, 'rose', at)
      c.oneOf(chart, 'sweep', at, PIE_SWEEPS)
      c.oneOf(chart, 'sort', at, PIE_SORTS)
      c.number(chart, 'maxSlices', at, { integer: true, min: 1 })
      c.oneOf(chart, 'labels', at, PIE_LABELS)
      c.oneOf(chart, 'labelContent', at, PIE_LABEL_CONTENTS)
      checkFormat(c, chart, 'format', at, true)
      break
    case 'funnel':
      reference(c, chart, 'nameField', at, keys, 'dimension')
      reference(c, chart, 'valueField', at, keys, 'measure')
      c.oneOf(chart, 'shape', at, FUNNEL_SHAPES)
      c.oneOf(chart, 'align', at, FUNNEL_ALIGNS)
      c.oneOf(chart, 'direction', at, FUNNEL_DIRECTIONS)
      c.oneOf(chart, 'conversion', at, FUNNEL_CONVERSIONS)
      c.oneOf(chart, 'labels', at, FUNNEL_LABELS)
      c.oneOf(chart, 'palette', at, CHART_PALETTES)
      checkFormat(c, chart, 'format', at, true)
      break
    case 'radar': {
      reference(c, chart, 'nameField', at, keys, 'dimension')
      const indicators = c.array(chart, 'indicators', at, true)
      if (indicators && (indicators.length < 3 || indicators.length > 10))
        c.report('invalid-value', [...at, 'indicators'], { min: 3, max: 10 })
      indicators?.forEach((value, index) => {
        const indicator = c.object(value, [...at, 'indicators', index])
        if (!indicator)
          return
        const ip = [...at, 'indicators', index]
        reference(c, indicator, 'key', ip, keys, 'measure')
        c.string(indicator, 'label', ip)
        c.number(indicator, 'min', ip)
        c.number(indicator, 'max', ip)
      })
      c.oneOf(chart, 'shape', at, RADAR_SHAPES)
      c.boolean(chart, 'area', at)
      c.oneOf(chart, 'scale', at, RADAR_SCALES)
      c.oneOf(chart, 'curve', at, RADAR_CURVES)
      c.number(chart, 'rings', at, { integer: true, min: 2, max: 10 })
      c.boolean(chart, 'ringLabels', at)
      checkFormat(c, chart, 'format', at, true)
      break
    }
    case 'sankey':
      reference(c, chart, 'sourceField', at, keys, 'dimension')
      reference(c, chart, 'targetField', at, keys, 'dimension')
      reference(c, chart, 'valueField', at, keys, 'measure')
      c.oneOf(chart, 'orientation', at, SANKEY_ORIENTATIONS)
      c.oneOf(chart, 'nodeAlign', at, SANKEY_NODE_ALIGNS)
      c.oneOf(chart, 'linkColor', at, SANKEY_LINK_COLORS)
      c.oneOf(chart, 'nodeSort', at, SANKEY_NODE_SORTS)
      checkFormat(c, chart, 'format', at, true)
      break
    case 'heatmap': {
      const variant = c.oneOf(chart, 'variant', at, HEATMAP_VARIANTS, true)
      reference(c, chart, 'valueField', at, keys, 'measure')
      if (variant === 'matrix') {
        reference(c, chart, 'rowField', at, keys, 'dimension')
        reference(c, chart, 'columnField', at, keys, 'dimension')
      }
      else if (variant !== undefined) {
        reference(c, chart, 'dateField', at, keys, 'dimension')
        checkDay(c, chart, 'startDate', at)
        checkDay(c, chart, 'endDate', at)
        c.number(chart, 'firstDayOfWeek', at, { integer: true, min: 0, max: 6 })
      }
      c.number(chart, 'levels', at, { integer: true, min: 1 })
      c.array(chart, 'thresholds', at)?.forEach((value, index) => {
        if (typeof value !== 'number' || !Number.isFinite(value))
          c.report('invalid-type', [...at, 'thresholds', index], { expected: 'number' })
      })
      c.oneOf(chart, 'scale', at, HEATMAP_SCALES)
      c.number(chart, 'midpoint', at)
      c.boolean(chart, 'continuous', at)
      c.oneOf(chart, 'tone', at, CHART_TONES)
      c.oneOf(chart, 'palette', at, CHART_PALETTES)
      c.oneOf(chart, 'size', at, CHART_SIZES)
      break
    }
    case 'hierarchy': {
      const levels = c.array(chart, 'levels', at, true, true)
      levels?.forEach((value, index) => {
        if (typeof value !== 'string')
          c.report('invalid-type', [...at, 'levels', index], { expected: 'string' })
        else
          checkKey(c, value, [...at, 'levels', index], keys, 'dimension')
      })
      reference(c, chart, 'valueField', at, keys, 'measure')
      c.oneOf(chart, 'layout', at, HIERARCHY_LAYOUTS)
      c.oneOf(chart, 'tile', at, HIERARCHY_TILES)
      c.number(chart, 'depth', at, { integer: true, min: 1 })
      c.oneOf(chart, 'colorBy', at, HIERARCHY_COLOR_BY)
      c.oneOf(chart, 'palette', at, CHART_PALETTES)
      c.oneOf(chart, 'orientation', at, HIERARCHY_ORIENTATIONS)
      checkFormat(c, chart, 'format', at, true)
      break
    }
  }
}

/** 校验指标卡片的 metric。 */
export function checkMetric(c: Checker, owner: JsonObject, path: JsonPath, keys: QueryKeys): void {
  const metric = c.objectAt(owner, 'metric', path, true)
  if (!metric)
    return
  const at = [...path, 'metric']
  reference(c, metric, 'value', at, keys, 'measure')
  reference(c, metric, 'baseline', at, keys, 'measure', false)
  c.string(metric, 'prefix', at)
  c.string(metric, 'suffix', at)
  checkFormat(c, metric, 'format', at, true)
  c.oneOf(metric, 'size', at, CHART_SIZES)
  c.oneOf(metric, 'tone', at, CHART_TONES)
  const sparkline = c.objectAt(metric, 'sparkline', at)
  if (!sparkline)
    return
  const sp = [...at, 'sparkline']
  reference(c, sparkline, 'x', sp, keys, 'dimension')
  reference(c, sparkline, 'y', sp, keys, 'measure')
  c.oneOf(sparkline, 'variant', sp, SPARKLINE_VARIANTS)
  c.oneOf(sparkline, 'curve', sp, SPARKLINE_CURVES)
  c.oneOf(sparkline, 'markers', sp, SPARKLINE_MARKERS)
  c.oneOf(sparkline, 'tone', sp, CHART_TONES)
  const band = sparkline.band
  if (band !== undefined && (!Array.isArray(band) || band.length !== 2 || band.some(item => typeof item !== 'number' || !Number.isFinite(item))))
    c.report('invalid-value', [...sp, 'band'], { expected: '[number, number]' })
  const referenceLine = sparkline.reference
  if (referenceLine !== undefined && referenceLine !== 'mean' && referenceLine !== 'median' && (typeof referenceLine !== 'number' || !Number.isFinite(referenceLine)))
    c.report('invalid-value', [...sp, 'reference'], { expected: 'number|mean|median' })
}
