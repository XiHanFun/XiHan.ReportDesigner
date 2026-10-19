# 模型层 core

<!-- 本页由 docs/scripts/gen-reference.mjs 从源码生成，不要手改；源码变了之后在 docs/ 运行 pnpm gen。 -->

`@xihan-report/core` 是纯 TypeScript 的模型层：报表定义的类型、校验、取数请求、计算、编辑操作与扩展的合并，不依赖 DOM，浏览器、Node.js 与其它 JavaScript 运行环境里都能用。报表定义的字段见[报表定义类型](./schema)，属性见[属性](./properties)。下表按源码模块列出全部导出。

## 全部导出

### binding-plans

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `FillBindingsOptions` | 接口 | 补全绑定的选项。 |
| `planFillBindings` | 函数 | 补全一张卡片的必填绑定：取数形状为 query 的卡片交给它种类的 fillBindings，拿到查询里现有的维度与度量 id。 |

### card-data

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `bodyQuery` | 函数 | 扩展视图作主体时的查询：取数形状为 query 的扩展视图；别的主体为 undefined。 |
| `cardDataset` | 函数 | 卡片取数的数据集 id；不取数的卡片为 undefined。 |
| `cardQuery` | 函数 | 卡片的查询：图表与指标卡片，或取数形状为 query 的扩展卡片；别的卡片为 undefined。 |
| `cardView` | 函数 | 卡片带的视图：表格卡片，或取数形状为 view 的扩展卡片；别的卡片为 undefined。 |
| `isDataView` | 函数 | 主体是不是明细表、分组报表或交叉表。 |
| `QueryBinding` | 接口 | 带查询的取数部分：数据集、参数绑定与聚合查询。 |

### card-templates

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `cardTemplate` | 函数 | 新卡片的模板：取数用 dataset，查询、图表与视图里的字段绑定都留空（空字符串或空列表），由设计器随后填上。 |
| `CardTemplate` | 类型 | 内置种类的新卡片模板。 |
| `cardTypeOf` | 函数 | 卡片的种类：内置的按图表或视图类型细分，扩展卡片就是它的种类名。 |
| `REPORT_CARD_TYPES` | 常量 | 全部卡片种类：图表、指标、表格依次排列。 |
| `ReportCardType` | 类型 | 卡片种类：chart.&lt;图表类型&gt;、metric、table.&lt;视图类型&gt;。 |

### data-plans

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `DataCascade` | 接口 | 删除时一并删掉的别处：列表项、筛选条件、明细排序、联动目标（目标删空时连同联动）与参数绑定。 |
| `DataRemoval` | 接口 | 删除计划：操作合为一步撤销，cascade 是一并删掉的别处的数目。 |
| `datasetUsage` | 函数 | 使用这个数据集的卡片与视图的数目。 |
| `planRemoveDataset` | 函数 | 删除数据集；还有卡片或视图使用它时抛 RangeError，数据集不存在时也抛 RangeError。 |
| `planRemoveField` | 函数 | 删除字段：取这个字段的列表项走 planRemoveItem 一并删掉（连带它们的引用），绑定这个数据集的对象里以它为字段的筛选条件、明细排序与联动目标也删掉（目标删空的联动整条删掉），最后 removeField。 |
| `planRemoveParameter` | 函数 | 删除报表参数：以它为操作数的筛选条件与引用它的参数绑定一并删掉，最后 removeParameter。 |
| `planRenameParameter` | 函数 | 报表参数改名：updateParameter，并把引用它的地方一起改掉——筛选条件的操作数、参数绑定，以及计算字段、公式度量与列汇总公式里的 $名字。 |

### engine/aggregate

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `createRollupAccumulator` | 函数 | 已聚合值的再汇总累加器：sum 与 count 相加，min / max 取最值，规则同 createAccumulator。 |
| `isAdditive` | 函数 | 聚合方式能否由已聚合值再汇总得到。 |
| `NEEDS_ROLLUP` | 常量 | 已聚合值无法再汇总、需要使用方另给汇总值的标记。 |

### engine/chart-data

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `CartesianChartData` | 接口 | 直角坐标图的数据：rows 是所有系列共用的数据行。 |
| `CartesianSeriesData` | 接口 | 直角坐标图的一条系列。 |
| `chartData` | 函数 | 把查询结果整成图表的数据。 |
| `ChartData` | 类型 | 交给图表渲染的数据，形状随图表类型。 |
| `DateHeatmapData` | 接口 | 日期热力图的数据：每天一格，日期写 YYYY-MM-DD。 |
| `HierarchyChartData` | 接口 | 层级图的数据：扁平的节点表，次序是父在子前。 |
| `HierarchyNodeData` | 接口 | 层级图的一个节点：根节点的 parent 为 null，叶子带数值。 |
| `MatrixHeatmapData` | 接口 | 矩阵热力图的数据：行与列按首次出现的次序。 |
| `RowsChartData` | 接口 | 饼图、漏斗图、雷达图的数据：查询行原样使用，字段按规格取。 |
| `SankeyChartData` | 接口 | 桑基图的数据：节点按首次出现的次序，同值的源与目标是同一个节点。 |

### engine/compute

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `CardResult` | 接口 | 一张卡片的计算结果：value 的形状由种类定，内置的图表是 ChartData、指标是 MetricValue、表格是 ViewResult。 |
| `computeCard` | 函数 | 按种类计算一张卡片：先按取数形状跑查询或视图，再交给种类的 compute。 |
| `computeExtensionView` | 函数 | 按种类计算作主体的扩展视图，规则同 computeCard。 |
| `computeView` | 函数 | 按视图类型计算明细表、分组报表或交叉表。 |
| `ExtensionViewResult` | 接口 | 作主体的扩展视图的计算结果：value 的形状由种类定。 |
| `ViewResult` | 类型 | 一个数据视图的计算结果。 |

### engine/context

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `ComputeEnvironment` | 接口 | 一次计算的环境。 |
| `ComputeOptions` | 接口 | 计算选项。 |

### engine/crosstab

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `buildCrosstab` | 函数 | 计算交叉表：行维度与列维度交叉，每格写各度量的聚合值。 |
| `CrosstabHeader` | 接口 | 交叉表一条轴上的一项。 |
| `CrosstabResult` | 接口 | 交叉表的计算结果。 |

### engine/crosstab-axis

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `crosstabAxes` | 函数 | 交叉表两条轴的表头结构。 |
| `CrosstabAxes` | 接口 | 交叉表两条轴的表头结构。 |
| `CrosstabAxis` | 接口 | 一条轴的表头结构。 |
| `CrosstabAxisNode` | 接口 | 表头树的一个节点：一个标签占一格或合并的一片。 |
| `CrosstabLabel` | 类型 | 表头上的一个标签；id 相同的相邻标签合成一格。 |
| `CrosstabLeaf` | 接口 | 轴上的一个叶子：交叉表的一行或一列。 |

### engine/cube

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `isAggregateMeasure` | 函数 | 度量是否为聚合度量。 |

### engine/dashboard

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `cardDimension` | 函数 | 卡片上的一个维度：图表与指标卡片是查询的维度，表格卡片按视图类型是明细表的列、分组报表的分组、交叉表的行列维度。 |
| `CardDimension` | 接口 | 卡片上一个可发出取值的维度。 |
| `computeMetric` | 函数 | 指标卡片的取值：从查询总计里取 value 与 baseline，比出涨跌与变化率。 |
| `findCard` | 函数 | 按 id 找卡片。 |
| `LinkSelections` | 类型 | 联动的选中值：联动 id 到源维度上选中的取值；空数组或缺项表示没有选中。 |
| `MetricResult` | 接口 | 指标卡片的取值。 |
| `resolveLinkFilters` | 函数 | 把联动的选中值换成各目标卡片的筛选条件：每个目标得到 field in 选中值，源维度带日期粒度时条件带同一粒度。 |

### engine/date

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `createDateTools` | 函数 | 建一组绑定时区的日期工具。 |
| `DateTools` | 接口 | 绑定了时区的日期工具。 |

### engine/errors

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `ComputeErrorCode` | 类型 | 计算错误码。 |
| `ReportComputeError` | 类 | 计算错误：message 即错误码，定位与取值放在 params 里。 |

### engine/filter

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `compileFilter` | 函数 | 把筛选编译成行谓词。 |
| `FilterEnvironment` | 接口 | 编译筛选需要的环境。 |
| `isEmptyOperand` | 函数 | 操作数为空：缺失值，或去掉缺失元素后为空的数组。 |
| `isFilterGroup` | 函数 | 判断一个节点是否为子组。 |
| `resolveOperand` | 函数 | 操作数的值：参数引用取参数值，未给值的参数为 undefined。 |
| `RowPredicate` | 类型 | 行谓词。 |

### engine/formula

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `applyCalculatedFields` | 函数 | 给每行算出计算字段，返回新的行数组；数据集没有计算字段时原样返回。 |

### engine/parameters

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `PARAMETER_ISSUE_CODES` | 常量 | 参数取值的问题码。 |
| `ParameterIssueCode` | 类型 | 参数取值的问题码。 |
| `ResolvedParameters` | 接口 | 解析后的参数取值。 |
| `resolveParameters` | 函数 | 解析报表参数的取值：输入里没有的参数取缺省值，输入写 null 表示不给值。 |

### engine/query

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `QueryResult` | 接口 | 查询结果。 |
| `runQuery` | 函数 | 执行聚合查询。 |

### engine/request

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `createDatasetRequest` | 函数 | 生成取数请求。 |
| `findDataset` | 函数 | 按 id 找数据集。 |
| `RequestOptions` | 接口 | 生成取数请求的选项。 |
| `RequestSource` | 类型 | 取数的来源：明细表、分组报表、交叉表，或带查询的卡片与扩展视图。 |

### engine/sort

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `sortRows` | 函数 | 按明细排序规则排序行，返回新数组。 |

### engine/table

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `buildGroupReport` | 函数 | 计算分组报表：逐级分组，每组算出带汇总的列的小计。 |
| `buildTable` | 函数 | 计算明细表：算出计算字段、筛选、排序、汇总，再截取。 |
| `GroupNode` | 接口 | 分组报表里的一个组。 |
| `GroupReportResult` | 接口 | 分组报表的计算结果。 |
| `TableResult` | 接口 | 明细表的计算结果。 |

### expression

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `CompiledExpression` | 类型 | 转导出自 @xihan-ui/expression |
| `EngineCompileOptions` | 类型 | 转导出自 @xihan-ui/expression |
| `EngineCompileResult` | 类型 | 转导出自 @xihan-ui/expression |
| `EngineEvaluation` | 类型 | 转导出自 @xihan-ui/expression |
| `ExpressionEngine` | 类型 | 转导出自 @xihan-ui/expression |
| `ExpressionIssue` | 类型 | 转导出自 @xihan-ui/expression |

### extensions

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `createReportModel` | 函数 | 合出报表模型：内置扩展 REPORT_CORE_EXTENSION 在前，extensions 按顺序在后。 |
| `MetricValue` | 接口 | 指标卡片的计算结果。 |
| `REPORT_CORE_EXTENSION` | 常量 | 内置的卡片、主体视图与编辑方式。 |
| `REPORT_CORE_EXTENSION_ID` | 常量 | 内置扩展的 id。 |
| `REPORT_EXTENSION_SPACES` | 常量 | 报表各层扩展共用的名字空间：卡片种类、视图种类、追加属性与文档级属性的路径。 |
| `ReportCardData` | 类型 | 卡片种类的取数形状：query 同图表与指标卡片（卡片上有 dataset、parameters 与 query），view 同表格卡片（带一个明细表、分组报表或交叉表），none 不取数。 |
| `ReportCardKind` | 接口 | 一种卡片。 |
| `ReportCoreExtension` | 接口 | 报表 core 层的扩展。 |
| `ReportKindCheck` | 接口 | 种类校验拿到的上下文：公共字段与取数部分 core 已经查过。 |
| `ReportKindEntry` | 接口 | 合并后的一个种类：定义、登记它的扩展 id，以及是不是内置的。 |
| `ReportKindInput` | 接口 | 交给种类计算的取数结果：query 形状是查询结果，view 形状是视图结果，none 两者都没有。 |
| `ReportModel` | 接口 | 一组扩展合出的报表模型。 |
| `ReportPropertyTarget` | 类型 | 属性追加到哪一类对象上：document 之外的键同属性面板的分区——dashboard、card:&lt;种类&gt;、chart:&lt;图表类型&gt;、series、metric、view:&lt;视图类型&gt;、column、group-level、dimension、measure、field、parameter、link。 |
| `ReportQueryIds` | 接口 | 卡片查询里现有的维度与度量 id，按查询里的先后。 |
| `ReportRuleContext` | 接口 | 规则拿到的上下文：合并后的报表模型。 |
| `ReportViewData` | 类型 | 主体视图种类的取数形状：扩展视图只能是 query 或 none；table、group、crosstab、dashboard 是内置四种自己的形状。 |
| `ReportViewKind` | 接口 | 一种主体视图。 |

### grid

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `CardPlacement` | 接口 | 新增卡片的位置：写了 x、y 时放在那里并推开压到的卡片，没写时放到第一个放得下的空位。 |
| `gridItems` | 函数 | 看板上全部卡片的网格位置，次序与卡片相同。 |
| `layoutOperations` | 函数 | 把布局的变化写成一条 layoutCards：before 里有、位置大小变了的卡片；没有变化时为空数组。 |
| `NewCard` | 类型 | 待新增的卡片：layout 只需写大小，位置可以留给 planAddCard 找空位。 |
| `NewExtensionCard` | 接口 | 待新增的扩展卡片：同 ExtensionCard，layout 只需写大小。 |
| `planAddCard` | 函数 | 新增卡片：按 placement 放进网格（推开压到的卡片，缺省整体压实），产出 addCard 与其余卡片的 layoutCards。 |
| `planCardLayout` | 函数 | 拖动或改大小：把卡片放到 target（只改写了的项），压到的卡片向下推开，向下拖过下方卡片时两者对调，之后缺省整体压实。 |
| `planCompactLayout` | 函数 | 压实布局：每张卡片向上移到碰到别的卡片为止，原本重叠的向下推开；没有变化时为空数组。 |
| `planRemoveCard` | 函数 | 删除卡片并清理联动：以它为源的联动整条删除，指向它的目标从联动里去掉，目标删空的联动也删除；之后缺省整体压实。 |

### item-plans

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `planAddFieldItem` | 函数 | 从数据集字段生成一个列表项并加进列表：维度（查询的 dimensions、交叉表的 rows / columns、分组报表的 groups）取这个字段，日期字段缺省按月分桶；度量里数值字段缺省 sum，其余缺省 count；明细表与分组报表的列只取字段。 |
| `planRemoveItem` | 函数 | 删除列表项，并清理对它的引用：以这张卡片为源、在它上面发出取值的联动删除；引用它的直角坐标系列删除，雷达指标与层级从数组里去掉，可选的引用（splitBy、气泡大小与颜色、指标基准值）删掉属性，引用它的迷你图删掉；查询排序的规则与各处的 sort.by 去掉，标注里指向被删系列的去掉。 |
| `planRenameField` | 函数 | 字段改名：updateField，并把绑定这个数据集的视图与查询里引用它的地方一起改掉——列、分组、维度与度量的 field，筛选条件与明细排序的 field、目标卡片绑定这个数据集的联动目标的 field，以及同一数据集里计算字段公式对它的引用。 |
| `planRenameItem` | 函数 | 列表项改 id：updateItem，并把别处对它的引用一起改掉——图表与指标配置里引用它的字段、查询排序的 key 与维度排序的 by、分组的 sort.by（列）、交叉表维度的 sort.by（度量）、直角坐标图标注的 series，以及以这张卡片为源、在它上面发出取值的联动。 |

### operations/apply

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `applyOperation` | 函数 | 以纯函数方式执行编辑操作：不修改传入的文档，返回新文档与逆操作数组；没有改到的部分沿用原引用。 |
| `applyOperations` | 函数 | 按顺序执行一组编辑操作，整体成功或整体失败（@xihan-ui/designer-kit 的 applyInSequence）；逆操作为各操作逆操作按相反顺序的拼接。 |

### operations/describe

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `describeReportStep` | 函数 | 撤销栈里一步的说明素材：按第一个操作定动作与对象种类，同一步里同动作、同种类的操作合起来计个数；只改了一个对象时带上它的名字（标题，没有时取 id 或字段名）。 |
| `ReportStep` | 接口 | 一步的说明素材。 |
| `ReportStepAction` | 类型 | 一步里的动作。 |
| `ReportStepKind` | 类型 | 一步改的对象种类，与设计器文案 objectKinds 的键同一组。 |

### operations/errors

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `ReportOperationError` | 类 | 操作无法应用时抛出的错误：message 即错误码，输入文档保持不变。 |
| `ReportOperationErrorCode` | 类型 | 操作失败的原因： |

### operations/path

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `itemKey` | 函数 | 数组项的键：id，没有 id 时取 name；都不是字符串时为 undefined。 |
| `readPath` | 函数 | 读取路径处的值；路径不存在时为 undefined，路径段不合法（负数、小数、原型键）时抛 JsonPathError。 |

### operations/types

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `AddCardOperation` | 接口 | 新增卡片，index 缺省放在末尾；位置大小写在卡片的 layout 里。 |
| `AddDatasetOperation` | 接口 | 新增数据集，index 缺省放在末尾。 |
| `AddFieldOperation` | 接口 | 在数据集里新增字段，index 缺省放在末尾。 |
| `AddItemOperation` | 接口 | 在列表里新增一项，index 缺省放在末尾。 |
| `AddLinkOperation` | 接口 | 新增联动，index 缺省放在末尾。 |
| `AddParameterOperation` | 接口 | 新增报表参数，index 缺省放在末尾。 |
| `ItemList` | 类型 | 视图或查询里的列表：明细表的 columns；分组报表的 groups、columns；交叉表的 rows、columns、measures；图表与指标卡片查询的 dimensions、measures；直角坐标图的 series。 |
| `ItemOwner` | 接口 | 列表项的所在：card 缺省时是报表主体的视图；表格卡片是它的视图，图表与指标卡片是它的查询，series 是直角坐标图的配置。 |
| `LayoutCardsOperation` | 接口 | 一次改多张卡片的位置大小。 |
| `MoveDatasetOperation` | 接口 | 把数据集移到 index。 |
| `MoveFieldOperation` | 接口 | 把数据集里的字段移到 index。 |
| `MoveItemOperation` | 接口 | 把列表项移到 index；写了 to 时移到同一视图的另一个列表，如交叉表的行维度换到列维度。 |
| `MoveParameterOperation` | 接口 | 把报表参数移到 index。 |
| `PropertyChange` | 接口 | 一处属性修改：path 相对被修改的对象，写法同 ReportPath；value 不写表示删除该属性。 |
| `RemoveCardOperation` | 接口 | 删除卡片；引用它的联动不随之改动，用 planRemoveCard 一并清理。 |
| `RemoveDatasetOperation` | 接口 | 删除数据集；用着它的卡片、视图与联动不一并改，要连带删除时用 planRemoveDataset。 |
| `RemoveFieldOperation` | 接口 | 删除数据集里的字段；引用它的地方不一并改，要连带删除时用 planRemoveField。 |
| `RemoveItemOperation` | 接口 | 删除报表主体或卡片里某个列表的一项。 |
| `RemoveLinkOperation` | 接口 | 删除看板的联动。 |
| `RemoveParameterOperation` | 接口 | 删除报表参数；引用它的地方不一并改，要连带删除时用 planRemoveParameter。 |
| `ReportOperation` | 类型 | 编辑操作。 |
| `ReportOperationResult` | 类型 | 操作结果，即 @xihan-ui/designer-kit 的 OperationResult：新文档，以及按顺序作用于新文档即可还原出传入文档的逆操作。 |
| `ReportOperationType` | 类型 | 编辑操作的种类。 |
| `ReportPath` | 类型 | 报表里的路径：字符串段是对象的属性名，或数组里带 id（没有 id 时取 name）的那一项；数字段是数组下标。 |
| `SetBodyOperation` | 接口 | 换掉报表主体，用来改报表的类型。 |
| `UpdateCardOperation` | 接口 | 修改卡片；不能修改 id、kind 与 layout（位置大小用 layoutCards）。 |
| `UpdateDashboardOperation` | 接口 | 修改看板本身（网格）；不能修改 type、cards 与 links。 |
| `UpdateDatasetOperation` | 接口 | 修改数据集；不能修改 id 与 fields（字段用字段的操作）。 |
| `UpdateDocumentOperation` | 接口 | 修改文档本身的属性；不能修改 schemaVersion、datasets、parameters 与 body。 |
| `UpdateFieldOperation` | 接口 | 修改字段；可以改 name，同一数据集里不能重名。 |
| `UpdateItemOperation` | 接口 | 修改列表项；可以改 id，同一列表里不能重复。 |
| `UpdateLinkOperation` | 接口 | 修改联动；不能修改 id。 |
| `UpdateParameterOperation` | 接口 | 修改报表参数；可以改 name，不能与别的参数重名。 |
| `UpdateViewOperation` | 接口 | 修改视图：card 缺省时是报表主体（须是明细表、分组报表或交叉表），否则是那张表格卡片的视图；不能修改 type。 |

### properties

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `builtinProperties` | 函数 | 某类对象的内置属性；扩展追加的属性不能与它们同路径。 |
| `cardProperties` | 函数 | 卡片自身的属性：标题、说明；带查询的卡片（图表、指标，或取数形状为 query 的扩展卡片）还有数据集、参数绑定与查询的筛选、行数上限。 |
| `chartProperties` | 函数 | 图表配置的属性，路径相对图表配置；直角坐标图的系列另用 seriesProperties。 |
| `dashboardProperties` | 函数 | 看板本身的属性：网格的列数与行高（px）。 |
| `datasetFieldProperties` | 函数 | 数据集一个字段的属性，路径相对字段。 |
| `dimensionProperties` | 函数 | 查询或交叉表一个维度的属性，路径相对维度。 |
| `documentProperties` | 函数 | 报表文档的属性：标题与说明。 |
| `extensionViewProperties` | 函数 | 作主体的扩展视图的属性：取数形状为 query 时是取数属性，none 时没有。 |
| `groupLevelProperties` | 函数 | 分组报表一级分组的属性，路径相对分组。 |
| `linkProperties` | 函数 | 看板联动的属性，路径相对联动。 |
| `measureProperties` | 函数 | 一个度量的属性，路径相对度量：写了 formula 的是公式度量，否则是聚合度量。 |
| `metricProperties` | 函数 | 指标卡片配置的属性，路径相对指标配置；迷你图的属性只在写了迷你图时显示。 |
| `parameterProperties` | 函数 | 报表参数的属性，路径相对参数。 |
| `REPORT_PROPERTY_GROUPS` | 常量 | 属性分组的先后。 |
| `ReportPropertyControl` | 类型 | 报表的编辑方式：designer-kit 的内建方式，加上报表自己的几种。 |
| `ReportPropertyDescriptor` | 类型 | 报表的属性描述。 |
| `ReportPropertyGroup` | 类型 | 属性分组。 |
| `seriesProperties` | 函数 | 直角坐标图一个系列的属性，路径相对系列；各标记的专有属性只在该标记下显示。 |
| `tableColumnProperties` | 函数 | 明细表与分组报表一列的属性，路径相对列；汇总写聚合或公式之一。 |
| `viewProperties` | 函数 | 视图的属性，路径相对视图（报表主体或表格卡片的 view）；列表里的项另用各自的描述。 |

### schema/chart

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `CartesianAnnotationSpec` | 类型 | 注释；axis 的 x 是自变量轴，y 是数值轴。 |
| `CartesianAxisSpec` | 接口 | 坐标轴；时间值写 ISO 8601 字符串。 |
| `CartesianBarSeriesSpec` | 接口 | 柱系列。 |
| `CartesianChartSpec` | 接口 | 笛卡尔图：柱、折线、面积、散点。 |
| `CartesianLineSeriesSpec` | 接口 | 折线系列。 |
| `CartesianScatterSeriesSpec` | 接口 | 散点系列：每个维度组合一个点。 |
| `CartesianSeriesSpec` | 类型 | 柱线图的一条系列：柱、折线或散点。 |
| `CartesianSeriesSpecBase` | 接口 | 笛卡尔图系列的共有属性。 |
| `CHART_TYPES` | 常量 | 全部图表类型。 |
| `ChartPalette` | 类型 | 顺序色阶的色板，与 XiHan.UI 的 ChartPalette 一致。 |
| `ChartSize` | 类型 | 尺寸档。 |
| `ChartSpec` | 类型 | 图表配置，按 type 分。 |
| `ChartSymbol` | 类型 | 散点形状：XiHan.UI 图表引擎的 SymbolName。 |
| `ChartTone` | 类型 | 语气：XiHan.UI 的 Tone。 |
| `FunnelChartSpec` | 接口 | 漏斗图：每个维度成员一个阶段。 |
| `HeatmapChartSpec` | 类型 | 热力图：日历（含按月）或矩阵。 |
| `HeatmapChartSpecBase` | 接口 | 热力图共有的属性。 |
| `HeatmapDateChartSpec` | 接口 | 日期热力图：calendar 连续周列，month 按自然月分块。 |
| `HeatmapMatrixChartSpec` | 接口 | 矩阵热力图：行列各是一个维度。 |
| `HierarchyChartSpec` | 接口 | 层级图：维度依次是由上到下的层。 |
| `MetricSpec` | 接口 | 指标卡片：一个汇总值，可带对比与走势。 |
| `PieChartSpec` | 接口 | 饼图：每个维度成员一个扇区。 |
| `RadarChartSpec` | 接口 | 雷达图：每个维度成员一个实体，每个指标一根轴。 |
| `RadarIndicatorSpec` | 接口 | 雷达图的一个指标。 |
| `SankeyChartSpec` | 接口 | 桑基图：每个维度组合一条流带。 |
| `SparklineSpec` | 接口 | 迷你图：指标卡片里的走势。 |

### schema/dataset

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `DatasetAggregated` | 接口 | 已聚合数据：使用方按请求里的 query 在后端聚合并筛选过。 |
| `DatasetData` | 类型 | 使用方交回的数据。 |
| `DatasetField` | 接口 | 数据集里的一个字段。 |
| `DatasetParameter` | 接口 | 数据集接受的一个参数：取数时由使用方的数据源解释。 |
| `DatasetQuery` | 接口 | 视图需要的聚合：使用方可以照此在后端聚合，返回 aggregated 数据。 |
| `DatasetQueryDimension` | 接口 | 取数请求里的一个维度：按 field 分组，写了 bucket 时按日期粒度取键。 |
| `DatasetQueryMeasure` | 接口 | 取数请求里的一个度量：对 field 做 aggregate；count 不写 field 时数行。 |
| `DatasetRequest` | 接口 | 取数请求：core 按视图与参数取值算出，使用方据此取数。 |
| `DatasetRollup` | 接口 | 一条汇总行：按 dimensions 分组的汇总值，键同已聚合行。 |
| `DatasetRows` | 接口 | 明细行：core 负责计算字段、筛选、分组与聚合。 |
| `DatasetSchema` | 接口 | 报表引用的一个数据集。 |

### schema/document

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `ParameterOption` | 接口 | 参数的一个候选项。 |
| `REPORT_SCHEMA_VERSION` | 常量 | 当前的 schema 版本。 |
| `ReportDocument` | 接口 | 报表文档：纯 JSON。 |
| `ReportParameter` | 接口 | 报表参数：报表使用者填写，经绑定传给数据集参数或筛选条件。 |

### schema/extension

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `ReportExtensible` | 接口 | 能带扩展数据的对象：文档、数据集、字段、参数、视图、卡片、各列表项与联动。 |
| `ReportExtensionData` | 类型 | 对象上各扩展自己的数据：键是扩展 id，值归那个扩展；校验只查它与每一块都是对象，里面不看。 |
| `ReportExtensionKind` | 类型 | 扩展登记的卡片与视图种类名：扩展 id 的末段、一个点、名字，如 gantt.timeline。 |

### schema/filter

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `FILTER_OPERATORS` | 常量 | 转导出自 @xihan-ui/viz |
| `FilterCondition` | 接口 | 一个筛选条件。 |
| `FilterGroup` | 接口 | 条件组：and 全部满足，or 任一满足。 |
| `FilterNode` | 类型 | 条件组里的一项：条件或子组。 |
| `FilterOperator` | 类型 | 转导出自 @xihan-ui/viz |
| `FilterSubgroup` | 接口 | 嵌套在条件组里的子组。 |
| `NullsPosition` | 类型 | 转导出自 @xihan-ui/viz |
| `Operand` | 类型 | 操作数：字面值、字面值数组，或报表参数。 |
| `ParameterRef` | 接口 | 引用一个报表参数的值。 |
| `RowSortRule` | 接口 | 明细行的一条排序规则。 |
| `SortDirection` | 类型 | 转导出自 @xihan-ui/viz |

### schema/format

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `DateFormatSpec` | 类型 | 转导出自 @xihan-ui/expression |
| `FormatRounding` | 类型 | 转导出自 @xihan-ui/expression |
| `FormatSpec` | 类型 | 转导出自 @xihan-ui/expression |
| `NumberFormatSpec` | 类型 | 转导出自 @xihan-ui/expression |
| `NumericFormatSpec` | 类型 | 图表数值用的格式说明：数字或百分比。 |
| `PercentFormatSpec` | 类型 | 转导出自 @xihan-ui/expression |
| `RmbUpperFormatSpec` | 类型 | 转导出自 @xihan-ui/expression |

### schema/options

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `ANNOTATION_AXES` | 常量 | 取值：`x`、`y`。 |
| `ANNOTATION_KINDS` | 常量 | 取值：`line`、`band`、`point`、`average`、`trend`。 |
| `ANNOTATION_POINTS` | 常量 | 取值：`max`、`min`、`last`。 |
| `AXIS_FITS` | 常量 | 取值：`all`、`window`。 |
| `AXIS_LABEL_OVERFLOWS` | 常量 | 取值：`auto`、`rotate`、`truncate`、`wrap`。 |
| `AXIS_SCALES` | 常量 | 取值：`band`、`point`、`linear`、`log`、`sqrt`、`pow`、`symlog`、`time`、`utc`。 |
| `BAR_LABELS` | 常量 | 取值：`none`、`inside`、`end`。 |
| `BAR_SHAPES` | 常量 | 取值：`bar`、`lollipop`。 |
| `BAR_STACK_OFFSETS` | 常量 | 取值：`none`、`expand`、`diverging`。 |
| `CARD_KINDS` | 常量 | 取值：`chart`、`metric`、`table`。 |
| `CARTESIAN_ORIENTATIONS` | 常量 | 取值：`vertical`、`horizontal`。 |
| `CHART_INTERACTION_AXES` | 常量 | 缩放与刷选的方向。 |
| `CHART_PALETTES` | 常量 | 取值：`red`、`orange`、`amber`、`yellow`、`lime`、`green`、`teal`、`cyan`、`blue`、`indigo`、`purple`、`pink`、`gray`。 |
| `CHART_RENDERERS` | 常量 | 取值：`svg`、`canvas`、`auto`。 |
| `CHART_SIZES` | 常量 | 取值：`sm`、`md`、`lg`。 |
| `CHART_TONES` | 常量 | 取值：`brand`、`neutral`、`success`、`warning`、`danger`、`info`。 |
| `CHART_TRIGGERS` | 常量 | 取值：`axis`、`item`。 |
| `COLUMN_ALIGNS` | 常量 | 取值：`start`、`center`、`end`。 |
| `COLUMN_STICKY_SIDES` | 常量 | 取值：`start`、`end`。 |
| `FILTER_LOGICS` | 常量 | 取值：`and`、`or`。 |
| `FUNNEL_ALIGNS` | 常量 | 取值：`center`、`start`。 |
| `FUNNEL_CONVERSIONS` | 常量 | 取值：`previous`、`first`、`none`。 |
| `FUNNEL_DIRECTIONS` | 常量 | 取值：`down`、`up`。 |
| `FUNNEL_LABELS` | 常量 | 取值：`inside`、`outside`。 |
| `FUNNEL_SHAPES` | 常量 | 取值：`trapezoid`、`bar`。 |
| `HEATMAP_SCALES` | 常量 | 取值：`sequential`、`diverging`。 |
| `HEATMAP_VARIANTS` | 常量 | 取值：`calendar`、`month`、`matrix`。 |
| `HIERARCHY_COLOR_BY` | 常量 | 取值：`branch`、`value`、`uniform`。 |
| `HIERARCHY_LAYOUTS` | 常量 | 取值：`treemap`、`sunburst`、`icicle`、`pack`。 |
| `HIERARCHY_ORIENTATIONS` | 常量 | 取值：`vertical`、`horizontal`。 |
| `HIERARCHY_TILES` | 常量 | 取值：`squarify`、`binary`、`slice-dice`。 |
| `LINE_CURVES` | 常量 | 取值：`linear`、`monotone`、`step`、`step-before`、`step-after`。 |
| `LINE_LABELS` | 常量 | 取值：`none`、`end`。 |
| `LINE_STACK_OFFSETS` | 常量 | 取值：`none`、`expand`、`silhouette`、`wiggle`。 |
| `LINE_SYMBOLS` | 常量 | 取值：`auto`、`always`、`none`。 |
| `MEASURES_ON` | 常量 | 取值：`columns`、`rows`。 |
| `NULLS_POSITIONS` | 常量 | 取值：`first`、`last`。 |
| `PIE_LABEL_CONTENTS` | 常量 | 取值：`name-share`、`name-value`、`name`、`share`、`value`。 |
| `PIE_LABELS` | 常量 | 取值：`none`、`inside`、`outside`。 |
| `PIE_SORTS` | 常量 | 取值：`none`、`descending`。 |
| `PIE_SWEEPS` | 常量 | 取值：`full`、`half`。 |
| `PIE_VARIANTS` | 常量 | 取值：`pie`、`donut`。 |
| `RADAR_CURVES` | 常量 | 取值：`linear`、`catmull-rom`。 |
| `RADAR_SCALES` | 常量 | 取值：`shared`、`independent`。 |
| `RADAR_SHAPES` | 常量 | 取值：`polygon`、`circle`。 |
| `SANKEY_LINK_COLORS` | 常量 | 取值：`neutral`、`source`、`target`、`gradient`。 |
| `SANKEY_NODE_ALIGNS` | 常量 | 取值：`justify`、`start`、`end`、`center`。 |
| `SANKEY_NODE_SORTS` | 常量 | 取值：`auto`、`input`。 |
| `SANKEY_ORIENTATIONS` | 常量 | 取值：`horizontal`、`vertical`。 |
| `SERIES_MARKS` | 常量 | 取值：`bar`、`line`、`scatter`。 |
| `SORT_DIRECTIONS` | 常量 | 取值：`asc`、`desc`。 |
| `SPARKLINE_CURVES` | 常量 | 取值：`linear`、`monotone`。 |
| `SPARKLINE_MARKERS` | 常量 | 取值：`none`、`last`、`extremes`。 |
| `SPARKLINE_VARIANTS` | 常量 | 取值：`line`、`area`、`bar`、`win-loss`。 |
| `TOOLTIP_ORDERS` | 常量 | 取值：`series`、`descending`、`ascending`。 |
| `TREND_METHODS` | 常量 | 取值：`linear`、`moving-average`。 |

### schema/query

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `AGGREGATE_KINDS` | 常量 | 转导出自 @xihan-ui/viz |
| `AggregateKind` | 类型 | 转导出自 @xihan-ui/viz |
| `AggregateMeasure` | 接口 | 聚合度量：对字段做聚合；count 不写 field 时数行。 |
| `AxisSort` | 接口 | 成员的次序：按键，或按某个度量在该成员上的汇总值。 |
| `DATE_BUCKETS` | 常量 | 全部日期粒度，由粗到细。 |
| `DateBucket` | 类型 | 日期粒度：把日期取成分组键。 |
| `Dimension` | 接口 | 维度：按字段分组。 |
| `FormulaMeasure` | 接口 | 公式度量：在聚合之后，以同一查询其它度量的值与报表参数（$名字）为变量求值。 |
| `Measure` | 类型 | 度量：聚合度量或公式度量。 |
| `MeasureBase` | 接口 | 共有的度量属性。 |
| `QuerySortRule` | 接口 | 查询结果行的一条排序规则。 |
| `ReportQuery` | 接口 | 聚合查询：按维度分组、计算度量，结果每个维度组合一行。 |

### schema/value

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `DataRow` | 类型 | 一行数据：字段名到值。 |
| `FIELD_TYPES` | 常量 | 全部字段类型，按声明次序。 |
| `FieldType` | 类型 | 字段类型。 |
| `JsonValue` | 类型 | 转导出自 @xihan-ui/core/json |
| `ParameterValue` | 类型 | 参数的取值：单值，或多选参数的值数组。 |
| `ParameterValues` | 类型 | 一组参数取值：参数名到值。 |
| `ScalarValue` | 类型 | JSON 标量：模板里能写下的单个值。 |

### schema/view

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `CardBase` | 接口 | 卡片的共有属性。 |
| `CardLayout` | 接口 | 卡片在网格上的位置与大小，单位是格。 |
| `ChartCard` | 接口 | 图表卡片。 |
| `ColumnSummary` | 类型 | 汇总：对列的字段做聚合，或以其它列的汇总值与报表参数（$名字）为变量求公式。 |
| `CrosstabTotals` | 接口 | 交叉表一条轴上的汇总。 |
| `CrosstabView` | 接口 | 交叉表：行维度与列维度交叉，格子里写度量。 |
| `DashboardCard` | 类型 | 看板上的一张卡片：图表、指标、表格，或扩展登记的种类。 |
| `DashboardGrid` | 接口 | 看板网格。 |
| `DashboardLink` | 接口 | 筛选联动：在源卡片上选中的取值，成为目标卡片在对应字段上的 in 条件。 |
| `DashboardView` | 接口 | 看板：网格上排列的卡片。 |
| `DataBinding` | 接口 | 视图取数的数据集与参数绑定。 |
| `DataView` | 类型 | 可以直接取数计算的视图。 |
| `ExtensionCard` | 接口 | 扩展登记的卡片：kind 是带点的种类名。 |
| `ExtensionView` | 接口 | 扩展登记的主体视图：type 是带点的种类名。 |
| `GroupLevel` | 接口 | 分组报表的一级分组。 |
| `GroupView` | 接口 | 分组报表：多级分组，组内列出明细，组尾写小计，末尾写总计。 |
| `LinkTarget` | 接口 | 联动的一个目标：在目标卡片上按字段筛选。 |
| `MetricCard` | 接口 | 指标卡片。 |
| `ReportBody` | 类型 | 报表的主体。 |
| `TableCard` | 接口 | 表格卡片：内嵌一个明细表、分组报表或交叉表。 |
| `TableColumn` | 接口 | 表格的一列。 |
| `TableView` | 接口 | 明细表：逐行列出数据。 |

### validate/checker

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `REPORT_ISSUE_CODES` | 常量 | 报表自己的校验问题码，按字母序；通用问题码见 @xihan-ui/designer-kit/schema 的 CommonIssueCode。 |
| `ValidationIssue` | 类型 | 一条校验问题：path 只用对象键与数组下标，target 指出所在的带键对象。 |
| `ValidationIssueCode` | 类型 | 校验问题码：designer-kit/schema 的通用问题码、报表自己的（REPORT_ISSUE_CODES），以及扩展的问题码（扩展 id 的末段、一个点、码）。 |

### validate/document

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `validateDocument` | 函数 | 校验报表文档，返回全部问题；没有问题时为空数组。 |
| `ValidateOptions` | 接口 | 校验选项。 |
