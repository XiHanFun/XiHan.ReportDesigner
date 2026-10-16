/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表定义里各个取值清单：校验与设计器的属性描述共用这一份，每张清单都按 schema 的类型核对过。

import type {
  CartesianAnnotationSpec,
  CartesianAxisSpec,
  CartesianBarSeriesSpec,
  CartesianChartSpec,
  CartesianLineSeriesSpec,
  CartesianSeriesSpec,
  ChartPalette,
  ChartSize,
  ChartTone,
  FunnelChartSpec,
  HeatmapChartSpec,
  HeatmapChartSpecBase,
  HierarchyChartSpec,
  PieChartSpec,
  RadarChartSpec,
  SankeyChartSpec,
  SparklineSpec,
} from './chart'
import type { FilterGroup, NullsPosition, SortDirection } from './filter'
import type { CrosstabView, DashboardCard, TableColumn } from './view'

type Values<T> = readonly NonNullable<T>[]

export const CHART_TONES = ['brand', 'neutral', 'success', 'warning', 'danger', 'info'] as const satisfies Values<ChartTone>
export const CHART_PALETTES = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'blue', 'indigo', 'purple', 'pink', 'gray'] as const satisfies Values<ChartPalette>
export const CHART_SIZES = ['sm', 'md', 'lg'] as const satisfies Values<ChartSize>

export const AXIS_SCALES = ['band', 'point', 'linear', 'log', 'sqrt', 'pow', 'symlog', 'time', 'utc'] as const satisfies Values<CartesianAxisSpec['scale']>
export const AXIS_LABEL_OVERFLOWS = ['auto', 'rotate', 'truncate', 'wrap'] as const satisfies Values<CartesianAxisSpec['labelOverflow']>
export const AXIS_FITS = ['all', 'window'] as const satisfies Values<CartesianAxisSpec['fit']>

export const SERIES_MARKS = ['bar', 'line', 'scatter'] as const satisfies Values<CartesianSeriesSpec['mark']>
export const BAR_SHAPES = ['bar', 'lollipop'] as const satisfies Values<CartesianBarSeriesSpec['shape']>
export const BAR_STACK_OFFSETS = ['none', 'expand', 'diverging'] as const satisfies Values<CartesianBarSeriesSpec['stackOffset']>
export const BAR_LABELS = ['none', 'inside', 'end'] as const satisfies Values<CartesianBarSeriesSpec['labels']>
export const LINE_CURVES = ['linear', 'monotone', 'step', 'step-before', 'step-after'] as const satisfies Values<CartesianLineSeriesSpec['curve']>
export const LINE_STACK_OFFSETS = ['none', 'expand', 'silhouette', 'wiggle'] as const satisfies Values<CartesianLineSeriesSpec['stackOffset']>
export const LINE_SYMBOLS = ['auto', 'always', 'none'] as const satisfies Values<CartesianLineSeriesSpec['symbols']>
export const LINE_LABELS = ['none', 'end'] as const satisfies Values<CartesianLineSeriesSpec['labels']>

export const CARTESIAN_ORIENTATIONS = ['vertical', 'horizontal'] as const satisfies Values<CartesianChartSpec['orientation']>
export const CHART_RENDERERS = ['svg', 'canvas', 'auto'] as const satisfies Values<CartesianChartSpec['renderer']>
export const CHART_TRIGGERS = ['axis', 'item'] as const satisfies Values<CartesianChartSpec['trigger']>
export const TOOLTIP_ORDERS = ['series', 'descending', 'ascending'] as const satisfies Values<CartesianChartSpec['tooltipOrder']>
/** 缩放与刷选的方向。 */
export const CHART_INTERACTION_AXES = ['none', 'x', 'y', 'xy'] as const satisfies Values<CartesianChartSpec['zoom']> & Values<CartesianChartSpec['brush']>

export const ANNOTATION_KINDS = ['line', 'band', 'point', 'average', 'trend'] as const satisfies Values<CartesianAnnotationSpec['kind']>
export const ANNOTATION_AXES = ['x', 'y'] as const satisfies Values<Extract<CartesianAnnotationSpec, { kind: 'line' }>['axis']>
export const ANNOTATION_POINTS = ['max', 'min', 'last'] as const satisfies Values<Exclude<Extract<CartesianAnnotationSpec, { kind: 'point' }>['at'], object>>
export const TREND_METHODS = ['linear', 'moving-average'] as const satisfies Values<Extract<CartesianAnnotationSpec, { kind: 'trend' }>['method']>

export const PIE_VARIANTS = ['pie', 'donut'] as const satisfies Values<PieChartSpec['variant']>
export const PIE_SWEEPS = ['full', 'half'] as const satisfies Values<PieChartSpec['sweep']>
export const PIE_SORTS = ['none', 'descending'] as const satisfies Values<PieChartSpec['sort']>
export const PIE_LABELS = ['none', 'inside', 'outside'] as const satisfies Values<PieChartSpec['labels']>
export const PIE_LABEL_CONTENTS = ['name-share', 'name-value', 'name', 'share', 'value'] as const satisfies Values<PieChartSpec['labelContent']>

export const FUNNEL_SHAPES = ['trapezoid', 'bar'] as const satisfies Values<FunnelChartSpec['shape']>
export const FUNNEL_ALIGNS = ['center', 'start'] as const satisfies Values<FunnelChartSpec['align']>
export const FUNNEL_DIRECTIONS = ['down', 'up'] as const satisfies Values<FunnelChartSpec['direction']>
export const FUNNEL_CONVERSIONS = ['previous', 'first', 'none'] as const satisfies Values<FunnelChartSpec['conversion']>
export const FUNNEL_LABELS = ['inside', 'outside'] as const satisfies Values<FunnelChartSpec['labels']>

export const RADAR_SHAPES = ['polygon', 'circle'] as const satisfies Values<RadarChartSpec['shape']>
export const RADAR_SCALES = ['shared', 'independent'] as const satisfies Values<RadarChartSpec['scale']>
export const RADAR_CURVES = ['linear', 'catmull-rom'] as const satisfies Values<RadarChartSpec['curve']>

export const SANKEY_ORIENTATIONS = ['horizontal', 'vertical'] as const satisfies Values<SankeyChartSpec['orientation']>
export const SANKEY_NODE_ALIGNS = ['justify', 'start', 'end', 'center'] as const satisfies Values<SankeyChartSpec['nodeAlign']>
export const SANKEY_LINK_COLORS = ['neutral', 'source', 'target', 'gradient'] as const satisfies Values<SankeyChartSpec['linkColor']>
export const SANKEY_NODE_SORTS = ['auto', 'input'] as const satisfies Values<SankeyChartSpec['nodeSort']>

export const HEATMAP_VARIANTS = ['calendar', 'month', 'matrix'] as const satisfies Values<HeatmapChartSpec['variant']>
export const HEATMAP_SCALES = ['sequential', 'diverging'] as const satisfies Values<HeatmapChartSpecBase['scale']>

export const HIERARCHY_LAYOUTS = ['treemap', 'sunburst', 'icicle', 'pack'] as const satisfies Values<HierarchyChartSpec['layout']>
export const HIERARCHY_TILES = ['squarify', 'binary', 'slice-dice'] as const satisfies Values<HierarchyChartSpec['tile']>
export const HIERARCHY_COLOR_BY = ['branch', 'value', 'uniform'] as const satisfies Values<HierarchyChartSpec['colorBy']>
export const HIERARCHY_ORIENTATIONS = ['vertical', 'horizontal'] as const satisfies Values<HierarchyChartSpec['orientation']>

export const SPARKLINE_VARIANTS = ['line', 'area', 'bar', 'win-loss'] as const satisfies Values<SparklineSpec['variant']>
export const SPARKLINE_CURVES = ['linear', 'monotone'] as const satisfies Values<SparklineSpec['curve']>
export const SPARKLINE_MARKERS = ['none', 'last', 'extremes'] as const satisfies Values<SparklineSpec['markers']>

export const COLUMN_ALIGNS = ['start', 'center', 'end'] as const satisfies Values<TableColumn['align']>
export const COLUMN_STICKY_SIDES = ['start', 'end'] as const satisfies Values<TableColumn['sticky']>
export const MEASURES_ON = ['columns', 'rows'] as const satisfies Values<CrosstabView['measuresOn']>
export const CARD_KINDS = ['chart', 'metric', 'table'] as const satisfies Values<DashboardCard['kind']>
export const FILTER_LOGICS = ['and', 'or'] as const satisfies Values<FilterGroup['logic']>
export const SORT_DIRECTIONS = ['asc', 'desc'] as const satisfies Values<SortDirection>
export const NULLS_POSITIONS = ['first', 'last'] as const satisfies Values<NullsPosition>
