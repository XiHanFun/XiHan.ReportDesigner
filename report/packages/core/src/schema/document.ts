/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义报表文档：参数、数据集与主体。

import type { DatasetSchema } from './dataset'
import type { FieldType, ParameterValue, ScalarValue } from './value'
import type { ReportBody } from './view'

/** 当前的 schema 版本。 */
export const REPORT_SCHEMA_VERSION = 1

/** 参数的一个候选项。 */
export interface ParameterOption {
  readonly value: ScalarValue
  readonly label?: string
}

/** 报表参数：报表使用者填写，经绑定传给数据集参数或筛选条件。 */
export interface ReportParameter {
  /** 参数名，在报表内唯一。 */
  readonly name: string
  readonly type: FieldType
  readonly title?: string
  /** 必须给值。 */
  readonly required?: boolean
  /** 接受多个值。 */
  readonly multiple?: boolean
  /** 缺省值。 */
  readonly defaultValue?: ParameterValue
  /** 固定的候选项。 */
  readonly options?: readonly ParameterOption[]
}

/** 报表文档：纯 JSON。 */
export interface ReportDocument {
  readonly schemaVersion: typeof REPORT_SCHEMA_VERSION
  /** 报表身份。 */
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly parameters?: readonly ReportParameter[]
  readonly datasets: readonly DatasetSchema[]
  readonly body: ReportBody
}
