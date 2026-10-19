// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

function normalize(selector: string): string {
  return selector.replace(/["']/g, '').replace(/\s+/g, ' ').trim()
}

function rule(selector: string): CSSStyleDeclaration {
  for (const sheet of document.styleSheets) {
    for (const item of sheet.cssRules) {
      if (item instanceof CSSStyleRule && normalize(item.selectorText) === normalize(selector))
        return item.style
    }
  }
  throw new Error(`style.css 里没有 ${selector}`)
}

beforeAll(() => {
  const style = document.createElement('style')
  style.textContent = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../style.css'), 'utf8')
  document.head.append(style)
})

describe('style.css：查看器不按内容撑宽宿主', () => {
  it('查看器作为 flex / grid 子项时可以收窄', () => {
    expect(rule('xh-report-viewer').getPropertyValue('min-inline-size')).toBe('0')
  })

  it('主体的宽度只取容器给的宽度，比容器宽的内容在表格自己的滚动区里滚动', () => {
    expect(rule('xh-report-viewer > [data-part=\'body\']').getPropertyValue('contain')).toBe('inline-size')
    // 虚拟滚动的表格同样由表格根滚动（虚拟列表写 scroll-container=ancestor），不另改根与视口的尺寸与滚动
    expect(() => rule(':is(xh-report-viewer, xh-report-designer) xh-table [data-xh-part=\'root\'][data-virtual]')).toThrow()
    expect(() => rule(':is(xh-report-viewer, xh-report-designer) xh-table [data-virtual] xh-virtualizer [data-xh-part=\'viewport\']')).toThrow()
  })

  it('虚拟表体的行间线由 UI 的表格皮肤画，查看器不另写', () => {
    expect(() => rule(':is(xh-report-viewer, xh-report-designer) xh-table [data-virtual] xh-virtualizer [data-xh-part=\'row\']')).toThrow()
  })

  it('查看器自己的层只选直接子元素，不波及 UI 元素同名的部件', () => {
    for (const part of ['header', 'status'])
      expect(() => rule(`xh-report-viewer > [data-part='${part}']`)).not.toThrow()
  })
})
