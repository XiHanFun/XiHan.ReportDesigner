// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fitChartToCard, fitMetricToCard } from '../src/viewer/dashboard'

// jsdom 不排版：正文、图表根与视口的尺寸用桩给出，ResizeObserver 换成手动触发的一份
let observed: Element[] = []
let notify: (() => void) | undefined
let disconnected = 0

class FakeResizeObserver {
  constructor(callback: () => void) {
    notify = callback
  }

  observe(target: Element): void {
    observed.push(target)
  }

  disconnect(): void {
    disconnected++
  }
}

function size(element: HTMLElement, name: 'clientHeight' | 'offsetHeight', value: () => number): void {
  Object.defineProperty(element, name, { configurable: true, get: value })
}

/** 正文 > 图表宿主 > 根（图例 + 视口）。 */
function chartCard(): { body: HTMLElement, host: HTMLElement, root: HTMLElement, viewport: HTMLElement } {
  const body = document.createElement('div')
  const host = document.createElement('xh-cartesian-chart')
  const root = document.createElement('figure')
  root.setAttribute('data-xh-chart-part', 'root')
  const legend = document.createElement('div')
  const viewport = document.createElement('div')
  viewport.setAttribute('data-xh-chart-part', 'viewport')
  root.append(legend, viewport)
  host.append(root)
  body.append(host)
  document.body.append(body)
  return { body, host, root, viewport }
}

beforeEach(() => {
  observed = []
  notify = undefined
  disconnected = 0
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
})

describe('卡片里的图表按卡片正文的高度画', () => {
  it('视口高度 = 正文高度 − 图表里视口之外的部分，写进 --xh-chart-height；正文变了重算，视口自己变了不改值', () => {
    const { body, host, root, viewport } = chartCard()
    let bodyHeight = 300
    let viewportHeight = 320
    size(body, 'clientHeight', () => bodyHeight)
    size(viewport, 'offsetHeight', () => viewportHeight)
    size(root, 'offsetHeight', () => viewportHeight + 36)
    fitChartToCard(body)
    expect(host.style.getPropertyValue('--xh-chart-height')).toBe('264px')
    expect(observed).toEqual([body, root])
    viewportHeight = 264
    notify!()
    expect(host.style.getPropertyValue('--xh-chart-height')).toBe('264px')
    bodyHeight = 200
    notify!()
    expect(host.style.getPropertyValue('--xh-chart-height')).toBe('164px')
  })

  it('同一张卡片只装一个观察器；量不出正文高度时不写；正文离开文档后停止观察', () => {
    const { body, host, root, viewport } = chartCard()
    size(body, 'clientHeight', () => 0)
    size(viewport, 'offsetHeight', () => 320)
    size(root, 'offsetHeight', () => 356)
    fitChartToCard(body)
    fitChartToCard(body)
    expect(host.style.getPropertyValue('--xh-chart-height')).toBe('')
    expect(observed).toEqual([body])
    body.remove()
    notify!()
    expect(disconnected).toBe(1)
  })
})

/**
 * 正文 > metric > xh-statistic > 根（标签、前缀、数值、后缀）。jsdom 不排版：字号写在各段的 style 上，
 * 前缀与数值的宽度按宿主上此刻写的字号从原来的宽度等比换算，根的宽度由 available 给出。
 */
function metricCard(available: () => number): { body: HTMLElement, host: HTMLElement, prefix: HTMLElement, value: HTMLElement } {
  const body = document.createElement('div')
  const content = document.createElement('div')
  content.dataset.part = 'metric'
  const host = document.createElement('xh-statistic')
  const root = document.createElement('div')
  root.setAttribute('data-xh-part', 'root')
  const piece = (name: string, size: number): HTMLElement => {
    const element = document.createElement('span')
    element.setAttribute('data-xh-part', name)
    element.style.fontSize = `${size}px`
    root.append(element)
    return element
  }
  piece('label', 14)
  const prefix = piece('prefix', 14)
  const value = piece('value', 32)
  const scaled = (slot: string, size: number, width: number): number => {
    const written = Number.parseFloat(host.style.getPropertyValue(slot))
    return Number.isNaN(written) ? width : width * written / size
  }
  box(root, available)
  box(prefix, () => scaled('--xh-statistic-affix-font-size', 14, 16))
  box(value, () => scaled('--xh-statistic-value-font-size', 32, 200))
  host.append(root)
  content.append(host)
  body.append(content)
  document.body.append(body)
  return { body, host, prefix, value }
}

function box(element: Element, width: () => number): void {
  element.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, width: width(), height: 0, right: width(), bottom: 0, toJSON: () => ({}) })
}

function written(host: HTMLElement): [string, string] {
  return [host.style.getPropertyValue('--xh-statistic-value-font-size'), host.style.getPropertyValue('--xh-statistic-affix-font-size')]
}

describe('指标卡片的数值按卡片的宽定字号', () => {
  it('前缀与数值放不下时按同一个倍数缩小两者的字号，缩完排得进一行；卡片变宽后回到原来的字号', () => {
    let available = 150
    const { body, host, prefix, value } = metricCard(() => available)
    fitMetricToCard(body)
    expect(written(host)).toEqual(['22.08px', '9.66px'])
    expect(prefix.getBoundingClientRect().width + value.getBoundingClientRect().width).toBeLessThanOrEqual(available)
    expect(observed).toHaveLength(2)
    available = 400
    notify!()
    expect(written(host)).toEqual(['', ''])
    available = 150
    notify!()
    expect(written(host)).toEqual(['22.08px', '9.66px'])
  })

  it('每次绘制先回到原来的字号再量：重绘时按原来的宽度算出同一个倍数', () => {
    const { body, host } = metricCard(() => 150)
    fitMetricToCard(body)
    fitMetricToCard(body)
    expect(written(host)).toEqual(['22.08px', '9.66px'])
    expect(observed).toHaveLength(2)
  })

  it('卡片再窄也按它的宽换算、不设下限，前缀不会折开；量不出宽度时不写；正文离开文档后停止观察', () => {
    let available = 40
    const { body, host } = metricCard(() => available)
    fitMetricToCard(body)
    expect(written(host)).toEqual(['5.76px', '2.52px'])
    available = 0
    notify!()
    expect(written(host)).toEqual(['5.76px', '2.52px'])
    body.remove()
    notify!()
    expect(disconnected).toBe(1)
  })
})
