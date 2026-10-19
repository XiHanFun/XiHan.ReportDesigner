/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 导入器：把选中的 .json 文件当成一份整份的报表模板。登记以后工具栏最前面多一条「导入模板」。

import type { ReportDocument } from '@xihan-report/core'
import type { ReportDesignerEventMap, ReportDesignerExtension, ReportDesignerImporter } from '@xihan-report/designer'

const designer = document.querySelector('xh-report-designer')!

// #region example
const jsonTemplate: ReportDesignerImporter = {
  id: '@acme/templates.json',
  fileTypes: ['.json', 'application/json'],
  accepts: source => source.name?.endsWith('.json') ?? false,
  import: async source => ({ document: JSON.parse(await source.file!.text()) as ReportDocument }),
}

const templates: ReportDesignerExtension = { id: '@acme/templates', importers: [jsonTemplate] }
designer.extensions = [templates]
designer.addEventListener('import-error', (event) => {
  const { importer, error } = (event as ReportDesignerEventMap['import-error']).detail
  console.warn('导入失败', importer, error)
})
// #endregion example
