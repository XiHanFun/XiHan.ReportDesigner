---
'@xihan-report/core': patch
'@xihan-report/runtime': patch
'@xihan-report/designer': patch
---

**调整** 三个包对 `@xihan-ui/*` 的 peer 依赖提到 `^5.2.0`，项目里的 XiHan.UI 需要升到 5.2.0 或更高。设计器的外观随 UI 5.2.0 变化：缺省品牌色换成偏紫的靛蓝，圆角、聚焦环与面板分组的箭头位置都有调整；要保留原来的蓝色，在主题根上写 `data-brand="indigo"`。
