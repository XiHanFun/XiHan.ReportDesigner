---
'@xihan-report/core': major
'@xihan-report/runtime': major
'@xihan-report/designer': major
---

**新增** 首次发布，以原生 Web Components 交付，不绑定前端框架。

- `@xihan-report/core`：报表定义的结构（数据集与字段、计算字段、报表参数，主体是明细表、分组报表、交叉表或看板与卡片，卡片之间的联动）、校验与问题码、按参数与联动选中算出取数请求、按取回的明细行或汇总行计算视图与卡片（聚合、透视、排序、公式度量）、编辑操作与撤销重做、卡片与视图种类的登记与扩展合并。纯 TypeScript，不依赖 DOM。
- `@xihan-report/runtime`：`<xh-report-viewer>` 按报表定义与取数回调计算并显示明细表、分组报表、交叉表与看板，带参数栏、卡片联动与表格下钻事件；`export('xlsx')` 把当前的计算结果写成 Excel 工作簿，`@xihan-report/runtime/xlsx` 把视图排成工作表；与 XiHan.UI 内建语言一一对应的界面语言包（`@xihan-report/runtime/locale`），查看器与设计器共用。
- `@xihan-report/designer`：`<xh-report-designer>` 可视化设计器，包括数据集与报表参数面板、物料、看板卡片的框选拖动与改大小、画布缩放、字段栏（拖进字段、换序、交叉表透视）、属性面板、问题列表、预览、撤销重做与剪贴板，以及设置对话框。卡片与视图种类、渲染、导出器、取数中间件、属性编辑器、命令、面板、物料与设置分区都能经 `extensions` 登记。
