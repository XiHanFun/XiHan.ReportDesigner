# @xihan-report/core

曦寒报表设计器的模型层：报表定义的类型（数据集与字段、计算字段、报表参数，主体是明细表、分组报表、交叉表或看板与卡片）、校验与问题码、按参数与联动选中算出取数请求、按取回的数据计算视图与卡片、编辑操作，以及扩展的合并。纯 TypeScript，不依赖 DOM，浏览器与 Node 里都能用。

**谁会装它**：在代码里写报表定义、校验报表，或在服务端按报表定义计算结果时直接引；只在页面上显示或设计报表时，装 `@xihan-report/runtime` 或 `@xihan-report/designer` 就会带上它。

## 用法

```ts
import type { ReportDocument, TableView } from '@xihan-report/core'
import { computeView, validateDocument } from '@xihan-report/core'

const dataset = { id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] } as const
const body: TableView = {
  type: 'table',
  dataset: 'sales',
  columns: [
    { id: 'region', field: 'region' },
    { id: 'amount', field: 'amount', summary: { aggregate: 'sum' } },
  ],
}
const schema: ReportDocument = { schemaVersion: 1, id: 'sales', datasets: [dataset], body }
const issues = validateDocument(schema)
const view = computeView(body, dataset, { kind: 'rows', rows: [{ region: '华东', amount: 10 }, { region: '华北', amount: 5 }] })
```

## 装

```bash
pnpm add @xihan-report/core
```

计算字段与公式度量要一个表达式引擎，用 `@xihan-ui/expression` 的 `createExpressionEngine()`，经计算与校验选项的 `expressionEngine` 交进来。

完整文档见 [https://report.docs.xihanfun.com](https://report.docs.xihanfun.com)。

许可：MIT
