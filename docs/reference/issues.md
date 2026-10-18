# 问题码

<!-- 本页由 docs/scripts/gen-reference.mjs 从源码生成，不要手改；源码变了之后在 docs/ 运行 pnpm gen。 -->

校验问题由 `validateDocument`、查看器的 `issues` 与设计器的问题列表给出，参数取值的问题由 `resolveParameters` 与查看器给出。问题不带文案，只有问题码、路径与参数；下表的说明来自中文语言包 `reportZhCN`，其中的 {名} 是参数，实际文案只含问题给出的参数。

报表的问题都是错误级：有问题的报表定义查看器不取数，显示「报表定义有问题」；参数取值有问题时显示「报表参数缺少或取值不合格」。

## 通用问题码

来自 `@xihan-ui/designer-kit/schema` 的 `CommonIssueCode`，按类型读取与属性检查时报出。

| 问题码 | 说明 | 参数 |
| --- | --- | --- |
| `required` | 必须填写 | — |
| `invalid-type` | 类型不对，应为{expected} | `expected` |
| `invalid-value` | 取值无效，应有 {min}～{max} 项 | `min`、`max` |
| `out-of-range` | 超出取值范围，应不小于 {min} 且大于 {exclusiveMin} 且不大于 {max} | `min`、`exclusiveMin`、`max` |
| `not-integer` | 应为整数 | — |
| `invalid-option` | 不是可选的值 | — |
| `invalid-color` | 不是有效的颜色 | — |
| `empty` | 不能为空 | — |
| `unknown-key` | 不认识的「{key}」 | `key` |
| `duplicate-key` | 名字「{key}」重复 | `key` |
| `duplicate-id` | 标识「{id}」重复 | `id` |
| `duplicate-value` | 选项的值重复 | — |
| `unknown-control` | 未知的编辑方式 | — |

## 报表的问题码

报表自己的校验问题码，按字母序；通用问题码见 @xihan-ui/designer-kit/schema 的 CommonIssueCode。报表的校验问题都是错误级。

| 问题码 | 说明 | 参数 |
| --- | --- | --- |
| `aggregate-type-mismatch` | 「{aggregate}」只能用于数值字段，这个字段是{type} | `aggregate`、`type` |
| `bucket-type-mismatch` | 日期粒度只能用于日期字段，这个字段是{type} | `type` |
| `chart-reference-role` | 「{key}」应是度量 | `key`、`expected` |
| `format-invalid` | 格式不合格 | — |
| `formula-cycle` | 公式互相引用成环：{names} | `names` |
| `formula-invalid` | 公式无法解析 | — |
| `formula-unknown-reference` | 公式引用了不存在的「{name}」 | `name` |
| `layout-out-of-bounds` | 卡片超出了 {columns} 列的网格 | `columns` |
| `layout-overlap` | 与卡片「{card}」重叠 | `card` |
| `link-target-type-mismatch` | 源维度按日期粒度取值，目标字段也应是日期，这个字段是{type} | `type` |
| `measure-definition` | 度量要么写聚合方式，要么写公式，二者取一 | — |
| `operand-required` | 缺少比较值 | — |
| `operand-shape` | 「{operator}」只要一个值 | `operator` |
| `operand-type-mismatch` | 比较值应为{expected} | `expected` |
| `operator-type-mismatch` | 「{operator}」不适用于{type}字段 | `operator`、`type` |
| `reserved-name` | 「{key}」以 $ 开头，这类名字留给公式里的报表参数 | `key` |
| `unknown-card` | 找不到卡片「{card}」 | `card` |
| `unknown-dataset` | 找不到数据集「{dataset}」 | `dataset` |
| `unknown-dataset-parameter` | 数据集没有参数「{parameter}」 | `parameter` |
| `unknown-dimension` | 找不到维度「{key}」 | `key` |
| `unknown-field` | 找不到字段「{field}」 | `field` |
| `unknown-kind` | 种类「{kind}」没有登记，装上登记它的扩展后才能显示 | `kind` |
| `unknown-measure` | 找不到度量「{key}」 | `key` |
| `unknown-parameter` | 找不到参数「{parameter}」 | `parameter` |
| `unknown-series` | 找不到系列「{series}」 | `series` |
| `unsupported-schema-version` | 不支持报表版本 {version} | `version` |

## 参数取值的问题

参数取值的问题码。

| 问题码 | 说明 | 参数 |
| --- | --- | --- |
| `parameter-required` | 必须给这个参数取值 | — |
| `parameter-type-mismatch` | 参数的取值类型不对 | — |
| `parameter-not-multiple` | 这个参数只能取一个值 | — |
| `parameter-option-mismatch` | 取值不在候选项里 | — |
| `unknown-parameter` | 找不到参数「{parameter}」 | `parameter` |

## 扩展的问题码

扩展自己的问题码写作扩展 id 的末段、一个点、码，如 `gantt.no-dates`；说明由扩展登记的 `issueText` 给出，设计器问题列表照样显示。

## 计算错误

计算错误：message 即错误码，定位与取值放在 params 里。

`ReportComputeError` 的码：`aggregated-input-unsupported`、`formula-compile-failed`、`formula-cycle`、`formula-engine-missing`、`formula-evaluation-failed`、`invalid-date-value`、`invalid-filter-operand`、`invalid-time-zone`、`missing-data`、`unknown-card`、`unknown-dimension`、`unknown-kind`、`unknown-sort-key`。
