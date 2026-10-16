/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 工具栏与右键菜单共用的命令：名字、文案键，以及工具栏的分组与两种右键菜单的条目。

import type { ReportDesignerTranslations } from '@xihan-report/runtime'

/** 设计器命令。 */
export type ReportCommand = 'undo' | 'redo' | 'cut' | 'copy' | 'paste' | 'duplicate' | 'delete' | 'select-all' | 'design' | 'preview'

/** 命令的文案键。 */
export const COMMAND_LABELS: Readonly<Record<ReportCommand, keyof ReportDesignerTranslations>> = {
  'undo': 'undo',
  'redo': 'redo',
  'cut': 'cut',
  'copy': 'copy',
  'paste': 'paste',
  'duplicate': 'duplicate',
  'delete': 'delete',
  'select-all': 'selectAll',
  'design': 'design',
  'preview': 'preview',
}

/** 工具栏的分组：撤销重做、剪贴板与删除、设计与预览。 */
export const TOOLBAR_GROUPS: readonly (readonly ReportCommand[])[] = [
  ['undo', 'redo'],
  ['cut', 'copy', 'paste', 'duplicate', 'delete'],
  ['design', 'preview'],
]

/** 右键菜单的条目：在卡片上与在空白处；'|' 是分隔线。 */
export const MENU_ENTRIES: Readonly<Record<'card' | 'blank', readonly (ReportCommand | '|')[]>> = {
  card: ['cut', 'copy', 'paste', 'duplicate', '|', 'delete'],
  blank: ['paste', '|', 'select-all'],
}

export function isReportCommand(value: string): value is ReportCommand {
  return Object.hasOwn(COMMAND_LABELS, value)
}
