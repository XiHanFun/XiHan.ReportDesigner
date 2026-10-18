/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 一种语言的报表文案：查看器与设计器各一份，都是全量的；与 designer-shell 同一语言的那份合成一个语言包。

import type { XhConfig } from '@xihan-ui/web-components'
import type { ReportDesignerLocale } from '../designer-translations'
import type { ReportViewerTranslations } from '../translations'
import { mergeXhConfig } from '@xihan-ui/web-components'
import { reportDesignerTranslations } from '../designer-translations'

/** 报表一种语言的全部文案。 */
export interface ReportLocale {
  readonly viewer: ReportViewerTranslations
  readonly designer: ReportDesignerLocale
}

/** 把报表文案与 designer-shell 同一语言的那份合成一个语言包。 */
export function reportLocale(shell: XhConfig, locale: ReportLocale): XhConfig {
  return mergeXhConfig(shell, {
    translations: {
      'xh-report-viewer': locale.viewer,
      'xh-report-designer': reportDesignerTranslations(locale.designer),
    },
  })
}
