/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 设计器的设置：宿主管着主题，用户偏好存在宿主自己那里；独立使用时交给本机存储；从工具栏外的按钮打开设置。
// 键都用常量，不手写字符串。

import type { XhReportDesigner } from '@xihan-report/designer'
import { DESIGNER_SETTING_KEYS } from '@xihan-ui/designer-shell'

type ReportSettings = NonNullable<XhReportDesigner['settings']>

// #region host
export function wireSettings(designer: XhReportDesigner, saved: ReportSettings, store: (settings: ReportSettings) => void): void {
  // 宿主自己的缺省压在下面，用户存过的值盖在上面
  designer.settings = { [DESIGNER_SETTING_KEYS.toolbarDisplay]: 'both', ...saved }
  designer.settingsPolicy = { [DESIGNER_SETTING_KEYS.theme]: 'hidden', [DESIGNER_SETTING_KEYS.brand]: 'hidden' }
  designer.addEventListener('settings-change', (event) => {
    store((event as CustomEvent<{ settings: ReportSettings }>).detail.settings)
  })
}
// #endregion host

// #region storage
export function standalone(designer: XhReportDesigner): void {
  designer.settingsStorageKey = 'report-designer:settings'
  designer.addEventListener('settings-storage-error', (event) => {
    console.warn('设置没能读写本机存储，这次改的只在内存里', (event as CustomEvent<{ error: unknown }>).detail.error)
  })
}
// #endregion storage

// #region open
export function openSettings(designer: XhReportDesigner): void {
  designer.openSettings()
}
// #endregion open
