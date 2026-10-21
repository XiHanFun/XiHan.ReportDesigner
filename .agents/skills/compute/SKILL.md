---
name: xihan-report-compute
description: 修改或排查 XiHan.ReportDesigner 的数据集、报表参数、取数请求、计算字段、聚合、分组、透视交叉表、看板卡片与联动、导出时使用。适用于“结果算错了”“加一种聚合”“交叉表表头”“参数没生效”“取数请求不对”“汇总行模式”“导出 Excel 不对”；改界面与扩展点见 xihan-report-designer-development。
---

# XiHan.ReportDesigner 取数、计算与导出

## 计算链

查看器与设计器预览走同一条链。计算都在 `report/packages/core/src/engine`，纯 TypeScript、不碰 DOM。`docs/scripts/check-examples.mjs` 就是这条链的最小用法。

1. 参数：`resolveParameters(schema.parameters, 取值)` 按类型、必填、多选与缺省值解析，问题码在 `PARAMETER_ISSUE_CODES`。
2. 取数请求：`createDatasetRequest(视图或卡片的查询, 数据集, { parameters })` 得出 `DatasetRequest`：数据集、参数取值、已代入参数的筛选、明细的排序与行数上限，以及聚合视图要的 `query`。看板卡片先用 `cardView(card) ?? cardQuery(card)` 找到查询，联动选中由 `resolveLinkFilters` 变成筛选。
3. 取数：宿主的 `dataProvider(request, context)` 交回 `DatasetData`，组件不发网络请求。
   - 明细行 `{ kind: 'rows', rows }`，以字段名为键，筛选、计算字段、分组与聚合都由 core 做。
   - 汇总行 `{ kind: 'aggregated', rows, rollups }`，宿主按 `query` 在后端聚合并筛选好，以维度 id 与度量 id 为键。`avg`、`distinctCount` 这类不可再汇总的度量，总计与小计由 `rollups` 给出，否则得到 `NEEDS_ROLLUP`。
   - `query` 为 null（明细视图，或引用了计算字段）时只能交回明细行。
   - runtime 的取数中间件（扩展的 `dataProvider`）包在宿主回调外面。
4. 计算：`applyCalculatedFields` 用宿主注入的 `expressionEngine` 算计算字段；`runQuery` 做筛选（`compileFilter`）、分组聚合与排序（`sortRows`）；再由 `buildTable`、`buildGroupReport`、`buildCrosstab`（表头树来自 `crosstabAxes`）、`computeMetric`、`chartData` 排成结果。入口是 `computeView` 与 `computeCard`。
5. 问题：报表定义本身的问题由 `validateDocument` 给问题码；计算中的问题抛 `ReportComputeError`，只带错误码（`ComputeErrorCode`）与参数、不带文案。两者不混，也不吞成空结果。

## 改动规矩

- 明细值的聚合用 `@xihan-ui/viz` 的累加器，已聚合值的再汇总用 `createRollupAccumulator`，规则保持一致；排序用 viz 的 `sortBy`，值的格式化用 `@xihan-ui/expression` 的 `formatValue`，不另写一套。
- 加聚合、透视或卡片计算时，接受汇总行的视图与卡片，明细行与汇总行两条路都要算出同样的结果，两条路各有用例；不接受的抛 `aggregated-input-unsupported`。
- 日期按查看器的 `timeZone` 计算（`createDateTools`），用例写明时区，不依赖运行机器的本地时区。
- 计算字段与公式度量是受限表达式，只经 `expressionEngine` 求值，不执行字符串代码；没给引擎时抛 `formula-engine-missing`，不静默跳过。
- 新的校验问题码要在每种语言里各写一条说明，并在 `docs/` 跑 `pnpm gen` 更新参考页的问题码一页。
- 用例的期望值要能手算：几行固定数据，断言具体数值、表头与行列顺序，不拿实现算出的结果当期望。

## 导出

- 查看器的 `export(format, options)` 按格式找导出器，把**当前的计算结果**（同 `getResults()`）写成文件，不另取数、不重算。内置 `xlsx` 由 `exportResultsXlsx` 写成工作簿。
- `@xihan-report/runtime/xlsx` 的 `tableSheet`、`groupSheet`、`crosstabSheet` 把视图排成 `@xihan-ui/xlsx` 的工作表；单元格写法、合并与样式缺的能力去 UI 的 xlsx 补。
- 自定义导出器经 runtime 扩展的 `exporters` 登记，拿到 `ReportExportContext`：`schema`、`results`、`translations`、`timeZone` 与调用方的 `options`。
- 导出的用例断言文件内容（工作表、单元格值与合并区），不只断言返回了 Blob。

## 门禁

`report/` 跑 `pnpm lint`、`pnpm build`、`pnpm typecheck`、`pnpm test`；动了示例报表或参考页的，`docs/` 再跑 `pnpm check:examples`、`pnpm gate:gen` 与文档站其余门禁。最后跑 `git diff --check`。
