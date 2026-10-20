# 查看器

<!-- 本页由 docs/scripts/gen-reference.mjs 从源码生成，不要手改；源码变了之后在 docs/ 运行 pnpm gen。 -->

`@xihan-report/runtime` 的公开接口：查看器元素与相关类型。样式在 `@xihan-report/runtime/style.css`。

## `<xh-report-viewer>`

注册 &lt;xh-report-viewer&gt; 与它排出的 UI 元素（按需注册），宿主不必再全量注册 UI 元素。

### 属性

| 属性 | attribute | 类型 | 说明 |
| --- | --- | --- | --- |
| `schema` | — | `ReportDocument \| undefined` | 报表定义。 |
| `dataProvider` | — | `ReportDataProvider \| undefined` | 取数回调。 |
| `expressionEngine` | — | `ExpressionEngine \| undefined` | 表达式引擎：计算字段与公式度量要用。 |
| `extensions` | — | `readonly ReportRuntimeExtension[] \| undefined` | 卡片与视图种类、渲染、叠加层、导出与取数中间件的扩展；赋值时当场合并查重，冲突时退回原值再抛。 |
| `formatter` | — | `ReportFormatter \| undefined` | 值的显示文字；缺省按格式说明调 formatValue。 |
| `parameters` | — | `ParameterValues \| undefined` | 报表参数的取值；不给时用各参数的缺省值。 |
| `selections` | — | `LinkSelections \| undefined` | 看板联动的选中值；给了就是受控。 |
| `locale` | `locale` | `string \| undefined` | BCP 47 语言标记；缺省取全局配置。 |
| `timeZone` | `time-zone` | `string \| undefined` | IANA 时区；缺省取运行环境所在的时区。 |
| `translations` | — | `Partial<ReportViewerTranslations> \| undefined` | 元素自己的文案，压在全局配置之上。 |
| `hideParameters` | `hide-parameters` | `boolean \| undefined` | 不显示参数栏；缺省显示。attribute 写 "false" 是显示，其余写法是不显示。 |

### 存取器

| 属性 | 读写 | 类型 | 说明 |
| --- | --- | --- | --- |
| `issues` | 只读 | `readonly ReportViewerIssue[]` | 最近一次校验报表定义与检查参数得到的问题。 |
| `loading` | 只读 | `boolean` | 是否还有未完成的取数。 |

### 方法

| 方法 | 说明 |
| --- | --- |
| `getResults(): ReportResults` | 此刻的计算结果，只读快照：主体视图或看板上已算好的卡片，以及当时的参数与联动。 |
| `refresh(options?: { readonly cards?: readonly string[] }): Promise<void>` | 重新取数并计算；看板可以只刷新部分卡片。 |
| `clearSelections(): void` | 清除看板联动的选中值。 |
| `export(format: string, options?: Readonly<Record<string, unknown>>): Promise<Blob \| string>` | 导出成文件：交给登记了这种格式的第一个导出器（内置的 xlsx 在最前，扩展可以加别的格式），options 原样交给它。内置的 xlsx 把当前的计算结果写成工作簿：表格主体导出一张表（表名取 options.name，缺省取报表标题），看板按已算好的表格卡片各导一张（表名取卡片标题），写出部分按需加载，还没有可导出的结果时抛 RangeError。没有导出器认这种格式时抛 RangeError。 |

### 事件

事件都是冒泡的 `CustomEvent`。

| 事件 | detail | 说明 |
| --- | --- | --- |
| `issues-change` | `{ issues: readonly ReportViewerIssue[] }` | 报表定义的校验问题或参数的检查问题变了。 |
| `load-error` | `{ card: string \| null, error: unknown }` | 取数或计算出错：card 是出错的卡片，报表主体出错时为 null。 |
| `loading-change` | `{ loading: boolean }` | 开始或结束取数。 |
| `selections-change` | `{ value: LinkSelections }` | 看板联动的选中值变了：value 是联动 id 到选中取值的对照；受控时宿主要把它写回 selections。 |
| `parameters-change` | `{ value: ParameterValues }` | 参数栏改了参数：value 是新的参数取值，清空的参数写 null。 |
| `datum-press` | `{ card: string, link: string \| null, value: unknown, chart: unknown }` | 转发图表卡片的 datum-press：link 与 value 是这次点按对应的联动与源维度上的取值，与联动无关时为 null。 |
| `action` | `{ card: string \| null, link: string \| null, value: unknown } & TableCellRef` | 表格的行主操作（点一格，或焦点行上按 Enter），用来下钻：card 是看板里的表格卡片，报表主体是表格时为 null；kind、column、values 说明点中的那一格（见 TableCellRef）。表格卡片作联动源时，link 与 value 是这次点按对应的联动与源维度上的取值，与联动无关时为 null。 |

## 函数

### defineReportViewer() {#definereportviewer}

```ts
declare function defineReportViewer(): void
```

注册 &lt;xh-report-viewer&gt; 与它排出的 UI 元素（按需注册），宿主不必再全量注册 UI 元素。

## 取数

### ReportDataProvider {#reportdataprovider}

使用方的取数回调：按 core 算出的请求取数，交回明细行或已聚合行。

```ts
type ReportDataProvider = (request: DatasetRequest, context: ReportDataContext) => Promise<DatasetData>
```

### ReportDataContext {#reportdatacontext}

取数时附带的上下文：参数或联动变化、元素卸载时 signal 被取消。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `signal` | `AbortSignal` | 取消信号：这一轮取数作废时触发，取数回调应随之中止请求。 |

## 结果与事件

### ReportResults {#reportresults}

查看器此刻的计算结果，只读快照。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `parameters` | `ParameterValues` | 这一轮取数用到的报表参数取值。 |
| `selections` | `LinkSelections` | 看板联动的选中值。 |
| `body` | `ViewResult \| ExtensionViewResult \| undefined` | 主体视图的结果；主体是看板或还没算好时为 undefined。 |
| `cards` | `readonly { readonly result: CardResult, readonly filters: readonly FilterCondition[] }[]` | 看板上已算好的卡片，按卡片的先后；filters 是它当时收到的联动筛选。 |

### ReportViewerIssue {#reportviewerissue}

查看器报出的问题：报表定义的校验问题与参数的检查问题，都带上 severity。

```ts
type ReportViewerIssue = SchemaIssue<ValidationIssueCode | ParameterIssueCode>
```

### TableCellRef {#tablecellref}

表格里被行主操作点中的那一格在报表里的含义。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `kind` | `'detail' \| 'group' \| 'subtotal'` | 行的种类：明细行（交叉表是成员行）、组头、小计；总计在表尾，不报行主操作。 |
| `column` | `string \| null` | 点中那一格所在的报表列：明细表与分组报表是列 id 或分组 id，交叉表的值格是度量 id、行表头格是行维度 id；焦点行上按 Enter 时为 null。 |
| `values` | `Readonly<Record<string, unknown>>` | 这一行（与点中那一列）在各维度上的取值，键与看板联动的 dimension 同一套写法：明细表是列 id，分组报表是分组 id（明细行另带各列 id），交叉表是行、列维度 id。 |

### ChartPress {#chartpress}

UI 图表派发的 datum-press 明细里查看器用到的字段：图表家族带 seriesId 与 datum，热力图带 date 或 row、column。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `key` | `unknown` | 点中的数据点在图表里的键。 |
| `seriesId?` | `string` | 点中的系列。 |
| `datum?` | `Readonly<Record<string, unknown>>` | 点中的数据行。 |
| `date?` | `string` | 日历热力图点中的日期，YYYY-MM-DD。 |
| `row?` | `string` | 矩阵热力图点中的行。 |
| `column?` | `string` | 矩阵热力图点中的列。 |

## 显示文字

### ReportFormatter {#reportformatter}

把一个值写成显示文字；缺失值由查看器先行处理，不会传进来。

```ts
type ReportFormatter = (value: unknown, format: FormatSpec | undefined, context: ReportFormatContext) => string
```

### ReportFormatContext {#reportformatcontext}

格式化时的上下文。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `locale` | `string \| undefined` | BCP 47 语言标记；没有时按运行环境。 |
| `timeZone` | `string` | IANA 时区：日期按它的墙上时间写。 |
| `type` | `FieldType \| undefined` | 值所在字段的类型；度量、按粒度取键的维度等没有字段类型时为 undefined。 |

### ReportViewerTranslations {#reportviewertranslations}

查看器的内建文案。

文案键是 `xh-report-viewer`，中文在 `@xihan-report/runtime/locale` 的 `reportZhCN` 里。

| 键 | 类型 | 说明 | 中文 |
| --- | --- | --- | --- |
| `label` | `string` | 查看器的可及名。 | 报表 |
| `loading` | `string` |  | 正在加载… |
| `empty` | `string` | 没有数据时的提示。 | 没有数据 |
| `error` | `string` | 取数或计算失败时的提示。 | 数据加载失败 |
| `invalid` | `string` | 报表定义有问题、不能显示时的提示。 | 报表定义有问题，无法显示 |
| `parametersInvalid` | `string` | 报表参数缺少或取值不合格时的提示。 | 报表参数缺少或取值不合格 |
| `total` | `string` | 总计行、总计列的标签。 | 总计 |
| `subtotal` | `string` | 小计行、小计列的标签。 | 小计 |
| `missing` | `string` | 缺失值成员的显示文字。 | （空） |
| `parameters` | `string` | 参数栏的可及名。 | 报表参数 |
| `clearSelections` | `string` | 清除联动选中的按钮。 | 清除联动 |
| `exportXlsx` | `string` | 内置 xlsx 导出器的名字。 | Excel 工作簿 |

## 全部导出

### designer-translations

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `DEFAULT_REPORT_DESIGNER_TRANSLATIONS` | 常量 | 内建英文文案。 |
| `ReportDesignerCascade` | 接口 | 删除数据面板对象时一并删掉的别处的数目。 |
| `ReportDesignerIssueDetails` | 接口 | 问题文案的入参：校验问题的码与参数。 |
| `ReportDesignerTranslations` | 接口 | 设计器的内建文案。 |
| `ReportHistoryStepText` | 接口 | 撤销栈里一步的说明素材：对象种类已按语言取好。 |
| `ReportTourStepKey` | 类型 | 新手引导里报表自己的几步：数据面板、「数据」菜单、字段栏、卡片、联动与预览。 |
| `ReportTourStepText` | 接口 | 引导一步的标题与说明。 |

### extensions

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `createReportRuntimeModel` | 函数 | 合出运行时用的报表模型：core 的合并与查重照旧；渲染、导出器重名时抛 DesignerExtensionError。 |
| `REPORT_RUNTIME_EXTENSION` | 常量 | 运行时内置扩展：三种内置卡片的渲染与 xlsx 导出。 |
| `REPORT_RUNTIME_EXTENSION_ID` | 常量 | 运行时内置扩展的 id。 |
| `ReportCardRenderer` | 类型 | 卡片的渲染：把计算结果画进卡片的内容区。 |
| `ReportDataMiddleware` | 类型 | 取数中间件：拿到下一层的取数回调，返回包在它外面的一层。 |
| `ReportExportContext` | 接口 | 导出时交给导出器的上下文。 |
| `ReportOverlay` | 接口 | 叠加层：铺满看板的一层，画在各卡片之下（below）或之上（above）；只在主体是看板时画。 |
| `ReportOverlayContext` | 接口 | 画叠加层时的上下文。 |
| `ReportRendered` | 类型 | 渲染出的、能接联动与下钻的内容：图表或表格；别的内容为 undefined。 |
| `ReportResults` | 接口 | 查看器此刻的计算结果，只读快照。 |
| `ReportRuntimeExtension` | 接口 | 报表运行时层的扩展。 |
| `ReportRuntimeModel` | 接口 | 运行时用的报表模型：core 的模型加上渲染、导出与取数中间件。 |
| `ReportScene` | 接口 | 叠加层的场景：看板与它上面各卡片的布局和状态。 |
| `ReportSceneCard` | 接口 | 叠加层场景里的一张卡片。 |
| `ReportViewRenderer` | 类型 | 作主体的扩展视图的渲染，规则同卡片。 |

### translations

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `DEFAULT_REPORT_VIEWER_TRANSLATIONS` | 常量 | 内建英文文案。 |
| `ReportViewerTranslations` | 接口 | 查看器的内建文案。 |

### viewer/charts

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `RenderedChart` | 接口 | 渲染好的图表卡片。 |

### viewer/context

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `RenderContext` | 接口 | 渲染上下文。 |

### viewer/format

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `defaultFormatter` | 常量 | 缺省格式化器：有格式说明时用 formatValue（它拒绝的值退回原样文字）；date / datetime 字段写成 timeZone 里的墙上时间（YYYY-MM-DD 或 YYYY-MM-DD HH:mm:ss）；数值按 locale 写千分位；其余写成文本。 |
| `ReportFormatContext` | 接口 | 格式化时的上下文。 |
| `ReportFormatter` | 类型 | 把一个值写成显示文字；缺失值由查看器先行处理，不会传进来。 |

### viewer/report-viewer

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `defineReportViewer` | 函数 | 注册 &lt;xh-report-viewer&gt; 与它排出的 UI 元素（按需注册），宿主不必再全量注册 UI 元素。 |
| `REPORT_VIEWER_TAG` | 常量 | 查看器的标签名。 |
| `ReportDataContext` | 接口 | 取数时附带的上下文：参数或联动变化、元素卸载时 signal 被取消。 |
| `ReportDataProvider` | 类型 | 使用方的取数回调：按 core 算出的请求取数，交回明细行或已聚合行。 |
| `ReportViewerEventMap` | 接口 | 查看器派发的事件。 |
| `ReportViewerIssue` | 类型 | 查看器报出的问题：报表定义的校验问题与参数的检查问题，都带上 severity。 |
| `XhReportViewer` | 类 | 报表查看器 &lt;xh-report-viewer&gt;：按报表定义、参数与联动取数，算出并绘出报表主体或看板。 |

### viewer/table

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `RenderedTable` | 接口 | 渲染好的表格：按 xh-table 行主操作报出的行 id 与列 id 查出点中的那一格。 |
| `TableCellRef` | 接口 | 表格里被行主操作点中的那一格在报表里的含义。 |

## `@xihan-report/runtime/locale` 的导出

### locale

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `reportDeDE` | 常量 | 报表的德语文案：查看器、设计器与 designer-shell 零件。 |
| `reportEnUS` | 常量 | 报表的英文文案：查看器、设计器与 designer-shell 零件。 |
| `reportEsES` | 常量 | 报表的西班牙语文案：查看器、设计器与 designer-shell 零件。 |
| `reportFrFR` | 常量 | 报表的法语文案：查看器、设计器与 designer-shell 零件。 |
| `reportJaJP` | 常量 | 报表的日语文案：查看器、设计器与 designer-shell 零件。 |
| `reportKoKR` | 常量 | 报表的韩语文案：查看器、设计器与 designer-shell 零件。 |
| `reportPtBR` | 常量 | 报表的巴西葡萄牙语文案：查看器、设计器与 designer-shell 零件。 |
| `reportRuRU` | 常量 | 报表的俄语文案：查看器、设计器与 designer-shell 零件。 |
| `reportZhCN` | 常量 | 报表的简体中文文案：查看器、设计器与 designer-shell 零件。 |
| `reportZhTW` | 常量 | 报表的繁体中文文案：查看器、设计器与 designer-shell 零件。 |

## `@xihan-report/runtime/xlsx` 的导出

### xlsx/report

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `crosstabSheet` | 函数 | 交叉表排成工作表：左上角是表头区，上方是列轴的多层表头，左侧是行轴的多层表头，相同的上层成员合并单元格，小计与总计的标签向内合并；多个度量按 measuresOn 排在最内一层，没有列维度时列轴只有度量一层。 |
| `groupSheet` | 函数 | 分组报表排成工作表：前几列是各级分组，之后是视图的列。 |
| `SheetOptions` | 接口 | 生成工作表的选项。 |
| `tableSheet` | 函数 | 明细表排成工作表：首行是列标题，之后每行一条明细，有汇总时末行写合计（首列没有汇总时写合计标签）；冻结首行。 |
| `XlsxTranslations` | 类型 | 工作表里的内建文字：查看器语言包里的总计与小计，两边共用一份。 |
