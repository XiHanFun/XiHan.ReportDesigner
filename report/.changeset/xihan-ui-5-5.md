---
'@xihan-report/core': patch
'@xihan-report/runtime': patch
'@xihan-report/designer': patch
---

**调整** 三个包对 `@xihan-ui/*` 的 peer 依赖提到 `^5.5.0`，项目里的 XiHan.UI 需要升到 5.5.0 或更高。查看器与设计器里用到的 UI 部件随 5.5.0 补上了过渡：树的展开收起按高度补间，列表增删与换序有进退场，提示、空态与清空钮出没时淡入淡出，换色改为淡变；选中的文字回到系统高亮色。
