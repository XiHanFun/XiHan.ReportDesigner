/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 图表与指标卡片配置的校验：取值范围与对查询维度、度量的引用。

import type { ReportPath } from '../issue'
import type { Checker, JsonObject } from './checker'
import { CHART_TYPES } from '../schema'
import { checkFormat } from './common'

/** 卡片查询的输出键。 */
export interface QueryKeys {
  readonly dimensions: ReadonlySet<string>
  readonly measures: ReadonlySet<string>
}

type Role = 'dimension' | 'measure' | 'any'

const TONES = ['brand', 'neutral', 'success', 'warning', 'danger', 'info'] as const
const PALETTES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'gray'] as const
const SYMBOLS = ['circle', 'square', 'diamond', 'triangle', 'triangleDown', 'cross', 'star', 'wye'] as const
const SIZES = ['sm', 'md', 'lg'] as const
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function checkKey(c: Checker, value: string, path: ReportPath, keys: QueryKeys, role: Role): void {
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

function reference(c: Checker, owner: JsonObject, key: string, path: ReportPath, keys: QueryKeys, role: Role, required = true): string | undefined {
  const value = c.string(owner, key, path, required)
  if (value !== undefined)
    checkKey(c, value, [...path, key], keys, role)
  return value
}

function measureOrRange(c: Checker, owner: JsonObject, key: string, path: ReportPath, keys: QueryKeys): void {
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

function numberOrString(c: Checker, owner: JsonObject, key: string, path: ReportPath, required: boolean): void {
  const value = owner[key]
  if (value === undefined) {
    if (required)
      c.report('required', [...path, key])
    return
  }
  if (typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value)))
    c.report('invalid-type', [...path, key], { expected: 'number|string' })
}

function checkAxis(c: Checker, owner: JsonObject, key: string, path: ReportPath): void {
  const axis = c.objectAt(owner, key, path)
  if (!axis)
    return
  const at = [...path, key]
  c.oneOf(axis, 'scale', at, ['band', 'point', 'linear', 'log', 'sqrt', 'pow', 'symlog', 'time', 'utc'] as const)
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
  c.oneOf(axis, 'labelOverflow', at, ['auto', 'rotate', 'truncate', 'wrap'] as const)
  c.boolean(axis, 'reverse', at)
  c.number(axis, 'exponent', at, { min: 0, exclusiveMin: true })
  c.number(axis, 'constant', at, { min: 0, exclusiveMin: true })
  c.string(axis, 'timeZone', at)
  c.number(axis, 'minSize', at, { min: 0 })
  c.boolean(axis, 'ordinal', at)
  c.oneOf(axis, 'fit', at, ['all', 'window'] as const)
}

function checkCartesian(c: Checker, chart: JsonObject, path: ReportPath, keys: QueryKeys): void {
  const series = c.keyed(chart, 'series', path, 'id', { required: true, nonEmpty: true })
  const seriesIds = new Set<string>()
  for (const { item, path: at, key } of series) {
    if (key !== undefined)
      seriesIds.add(key)
    const mark = c.oneOf(item, 'mark', at, ['bar', 'line', 'scatter'] as const, true)
    c.string(item, 'name', at)
    c.number(item, 'slot', at, { integer: true, min: 1, max: 8 })
    c.oneOf(item, 'tone', at, TONES)
    if (mark === 'bar' || mark === 'line') {
      reference(c, item, 'x', at, keys, 'dimension')
      measureOrRange(c, item, 'y', at, keys)
      c.string(item, 'stack', at)
    }
    if (mark === 'bar') {
      c.oneOf(item, 'shape', at, ['bar', 'lollipop'] as const)
      c.oneOf(item, 'stackOffset', at, ['none', 'expand', 'diverging'] as const)
      c.oneOf(item, 'labels', at, ['none', 'inside', 'end'] as const)
    }
    else if (mark === 'line') {
      c.oneOf(item, 'curve', at, ['linear', 'monotone', 'step', 'step-before', 'step-after'] as const)
      c.boolean(item, 'area', at)
      c.oneOf(item, 'stackOffset', at, ['none', 'expand', 'silhouette', 'wiggle'] as const)
      c.oneOf(item, 'symbols', at, ['auto', 'always', 'none'] as const)
      c.boolean(item, 'connectNulls', at)
      c.oneOf(item, 'labels', at, ['none', 'end'] as const)
      c.boolean(item, 'endLabel', at)
    }
    else if (mark === 'scatter') {
      reference(c, item, 'x', at, keys, 'any')
      reference(c, item, 'y', at, keys, 'measure')
      reference(c, item, 'size', at, keys, 'measure', false)
      reference(c, item, 'color', at, keys, 'measure', false)
      c.oneOf(item, 'symbol', at, SYMBOLS)
      c.number(item, 'jitter', at, { min: 0, max: 1 })
    }
  }
  reference(c, chart, 'splitBy', path, keys, 'dimension', false)
  c.oneOf(chart, 'orientation', path, ['vertical', 'horizontal'] as const)
  checkAxis(c, chart, 'xAxis', path)
  checkAxis(c, chart, 'yAxis', path)
  c.oneOf(chart, 'renderer', path, ['svg', 'canvas', 'auto'] as const)
  c.oneOf(chart, 'trigger', path, ['axis', 'item'] as const)
  c.boolean(chart, 'totals', path)
  c.oneOf(chart, 'tooltipOrder', path, ['series', 'descending', 'ascending'] as const)
  c.oneOf(chart, 'palette', path, PALETTES)
  c.oneOf(chart, 'zoom', path, ['none', 'x', 'y', 'xy'] as const)
  c.oneOf(chart, 'brush', path, ['none', 'x', 'y', 'xy'] as const)
  const annotations = c.array(chart, 'annotations', path)
  annotations?.forEach((value, index) => {
    const at = [...path, 'annotations', index]
    const annotation = c.object(value, at)
    if (!annotation)
      return
    const kind = c.oneOf(annotation, 'kind', at, ['line', 'band', 'point', 'average', 'trend'] as const, true)
    c.string(annotation, 'label', at)
    if (kind === 'line' || kind === 'band')
      c.oneOf(annotation, 'axis', at, ['x', 'y'] as const, true)
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
        c.oneOf(annotation, 'at', at, ['max', 'min', 'last'] as const)
      else if (c.object(target, [...at, 'at']))
        numberOrString(c, target as JsonObject, 'x', [...at, 'at'], true)
    }
    if (kind === 'trend') {
      c.oneOf(annotation, 'method', at, ['linear', 'moving-average'] as const, true)
      c.number(annotation, 'window', at, { integer: true, min: 1 })
    }
  })
}

function checkDay(c: Checker, owner: JsonObject, key: string, path: ReportPath): void {
  const value = c.string(owner, key, path)
  if (value !== undefined && !DAY_PATTERN.test(value))
    c.report('invalid-value', [...path, key], { expected: 'YYYY-MM-DD' })
}

/** 校验图表卡片的 chart。 */
export function checkChart(c: Checker, owner: JsonObject, path: ReportPath, keys: QueryKeys): void {
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
      c.oneOf(chart, 'variant', at, ['pie', 'donut'] as const)
      c.boolean(chart, 'rose', at)
      c.oneOf(chart, 'sweep', at, ['full', 'half'] as const)
      c.oneOf(chart, 'sort', at, ['none', 'descending'] as const)
      c.number(chart, 'maxSlices', at, { integer: true, min: 1 })
      c.oneOf(chart, 'labels', at, ['none', 'inside', 'outside'] as const)
      c.oneOf(chart, 'labelContent', at, ['name-share', 'name-value', 'name', 'share', 'value'] as const)
      checkFormat(c, chart, 'format', at, 'number')
      break
    case 'funnel':
      reference(c, chart, 'nameField', at, keys, 'dimension')
      reference(c, chart, 'valueField', at, keys, 'measure')
      c.oneOf(chart, 'shape', at, ['trapezoid', 'bar'] as const)
      c.oneOf(chart, 'align', at, ['center', 'start'] as const)
      c.oneOf(chart, 'direction', at, ['down', 'up'] as const)
      c.oneOf(chart, 'conversion', at, ['previous', 'first', 'none'] as const)
      c.oneOf(chart, 'labels', at, ['inside', 'outside'] as const)
      c.oneOf(chart, 'palette', at, PALETTES)
      checkFormat(c, chart, 'format', at, 'number')
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
      c.oneOf(chart, 'shape', at, ['polygon', 'circle'] as const)
      c.boolean(chart, 'area', at)
      c.oneOf(chart, 'scale', at, ['shared', 'independent'] as const)
      c.oneOf(chart, 'curve', at, ['linear', 'catmull-rom'] as const)
      c.number(chart, 'rings', at, { integer: true, min: 2, max: 10 })
      c.boolean(chart, 'ringLabels', at)
      checkFormat(c, chart, 'format', at, 'number')
      break
    }
    case 'sankey':
      reference(c, chart, 'sourceField', at, keys, 'dimension')
      reference(c, chart, 'targetField', at, keys, 'dimension')
      reference(c, chart, 'valueField', at, keys, 'measure')
      c.oneOf(chart, 'orientation', at, ['horizontal', 'vertical'] as const)
      c.oneOf(chart, 'nodeAlign', at, ['justify', 'start', 'end', 'center'] as const)
      c.oneOf(chart, 'linkColor', at, ['neutral', 'source', 'target', 'gradient'] as const)
      c.oneOf(chart, 'nodeSort', at, ['auto', 'input'] as const)
      checkFormat(c, chart, 'format', at, 'number')
      break
    case 'heatmap': {
      const variant = c.oneOf(chart, 'variant', at, ['calendar', 'month', 'matrix'] as const, true)
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
      c.oneOf(chart, 'scale', at, ['sequential', 'diverging'] as const)
      c.number(chart, 'midpoint', at)
      c.boolean(chart, 'continuous', at)
      c.oneOf(chart, 'tone', at, TONES)
      c.oneOf(chart, 'palette', at, PALETTES)
      c.oneOf(chart, 'size', at, SIZES)
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
      c.oneOf(chart, 'layout', at, ['treemap', 'sunburst', 'icicle', 'pack'] as const)
      c.oneOf(chart, 'tile', at, ['squarify', 'binary', 'slice-dice'] as const)
      c.number(chart, 'depth', at, { integer: true, min: 1 })
      c.oneOf(chart, 'colorBy', at, ['branch', 'value', 'uniform'] as const)
      c.oneOf(chart, 'palette', at, PALETTES)
      c.oneOf(chart, 'orientation', at, ['vertical', 'horizontal'] as const)
      checkFormat(c, chart, 'format', at, 'number')
      break
    }
  }
}

/** 校验指标卡片的 metric。 */
export function checkMetric(c: Checker, owner: JsonObject, path: ReportPath, keys: QueryKeys): void {
  const metric = c.objectAt(owner, 'metric', path, true)
  if (!metric)
    return
  const at = [...path, 'metric']
  reference(c, metric, 'value', at, keys, 'measure')
  reference(c, metric, 'baseline', at, keys, 'measure', false)
  c.string(metric, 'prefix', at)
  c.string(metric, 'suffix', at)
  checkFormat(c, metric, 'format', at, 'number')
  c.oneOf(metric, 'size', at, SIZES)
  c.oneOf(metric, 'tone', at, TONES)
  const sparkline = c.objectAt(metric, 'sparkline', at)
  if (!sparkline)
    return
  const sp = [...at, 'sparkline']
  reference(c, sparkline, 'x', sp, keys, 'dimension')
  reference(c, sparkline, 'y', sp, keys, 'measure')
  c.oneOf(sparkline, 'variant', sp, ['line', 'area', 'bar', 'win-loss'] as const)
  c.oneOf(sparkline, 'curve', sp, ['linear', 'monotone'] as const)
  c.oneOf(sparkline, 'markers', sp, ['none', 'last', 'extremes'] as const)
  c.oneOf(sparkline, 'tone', sp, TONES)
  const band = sparkline.band
  if (band !== undefined && (!Array.isArray(band) || band.length !== 2 || band.some(item => typeof item !== 'number' || !Number.isFinite(item))))
    c.report('invalid-value', [...sp, 'band'], { expected: '[number, number]' })
  const referenceLine = sparkline.reference
  if (referenceLine !== undefined && referenceLine !== 'mean' && referenceLine !== 'median' && (typeof referenceLine !== 'number' || !Number.isFinite(referenceLine)))
    c.report('invalid-value', [...sp, 'reference'], { expected: 'number|mean|median' })
}
