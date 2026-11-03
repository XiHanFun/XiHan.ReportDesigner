---
'@xihan-report/core': patch
'@xihan-report/runtime': patch
'@xihan-report/designer': patch
---

**修复** 扩展的校验规则（`rules`）与扩展种类的 `validate` 给出的问题，经 `validateDocument` 后丢了自己写的 `severity` 与 `target`：写成 `warning` 的问题一律成了错误，查看器因此不取数、显示「报表定义有问题」，设计器的问题列表按错误计数，画布上的问题标记也按错误着色。现在问题自己写的 `severity` 照留，没写的仍是 `error`；自带 `target` 的照留，没带的仍按路径补上所在的带键对象。内建的问题照旧都是错误级。
