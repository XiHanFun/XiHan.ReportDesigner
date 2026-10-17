# 报表结构

一份报表定义 `ReportDocument` 由三部分组成：数据集描述数据长什么样，报表参数让看报表的人筛选，主体决定画成什么。它是纯 JSON，可以原样存进数据库、从接口取回，或在设计器里编辑。全部字段见[报表定义类型](../reference/schema#reportdocument)。

| 字段 | 内容 |
| --- | --- |
| `schemaVersion` | 报表定义的版本，写 `REPORT_SCHEMA_VERSION` |
| `id`、`title`、`description` | 报表的身份、标题与说明 |
| `datasets` | 数据集：字段与数据集参数，不含数据 |
| `parameters` | 报表参数：查看器在报表上方排出参数栏 |
| `body` | 主体：明细表、分组报表、交叉表或看板 |

## 数据集

数据集只描述字段，数据由取数回调按请求交回。字段的 `type` 取 `string`、`number`、`boolean`、`date`、`datetime` 之一，决定能用哪些聚合与运算符、怎么显示；`title` 是表头与设计器里显示的名字。

### 计算字段

字段写了 `formula` 就是计算字段：取回数据后，在每一行上按公式算出它的值，可以引用同一行的其它字段，也可以用 `$参数名` 引用报表参数。下面的单价由金额除以数量得到：

<<< @/examples/reports/regional.ts#datasets

公式是受限表达式，不执行任何代码，写法见 XiHan.UI 的[表达式文法](https://ui.docs.xihanfun.com/runtime/expression#文法)。用到公式时要给查看器（和设计器）一个表达式引擎：

<<< @/examples/snippets/structure.ts#engine

计算字段只在浏览器里算。筛选引用了计算字段时，取数请求里不带筛选，由 core 在取回的明细行上筛。

### 数据集参数

数据集还可以声明自己的参数 `parameters`，表示取数时要由宿主带进查询的值，例如只查某个门店。视图或卡片用 `parameters` 把它们绑定到字面值或报表参数上，取数请求的 `parameters` 里就是解析好的取值，宿主据此查数：

<<< @/examples/snippets/structure.ts#dataset-parameters

## 报表参数

报表参数由看报表的人填写，查看器在主体上方按参数类型排出参数栏：

| 参数 | 控件 |
| --- | --- |
| 有 `options` | 下拉选择，`multiple` 时可多选 |
| `boolean` | 开关 |
| `date`、`datetime` | 日期选择，`datetime` 精确到秒 |
| `multiple` 且没有 `options` | 标签输入 |
| `number`、`string` | 数字框、文本框；失焦或回车时才提交，不按每次击键重算 |

<<< @/examples/reports/regional.ts#parameters

- `defaultValue` 是没给值时的取值；`required` 的参数没有值时查看器不取数，显示「报表参数缺少或取值不合格」。
- 筛选条件的操作数写 `{ parameter: '名字' }` 就引用参数；参数没有值时这个条件不参与筛选，所以上面的「区域」不选就是全部区域。
- 公式里用 `$名字` 引用参数。
- 参数栏改了取值，查看器派发 `parameters-change` 并重新取数。宿主要自己管参数时写 `parameters` 属性，这时查看器只派发事件、不自己改，宿主把新取值写回去；`hide-parameters` 不显示参数栏。

## 主体

### 明细表 `table`

逐行列出数据。每一列 `columns` 对应数据集的一个字段，可以写标题、[值格式](#值格式)、列宽、对齐与冻结（`sticky` 固定在行首侧或行尾侧）。`summary` 写聚合方式或公式，在末尾出合计行。`sort` 是明细的排序，`limit` 是行数上限；行数多时表格自动改为按需渲染可见的行。

### 分组报表 `group`

按 `groups` 由外到内逐级分组，组内列出明细，组尾写小计，末尾写总计：

<<< @/examples/reports/regional.ts#body

- 每级分组可以写日期粒度 `bucket`（按年、季度、月、周、日、小时取键），`header` 与 `subtotal` 控制组头与组小计，缺省都显示。
- 组的次序缺省按键升序；`sort.by` 写一个带汇总的列 id 时按该列的组小计排，上面按金额从高到低排区域。
- `detail: false` 只留组头与小计，`grandTotal: false` 不写总计。

<ReportDemo name="regional" />

### 交叉表与看板

交叉表 `crosstab` 按行、列两组维度透视出度量，见[透视与交叉表](./pivot)；看板 `dashboard` 把图表、指标与表格卡片排在网格上，见[看板与卡片](./dashboard)。扩展还可以登记新的主体视图种类。

## 筛选

视图、卡片的查询与看板联动都用同一种筛选树 `FilterGroup`：`logic` 取 `and`（全部满足）或 `or`（任一满足），`conditions` 里是条件，也可以嵌套带 `id` 的子组。一个条件写字段、运算符与操作数：

<<< @/examples/snippets/structure.ts#filter

- 运算符见 [FilterOperator](../reference/schema#filteroperator)：`between` 要两个值，`in`、`notIn` 要一组值，`isEmpty`、`isNotEmpty` 不要操作数；字符串运算符可以写 `ignoreCase`。
- 写了 `bucket` 的条件先把字段值按日期粒度取键再比较，操作数直接写键。
- 否定运算符（`neq`、`notIn`、`notContains`）匹配缺失值；操作数为空的条件不参与筛选，组里的条件都不参与时整组不筛选。

## 值格式

列、维度、度量与坐标轴的 `format` 用 XiHan.UI 的值格式说明，取 `number`、`percent`、`date`、`rmbUpper` 几种，十进制精确舍入，写法见[格式化](https://ui.docs.xihanfun.com/runtime/expression#格式化)：

<<< @/examples/snippets/structure.ts#formats

没写格式时，数值按界面语言加千分位，日期写成 `YYYY-MM-DD`，日期时间写到秒。要换掉全部值的显示方式，给查看器一个 `formatter`。
