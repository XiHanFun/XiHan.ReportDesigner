// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { ReportDocument } from '@xihan-report/core'
import type { ReportDesignerContext, ReportDesignerExtension, XhReportDesigner } from '../src'
import { DesignerExtensionError } from '@xihan-ui/designer-kit'
import { DESIGNER_SETTING_KEYS } from '@xihan-ui/designer-shell'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineReportDesigner, REPORT_TOOLBAR_LAYOUT } from '../src'

const board: ReportDocument = {
  schemaVersion: 1,
  id: 'board',
  title: '看板',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] }],
  body: { type: 'dashboard', grid: { columns: 12, rowHeight: 40 }, cards: [] },
}

const acme = { id: 'acme', label: 'Acme', order: 200, items: [{ path: ['token'], label: 'Token', control: { kind: 'text' as const, secret: true } }] }

// jsdom 不排版：设置对话框里的字段要读的计算样式给出浏览器里的缺省值
const STYLE_FALLBACK: Readonly<Record<string, string>> = {
  'writing-mode': 'horizontal-tb',
  'box-sizing': 'border-box',
  'max-block-size': 'none',
  'padding-top': '0px',
  'padding-bottom': '0px',
  'border-top-width': '0px',
  'border-bottom-width': '0px',
  'font-size': '14px',
  'line-height': '20px',
}

beforeAll(() => {
  defineReportDesigner()
  Element.prototype.scrollIntoView ??= function () {}
})

beforeEach(() => {
  const real = window.getComputedStyle.bind(window)
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudo) => new Proxy(real(element, pseudo), {
    get(target, key) {
      if (key === 'getPropertyValue')
        return (name: string) => target.getPropertyValue(name) || STYLE_FALLBACK[name] || ''
      const value = Reflect.get(target, key) as unknown
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  }))
})

afterEach(() => {
  document.body.replaceChildren()
  localStorage.clear()
  vi.restoreAllMocks()
})

async function mount(setup?: (element: XhReportDesigner) => void): Promise<XhReportDesigner> {
  const designer = document.createElement('xh-report-designer')
  designer.schema = board
  setup?.(designer)
  document.body.append(designer)
  await designer.updateComplete
  return designer
}

async function settle(designer: XhReportDesigner): Promise<void> {
  for (let round = 0; round < 3; round++) {
    await designer.updateComplete
    await designer.querySelector<HTMLElement & { updateComplete: Promise<unknown> }>('xh-designer-settings')!.updateComplete
    await Promise.resolve()
  }
}

function row(key: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-setting="${key}"]`)
}

function pages(): string[] {
  return Array.from(document.querySelectorAll('xh-tabs[orientation="vertical"] [data-xh-part="list"] > button'), button => button.getAttribute('value')!)
}

describe('设置', () => {
  it('openSettings 打开设置对话框：报表没有自己那一页；基础、布局、工具栏三页，基础列出主题与状态栏，工具栏页列出按钮显示方式、显示工具栏与按钮表', async () => {
    const designer = await mount()
    expect(designer.querySelector('xh-designer-settings')!.parentElement).toBe(designer)
    designer.openSettings()
    await settle(designer)
    expect(pages()).toEqual(['general', 'layout', 'toolbar'])
    expect([DESIGNER_SETTING_KEYS.theme, DESIGNER_SETTING_KEYS.statusBar, 'general.toolbarDisplay'].map(key => row(key) !== null)).toEqual([true, true, false])
    designer.openSettings('toolbar')
    await settle(designer)
    expect([DESIGNER_SETTING_KEYS.toolbarDisplay, DESIGNER_SETTING_KEYS.toolbarVisible, DESIGNER_SETTING_KEYS.toolbarLayout].map(key => row(key) !== null)).toEqual([true, true, true])
  })

  it('扩展登记的设置分区放进对话框；分区 id 与 general 或彼此重名时赋值即抛错，extensions 不变', async () => {
    const designer = await mount(element => (element.extensions = [{ id: 'acme', settings: [acme] }]))
    designer.openSettings('acme')
    await settle(designer)
    expect(pages()).toEqual(['general', 'layout', 'toolbar', 'acme'])
    expect(row('acme.token')!.querySelector('xh-password-input')).not.toBeNull()
    const before = designer.extensions
    expect(() => (designer.extensions = [{ id: 'acme', settings: [{ ...acme, id: 'general' }] }])).toThrow(DesignerExtensionError)
    expect(() => (designer.extensions = [{ id: 'acme', settings: [acme] }, { id: 'beta', settings: [acme] }])).toThrow(DesignerExtensionError)
    expect(designer.extensions).toBe(before)
  })

  it('settingsPolicy 隐藏条目或整个分区，锁定的只读', async () => {
    const designer = await mount((element) => {
      element.extensions = [{ id: 'acme', settings: [acme] }]
      element.settingsPolicy = { 'general': 'hidden', 'acme.token': 'locked' }
    })
    designer.openSettings()
    await settle(designer)
    expect(pages()).toEqual(['layout', 'toolbar', 'acme'])
    expect(row('acme.token')!.querySelector('xh-field')!.hasAttribute('read-only')).toBe(true)
  })

  it('在对话框里改一条：settings 换成新的一份、派发 settings-change；命令与扩展从上下文的 settings 读到写了的值与扩展分区的缺省值', async () => {
    const seen: ReportDesignerContext['settings'][] = []
    const probe: ReportDesignerExtension = {
      id: 'probe',
      settings: [{ id: 'probe', label: 'Probe', items: [{ path: ['level'], label: 'Level', control: { kind: 'number' }, default: 3 }] }],
      commands: [{ id: 'probe.read', label: 'Read', placement: ['toolbar'], run: context => void seen.push(context.settings) }],
    }
    const designer = await mount(element => (element.extensions = [probe]))
    designer.openSettings()
    await settle(designer)
    const changes: unknown[] = []
    designer.addEventListener('settings-change', event => changes.push((event as CustomEvent).detail))
    row(DESIGNER_SETTING_KEYS.statusBar)!.querySelector('xh-switch')!.dispatchEvent(new CustomEvent('checked-change', { detail: { checked: false }, bubbles: true }))
    await settle(designer)
    expect(changes).toEqual([{ key: DESIGNER_SETTING_KEYS.statusBar, value: false, settings: { [DESIGNER_SETTING_KEYS.statusBar]: false } }])
    expect(designer.settings).toEqual({ [DESIGNER_SETTING_KEYS.statusBar]: false })
    designer.querySelector<HTMLButtonElement>('[data-region="toolbar"] button[value="probe.read"]')!.click()
    expect(seen[0]).toEqual({ [DESIGNER_SETTING_KEYS.statusBar]: false, 'probe.level': 3 })
  })

  it('布局页的面板表列出报表的卡片，关掉一块的显示开关：外框隐藏它，整份布局写进设置的 layout.panels 并派发 settings-change', async () => {
    const designer = await mount()
    designer.openSettings('layout')
    await settle(designer)
    const rows = Array.from(document.querySelectorAll('[data-part="panel-row"][data-panel]'), node => node.getAttribute('data-panel'))
    expect([...rows].sort()).toEqual(['datasets', 'history', 'issues', 'outline', 'palette', 'parameters', 'properties', 'wells'])
    const changes: { key: string, value: { hidden: string[] } }[] = []
    designer.addEventListener('settings-change', event => changes.push((event as CustomEvent).detail))
    document.querySelector('[data-part="panel-row"][data-panel="wells"] [data-part="panel-visible"]')!.dispatchEvent(new CustomEvent('checked-change', { detail: { checked: false }, bubbles: true }))
    await settle(designer)
    expect(changes.map(change => [change.key, change.value.hidden])).toEqual([[DESIGNER_SETTING_KEYS.layout, ['history', 'wells']]])
    expect(designer.querySelector('xh-designer-frame')!.showsPanel('wells')).toBe(false)
  })

  it('主题与主题色落在设计器元素上：亮暗写 data-theme，预设主题色写 data-brand，跟随页面时去掉', async () => {
    const designer = await mount((element) => {
      element.brands = [{ value: 'green', color: '#16a34a' }]
      element.settings = { [DESIGNER_SETTING_KEYS.theme]: 'dark' }
    })
    expect(designer.getAttribute('data-theme')).toBe('dark')
    designer.settings = { [DESIGNER_SETTING_KEYS.brand]: 'green' }
    await designer.updateComplete
    expect([designer.getAttribute('data-theme'), designer.getAttribute('data-brand')]).toEqual(['light', 'green'])
    designer.settings = {}
    await designer.updateComplete
    expect([designer.hasAttribute('data-theme'), designer.hasAttribute('data-brand')]).toEqual([false, false])
  })

  it('工具栏的按钮显示方式取设置里的 toolbar.display，缺省只显示图标；换显示方式不重铺按钮', async () => {
    const designer = await mount()
    const shell = (): Element => designer.querySelector('[data-region="toolbar"] xh-tooltip[data-scope="designer-commands"]')!
    const undo = designer.querySelector('[data-region="toolbar"] button[value="undo"]')
    expect(shell().getAttribute('data-display')).toBe('icon')
    designer.settings = { [DESIGNER_SETTING_KEYS.toolbarDisplay]: 'both' }
    await designer.updateComplete
    expect(shell().getAttribute('data-display')).toBe('both')
    designer.settings = { [DESIGNER_SETTING_KEYS.toolbarDisplay]: 'text' }
    await designer.updateComplete
    expect(shell().getAttribute('data-display')).toBe('text')
    expect(designer.querySelector('[data-region="toolbar"] button[value="undo"]')).toBe(undo)
  })

  it('工具栏按设置「工具栏」页的定制排：换了先后、藏起的不在工具栏上；对话框拿到缺省排列与各命令的文字；toolbar.visible 为 false 时不登记工具栏', async () => {
    const designer = await mount()
    const values = (): string[] => Array.from(designer.querySelectorAll<HTMLButtonElement>('[data-region="toolbar"] button[value]'), button => button.value)
    const dialog = designer.querySelector<HTMLElement & { toolbar?: { defaults: string[][], commands: { id: string, label: string }[] } }>('xh-designer-settings')!
    expect(dialog.toolbar!.defaults).toEqual(REPORT_TOOLBAR_LAYOUT.map(group => [...group]))
    expect(dialog.toolbar!.commands[0]).toMatchObject({ id: 'undo', label: 'Undo' })
    expect(values().slice(0, 3)).toEqual(['undo', 'redo', 'cut'])
    const [first, second, ...rest] = REPORT_TOOLBAR_LAYOUT
    designer.settings = { [DESIGNER_SETTING_KEYS.toolbarLayout]: { groups: [[...second!], [first![1]!, first![0]!], ...rest.map(group => [...group])], hidden: ['delete'] } }
    await settle(designer)
    expect(values().slice(0, 4)).toEqual(['cut', 'copy', 'paste', 'duplicate'])
    expect(values().slice(4, 6)).toEqual(['redo', 'undo'])
    expect(values()).not.toContain('delete')
    const frame = designer.querySelector<HTMLElement & { showsPanel: (name: string) => boolean, updateComplete: Promise<unknown> }>('xh-designer-frame')!
    expect(frame.showsPanel('toolbar')).toBe(true)
    designer.settings = { [DESIGNER_SETTING_KEYS.toolbarVisible]: false }
    await settle(designer)
    await frame.updateComplete
    expect(frame.showsPanel('toolbar')).toBe(false)
  })

  it('给了 settingsStorageKey：没赋 settings 时从存储读，对话框里改了就写回；读出的不是对象时派发 settings-storage-error', async () => {
    localStorage.setItem('report-settings', JSON.stringify({ [DESIGNER_SETTING_KEYS.theme]: 'dark' }))
    const designer = await mount(element => (element.settingsStorageKey = 'report-settings'))
    expect(designer.settings).toEqual({ [DESIGNER_SETTING_KEYS.theme]: 'dark' })
    designer.openSettings()
    await settle(designer)
    row(DESIGNER_SETTING_KEYS.statusBar)!.querySelector('xh-switch')!.dispatchEvent(new CustomEvent('checked-change', { detail: { checked: false }, bubbles: true }))
    expect(JSON.parse(localStorage.getItem('report-settings')!)).toEqual({ [DESIGNER_SETTING_KEYS.theme]: 'dark', [DESIGNER_SETTING_KEYS.statusBar]: false })

    localStorage.setItem('broken', '[1]')
    const errors: unknown[] = []
    await mount((element) => {
      element.addEventListener('settings-storage-error', event => errors.push((event as CustomEvent).detail))
      element.settingsStorageKey = 'broken'
    })
    expect(errors).toEqual([expect.objectContaining({ operation: 'read', key: 'broken' })])
  })
})
