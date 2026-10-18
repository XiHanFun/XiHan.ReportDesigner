// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fitChartToCard } from '../src/viewer/dashboard'

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
