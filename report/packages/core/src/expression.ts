/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 表达式引擎的接口：与四款设计器共用的形状一致，由使用方注入实现；这里只有类型。

/** 表达式的问题：问题码、源码里的 UTF-16 区间与参数，不带文案。 */
export interface ExpressionIssue {
  readonly code: string
  readonly start: number
  readonly end: number
  readonly data?: unknown
}

/** 一次求值的结果。 */
export type EngineEvaluation
  = | { readonly ok: true, readonly value: unknown }
    | { readonly ok: false, readonly issue: ExpressionIssue }

/** 编译成功的表达式。 */
export interface CompiledExpression {
  readonly ok: true
  /** 引用的顶层变量名：去重后按源码中出现的次序，不含函数名。 */
  readonly references: readonly string[]
  /** 以 scope 里的变量求值，返回普通 JS 值，不抛出。 */
  readonly evaluate: (scope: Readonly<Record<string, unknown>>) => EngineEvaluation
}

/** 编译结果：成功时可求值，失败时带全部问题。 */
export type EngineCompileResult
  = | CompiledExpression
    | { readonly ok: false, readonly issues: readonly ExpressionIssue[] }

/** 编译选项。 */
export interface EngineCompileOptions {
  /** 允许引用的变量名；不写时不检查。 */
  readonly identifiers?: Iterable<string> | ((name: string) => boolean)
}

/** 表达式引擎：编译不抛出，问题都在结果里。 */
export interface ExpressionEngine {
  readonly compile: (source: string, options?: EngineCompileOptions) => EngineCompileResult
}
