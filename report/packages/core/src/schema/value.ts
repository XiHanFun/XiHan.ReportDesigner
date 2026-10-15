/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 定义报表里的基础值类型：JSON 标量、数据行、参数值与字段类型。

/** JSON 标量：模板里能写下的单个值。 */
export type ScalarValue = string | number | boolean | null

/** 模板里能写下的任意 JSON 值。 */
export type JsonValue = ScalarValue | readonly JsonValue[] | { readonly [key: string]: JsonValue }

/** 一行数据：字段名到值。core 只读不写。 */
export type DataRow = Readonly<Record<string, unknown>>

/** 参数的取值：单值，或多选参数的值数组。 */
export type ParameterValue = ScalarValue | readonly ScalarValue[]

/** 一组参数取值：参数名到值。 */
export type ParameterValues = Readonly<Record<string, ParameterValue>>

/**
 * 字段类型。date 是日期（YYYY-MM-DD），datetime 是日期时间；
 * 两者的值可以是 ISO 8601 字符串、毫秒时间戳或 Date。
 */
export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'datetime'

/** 全部字段类型，按声明次序。 */
export const FIELD_TYPES: readonly FieldType[] = ['string', 'number', 'boolean', 'date', 'datetime']
