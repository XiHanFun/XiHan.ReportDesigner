# @xihan-report/runtime

曦寒报表设计器的运行时，给业务页面用：`<xh-report-viewer>` 按报表定义为每个数据集算出取数请求，交给宿主的取数回调，再把取回的数据计算成明细表、分组报表、交叉表或看板并显示出来，带参数栏、卡片联动与表格下钻事件；`export('xlsx')` 把当前的计算结果写成 Excel 工作簿。以原生 Web Components 交付，任何前端项目都能用。组件不发网络请求，数据从哪里取由宿主决定。

子入口：

- `@xihan-report/runtime/locale`：界面语言包（`reportZhCN`、`reportJaJP`……），与 XiHan.UI 的内建语言一一对应，查看器与设计器共用。
- `@xihan-report/runtime/xlsx`：把明细表、分组报表与交叉表的计算结果排成工作表，自己组织工作簿时用。
- `@xihan-report/runtime/style.css`：查看器的样式，只消费 `@xihan-ui/styles` 的设计令牌。

## 用法

```ts
import { defineReportViewer } from '@xihan-report/runtime'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()

const viewer = document.createElement('xh-report-viewer')
viewer.dataProvider = async request => ({ kind: 'rows', rows: await fetchRows(request) })
viewer.schema = schema
document.body.append(viewer)
const blob = await viewer.export('xlsx', { name: '销售汇总' })
```

## 装

```bash
pnpm add @xihan-report/core @xihan-report/runtime @xihan-ui/styles
```

完整文档见 [https://report.docs.xihanfun.com](https://report.docs.xihanfun.com)。

许可：MIT
