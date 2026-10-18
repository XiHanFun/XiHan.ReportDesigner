# 报表定义类型

<!-- 本页由 docs/scripts/gen-reference.mjs 从源码生成，不要手改；源码变了之后在 docs/ 运行 pnpm gen。 -->

报表定义 `ReportDocument` 的全部类型，按 `@xihan-report/core` 的源码列出。当前 schema 版本 `REPORT_SCHEMA_VERSION` 为 `1`。

报表定义是纯 JSON：数据集只描述字段与参数，不含数据；数据由取数回调按请求交回。各对象都可以带 `extensions`，放扩展自己的数据，见[扩展数据](#reportextensible)。「中文名」是设计器属性面板里的叫法，详见[属性](./properties)。

## 报表与参数

### ParameterOption {#parameteroption}

参数的一个候选项。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | <code><a href="#scalarvalue">ScalarValue</a></code> | 是 | 数值 |  |
| `label` | <code>string</code> | 可省 | — | 显示的文字；不写按取值显示。 |
| `disabled` | <code>boolean</code> | 可省 | — | 在参数栏里列出但不能选；宿主或缺省值给了这个取值照样认。 |

### ReportParameter {#reportparameter}

报表参数：报表使用者填写，经绑定传给数据集参数或筛选条件。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | <code>string</code> | 是 | 名称 | 参数名，在报表内唯一。 |
| `type` | <code><a href="#fieldtype">FieldType</a></code> | 是 | 类型 |  |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `required` | <code>boolean</code> | 可省 | 必填 | 必须给值。 |
| `multiple` | <code>boolean</code> | 可省 | 多选 | 接受多个值。 |
| `defaultValue` | <code><a href="#parametervalue">ParameterValue</a></code> | 可省 | 缺省值 | 缺省值。 |
| `options` | <code>readonly <a href="#parameteroption">ParameterOption</a>&#91;&#93;</code> | 可省 | 候选项 | 固定的候选项。 |

### ReportDocument {#reportdocument}

报表文档：纯 JSON。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `schemaVersion` | <code>typeof REPORT_SCHEMA_VERSION</code> | 是 | — | 报表定义的版本，写 REPORT_SCHEMA_VERSION。 |
| `id` | <code>string</code> | 是 | — | 报表身份。 |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `description` | <code>string</code> | 可省 | 说明 |  |
| `parameters` | <code>readonly <a href="#reportparameter">ReportParameter</a>&#91;&#93;</code> | 可省 | 参数绑定 |  |
| `datasets` | <code>readonly <a href="#datasetschema">DatasetSchema</a>&#91;&#93;</code> | 是 | — | 报表用到的数据集：只描述字段与参数，数据由取数回调交回。 |
| `body` | <code><a href="#reportbody">ReportBody</a></code> | 是 | — | 报表的主体：明细表、分组报表、交叉表、看板，或扩展登记的视图。 |

## 数据集与取数

### DatasetField {#datasetfield}

数据集里的一个字段。写了 formula 的是计算字段，以同一行的字段与报表参数（$名字）为变量逐行求值，不由使用方提供。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | <code>string</code> | 是 | 名称 | 字段名：数据行里的键，在数据集内唯一；不以 $ 开头。 |
| `type` | <code><a href="#fieldtype">FieldType</a></code> | 是 | 类型 |  |
| `title` | <code>string</code> | 可省 | 标题 | 显示的标题，缺省同 name。 |
| `formula` | <code>string</code> | 可省 | 公式 | 计算字段的表达式；求值能力由 ExpressionEngine 提供。 |

### DatasetParameter {#datasetparameter}

数据集接受的一个参数：取数时由使用方的数据源解释。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `name` | <code>string</code> | 是 | 名称 | 参数名，在数据集内唯一。 |
| `type` | <code><a href="#fieldtype">FieldType</a></code> | 是 | 类型 |  |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `required` | <code>boolean</code> | 可省 | 必填 | 取数时必须给值。 |
| `multiple` | <code>boolean</code> | 可省 | 多选 | 接受多个值。 |

### DatasetSchema {#datasetschema}

报表引用的一个数据集。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 数据集身份，在报表内唯一，也是取数请求里的 dataset。 |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `fields` | <code>readonly <a href="#datasetfield">DatasetField</a>&#91;&#93;</code> | 是 | — | 数据集的字段。 |
| `parameters` | <code>readonly <a href="#datasetparameter">DatasetParameter</a>&#91;&#93;</code> | 可省 | 参数绑定 |  |

### DatasetQueryDimension {#datasetquerydimension}

取数请求里的一个维度：按 field 分组，写了 bucket 时按日期粒度取键。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 维度 id：交回的聚合行里以它为键。 |
| `field` | <code>string</code> | 是 | 字段 |  |
| `bucket` | <code><a href="#datebucket">DateBucket</a></code> | 可省 | 日期粒度 |  |

### DatasetQueryMeasure {#datasetquerymeasure}

取数请求里的一个度量：对 field 做 aggregate；count 不写 field 时数行。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 度量 id：交回的聚合行里以它为键。 |
| `field` | <code>string</code> | 可省 | 字段 |  |
| `aggregate` | <code><a href="#aggregatekind">AggregateKind</a></code> | 是 | 聚合 |  |

### DatasetQuery {#datasetquery}

视图需要的聚合：使用方可以照此在后端聚合，返回 aggregated 数据。已聚合数据的每行以维度 id 与度量 id 为键。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `dimensions` | <code>readonly <a href="#datasetquerydimension">DatasetQueryDimension</a>&#91;&#93;</code> | 是 | — | 按哪些维度分组。 |
| `measures` | <code>readonly <a href="#datasetquerymeasure">DatasetQueryMeasure</a>&#91;&#93;</code> | 是 | — | 每组要算的度量。 |
| `rollups` | <code>readonly (readonly string&#91;&#93;)&#91;&#93;</code> | 是 | — | 不可累加的度量（avg、distinctCount）要单独给出的汇总分组：每项是一组维度 id，空数组是总计。没有不可累加的度量时为空。 |

### DatasetRequest {#datasetrequest}

取数请求：core 按视图与参数取值算出，使用方据此取数。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `dataset` | <code>string</code> | 是 | 数据集 | 数据集 id。 |
| `parameters` | <code><a href="#parametervalues">ParameterValues</a></code> | 是 | 参数绑定 | 数据集参数的取值：已按绑定解析，未给值的参数不出现。 |
| `filter` | <code><a href="#filtergroup">FilterGroup</a> &#124; null</code> | 是 | 筛选 | 已代入参数的筛选；引用了计算字段时为 null，由 core 在取回的行上筛选。 |
| `sort` | <code>readonly <a href="#rowsortrule">RowSortRule</a>&#91;&#93; &#124; null</code> | 是 | 排序 | 明细视图的排序；聚合视图为 null。 |
| `limit` | <code>number &#124; null</code> | 是 | 行数上限 | 明细视图的行数上限；没有上限为 null。 |
| `query` | <code><a href="#datasetquery">DatasetQuery</a> &#124; null</code> | 是 | — | 视图需要的聚合；明细视图或引用了计算字段时为 null，此时只能返回明细行。 |

### DatasetRows {#datasetrows}

明细行：core 负责计算字段、筛选、分组与聚合。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `kind` | <code>'rows'</code> | 是 | — | 交回明细行。 |
| `rows` | <code>readonly <a href="#datarow">DataRow</a>&#91;&#93;</code> | 是 | — | 明细行：以字段名为键；core 在这些行上筛选、聚合与计算。 |

### DatasetRollup {#datasetrollup}

一条汇总行：按 dimensions 分组的汇总值，键同已聚合行。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `dimensions` | <code>readonly string&#91;&#93;</code> | 是 | — | 分组的维度 id；空数组是总计。 |
| `row` | <code><a href="#datarow">DataRow</a></code> | 是 | — | 这一组的汇总值：以度量 id 为键。 |

### DatasetAggregated {#datasetaggregated}

已聚合数据：使用方按请求里的 query 在后端聚合并筛选过。rows 以维度 id 与度量 id 为键；不可累加度量的汇总值由 rollups 给出。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `kind` | <code>'aggregated'</code> | 是 | — | 交回按请求聚合好的行。 |
| `rows` | <code>readonly <a href="#datarow">DataRow</a>&#91;&#93;</code> | 是 | — | 每组一行：以维度 id 与度量 id 为键。 |
| `rollups` | <code>readonly <a href="#datasetrollup">DatasetRollup</a>&#91;&#93;</code> | 可省 | — | 请求的 rollups 里每个分组的汇总行；请求里 rollups 为空时不写。 |

### DatasetData {#datasetdata}

使用方交回的数据。

取其一：<code><a href="#datasetrows">DatasetRows</a></code>、<code><a href="#datasetaggregated">DatasetAggregated</a></code>。

## 视图与看板

### DataBinding {#databinding}

视图取数的数据集与参数绑定。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `dataset` | <code>string</code> | 是 | 数据集 | 数据集 id。 |
| `parameters` | <code>Readonly&lt;Record&lt;string, <a href="#operand">Operand</a>&gt;&gt;</code> | 可省 | 参数绑定 | 数据集参数名到操作数：字面值或报表参数。 |

### ColumnSummary {#columnsummary}

汇总：对列的字段做聚合，或以其它列的汇总值与报表参数（$名字）为变量求公式。

类型：<code>{ readonly aggregate: <a href="#aggregatekind">AggregateKind</a> } &#124; { readonly formula: string }</code>

### TableColumn {#tablecolumn}

表格的一列。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 列身份，在视图内唯一。 |
| `field` | <code>string</code> | 是 | 字段 | 数据集字段名。 |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `format` | <code><a href="#formatspec">FormatSpec</a></code> | 可省 | 格式 |  |
| `width` | <code>number</code> | 可省 | 列宽 | 列宽（px）。 |
| `align` | <code>'start' &#124; 'center' &#124; 'end'</code> | 可省 | 对齐 |  |
| `sticky` | <code>'start' &#124; 'end'</code> | 可省 | 冻结 | 横向滚动时固定在行首侧或行尾侧。 |
| `summary` | <code><a href="#columnsummary">ColumnSummary</a></code> | 可省 | — | 汇总：分组报表的组小计与总计、明细表的合计行。 |

### TableView {#tableview}

明细表：逐行列出数据。

继承 <code><a href="#databinding">DataBinding</a></code>、<code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'table'</code> | 是 | 类型 |  |
| `columns` | <code>readonly <a href="#tablecolumn">TableColumn</a>&#91;&#93;</code> | 是 | — | 各列，从左到右。 |
| `filter` | <code><a href="#filtergroup">FilterGroup</a></code> | 可省 | 筛选 |  |
| `sort` | <code>readonly <a href="#rowsortrule">RowSortRule</a>&#91;&#93;</code> | 可省 | 排序 |  |
| `limit` | <code>number</code> | 可省 | 行数上限 | 行数上限，在排序之后截取。 |

### GroupLevel {#grouplevel}

分组报表的一级分组。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 分组身份，在视图内唯一。 |
| `field` | <code>string</code> | 是 | 字段 | 数据集字段名。 |
| `bucket` | <code><a href="#datebucket">DateBucket</a></code> | 可省 | 日期粒度 |  |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `format` | <code><a href="#formatspec">FormatSpec</a></code> | 可省 | 格式 |  |
| `sort` | <code><a href="#axissort">AxisSort</a></code> | 可省 | 排序 | 组的次序：by 写带汇总的列 id 时按该列的组小计排；缺省按键升序。 |
| `header` | <code>boolean</code> | 可省 | 组头 | 显示组头，缺省 true。 |
| `subtotal` | <code>boolean</code> | 可省 | 组小计 | 显示组小计，缺省 true。 |

### GroupView {#groupview}

分组报表：多级分组，组内列出明细，组尾写小计，末尾写总计。

继承 <code><a href="#databinding">DataBinding</a></code>、<code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'group'</code> | 是 | 类型 |  |
| `groups` | <code>readonly <a href="#grouplevel">GroupLevel</a>&#91;&#93;</code> | 是 | — | 各级分组，由外到内。 |
| `columns` | <code>readonly <a href="#tablecolumn">TableColumn</a>&#91;&#93;</code> | 是 | — | 明细行与组小计的各列，从左到右。 |
| `filter` | <code><a href="#filtergroup">FilterGroup</a></code> | 可省 | 筛选 |  |
| `sort` | <code>readonly <a href="#rowsortrule">RowSortRule</a>&#91;&#93;</code> | 可省 | 排序 | 组内明细行的次序。 |
| `detail` | <code>boolean</code> | 可省 | 列出明细 | 列出明细行，缺省 true；false 时只有组头与小计。 |
| `grandTotal` | <code>boolean</code> | 可省 | 总计 | 写总计，缺省 true。 |

### CrosstabTotals {#crosstabtotals}

交叉表一条轴上的汇总。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `subtotals` | <code>boolean</code> | 可省 | — | 除最内层外，每层维度的成员之后写小计，缺省 false。 |
| `grandTotal` | <code>boolean</code> | 可省 | 总计 | 轴的末尾写总计，缺省 true。 |

### CrosstabView {#crosstabview}

交叉表：行维度与列维度交叉，格子里写度量。

继承 <code><a href="#databinding">DataBinding</a></code>、<code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'crosstab'</code> | 是 | 类型 |  |
| `rows` | <code>readonly <a href="#dimension">Dimension</a>&#91;&#93;</code> | 是 | — | 行维度，由外到内。 |
| `columns` | <code>readonly <a href="#dimension">Dimension</a>&#91;&#93;</code> | 是 | — | 列维度，由外到内。 |
| `measures` | <code>readonly <a href="#measure">Measure</a>&#91;&#93;</code> | 是 | — | 每个格子里的度量。 |
| `filter` | <code><a href="#filtergroup">FilterGroup</a></code> | 可省 | 筛选 |  |
| `rowTotals` | <code><a href="#crosstabtotals">CrosstabTotals</a></code> | 可省 | — | 行方向（行维度）的小计与总计。 |
| `columnTotals` | <code><a href="#crosstabtotals">CrosstabTotals</a></code> | 可省 | — | 列方向（列维度）的小计与总计。 |
| `measuresOn` | <code>'columns' &#124; 'rows'</code> | 可省 | 度量排在 | 多个度量排在列方向还是行方向，缺省 columns。 |

### DashboardGrid {#dashboardgrid}

看板网格。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `columns` | <code>number</code> | 是 | — | 列数。 |
| `rowHeight` | <code>number</code> | 是 | — | 一行的高度（px）。 |

### CardLayout {#cardlayout}

卡片在网格上的位置与大小，单位是格。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `x` | <code>number</code> | 是 | 横坐标 |  |
| `y` | <code>number</code> | 是 | 纵坐标 |  |
| `w` | <code>number</code> | 是 | — | 宽，单位是格。 |
| `h` | <code>number</code> | 是 | — | 高，单位是行。 |

### CardBase {#cardbase}

卡片的共有属性。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 卡片身份，在看板内唯一。 |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `description` | <code>string</code> | 可省 | 说明 |  |
| `layout` | <code><a href="#cardlayout">CardLayout</a></code> | 是 | 布局 |  |

### ChartCard {#chartcard}

图表卡片。

继承 <code><a href="#cardbase">CardBase</a></code>、<code><a href="#databinding">DataBinding</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `kind` | <code>'chart'</code> | 是 | — | 图表卡片。 |
| `query` | <code><a href="#reportquery">ReportQuery</a></code> | 是 | — | 取数的聚合查询：图表的维度与度量都引用它的 id。 |
| `chart` | <code><a href="#chartspec">ChartSpec</a></code> | 是 | — | 图表配置。 |

### MetricCard {#metriccard}

指标卡片。

继承 <code><a href="#cardbase">CardBase</a></code>、<code><a href="#databinding">DataBinding</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `kind` | <code>'metric'</code> | 是 | — | 指标卡片。 |
| `query` | <code><a href="#reportquery">ReportQuery</a></code> | 是 | — | 取数的聚合查询：指标取它的总计，迷你图取它的分组。 |
| `metric` | <code><a href="#metricspec">MetricSpec</a></code> | 是 | — | 指标配置。 |

### TableCard {#tablecard}

表格卡片：内嵌一个明细表、分组报表或交叉表。

继承 <code><a href="#cardbase">CardBase</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `kind` | <code>'table'</code> | 是 | — | 表格卡片。 |
| `view` | <code><a href="#tableview">TableView</a> &#124; <a href="#groupview">GroupView</a> &#124; <a href="#crosstabview">CrosstabView</a></code> | 是 | — | 卡片里的明细表、分组报表或交叉表，带自己的数据集与筛选。 |

### ExtensionCard {#extensioncard}

扩展登记的卡片：kind 是带点的种类名。取数部分按种类声明的形状写：同图表卡片的 dataset、parameters 与 query，或同表格卡片的 view，或不取数；其余字段归种类自己。

继承 <code><a href="#cardbase">CardBase</a></code>、<code>Partial&lt;<a href="#databinding">DataBinding</a>&gt;</code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `kind` | <code><a href="#reportextensionkind">ReportExtensionKind</a></code> | 是 | — | 扩展登记的种类名。 |
| `query` | <code><a href="#reportquery">ReportQuery</a></code> | 可省 | — | 取数形状为 query 的种类：聚合查询。 |
| `view` | <code><a href="#dataview">DataView</a></code> | 可省 | — | 取数形状为 view 的种类：明细表、分组报表或交叉表。 |
| `[key: string]` | <code>unknown</code> | 是 | — | 种类自己的其余字段，由种类的 validate 校验。 |

### DashboardCard {#dashboardcard}

看板上的一张卡片：图表、指标、表格，或扩展登记的种类。

取其一：<code><a href="#chartcard">ChartCard</a></code>、<code><a href="#metriccard">MetricCard</a></code>、<code><a href="#tablecard">TableCard</a></code>、<code><a href="#extensioncard">ExtensionCard</a></code>。

### LinkTarget {#linktarget}

联动的一个目标：在目标卡片上按字段筛选。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `card` | <code>string</code> | 是 | 源卡片 | 目标卡片 id。 |
| `field` | <code>string</code> | 是 | 字段 | 目标卡片数据集的字段名。 |

### DashboardLink {#dashboardlink}

筛选联动：在源卡片上选中的取值，成为目标卡片在对应字段上的 in 条件。源维度带日期粒度时，目标字段按同一粒度取键再比较。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 联动身份，在看板内唯一。 |
| `card` | <code>string</code> | 是 | 源卡片 | 源卡片 id。 |
| `dimension` | <code>string</code> | 是 | 源维度 | 源卡片上发出取值的维度：图表与指标卡片是查询的维度 id，分组报表是分组 id，交叉表是行或列维度 id，明细表是列 id。 |
| `targets` | <code>readonly <a href="#linktarget">LinkTarget</a>&#91;&#93;</code> | 是 | 目标 |  |

### DashboardView {#dashboardview}

看板：网格上排列的卡片。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'dashboard'</code> | 是 | 类型 |  |
| `grid` | <code><a href="#dashboardgrid">DashboardGrid</a></code> | 是 | — | 网格的列数与行高。 |
| `cards` | <code>readonly <a href="#dashboardcard">DashboardCard</a>&#91;&#93;</code> | 是 | — | 看板上的卡片，位置与大小写在各自的 layout 上。 |
| `links` | <code>readonly <a href="#dashboardlink">DashboardLink</a>&#91;&#93;</code> | 可省 | — | 卡片之间的筛选联动。 |

### ExtensionView {#extensionview}

扩展登记的主体视图：type 是带点的种类名。取数部分按种类声明的形状写：同图表卡片的 dataset、parameters 与 query，或不取数；其余字段归种类自己。

继承 <code>Partial&lt;<a href="#databinding">DataBinding</a>&gt;</code>、<code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code><a href="#reportextensionkind">ReportExtensionKind</a></code> | 是 | 类型 |  |
| `query` | <code><a href="#reportquery">ReportQuery</a></code> | 可省 | — | 取数形状为 query 的种类：聚合查询。 |
| `[key: string]` | <code>unknown</code> | 是 | — | 种类自己的其余字段，由种类的 validate 校验。 |

### ReportBody {#reportbody}

报表的主体。

取其一：<code><a href="#tableview">TableView</a></code>、<code><a href="#groupview">GroupView</a></code>、<code><a href="#crosstabview">CrosstabView</a></code>、<code><a href="#dashboardview">DashboardView</a></code>、<code><a href="#extensionview">ExtensionView</a></code>。

### DataView {#dataview}

可以直接取数计算的视图。

取其一：<code><a href="#tableview">TableView</a></code>、<code><a href="#groupview">GroupView</a></code>、<code><a href="#crosstabview">CrosstabView</a></code>。

## 查询

### AggregateKind {#aggregatekind}

转导出自 `@xihan-ui/viz`。取值见常量 `AGGREGATE_KINDS`：

| 取值 | 中文名 |
| --- | --- |
| `sum` | 求和 |
| `avg` | 平均 |
| `count` | 计数 |
| `min` | 最小 |
| `max` | 最大 |
| `distinctCount` | 去重计数 |

### DateBucket {#datebucket}

日期粒度：把日期取成分组键。year → 2026，quarter → 2026-Q4，month → 2026-10，week → 2026-W42（ISO 周），day → 2026-10-16，hour → 2026-10-16T08。

取值见常量 `DATE_BUCKETS`：

| 取值 | 中文名 |
| --- | --- |
| `year` | 年 |
| `quarter` | 季度 |
| `month` | 月 |
| `week` | 周 |
| `day` | 日 |
| `hour` | 小时 |

### AxisSort {#axissort}

成员的次序：按键，或按某个度量在该成员上的汇总值。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `by` | <code>string</code> | 可省 | — | 度量 id（分组报表里是带汇总的列 id）；不写按键。 |
| `direction` | <code><a href="#sortdirection">SortDirection</a></code> | 可省 | 方向 | 缺省 asc。 |
| `nulls` | <code><a href="#nullsposition">NullsPosition</a></code> | 可省 | — | 缺省 last。 |

### Dimension {#dimension}

维度：按字段分组。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 维度身份：查询结果里的键，与同一查询的度量 id 共用命名空间。 |
| `field` | <code>string</code> | 是 | 字段 | 数据集字段名。 |
| `bucket` | <code><a href="#datebucket">DateBucket</a></code> | 可省 | 日期粒度 | 日期粒度。 |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `format` | <code><a href="#formatspec">FormatSpec</a></code> | 可省 | 格式 |  |
| `sort` | <code><a href="#axissort">AxisSort</a></code> | 可省 | 排序 | 成员次序，缺省按键升序。 |

### MeasureBase {#measurebase}

共有的度量属性。

继承 <code><a href="#reportextensible">ReportExtensible</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 度量身份：查询结果里的键，与同一查询的维度 id 共用命名空间。 |
| `title` | <code>string</code> | 可省 | 标题 |  |
| `format` | <code><a href="#formatspec">FormatSpec</a></code> | 可省 | 格式 |  |

### AggregateMeasure {#aggregatemeasure}

聚合度量：对字段做聚合；count 不写 field 时数行。

继承 <code><a href="#measurebase">MeasureBase</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `aggregate` | <code><a href="#aggregatekind">AggregateKind</a></code> | 是 | 聚合 |  |
| `field` | <code>string</code> | 可省 | 字段 |  |

### FormulaMeasure {#formulameasure}

公式度量：在聚合之后，以同一查询其它度量的值与报表参数（$名字）为变量求值。

继承 <code><a href="#measurebase">MeasureBase</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `formula` | <code>string</code> | 是 | 公式 |  |

### Measure {#measure}

度量：聚合度量或公式度量。

取其一：<code><a href="#aggregatemeasure">AggregateMeasure</a></code>、<code><a href="#formulameasure">FormulaMeasure</a></code>。

### QuerySortRule {#querysortrule}

查询结果行的一条排序规则。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `key` | <code>string</code> | 是 | — | 维度 id 或度量 id。 |
| `direction` | <code><a href="#sortdirection">SortDirection</a></code> | 可省 | 方向 | 缺省 asc。 |
| `nulls` | <code><a href="#nullsposition">NullsPosition</a></code> | 可省 | — | 缺省 last。 |

### ReportQuery {#reportquery}

聚合查询：按维度分组、计算度量，结果每个维度组合一行。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `dimensions` | <code>readonly <a href="#dimension">Dimension</a>&#91;&#93;</code> | 是 | — | 按哪些维度分组；不写维度时结果只有总计。 |
| `measures` | <code>readonly <a href="#measure">Measure</a>&#91;&#93;</code> | 是 | — | 每组要算的度量。 |
| `filter` | <code><a href="#filtergroup">FilterGroup</a></code> | 可省 | 筛选 |  |
| `sort` | <code>readonly <a href="#querysortrule">QuerySortRule</a>&#91;&#93;</code> | 可省 | 排序 | 结果行的次序；不写按维度依次升序。 |
| `limit` | <code>number</code> | 可省 | 行数上限 | 结果行数上限，在排序之后截取。 |

## 筛选与排序

### ParameterRef {#parameterref}

引用一个报表参数的值。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `parameter` | <code>string</code> | 是 | — | 报表参数名：取数时换成参数的取值。 |

### Operand {#operand}

操作数：字面值、字面值数组，或报表参数。

类型：<code><a href="#scalarvalue">ScalarValue</a> &#124; readonly <a href="#scalarvalue">ScalarValue</a>&#91;&#93; &#124; <a href="#parameterref">ParameterRef</a></code>

### FilterOperator {#filteroperator}

转导出自 `@xihan-ui/viz`。取值见常量 `FILTER_OPERATORS`：

| 取值 | 中文名 |
| --- | --- |
| `eq` | — |
| `neq` | — |
| `gt` | — |
| `gte` | — |
| `lt` | — |
| `lte` | — |
| `between` | — |
| `in` | — |
| `notIn` | — |
| `contains` | — |
| `notContains` | — |
| `startsWith` | — |
| `endsWith` | — |
| `isEmpty` | — |
| `isNotEmpty` | — |

### NullsPosition {#nullsposition}

转导出自 `@xihan-ui/viz`。取值见常量 `NULLS_POSITIONS`：

| 取值 | 中文名 |
| --- | --- |
| `first` | 最前 |
| `last` | 最后 |

### SortDirection {#sortdirection}

转导出自 `@xihan-ui/viz`。取值见常量 `SORT_DIRECTIONS`：

| 取值 | 中文名 |
| --- | --- |
| `asc` | 升序 |
| `desc` | 降序 |

### FilterCondition {#filtercondition}

一个筛选条件。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 条件身份，在所在筛选树内唯一。 |
| `field` | <code>string</code> | 是 | 字段 | 数据集字段名。 |
| `bucket` | <code><a href="#datebucket">DateBucket</a></code> | 可省 | 日期粒度 | 先把字段值按日期粒度取键再比较。 |
| `operator` | <code><a href="#filteroperator">FilterOperator</a></code> | 是 | — | 运算符，见 FilterOperator；isEmpty、isNotEmpty 不要操作数，between 要两个值，in、notIn 要一组值。 |
| `value` | <code><a href="#operand">Operand</a></code> | 可省 | 数值 | 操作数；isEmpty / isNotEmpty 不写。 |
| `ignoreCase` | <code>boolean</code> | 可省 | — | 字符串运算符忽略大小写。 |

### FilterGroup {#filtergroup}

条件组：and 全部满足，or 任一满足。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `logic` | <code>'and' &#124; 'or'</code> | 是 | — | and 是全部满足，or 是任一满足。 |
| `conditions` | <code>readonly <a href="#filternode">FilterNode</a>&#91;&#93;</code> | 是 | — | 条件与子组；组里的条件都不参与（空数组，或操作数都为空）时整组不筛选。 |

### FilterSubgroup {#filtersubgroup}

嵌套在条件组里的子组。

继承 <code><a href="#filtergroup">FilterGroup</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 子组身份，在所在筛选树内唯一。 |

### FilterNode {#filternode}

条件组里的一项：条件或子组。

取其一：<code><a href="#filtercondition">FilterCondition</a></code>、<code><a href="#filtersubgroup">FilterSubgroup</a></code>。

### RowSortRule {#rowsortrule}

明细行的一条排序规则。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `field` | <code>string</code> | 是 | 字段 | 数据集字段名。 |
| `direction` | <code><a href="#sortdirection">SortDirection</a></code> | 可省 | 方向 | 缺省 asc。 |
| `nulls` | <code><a href="#nullsposition">NullsPosition</a></code> | 可省 | — | 缺省 last。 |

## 图表

### ChartTone {#charttone}

语气：XiHan.UI 的 Tone。

类型：<code>Tone</code>

### ChartPalette {#chartpalette}

顺序色阶的色板，与 XiHan.UI 的 ChartPalette 一致。

类型：<code>'red' &#124; 'orange' &#124; 'amber' &#124; 'yellow' &#124; 'lime' &#124; 'green' &#124; 'teal' &#124; 'cyan' &#124; 'blue' &#124; 'indigo' &#124; 'purple' &#124; 'pink' &#124; 'gray'</code>

### ChartSymbol {#chartsymbol}

散点形状：XiHan.UI 图表引擎的 SymbolName。

类型：<code>SymbolName</code>

### ChartSize {#chartsize}

尺寸档。

类型：<code>'sm' &#124; 'md' &#124; 'lg'</code>

### CartesianSeriesSpecBase {#cartesianseriesspecbase}

笛卡尔图系列的共有属性。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | <code>string</code> | 是 | — | 系列身份，在图内唯一。 |
| `name` | <code>string</code> | 可省 | 名称 | 图例与提示框里的名字，缺省取度量标题。 |
| `slot` | <code>number</code> | 可省 | 色槽 | 固定色槽 1–8。 |
| `tone` | <code><a href="#charttone">ChartTone</a></code> | 可省 | 语气 | 语义系列的语气。 |

### CartesianBarSeriesSpec {#cartesianbarseriesspec}

柱系列。

继承 <code><a href="#cartesianseriesspecbase">CartesianSeriesSpecBase</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `mark` | <code>'bar'</code> | 是 | 标记 |  |
| `x` | <code>string</code> | 是 | 横坐标 | 自变量：维度 id。 |
| `y` | <code>string &#124; readonly &#91;string, string&#93;</code> | 是 | 纵坐标 | 数值：度量 id；写成 [下, 上] 是浮动柱。 |
| `shape` | <code>'bar' &#124; 'lollipop'</code> | 可省 | 形状 |  |
| `stack` | <code>string</code> | 可省 | 堆叠组 |  |
| `stackOffset` | <code>'none' &#124; 'expand' &#124; 'diverging'</code> | 可省 | 堆叠方式 |  |
| `labels` | <code>'none' &#124; 'inside' &#124; 'end'</code> | 可省 | 标签 |  |

### CartesianLineSeriesSpec {#cartesianlineseriesspec}

折线系列。

继承 <code><a href="#cartesianseriesspecbase">CartesianSeriesSpecBase</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `mark` | <code>'line'</code> | 是 | 标记 |  |
| `x` | <code>string</code> | 是 | 横坐标 | 自变量：维度 id。 |
| `y` | <code>string &#124; readonly &#91;string, string&#93;</code> | 是 | 纵坐标 | 数值：度量 id；写成 [下, 上] 是区间带。 |
| `curve` | <code>'linear' &#124; 'monotone' &#124; 'step' &#124; 'step-before' &#124; 'step-after'</code> | 可省 | 曲线 |  |
| `area` | <code>boolean</code> | 可省 | 面积 |  |
| `stack` | <code>string</code> | 可省 | 堆叠组 |  |
| `stackOffset` | <code>'none' &#124; 'expand' &#124; 'silhouette' &#124; 'wiggle'</code> | 可省 | 堆叠方式 |  |
| `symbols` | <code>'auto' &#124; 'always' &#124; 'none'</code> | 可省 | 数据点 |  |
| `connectNulls` | <code>boolean</code> | 可省 | 连接空值 |  |
| `labels` | <code>'none' &#124; 'end'</code> | 可省 | 标签 |  |
| `endLabel` | <code>boolean</code> | 可省 | 末端标签 |  |

### CartesianScatterSeriesSpec {#cartesianscatterseriesspec}

散点系列：每个维度组合一个点。

继承 <code><a href="#cartesianseriesspecbase">CartesianSeriesSpecBase</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `mark` | <code>'scatter'</code> | 是 | 标记 |  |
| `x` | <code>string</code> | 是 | 横坐标 | 横坐标：维度 id 或度量 id。 |
| `y` | <code>string</code> | 是 | 纵坐标 | 纵坐标：度量 id。 |
| `size` | <code>string</code> | 可省 | 尺寸 | 气泡大小：度量 id。 |
| `symbol` | <code><a href="#chartsymbol">ChartSymbol</a></code> | 可省 | 点形状 |  |
| `jitter` | <code>number</code> | 可省 | 抖动 |  |
| `color` | <code>string</code> | 可省 | 颜色度量 | 按值着色：度量 id。 |

### CartesianSeriesSpec {#cartesianseriesspec}

柱线图的一条系列：柱、折线或散点。

取其一：<code><a href="#cartesianbarseriesspec">CartesianBarSeriesSpec</a></code>、<code><a href="#cartesianlineseriesspec">CartesianLineSeriesSpec</a></code>、<code><a href="#cartesianscatterseriesspec">CartesianScatterSeriesSpec</a></code>。

### CartesianAxisSpec {#cartesianaxisspec}

坐标轴；时间值写 ISO 8601 字符串。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `scale` | <code>'band' &#124; 'point' &#124; 'linear' &#124; 'log' &#124; 'sqrt' &#124; 'pow' &#124; 'symlog' &#124; 'time' &#124; 'utc'</code> | 可省 | 刻度 | 比例尺；不写按数据推断：带柱或非数值的自变量用 band，日期用 time，数值用 linear。 |
| `domain` | <code>readonly (string &#124; number)&#91;&#93;</code> | 可省 | — | 类目轴的显式顺序。 |
| `min` | <code>number &#124; string</code> | 可省 | — | 下界；时间轴写 ISO 8601 字符串。 |
| `max` | <code>number &#124; string</code> | 可省 | — | 上界；时间轴写 ISO 8601 字符串。 |
| `nice` | <code>boolean</code> | 可省 | — | 两端取整到刻度上，数值轴缺省为真。 |
| `zero` | <code>boolean</code> | 可省 | — | 数值轴包含 0；有柱系列时总是包含。 |
| `ticks` | <code>number</code> | 可省 | — | 刻度数量提示。 |
| `format` | <code><a href="#formatspec">FormatSpec</a></code> | 可省 | 格式 | 刻度标签的格式。 |
| `title` | <code>string</code> | 可省 | 标题 | 轴标题。 |
| `grid` | <code>boolean</code> | 可省 | — | 画网格线；不写时数值轴画、类目轴不画。 |
| `labelOverflow` | <code>'auto' &#124; 'rotate' &#124; 'truncate' &#124; 'wrap'</code> | 可省 | — | 刻度标签放不下时：自动、旋转、截断或折行。 |
| `reverse` | <code>boolean</code> | 可省 | — | 反向。 |
| `exponent` | <code>number</code> | 可省 | — | pow 轴的指数，正数，缺省 1。 |
| `constant` | <code>number</code> | 可省 | — | symlog 轴 sign(x) · log1p(\|x\| / c) 里的 c，正数，缺省 1；越小越接近对数，越大越接近线性。 |
| `timeZone` | <code>string</code> | 可省 | — | 时间轴按哪个时区（IANA 名）排刻度、写标签；不写时 time 轴按运行环境所在时区，utc 轴按 UTC。 |
| `minSize` | <code>number</code> | 可省 | — | 这根轴（刻度、标签与标题）至少占的厚度（px）：上下叠放的几张图写同一个值，绘图区的左边就对齐。 |
| `ordinal` | <code>boolean</code> | 可省 | — | 只用于横轴：数据点等距排列，跳过没有数据的时段；比例尺须为 time、utc 或 linear。 |
| `fit` | <code>'all' &#124; 'window'</code> | 可省 | — | 只用于纵轴：定义域按全部数据（all，缺省）还是只按缩放窗口里露出的数据（window）算。 |

### CartesianAnnotationSpec {#cartesianannotationspec}

注释；axis 的 x 是自变量轴，y 是数值轴。series 写系列 id。

类型：<code>&#124; { readonly kind: 'line', readonly axis: 'x' &#124; 'y', readonly value: number &#124; string, readonly label?: string } &#124; { readonly kind: 'band', readonly axis: 'x' &#124; 'y', readonly from: number &#124; string, readonly to: number &#124; string, readonly label?: string } &#124; { readonly kind: 'point', readonly series: string, readonly at: 'max' &#124; 'min' &#124; 'last' &#124; { readonly x: number &#124; string }, readonly label?: string } &#124; { readonly kind: 'average', readonly series: string, readonly label?: string } &#124; { readonly kind: 'trend', readonly series: string, readonly method: 'linear' &#124; 'moving-average', readonly window?: number, readonly label?: string }</code>

### CartesianChartSpec {#cartesianchartspec}

笛卡尔图：柱、折线、面积、散点。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'cartesian'</code> | 是 | 类型 |  |
| `series` | <code>readonly <a href="#cartesianseriesspec">CartesianSeriesSpec</a>&#91;&#93;</code> | 是 | — | 各系列：柱、折线与散点可以混排。 |
| `splitBy` | <code>string</code> | 可省 | 拆分系列 | 拆分维度：每个系列按这个维度的每个成员各展开一条。 |
| `orientation` | <code>'vertical' &#124; 'horizontal'</code> | 可省 | 方向 |  |
| `xAxis` | <code><a href="#cartesianaxisspec">CartesianAxisSpec</a></code> | 可省 | — | 横轴（自变量轴）；orientation 为 horizontal 时画在左侧。 |
| `yAxis` | <code><a href="#cartesianaxisspec">CartesianAxisSpec</a></code> | 可省 | — | 纵轴（数值轴）。 |
| `renderer` | <code>'svg' &#124; 'canvas' &#124; 'auto'</code> | 可省 | 渲染方式 |  |
| `trigger` | <code>'axis' &#124; 'item'</code> | 可省 | 提示框触发 |  |
| `totals` | <code>boolean</code> | 可省 | 显示合计 |  |
| `tooltipOrder` | <code>'series' &#124; 'descending' &#124; 'ascending'</code> | 可省 | 提示框排序 |  |
| `palette` | <code><a href="#chartpalette">ChartPalette</a></code> | 可省 | 色板 |  |
| `annotations` | <code>readonly <a href="#cartesianannotationspec">CartesianAnnotationSpec</a>&#91;&#93;</code> | 可省 | 标注 |  |
| `zoom` | <code>'none' &#124; 'x' &#124; 'y' &#124; 'xy'</code> | 可省 | 缩放 |  |
| `brush` | <code>'none' &#124; 'x' &#124; 'y' &#124; 'xy'</code> | 可省 | 刷选 |  |

### PieChartSpec {#piechartspec}

饼图：每个维度成员一个扇区。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'pie'</code> | 是 | 类型 |  |
| `nameField` | <code>string</code> | 是 | 名称维度 | 扇区名：维度 id。 |
| `valueField` | <code>string</code> | 是 | 数值度量 | 数值：度量 id。 |
| `variant` | <code>'pie' &#124; 'donut'</code> | 可省 | 形态 |  |
| `rose` | <code>boolean</code> | 可省 | 玫瑰图 |  |
| `sweep` | <code>'full' &#124; 'half'</code> | 可省 | 扇区范围 |  |
| `sort` | <code>'none' &#124; 'descending'</code> | 可省 | 排序 |  |
| `maxSlices` | <code>number</code> | 可省 | 最多扇区数 |  |
| `labels` | <code>'none' &#124; 'inside' &#124; 'outside'</code> | 可省 | 标签 |  |
| `labelContent` | <code>'name-share' &#124; 'name-value' &#124; 'name' &#124; 'share' &#124; 'value'</code> | 可省 | 标签内容 |  |
| `format` | <code><a href="#numericformatspec">NumericFormatSpec</a></code> | 可省 | 格式 |  |

### FunnelChartSpec {#funnelchartspec}

漏斗图：每个维度成员一个阶段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'funnel'</code> | 是 | 类型 |  |
| `nameField` | <code>string</code> | 是 | 名称维度 | 阶段名：维度 id。 |
| `valueField` | <code>string</code> | 是 | 数值度量 | 数值：度量 id。 |
| `shape` | <code>'trapezoid' &#124; 'bar'</code> | 可省 | 形状 |  |
| `align` | <code>'center' &#124; 'start'</code> | 可省 | 对齐 |  |
| `direction` | <code>'down' &#124; 'up'</code> | 可省 | 方向 |  |
| `conversion` | <code>'previous' &#124; 'first' &#124; 'none'</code> | 可省 | 转化率 |  |
| `labels` | <code>'inside' &#124; 'outside'</code> | 可省 | 标签 |  |
| `palette` | <code><a href="#chartpalette">ChartPalette</a></code> | 可省 | 色板 |  |
| `format` | <code><a href="#numericformatspec">NumericFormatSpec</a></code> | 可省 | 格式 |  |

### RadarIndicatorSpec {#radarindicatorspec}

雷达图的一个指标。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `key` | <code>string</code> | 是 | — | 度量 id。 |
| `label` | <code>string</code> | 可省 | — | 轴上的名字；不写取度量的标题。 |
| `min` | <code>number</code> | 可省 | — | 这根轴的下界；不写按数据算。 |
| `max` | <code>number</code> | 可省 | — | 这根轴的上界；不写按数据算。 |

### RadarChartSpec {#radarchartspec}

雷达图：每个维度成员一个实体，每个指标一根轴。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'radar'</code> | 是 | 类型 |  |
| `nameField` | <code>string</code> | 是 | 名称维度 | 实体名：维度 id。 |
| `indicators` | <code>readonly <a href="#radarindicatorspec">RadarIndicatorSpec</a>&#91;&#93;</code> | 是 | 指标 |  |
| `shape` | <code>'polygon' &#124; 'circle'</code> | 可省 | 形状 |  |
| `area` | <code>boolean</code> | 可省 | 面积 |  |
| `scale` | <code>'shared' &#124; 'independent'</code> | 可省 | 刻度 |  |
| `curve` | <code>'linear' &#124; 'catmull-rom'</code> | 可省 | 曲线 |  |
| `rings` | <code>number</code> | 可省 | 环数 |  |
| `ringLabels` | <code>boolean</code> | 可省 | 环标签 |  |
| `format` | <code><a href="#numericformatspec">NumericFormatSpec</a></code> | 可省 | 格式 |  |

### SankeyChartSpec {#sankeychartspec}

桑基图：每个维度组合一条流带。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'sankey'</code> | 是 | 类型 |  |
| `sourceField` | <code>string</code> | 是 | 源维度 | 源节点：维度 id。 |
| `targetField` | <code>string</code> | 是 | 目标维度 | 目标节点：维度 id。 |
| `valueField` | <code>string</code> | 是 | 数值度量 | 流量：度量 id。 |
| `orientation` | <code>'horizontal' &#124; 'vertical'</code> | 可省 | 方向 |  |
| `nodeAlign` | <code>'justify' &#124; 'start' &#124; 'end' &#124; 'center'</code> | 可省 | 节点对齐 |  |
| `linkColor` | <code>'neutral' &#124; 'source' &#124; 'target' &#124; 'gradient'</code> | 可省 | 连线颜色 |  |
| `nodeSort` | <code>'auto' &#124; 'input'</code> | 可省 | 节点排序 |  |
| `format` | <code><a href="#numericformatspec">NumericFormatSpec</a></code> | 可省 | 格式 |  |

### HeatmapChartSpecBase {#heatmapchartspecbase}

热力图共有的属性。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'heatmap'</code> | 是 | 类型 |  |
| `valueField` | <code>string</code> | 是 | 数值度量 | 数值：度量 id。 |
| `levels` | <code>number</code> | 可省 | 层级 |  |
| `thresholds` | <code>readonly number&#91;&#93;</code> | 可省 | 分档阈值 |  |
| `scale` | <code>'sequential' &#124; 'diverging'</code> | 可省 | 刻度 |  |
| `midpoint` | <code>number</code> | 可省 | 中点 |  |
| `continuous` | <code>boolean</code> | 可省 | 连续色阶 |  |
| `tone` | <code><a href="#charttone">ChartTone</a></code> | 可省 | 语气 |  |
| `palette` | <code><a href="#chartpalette">ChartPalette</a></code> | 可省 | 色板 |  |
| `size` | <code><a href="#chartsize">ChartSize</a></code> | 可省 | 尺寸 |  |

### HeatmapDateChartSpec {#heatmapdatechartspec}

日期热力图：calendar 连续周列，month 按自然月分块。

继承 <code><a href="#heatmapchartspecbase">HeatmapChartSpecBase</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `variant` | <code>'calendar' &#124; 'month'</code> | 是 | 形态 |  |
| `dateField` | <code>string</code> | 是 | 日期维度 | 日期：维度 id，键为 YYYY-MM-DD。 |
| `startDate` | <code>string</code> | 可省 | 开始日期 | 区间起点（含），YYYY-MM-DD；不写取数据里最早的日期。 |
| `endDate` | <code>string</code> | 可省 | 结束日期 | 区间终点（含），YYYY-MM-DD；不写取数据里最晚的日期。 |
| `firstDayOfWeek` | <code>number</code> | 可省 | 每周第一天 | 周首日，0 = 星期日。 |

### HeatmapMatrixChartSpec {#heatmapmatrixchartspec}

矩阵热力图：行列各是一个维度。

继承 <code><a href="#heatmapchartspecbase">HeatmapChartSpecBase</a></code> 的字段。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `variant` | <code>'matrix'</code> | 是 | 形态 |  |
| `rowField` | <code>string</code> | 是 | 行维度 | 行：维度 id。 |
| `columnField` | <code>string</code> | 是 | 列维度 | 列：维度 id。 |

### HeatmapChartSpec {#heatmapchartspec}

热力图：日历（含按月）或矩阵。

取其一：<code><a href="#heatmapdatechartspec">HeatmapDateChartSpec</a></code>、<code><a href="#heatmapmatrixchartspec">HeatmapMatrixChartSpec</a></code>。

### HierarchyChartSpec {#hierarchychartspec}

层级图：维度依次是由上到下的层。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `type` | <code>'hierarchy'</code> | 是 | 类型 |  |
| `levels` | <code>readonly string&#91;&#93;</code> | 是 | 层级 | 各层：维度 id，由上到下。 |
| `valueField` | <code>string</code> | 是 | 数值度量 | 数值：度量 id。 |
| `layout` | <code>'treemap' &#124; 'sunburst' &#124; 'icicle' &#124; 'pack'</code> | 可省 | 布局 |  |
| `tile` | <code>'squarify' &#124; 'binary' &#124; 'slice-dice'</code> | 可省 | 切分方式 |  |
| `depth` | <code>number</code> | 可省 | 展开层数 |  |
| `colorBy` | <code>'branch' &#124; 'value' &#124; 'uniform'</code> | 可省 | 着色依据 |  |
| `palette` | <code><a href="#chartpalette">ChartPalette</a></code> | 可省 | 色板 |  |
| `orientation` | <code>'vertical' &#124; 'horizontal'</code> | 可省 | 方向 |  |
| `format` | <code><a href="#numericformatspec">NumericFormatSpec</a></code> | 可省 | 格式 |  |

### ChartSpec {#chartspec}

图表配置，按 type 分。

取其一：<code><a href="#cartesianchartspec">CartesianChartSpec</a></code>、<code><a href="#piechartspec">PieChartSpec</a></code>、<code><a href="#funnelchartspec">FunnelChartSpec</a></code>、<code><a href="#radarchartspec">RadarChartSpec</a></code>、<code><a href="#sankeychartspec">SankeyChartSpec</a></code>、<code><a href="#heatmapchartspec">HeatmapChartSpec</a></code>、<code><a href="#hierarchychartspec">HierarchyChartSpec</a></code>。

### SparklineSpec {#sparklinespec}

迷你图：指标卡片里的走势。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `x` | <code>string</code> | 是 | 横坐标 | 横坐标：维度 id。 |
| `y` | <code>string</code> | 是 | 纵坐标 | 数值：度量 id。 |
| `variant` | <code>'line' &#124; 'area' &#124; 'bar' &#124; 'win-loss'</code> | 可省 | 形态 |  |
| `curve` | <code>'linear' &#124; 'monotone'</code> | 可省 | 曲线 |  |
| `markers` | <code>'none' &#124; 'last' &#124; 'extremes'</code> | 可省 | — | 标出哪些点：不标、末点或最高最低点。 |
| `band` | <code>readonly &#91;number, number&#93;</code> | 可省 | — | 参考带 [下界, 上界]。 |
| `reference` | <code>number &#124; 'mean' &#124; 'median'</code> | 可省 | — | 参考线：固定值，或按数据算出的均值 / 中位数。 |
| `tone` | <code><a href="#charttone">ChartTone</a></code> | 可省 | 语气 |  |

### MetricSpec {#metricspec}

指标卡片：一个汇总值，可带对比与走势。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `value` | <code>string</code> | 是 | 数值 | 显示的值：度量 id，取查询的总计。 |
| `baseline` | <code>string</code> | 可省 | 基准值 | 对比基准：度量 id，取查询的总计；与 value 比出涨跌。 |
| `prefix` | <code>string</code> | 可省 | 前缀 |  |
| `suffix` | <code>string</code> | 可省 | 后缀 |  |
| `format` | <code><a href="#numericformatspec">NumericFormatSpec</a></code> | 可省 | 格式 |  |
| `size` | <code><a href="#chartsize">ChartSize</a></code> | 可省 | 尺寸 |  |
| `tone` | <code><a href="#charttone">ChartTone</a></code> | 可省 | 语气 |  |
| `sparkline` | <code><a href="#sparklinespec">SparklineSpec</a></code> | 可省 | — | 迷你图；不写不画。 |

## 取值

### ScalarValue {#scalarvalue}

JSON 标量：模板里能写下的单个值。

类型：<code>JsonPrimitive</code>

### JsonValue {#jsonvalue}

转导出自 `@xihan-ui/core/json`。

### DataRow {#datarow}

一行数据：字段名到值。core 只读不写。

类型：<code>Readonly&lt;Record&lt;string, unknown&gt;&gt;</code>

### ParameterValue {#parametervalue}

参数的取值：单值，或多选参数的值数组。

类型：<code><a href="#scalarvalue">ScalarValue</a> &#124; readonly <a href="#scalarvalue">ScalarValue</a>&#91;&#93;</code>

### ParameterValues {#parametervalues}

一组参数取值：参数名到值。

类型：<code>Readonly&lt;Record&lt;string, <a href="#parametervalue">ParameterValue</a>&gt;&gt;</code>

### FieldType {#fieldtype}

字段类型。date 是日期（YYYY-MM-DD），datetime 是日期时间；两者的值可以是 ISO 8601 字符串、毫秒时间戳或 Date。

取值见常量 `FIELD_TYPES`：

| 取值 | 中文名 |
| --- | --- |
| `string` | 文本 |
| `number` | 数值 |
| `boolean` | 布尔 |
| `date` | 日期 |
| `datetime` | 日期时间 |

## 值格式

### DateFormatSpec {#dateformatspec}

转导出自 `@xihan-ui/expression`。

### FormatRounding {#formatrounding}

转导出自 `@xihan-ui/expression`。

### FormatSpec {#formatspec}

转导出自 `@xihan-ui/expression`。

### NumberFormatSpec {#numberformatspec}

转导出自 `@xihan-ui/expression`。

### PercentFormatSpec {#percentformatspec}

转导出自 `@xihan-ui/expression`。

### RmbUpperFormatSpec {#rmbupperformatspec}

转导出自 `@xihan-ui/expression`。

### NumericFormatSpec {#numericformatspec}

图表数值用的格式说明：数字或百分比。

取其一：<code><a href="#numberformatspec">NumberFormatSpec</a></code>、<code><a href="#percentformatspec">PercentFormatSpec</a></code>。

## 扩展数据

### ReportExtensionKind {#reportextensionkind}

扩展登记的卡片与视图种类名：扩展 id 的末段、一个点、名字，如 gantt.timeline。内置种类不带点。

类型：<code>`${string}.${string}`</code>

### ReportExtensionData {#reportextensiondata}

对象上各扩展自己的数据：键是扩展 id，值归那个扩展；校验只查它与每一块都是对象，里面不看。

类型：<code>Readonly&lt;Record&lt;string, JsonObject&gt;&gt;</code>

### ReportExtensible {#reportextensible}

能带扩展数据的对象：文档、数据集、字段、参数、视图、卡片、各列表项与联动。

| 字段 | 类型 | 必填 | 中文名 | 说明 |
| --- | --- | --- | --- | --- |
| `extensions` | <code><a href="#reportextensiondata">ReportExtensionData</a></code> | 可省 | — | 各扩展自己的数据：键是扩展 id，值是 JSON 对象；编辑与剪贴板原样带过去。 |
