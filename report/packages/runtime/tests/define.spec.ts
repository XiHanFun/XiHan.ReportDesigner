// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { describe, expect, it } from 'vitest'
import { defineReportViewer } from '../src'

const USED = [
  'xh-table',
  'xh-virtualizer',
  'xh-cartesian-chart',
  'xh-pie-chart',
  'xh-funnel-chart',
  'xh-radar-chart',
  'xh-sankey-chart',
  'xh-hierarchy-chart',
  'xh-heatmap',
  'xh-statistic',
  'xh-sparkline',
  'xh-select',
  'xh-switch',
  'xh-date-field',
  'xh-tags-input',
  'xh-tag',
  'xh-number-field',
  'xh-text-field',
  'xh-button',
]

describe('defineReportViewer', () => {
  it('注册查看器与它排出的 UI 元素，别的 UI 元素不注册；重复调用不报错', () => {
    expect(customElements.get('xh-report-viewer')).toBeUndefined()
    defineReportViewer()
    expect(customElements.get('xh-report-viewer')).toBeDefined()
    expect(USED.filter(tag => customElements.get(tag) === undefined)).toEqual([])
    expect(customElements.get('xh-dialog')).toBeUndefined()
    expect(customElements.get('xh-tabs')).toBeUndefined()
    expect(() => defineReportViewer()).not.toThrow()
  })
})
