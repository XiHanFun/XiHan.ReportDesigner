---
'@xihan-report/core': patch
'@xihan-report/runtime': patch
'@xihan-report/designer': patch
---

**调整** 三个包对 `@xihan-ui/*` 的 peer 依赖提到 `^5.4.0`，项目里的 XiHan.UI 需要升到 5.4.0 或更高。设计器的外观随 UI 5.4.0 变化：工具栏的设计 / 预览切换，问题面板的筛选和属性面板里的按钮组，选中项都改为实心主色、字反白。工具栏钮的提示压在下拉或菜单上面时，按空白处会一并收起；按下带提示的钮后，提示不再重新弹出。
