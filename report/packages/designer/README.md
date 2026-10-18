# @xihan-report/designer

曦寒报表设计器：`<xh-report-designer>` 可视化编辑报表，包括数据集与报表参数面板、物料、看板卡片的框选拖动与改大小、画布缩放、字段栏（拖进字段、换序、交叉表透视）、属性面板、问题列表、预览、撤销重做与剪贴板，以及设置对话框。以原生 Web Components 交付，任何前端项目都能用。设计器只改报表定义、派发事件，报表定义的保存、取数与权限由宿主负责。

设计器用到 XiHan.UI 的设计器零件，样式要四份一起引入（见下面的用法）。卡片与视图种类、渲染、导出器、取数中间件、属性编辑器、命令、面板、物料与设置分区都能经 `extensions` 登记。

## 用法

```ts
import { defineReportDesigner } from '@xihan-report/designer'
import { createExpressionEngine } from '@xihan-ui/expression'
import '@xihan-ui/styles/index.css'
import '@xihan-ui/designer-shell/style.css'
import '@xihan-report/runtime/style.css'
import '@xihan-report/designer/style.css'

defineReportDesigner()

const designer = document.createElement('xh-report-designer')
designer.expressionEngine = createExpressionEngine()
designer.dataProvider = dataProvider
designer.schema = schema
designer.addEventListener('save', () => save(designer.schema).then(() => designer.markSaved()))
document.body.append(designer)
```

## 装

```bash
pnpm add @xihan-report/core @xihan-report/designer @xihan-report/runtime @xihan-ui/styles @xihan-ui/designer-shell @xihan-ui/expression
```

`@xihan-ui/expression` 只在报表里有计算字段或公式度量时需要。

完整文档见 [https://report.docs.xihanfun.com](https://report.docs.xihanfun.com)。

许可：MIT
