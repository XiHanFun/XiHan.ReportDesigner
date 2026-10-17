/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { CommonIssueCode } from '@xihan-ui/designer-kit/schema'
import type { ReportDesignerTranslations } from '../src'
import { PARAMETER_ISSUE_CODES, REPORT_ISSUE_CODES } from '@xihan-report/core'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { DEFAULT_REPORT_DESIGNER_TRANSLATIONS } from '../src'
import * as design from '../src/design'
import { reportZhCN } from '../src/locale'

describe('reportZhCN', () => {
  it('一份语言包含查看器、设计器与 designer-shell 零件的中文文案', () => {
    const translations = reportZhCN.translations as Record<string, Record<string, unknown> | undefined>
    expect(translations['xh-report-viewer']?.total).toBe('总计')
    const designer = translations['xh-report-designer'] as Partial<ReportDesignerTranslations>
    expect(designer.label).toBe('报表设计器')
    expect(designer.propertyLabels?.['xAxis.title']).toBe('横轴标题')
    expect(designer.issue?.({ code: 'unknown-field', params: { field: 'qty' } })).toBe('找不到字段「qty」')
    expect(translations['xh-designer-properties']?.title).toBe('属性')
    expect(translations['xh-designer-issues']?.title).toBe('问题')
  })

  it('英文缺省的问题文案按码给出，认不出的码原样带上', () => {
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issue({ code: 'unknown-measure', params: { key: 'amount' } })).toBe('Unknown measure "amount"')
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issue({ code: 'something-new' })).toBe('Problem: something-new')
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.selected(3)).toBe('3 selected')
  })
})

const COMMON_ISSUE_CODES = ['required', 'invalid-type', 'invalid-value', 'out-of-range', 'not-integer', 'invalid-option', 'invalid-color', 'empty', 'unknown-key', 'duplicate-key', 'duplicate-id', 'unknown-control'] as const satisfies readonly CommonIssueCode[]

describe('问题说明', () => {
  it('通用问题码列全了', () => {
    expectTypeOf<Exclude<CommonIssueCode, (typeof COMMON_ISSUE_CODES)[number]>>().toEqualTypeOf<never>()
  })

  it('中英两份都给每个问题码写了自己的说明', () => {
    const zh = (reportZhCN.translations as Record<string, Partial<ReportDesignerTranslations>>)['xh-report-designer']!.issue!
    for (const code of [...COMMON_ISSUE_CODES, ...REPORT_ISSUE_CODES, ...PARAMETER_ISSUE_CODES]) {
      expect(zh({ code }), code).not.toBe(`问题：${code}`)
      expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issue({ code }), code).not.toBe(`Problem: ${code}`)
    }
  })

  it('说明带上问题参数', () => {
    const zh = (reportZhCN.translations as Record<string, Partial<ReportDesignerTranslations>>)['xh-report-designer']!.issue!
    expect(zh({ code: 'formula-cycle', params: { names: 'a,b,a' } })).toBe('公式互相引用成环：a → b → a')
    expect(zh({ code: 'operator-type-mismatch', params: { operator: 'contains', type: 'number' } })).toBe('「包含」不适用于数值字段')
    expect(zh({ code: 'out-of-range', params: { min: 1, max: 24 } })).toBe('超出取值范围，应不小于 1且不大于 24')
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issue({ code: 'operand-shape', params: { operator: 'between' } })).toBe('"between" needs two values')
  })
})

describe('@xihan-report/runtime/design', () => {
  it('导出画布复用的计算与渲染', () => {
    expect(Object.keys(design).sort()).toEqual(['createRenderContext', 'dashboardScene', 'defineViewerElements', 'renderCard', 'renderDashboardFrame', 'renderOverlays', 'renderParameterControl', 'renderView', 'tableLabel'])
  })
})
