/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { CommonIssueCode } from '@xihan-ui/designer-kit/schema'
import type { ReportDesignerTranslations } from '../src'
import * as core from '@xihan-report/core'
import * as uiLocales from '@xihan-ui/web-components/locale'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { DEFAULT_REPORT_DESIGNER_TRANSLATIONS, DEFAULT_REPORT_VIEWER_TRANSLATIONS } from '../src'
import * as design from '../src/design'
import * as locales from '../src/locale'

type Bucket = Record<string, unknown>

const packs = Object.entries(locales).map(([name, pack]) => [name, pack.translations as unknown as Record<string, Bucket>] as const)
const english = locales.reportEnUS.translations as unknown as Record<string, Bucket>

function designerOf(translations: Record<string, Bucket>): ReportDesignerTranslations {
  return translations['xh-report-designer'] as unknown as ReportDesignerTranslations
}

describe('reportZhCN', () => {
  it('一份语言包含查看器、设计器与 designer-shell 零件的中文文案', () => {
    const translations = locales.reportZhCN.translations as Record<string, Record<string, unknown> | undefined>
    expect(translations['xh-report-viewer']?.total).toBe('总计')
    const designer = translations['xh-report-designer'] as Partial<ReportDesignerTranslations>
    expect(designer.label).toBe('报表设计器')
    expect(designer.issues).toBe('问题')
    expect(designer.propertyLabels?.['xAxis.title']).toBe('横轴标题')
    expect(designer.issue?.({ code: 'unknown-field', params: { field: 'qty' } })).toBe('找不到字段「qty」')
    expect(translations['xh-designer-properties']?.title).toBe('属性')
    expect(translations['xh-designer-issues']?.title).toBe('问题')
  })

  it('英文缺省的问题文案按码给出，认不出的码原样带上', () => {
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issue({ code: 'unknown-measure', params: { key: 'amount' } })).toBe('Unknown measure "amount"')
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issue({ code: 'something-new' })).toBe('Problem: something-new')
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.selected(3)).toBe('3 selected')
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issues).toBe('Problems')
  })
})

describe('各语言的语言包', () => {
  it('语言与 UI 的内建语言包一一对应，导出名是 report 加 UI 的语言包名', () => {
    const expected = Object.keys(uiLocales).map(name => `report${name[0]!.toUpperCase()}${name.slice(1)}`).sort()
    expect(packs.map(([name]) => name).sort()).toEqual(expected)
  })

  it('英文包与缺省文案相同', () => {
    expect(english['xh-report-viewer']).toEqual(DEFAULT_REPORT_VIEWER_TRANSLATIONS)
    const designer = designerOf(english)
    for (const [key, value] of Object.entries(DEFAULT_REPORT_DESIGNER_TRANSLATIONS)) {
      if (typeof value !== 'function')
        expect((designer as unknown as Bucket)[key], key).toEqual(value)
    }
  })

  it.each(packs)('%s 的零件、键与对照表和英文一致，文案都不空', (_name, translations) => {
    expect(Object.keys(translations).sort()).toEqual(Object.keys(english).sort())
    for (const [tag, bucket] of Object.entries(translations)) {
      const reference = english[tag]!
      expect(Object.keys(bucket).sort(), tag).toEqual(Object.keys(reference).sort())
      for (const [key, value] of Object.entries(bucket)) {
        expect(typeof value, `${tag}.${key}`).toBe(typeof reference[key])
        if (typeof value === 'string')
          expect(value.trim(), `${tag}.${key}`).not.toBe('')
        if (typeof value === 'object' && value !== null) {
          expect(Object.keys(value).sort(), `${tag}.${key}`).toEqual(Object.keys(reference[key] as Bucket).sort())
          for (const [entry, text] of Object.entries(value))
            expect(String(text).trim(), `${tag}.${key}.${entry}`).not.toBe('')
        }
      }
    }
  })

  it.each(packs)('%s 的带参文案把入参写进去', (_name, translations) => {
    const designer = designerOf(translations)
    expect(designer.selected(7)).toContain('7')
    expect(designer.linkLabel('Region', 3)).toContain('Region')
    expect(designer.linkLabel('Region', 3)).toContain('3')
    expect(designer.removeTitle('Orders')).toContain('Orders')
    expect(designer.removeCascade({ items: 2, conditions: 0, sorts: 1, links: 0, bindings: 0 })).toMatch(/2[\s\S]*1|1[\s\S]*2/)
    expect(designer.issue({ code: 'unknown-field', params: { field: 'qty' } })).toContain('qty')
    expect(designer.issue({ code: 'formula-cycle', params: { names: 'a,b,a' } })).toContain('a → b → a')
    expect(designer.issue({ code: 'out-of-range', params: { min: 1, max: 24 } })).toMatch(/1[\s\S]*24/)
    expect(designer.issue({ code: 'something-new' })).toContain('something-new')
  })
})

const COMMON_ISSUE_CODES = ['required', 'invalid-type', 'invalid-value', 'out-of-range', 'not-integer', 'invalid-option', 'invalid-color', 'empty', 'unknown-key', 'duplicate-key', 'duplicate-id', 'unknown-control'] as const satisfies readonly CommonIssueCode[]

describe('问题说明', () => {
  it('通用问题码列全了', () => {
    expectTypeOf<Exclude<CommonIssueCode, (typeof COMMON_ISSUE_CODES)[number]>>().toEqualTypeOf<never>()
  })

  it.each(packs)('%s 给每个内建问题码写了自己的说明', (_name, translations) => {
    const designer = designerOf(translations)
    const unknown = designer.issue({ code: '\u0000' })
    for (const code of [...COMMON_ISSUE_CODES, ...core.REPORT_ISSUE_CODES, ...core.PARAMETER_ISSUE_CODES]) {
      const text = designer.issue({ code })
      expect(text.trim(), code).not.toBe('')
      expect(text, code).not.toBe(unknown.replace('\u0000', code))
    }
  })

  it('说明带上问题参数', () => {
    const zh = designerOf(locales.reportZhCN.translations as unknown as Record<string, Bucket>).issue
    expect(zh({ code: 'formula-cycle', params: { names: 'a,b,a' } })).toBe('公式互相引用成环：a → b → a')
    expect(zh({ code: 'operator-type-mismatch', params: { operator: 'contains', type: 'number' } })).toBe('「包含」不适用于数值字段')
    expect(zh({ code: 'out-of-range', params: { min: 1, max: 24 } })).toBe('超出取值范围，应不小于 1 且不大于 24')
    expect(DEFAULT_REPORT_DESIGNER_TRANSLATIONS.issue({ code: 'operand-shape', params: { operator: 'between' } })).toBe('"between" needs two values')
  })
})

describe('属性名', () => {
  const tables: readonly (readonly [string, readonly { readonly path: readonly (string | number)[] }[]])[] = [
    ['document', core.documentProperties()],
    ['dashboard', core.dashboardProperties()],
    ['card', core.cardProperties({ kind: 'chart' })],
    ['card', core.cardProperties({ kind: 'table' })],
    ...core.CHART_TYPES.map(type => [`chart.${type}`, core.chartProperties(type)] as const),
    ['series', core.seriesProperties()],
    ['metric', core.metricProperties()],
    ...(['table', 'group', 'crosstab'] as const).map(type => [`view.${type}`, core.viewProperties(type)] as const),
    ['column', core.tableColumnProperties()],
    ['group', core.groupLevelProperties()],
    ['dimension', core.dimensionProperties()],
    ['measure', core.measureProperties()],
    ['field', core.datasetFieldProperties()],
    ['parameter', core.parameterProperties()],
    ['link', core.linkProperties()],
  ]

  it('内建的每个属性在对照表里都有名字', () => {
    const labels = DEFAULT_REPORT_DESIGNER_TRANSLATIONS.propertyLabels
    const missing = tables.flatMap(([kind, descriptors]) => descriptors
      .map(descriptor => descriptor.path.join('.'))
      .filter(key => (labels[`${kind}:${key}`] ?? labels[`${kind.split('.')[0]}:${key}`] ?? labels[key]) === undefined)
      .map(key => `${kind}:${key}`))
    expect(missing).toEqual([])
  })
})

describe('@xihan-report/runtime/design', () => {
  it('导出画布复用的计算与渲染', () => {
    expect(Object.keys(design).sort()).toEqual(['createRenderContext', 'dashboardScene', 'defineViewerElements', 'renderCard', 'renderDashboardFrame', 'renderOverlays', 'renderParameterControl', 'renderView', 'tableLabel'])
  })
})
