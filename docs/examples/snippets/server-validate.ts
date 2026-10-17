/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 保存报表定义前在服务端（Node）校验：有问题就拒收，问题原样交回给前端显示。

// #region example
import type { ReportDocument, ValidationIssue } from '@xihan-report/core'
import { validateDocument } from '@xihan-report/core'
import { createExpressionEngine } from '@xihan-ui/expression'

const expressionEngine = createExpressionEngine()

export function acceptReport(schema: ReportDocument): { readonly ok: boolean, readonly issues: readonly ValidationIssue[] } {
  const issues = validateDocument(schema, { expressionEngine })
  return { ok: issues.length === 0, issues }
}
// #endregion example
