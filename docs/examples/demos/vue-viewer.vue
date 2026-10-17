<script setup lang="ts">
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 在 Vue 里使用查看器：对象经 .prop 交给元素的属性，事件用 @ 监听；参数由 Vue 的状态管着（受控）。

import type { ParameterValues } from '@xihan-report/core'
import type { ReportDataProvider, ReportViewerEventMap } from '@xihan-report/runtime'
import { defineReportViewer } from '@xihan-report/runtime'
import { createExpressionEngine } from '@xihan-ui/expression'
import { ref } from 'vue'
import { rows, schema } from '../reports/regional.ts'

defineReportViewer()

const expressionEngine = createExpressionEngine()
const dataProvider: ReportDataProvider = async () => ({ kind: 'rows', rows })
const parameters = ref<ParameterValues>({ region: '华南' })

function onParametersChange(event: Event): void {
  parameters.value = (event as ReportViewerEventMap['parameters-change']).detail.value
}
</script>

<template>
  <p>区域：{{ parameters.region ?? '全部' }}</p>
  <xh-report-viewer
    :schema.prop="schema"
    :data-provider.camel.prop="dataProvider"
    :expression-engine.camel.prop="expressionEngine"
    :parameters.prop="parameters"
    @parameters-change="onParametersChange"
  />
</template>
