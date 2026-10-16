/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 建节点的小工具：UI 元素的外壳写 data-xh-part，查看器自己的结构写 data-part。

/** 建一个 UI 元素外壳里的部件节点。 */
export function uiPart<K extends keyof HTMLElementTagNameMap>(tag: K, name: string, attributes: Readonly<Record<string, string>> = {}, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.dataset.xhPart = name
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, value)
  if (text !== undefined)
    element.textContent = text
  return element
}

/** 建一个查看器自己的结构节点。 */
export function ownPart<K extends keyof HTMLElementTagNameMap>(tag: K, name: string, text?: string): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.dataset.part = name
  if (text !== undefined)
    element.textContent = text
  return element
}

/** 建一个 SVG 部件节点。 */
export function svgPart(name: string): SVGSVGElement {
  const element = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  element.dataset.xhPart = name
  return element
}

/** UI 元素宿主上可写的属性：查看器按名字写 property，元素升级前写入的值由 UI 保留。 */
export type ElementProps = Readonly<Record<string, unknown>>

/** 建一个 UI 元素宿主并写入 property。 */
export function uiElement(tag: string, props: ElementProps = {}, attributes: Readonly<Record<string, string>> = {}): HTMLElement {
  const element = document.createElement(tag)
  for (const [key, value] of Object.entries(attributes))
    element.setAttribute(key, value)
  Object.assign(element, props)
  return element
}
