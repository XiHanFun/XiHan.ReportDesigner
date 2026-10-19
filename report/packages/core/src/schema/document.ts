/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义报表文档：参数、数据集与主体。

import type { DatasetSchema } from './dataset'
import type { ReportExtensible } from './extension'
import type { FieldType, ParameterValue, ScalarValue } from './value'
import type { ReportBody } from './view'

/** 当前的 schema 版本。 */
export const REPORT_SCHEMA_VERSION = 1

/** 参数的一个候选项。 */
export interface ParameterOption {
  /** 取值，类型与参数一致：date 写 YYYY-MM-DD，datetime 写不带时区的 YYYY-MM-DDTHH:mm[:ss]。 */
  readonly value: ScalarValue
  /** 显示的文字；不写按取值显示。 */
  readonly label?: string
  /** 在参数栏里列出但不能选；宿主或缺省值给了这个取值照样认。 */
  readonly disabled?: boolean
}

/** 报表参数：报表使用者填写，经绑定传给数据集参数或筛选条件。 */
export interface ReportParameter extends ReportExtensible {
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
export interface ReportDocument extends ReportExtensible {
  /** 报表定义的版本，写 REPORT_SCHEMA_VERSION。 */
  readonly schemaVersion: typeof REPORT_SCHEMA_VERSION
  /** 报表身份。 */
  readonly id: string
  readonly title?: string
  readonly description?: string
  readonly parameters?: readonly ReportParameter[]
  /** 报表用到的数据集：只描述字段与参数，数据由取数回调交回。 */
  readonly datasets: readonly DatasetSchema[]
  /** 报表的主体：明细表、分组报表、交叉表、看板，或扩展登记的视图。 */
  readonly body: ReportBody
}
