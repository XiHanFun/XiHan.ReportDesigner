/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ReportDesignerTranslations } from '../src'
import { describe, expect, it } from 'vitest'
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

describe('@xihan-report/runtime/design', () => {
  it('导出画布复用的计算与渲染', () => {
    expect(Object.keys(design).sort()).toEqual(['cardDataset', 'computeCard', 'computeView', 'createRenderContext', 'defineViewerElements', 'renderCard', 'renderDashboardFrame', 'renderParameterControl', 'renderView'])
  })
})
