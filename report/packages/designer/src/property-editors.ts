/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 报表自己的属性编辑器：报表参数的取值用查看器参数栏同一套控件。

import type { ParameterValue, ReportParameter } from '@xihan-report/core'
import type { RenderContext } from '@xihan-report/runtime/design'
import type { JsonValue } from '@xihan-ui/core/json'
import type { DesignerPropertyEditor } from '@xihan-ui/designer-shell'
import { renderParameterControl } from '@xihan-report/runtime/design'
import { createAuthoredElement } from '@xihan-ui/web-components/authoring'

/**
 * 参数取值编辑器：被编辑的对象是报表参数，按它的类型、多值与候选项选控件；改动即写入并结束这次编辑。
 * 参数的定义或取值从外面变了才重建控件，只读时控件禁用。
 */
export function parameterValueEditor(ownerDocument: Document, renderContext: () => RenderContext): DesignerPropertyEditor {
  return (initial) => {
    const element = createAuthoredElement(ownerDocument, 'div', { 'data-part': 'parameter-value' })
    let context = initial
    let key = ''
    const render = (): void => {
      const parameter = context.target[0]?.value as unknown as ReportParameter | undefined
      const next = JSON.stringify([parameter?.type, parameter?.multiple, parameter?.options, context.value, context.readonly])
      if (!parameter || next === key)
        return
      key = next
      const control = renderParameterControl(parameter, context.value as ParameterValue | undefined, renderContext(), {
        change: (_name, value) => {
          key = JSON.stringify([parameter.type, parameter.multiple, parameter.options, value, context.readonly])
          context.setValue(value as JsonValue | undefined)
          context.commit()
        },
      })
      if (context.readonly) {
        for (const field of [control, ...control.querySelectorAll('*')].filter(node => node.tagName.startsWith('XH-')))
          field.setAttribute('disabled', '')
      }
      element.replaceChildren(control)
    }
    render()
    return {
      element,
      update: (next) => {
        context = next
        render()
      },
    }
  }
}
