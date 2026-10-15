/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 表达式引擎的接口：四款设计器统一使用 @xihan-ui/expression 定义的形状，实现由使用方注入。

export type {
  CompiledExpression,
  EngineCompileOptions,
  EngineCompileResult,
  EngineEvaluation,
  ExpressionEngine,
  ExpressionIssue,
} from '@xihan-ui/expression'
