/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 参数栏：按报表参数的类型排成 UI 表单元素，改动后把新的参数取值交给查看器。

import type { ParameterValue, ParameterValues, ReportParameter, ScalarValue } from '@xihan-report/core'
import type { RenderContext } from './context'
import { uiPart } from './dom'

/** 参数栏的回调。 */
export interface ParameterBarHandlers {
  /** 某个参数改了值；value 为 undefined 表示清空。 */
  readonly change: (name: string, value: ParameterValue | undefined) => void
}

function label(parameter: ReportParameter): string {
  return parameter.title ?? parameter.name
}

function scalars(value: ParameterValue | undefined): readonly ScalarValue[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value as ScalarValue]
}

function optionText(option: { readonly value: ScalarValue, readonly label?: string }, parameter: ReportParameter, ctx: RenderContext): string {
  return option.label ?? ctx.member(option.value, undefined, parameter.type)
}

/** 有候选项：xh-select，多选参数开 multiple；候选项按下标作选项值。 */
function selectControl(parameter: ReportParameter, value: ParameterValue | undefined, ctx: RenderContext, handlers: ParameterBarHandlers): HTMLElement {
  const options = parameter.options!
  const element = document.createElement('xh-select')
  if (parameter.multiple)
    element.setAttribute('multiple', '')
  const root = uiPart('div', 'root')
  root.append(uiPart('span', 'label', {}, label(parameter)))
  const control = uiPart('div', 'control')
  const trigger = uiPart('button', 'trigger')
  trigger.append(uiPart('span', 'value-text'), uiPart('span', 'indicator'))
  control.append(trigger)
  const positioner = uiPart('div', 'positioner')
  const content = uiPart('div', 'content')
  const list = uiPart('div', 'list')
  list.append(...options.map((option, index) => {
    const item = uiPart('div', 'item', option.disabled === true ? { 'value': `o${index}`, 'aria-disabled': 'true' } : { value: `o${index}` })
    item.append(uiPart('span', 'item-text', {}, optionText(option, parameter, ctx)), uiPart('span', 'item-indicator'))
    return item
  }))
  content.append(list)
  positioner.append(content)
  root.append(control, positioner)
  element.append(root)
  const selected = scalars(value).map(item => options.findIndex(option => option.value === item)).filter(index => index >= 0).map(index => `o${index}`)
  Object.assign(element, { defaultValue: selected })
  element.addEventListener('value-change', (event) => {
    const picked = ((event as CustomEvent<{ value: readonly string[] }>).detail.value).map(id => options[Number(id.slice(1))]!.value)
    handlers.change(parameter.name, parameter.multiple ? (picked.length > 0 ? picked : undefined) : picked[0])
  })
  return element
}

/** 布尔：xh-switch，标签写在根按钮的可及名上。 */
function switchControl(parameter: ReportParameter, value: ParameterValue | undefined, handlers: ParameterBarHandlers): HTMLElement {
  const wrapper = document.createElement('label')
  wrapper.dataset.part = 'parameter-switch'
  const element = document.createElement('xh-switch')
  if (value === true)
    element.setAttribute('default-checked', '')
  const root = uiPart('button', 'root', { 'aria-label': label(parameter) })
  root.append(uiPart('span', 'thumb'))
  element.append(root)
  element.addEventListener('checked-change', event => handlers.change(parameter.name, (event as CustomEvent<{ checked: boolean }>).detail.checked))
  const text = document.createElement('span')
  text.textContent = label(parameter)
  wrapper.append(element, text)
  return wrapper
}

/** 日期与日期时间：xh-date-field，精度到日或到秒。 */
function dateControl(parameter: ReportParameter, value: ParameterValue | undefined, handlers: ParameterBarHandlers): HTMLElement {
  const element = document.createElement('xh-date-field')
  const datetime = parameter.type === 'datetime'
  element.setAttribute('granularity', datetime ? 'second' : 'day')
  if (typeof value === 'string')
    element.setAttribute('default-value', value)
  const root = uiPart('div', 'root')
  root.append(uiPart('label', 'label', {}, label(parameter)))
  const control = uiPart('div', 'control')
  const group = uiPart('div', 'segment-group')
  const count = datetime ? 6 : 3
  for (let index = 0; index < count; index++) {
    if (index > 0)
      group.append(document.createTextNode(index < 3 ? '-' : index === 3 ? ' ' : ':'))
    group.append(uiPart('span', 'segment', { index: String(index) }))
  }
  control.append(group, uiPart('button', 'clear-trigger'))
  root.append(control, uiPart('input', 'hidden-input'))
  element.append(root)
  element.addEventListener('value-change', (event) => {
    const next = (event as CustomEvent<{ value: string | null }>).detail.value
    handlers.change(parameter.name, next === null || next === '' ? undefined : next)
  })
  return element
}

/** 多值且没有候选项：xh-tags-input，标签按当前值渲染。 */
function tagsControl(parameter: ReportParameter, value: ParameterValue | undefined, handlers: ParameterBarHandlers): HTMLElement {
  const element = document.createElement('xh-tags-input')
  const root = uiPart('div', 'root')
  root.append(uiPart('label', 'label', {}, label(parameter)))
  const control = uiPart('div', 'control')
  const input = uiPart('input', 'input')
  control.append(input)
  root.append(control)
  element.append(root)
  const paint = (tags: readonly string[]): void => {
    control.replaceChildren(...tags.map((tag) => {
      const item = uiPart('div', 'item', { value: tag })
      const preview = uiPart('div', 'item-preview')
      preview.append(uiPart('span', 'item-text', {}, tag), uiPart('button', 'item-delete-trigger'))
      item.append(preview)
      return item
    }), input)
  }
  const initial = scalars(value).map(String)
  Object.assign(element, { defaultValue: initial })
  paint(initial)
  element.addEventListener('value-change', (event) => {
    const tags = (event as CustomEvent<{ value: readonly string[] }>).detail.value
    paint(tags)
    const parsed = parameter.type === 'number' ? tags.map(Number).filter(Number.isFinite) : tags
    handlers.change(parameter.name, parsed.length > 0 ? parsed : undefined)
  })
  return element
}

/** 数值：xh-number-field；文本：xh-text-field。输入框失焦或回车时才提交，不按每次击键重算。 */
function inputControl(parameter: ReportParameter, value: ParameterValue | undefined, handlers: ParameterBarHandlers): HTMLElement {
  const numeric = parameter.type === 'number'
  const element = document.createElement(numeric ? 'xh-number-field' : 'xh-text-field')
  if (value !== undefined && value !== null && !Array.isArray(value))
    element.setAttribute('default-value', String(value))
  const root = uiPart('div', 'root')
  root.append(uiPart('label', 'label', {}, label(parameter)))
  const control = uiPart('div', 'control')
  const input = uiPart('input', 'input')
  if (numeric)
    control.append(uiPart('button', 'decrement-trigger'), input, uiPart('button', 'increment-trigger'))
  else
    control.append(input)
  root.append(control)
  element.append(root)
  input.addEventListener('change', () => {
    const text = input.value.trim()
    if (text === '')
      return handlers.change(parameter.name, undefined)
    if (!numeric)
      return handlers.change(parameter.name, text)
    const number = Number(text.replace(/[^\d.+\-e]/gi, ''))
    if (Number.isFinite(number))
      handlers.change(parameter.name, number)
  })
  return element
}

/** 一个参数的控件：有候选项用下拉，布尔用开关，日期用日期选择，多值用标签输入，其余用输入框。 */
export function renderParameterControl(parameter: ReportParameter, value: ParameterValue | undefined, ctx: RenderContext, handlers: ParameterBarHandlers): HTMLElement {
  return parameter.options && parameter.options.length > 0
    ? selectControl(parameter, value, ctx, handlers)
    : parameter.type === 'boolean'
      ? switchControl(parameter, value, handlers)
      : parameter.type === 'date' || parameter.type === 'datetime'
        ? dateControl(parameter, value, handlers)
        : parameter.multiple
          ? tagsControl(parameter, value, handlers)
          : inputControl(parameter, value, handlers)
}

/** 排出参数栏；没有参数时返回 undefined。 */
export function renderParameterBar(parameters: readonly ReportParameter[] | undefined, values: ParameterValues, ctx: RenderContext, handlers: ParameterBarHandlers): HTMLElement | undefined {
  if (!parameters || parameters.length === 0)
    return undefined
  const bar = document.createElement('div')
  bar.dataset.part = 'parameters'
  bar.setAttribute('role', 'group')
  bar.setAttribute('aria-label', ctx.translations.parameters)
  for (const parameter of parameters) {
    const value = values[parameter.name]
    const field = document.createElement('div')
    field.dataset.part = 'parameter'
    field.dataset.name = parameter.name
    field.append(renderParameterControl(parameter, value, ctx, handlers))
    bar.append(field)
  }
  return bar
}
