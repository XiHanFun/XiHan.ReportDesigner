# 更新日志

本页记录 `@xihan-report/core`、`@xihan-report/runtime`、`@xihan-report/designer` 各版本使用者能感知的变更，每条标注 **新增 / 修复 / 调整 / 移除**。这几个包总是同一个版本号一起发布；逐包的完整记录见仓库里各包的 `CHANGELOG.md`。

## v1.0.0（2026-11-08）

首个正式版，以原生 Web Components 交付，不绑定前端框架。报表定义是纯 JSON，按数据集与参数取数后在浏览器里算出明细表、分组报表、交叉表与看板，卡片能联动、表格能下钻，结果能导出 Excel。需要 XiHan.UI 5.4.0 及以上。

- **新增** `@xihan-report/core`：报表定义的结构（数据集、计算字段、参数、主体视图与看板卡片、联动）、校验与问题码、取数请求与计算（聚合、透视、排序、公式度量）、编辑操作与撤销重做。纯 TypeScript，不依赖 DOM。
- **新增** `@xihan-report/runtime`：`<xh-report-viewer>` 按报表定义与取数回调显示明细表、分组报表、交叉表与看板，带参数栏、卡片联动与下钻事件；`export('xlsx')` 导出 Excel；界面语言包与 XiHan.UI 内建语言一一对应。
- **新增** `@xihan-report/designer`：`<xh-report-designer>` 可视化设计器：数据集与参数面板、物料、看板卡片的拖动与改大小、字段栏、属性面板与问题列表、预览、撤销重做，从 JSON 样例或 JSON Schema 导入字段与参数，本机草稿。卡片与视图种类、导出器、取数中间件、命令、面板等都能经 `extensions` 扩展。
