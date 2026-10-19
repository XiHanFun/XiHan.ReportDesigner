# 扩展

<!-- 本页由 docs/scripts/gen-reference.mjs 从源码生成，不要手改；源码变了之后在 docs/ 运行 pnpm gen。 -->

扩展按实例传入：查看器与设计器的 `extensions` 属性，以及 core 各入口的 `extensions` 选项。扩展分三层，逐层是超集：core 层只有纯数据与纯函数，运行时层加渲染、叠加层、导出与取数中间件，设计器层再加物料、命令、面板与属性编辑器。四款设计器共有的部分来自 `@xihan-ui/designer-kit` 与 `@xihan-ui/designer-shell`。

## core 层

### createReportModel() {#createreportmodel}

```ts
declare function createReportModel(extensions?: readonly ReportCoreExtension[]): ReportModel
```

合出报表模型：内置扩展 REPORT_CORE_EXTENSION 在前，extensions 按顺序在后。扩展 id、种类名、追加属性的路径、编辑方式等重名时抛 DesignerExtensionError（code 为 designer.extension-conflict）；追加的属性与内置的同路径也抛。种类名不合规时抛 TypeError。同一个数组只合一次：元素把同一份 extensions 交给各个 core 函数时不重复合并。

### ReportCoreExtension {#reportcoreextension}

报表 core 层的扩展。

继承 `DesignerExtensionCore<ReportDocument, ReportRuleContext>`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `cards?` | `Readonly<Record<string, ReportCardKind<never>>>` | 卡片种类：键是种类名，扩展登记的带点、以扩展 id 的末段开头。 |
| `views?` | `Readonly<Record<string, ReportViewKind<never>>>` | 主体视图种类：键是种类名，规则同卡片。 |
| `properties?` | `Readonly<Partial<Record<ReportPropertyTarget, readonly ReportPropertyDescriptor[]>>>` | 追加在内置之后的属性，path 相对那类对象本身。 |
| `documentProperties?` | `readonly ReportPropertyDescriptor[]` | 文档级属性，path 相对文档本身，没选中任何对象时属性面板显示它们。 |

| 方法 | 说明 |
| --- | --- |
| `issueText?(issue: ValidationIssue): string \| undefined` | 这个扩展自己的问题码的说明文字；返回 undefined 时交给查看器与设计器的文案。 |

### DesignerExtensionCore {#designerextensioncore}

`ReportCoreExtension` 继承的共有部分，出自 `@xihan-ui/designer-kit`，类型参数代入报表的。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `controls?` | `Readonly<Record<string, ControlKind>>` | 新的编辑方式，键是 control.kind，不能与内建的重名。 |
| `id` | `string` | 全局唯一，用包名加功能名：@xihan-flow-pro/simulation。也是模板里扩展数据的键。 |
| `rules?` | `readonly SchemaRule<ReportDocument, ReportRuleContext>[]` | 校验规则，问题与内置校验的一起进问题列表；问题码以 id 的末段加点开头。 |

### ReportCardKind {#reportcardkind}

一种卡片。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `data` | `ReportCardData` | 取数形状：query 带聚合查询，view 带一个明细表、分组报表或交叉表，none 不取数。 |

| 方法 | 说明 |
| --- | --- |
| `validate?(card: Card, check: ReportKindCheck): readonly SchemaIssue[]` | 查种类自己的其余字段。扩展种类的问题码以扩展 id 的末段加点开头。 |
| `compute?(card: Card, input: ReportKindInput): Value` | 把取数结果换成交给渲染的值；不给时值就是取数结果本身（query 形状是 QueryResult，view 形状是 ViewResult）。 |
| `fillBindings?(card: Card, query: ReportQueryIds): readonly PropertyChange[]` | 补全种类自己的必填绑定（planFillBindings 调它，设计器在字段栏增删维度、度量之后调）：拿到卡片与查询里现有的维度、度量 id，返回要改的属性，路径从卡片算起。只对取数形状为 query 的卡片调用；不给时不补。 |

### ReportViewKind {#reportviewkind}

一种主体视图。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `data` | `ReportViewData` | 取数形状：扩展视图只能是 query 或 none。 |

| 方法 | 说明 |
| --- | --- |
| `validate?(view: View, check: ReportKindCheck): readonly SchemaIssue[]` | 查种类自己的其余字段，规则同卡片种类。 |
| `compute?(view: View, input: ReportKindInput): Value` | 把取数结果换成交给渲染的值，规则同卡片种类。 |

### ReportCardData {#reportcarddata}

卡片种类的取数形状：query 同图表与指标卡片（卡片上有 dataset、parameters 与 query），view 同表格卡片（带一个明细表、分组报表或交叉表），none 不取数。

```ts
type ReportCardData = 'query' | 'view' | 'none'
```

### ReportViewData {#reportviewdata}

主体视图种类的取数形状：扩展视图只能是 query 或 none；table、group、crosstab、dashboard 是内置四种自己的形状。

```ts
type ReportViewData = 'query' | 'none' | 'table' | 'group' | 'crosstab' | 'dashboard'
```

### ReportKindInput {#reportkindinput}

交给种类计算的取数结果：query 形状是查询结果，view 形状是视图结果，none 两者都没有。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `dataset` | `DatasetSchema \| undefined` | 取数的数据集；不取数时为 undefined。 |
| `query?` | `QueryResult` | query 形状：跑好的聚合查询。 |
| `view?` | `ViewResult` | view 形状：算好的明细表、分组报表或交叉表。 |

### ReportKindCheck {#reportkindcheck}

种类校验拿到的上下文：公共字段与取数部分 core 已经查过。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `path` | `JsonPath` | 对象在文档里的路径；返回的问题路径要以它开头。 |
| `dimensions` | `ReadonlySet<string>` | query 形状时查询的维度 id；别的形状为空集。 |
| `measures` | `ReadonlySet<string>` | query 形状时查询的度量 id；别的形状为空集。 |

| 方法 | 说明 |
| --- | --- |
| `fieldType(name: string): FieldType \| undefined` | 取数的数据集里某个字段的类型（含计算字段）；不取数、数据集未知或没有这个字段时为 undefined。 |

### ReportQueryIds {#reportqueryids}

卡片查询里现有的维度与度量 id，按查询里的先后。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `dimensions` | `readonly string[]` | 维度 id。 |
| `measures` | `readonly string[]` | 度量 id。 |

### ReportPropertyTarget {#reportpropertytarget}

属性追加到哪一类对象上：document 之外的键同属性面板的分区——dashboard、card:&lt;种类&gt;、chart:&lt;图表类型&gt;、series、metric、view:&lt;视图类型&gt;、column、group-level、dimension、measure、field、parameter、link。

```ts
type ReportPropertyTarget = | 'dashboard' | `card:${string}` | `chart:${string}` | 'series' | 'metric' | `view:${string}` | 'column' | 'group-level' | 'dimension' | 'measure' | 'field' | 'parameter' | 'link'
```

### ReportRuleContext {#reportrulecontext}

规则拿到的上下文：合并后的报表模型。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `model` | `ReportModel` | 合并后的报表模型：校验规则可以按它查种类。 |

### ReportModel {#reportmodel}

一组扩展合出的报表模型。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `extensions` | `readonly ReportCoreExtension[]` | 内置扩展在前，传入的按顺序在后。 |
| `cards` | `ReadonlyMap<string, ReportKindEntry<ReportCardKind<CardBase>>>` | 卡片种类名到登记项的对照，内置的在前。 |
| `views` | `ReadonlyMap<string, ReportKindEntry<ReportViewKind<unknown>>>` | 视图种类名到登记项的对照，内置的在前。 |
| `documentProperties` | `readonly ReportPropertyDescriptor[]` | 各扩展追加的文档级属性，按扩展顺序。 |
| `controls` | `Readonly<Record<string, ControlKind>>` | 报表自己的编辑方式与各扩展登记的，键是 control.kind。 |

| 方法 | 说明 |
| --- | --- |
| `properties(target: ReportPropertyTarget): readonly ReportPropertyDescriptor[]` | 扩展追加在某类对象上的属性，内置的不在其中。 |
| `issueText(issue: ValidationIssue): string \| undefined` | 问题的说明文字：按扩展顺序取第一个给出的；都不给时为 undefined。 |

### ReportKindEntry {#reportkindentry}

合并后的一个种类：定义、登记它的扩展 id，以及是不是内置的。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `name` | `string` | 种类名。 |
| `kind` | `Kind` | 种类的定义。 |
| `owner` | `string` | 登记它的扩展 id。 |
| `builtin` | `boolean` | 是不是内置的种类。 |

## 运行时层

### createReportRuntimeModel() {#createreportruntimemodel}

```ts
declare function createReportRuntimeModel(extensions?: readonly ReportRuntimeExtension[]): ReportRuntimeModel
```

合出运行时用的报表模型：core 的合并与查重照旧；渲染、导出器重名时抛 DesignerExtensionError。扩展登记的卡片与视图种类必须有渲染（同一个扩展或别的扩展给的都行），没有时抛 TypeError。同一个数组只合一次。

### ReportRuntimeExtension {#reportruntimeextension}

报表运行时层的扩展。

继承 `ReportCoreExtension`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `cardRenderers?` | `Readonly<Record<string, ReportCardRenderer>>` | 卡片的渲染，键是卡片种类名。 |
| `viewRenderers?` | `Readonly<Record<string, ReportViewRenderer>>` | 作主体的扩展视图的渲染，键是视图种类名。 |
| `overlays?` | `readonly ReportOverlay[]` | 看板的叠加层；同一层里按扩展顺序，后登记的在上。 |
| `exporters?` | `readonly DesignerExporter<ReportExportContext>[]` | 导出成文件；内置的 xlsx 在最前。 |
| `dataProvider?` | `ReportDataMiddleware` | 取数中间件，按扩展顺序一层层包在宿主的 dataProvider 外面，后登记的在最外。 |

### ReportCardRenderer {#reportcardrenderer}

卡片的渲染：把计算结果画进卡片的内容区。上一轮画过的元素还在 body 里，同种卡片可以复用它们只换数据。返回图表或表格时查看器给它接联动与下钻。

```ts
type ReportCardRenderer = (body: HTMLElement, result: CardResult, context: RenderContext) => ReportRendered | undefined
```

### ReportViewRenderer {#reportviewrenderer}

作主体的扩展视图的渲染，规则同卡片。

```ts
type ReportViewRenderer = (container: HTMLElement, result: ExtensionViewResult, context: RenderContext) => ReportRendered | undefined
```

### ReportRendered {#reportrendered}

渲染出的、能接联动与下钻的内容：图表或表格；别的内容为 undefined。

```ts
type ReportRendered = RenderedChart | RenderedTable
```

### RenderContext {#rendercontext}

渲染上下文。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `translations` | `ReportViewerTranslations` | 查看器此刻生效的文案。 |

| 方法 | 说明 |
| --- | --- |
| `text(value: unknown, format: FormatSpec \| undefined, type: FieldType \| undefined, missing?: string): string` | 值的显示文字：缺失值写成 missing（缺省空串）。 |
| `member(value: unknown, format: FormatSpec \| undefined, type: FieldType \| undefined): string` | 维度成员的显示文字：缺失值写成语言包里的 missing。 |

### ReportOverlay {#reportoverlay}

叠加层：铺满看板的一层，画在各卡片之下（below）或之上（above）；只在主体是看板时画。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 全局唯一，写作 `<扩展 id>.<名>`。 |
| `layer` | `'below' \| 'above'` | 画在卡片之下（below）还是之上（above）。 |

| 方法 | 说明 |
| --- | --- |
| `render(container: HTMLElement, scene: ReportScene, context: ReportOverlayContext): void` | 看板排好、卡片状态或看板大小变了时调用。container 铺满看板、随看板滚动，不接指针（要接指针的子节点自己写pointer-events）；看板骨架没重建时上一轮画的东西还在 container 里。 |

### ReportScene {#reportscene}

叠加层的场景：看板与它上面各卡片的布局和状态。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `dashboard` | `DashboardView` | 看板定义。 |
| `width` | `number` | 看板的像素宽。 |
| `height` | `number` | 看板的像素高。 |
| `cards` | `readonly ReportSceneCard[]` | 各卡片，按卡片的先后。 |

### ReportSceneCard {#reportscenecard}

叠加层场景里的一张卡片。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `card` | `DashboardCard` | 卡片定义。 |
| `layout` | `GridRect` | 网格上的位置与大小（格），已收进网格的列数。 |
| `rect` | `{ readonly x: number, readonly y: number, readonly width: number, readonly height: number }` | 卡片外壳相对看板左上角的像素矩形。 |
| `status` | `'loading' \| 'error' \| 'ready' \| 'placeholder'` | 卡片此刻的状态；placeholder 是设计器画布上还没绑数据、只画占位的卡片。 |
| `result` | `CardResult \| undefined` | 算好的结果；status 不是 ready 时为 undefined。 |

### ReportOverlayContext {#reportoverlaycontext}

画叠加层时的上下文。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `mode` | `'viewer' \| 'designer'` | 画在查看器上还是设计器画布上。 |
| `schema` | `ReportDocument` | 当前的报表定义。 |
| `render` | `RenderContext` | 渲染上下文：文案与值的显示文字。 |

### DesignerExporter {#designerexporter}

导出器的形状，出自 `@xihan-ui/designer-kit`，上下文代入报表的 `ReportExportContext`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `formats` | `readonly string[]` | 能导出的格式，如 svg、png、xlsx。 |
| `id` | `string` | 全局唯一，写法同命令 id；不能与内置或别的扩展的导出器重名。 |
| `label` | `string \| ((context: ReportExportContext) => string)` | 导出项的名称，列导出入口时显示；给函数时现取，随语言变。 |

| 方法 | 说明 |
| --- | --- |
| `export(format: string, context: ReportExportContext): Promise<string \| Blob>` | 按格式导出，format 是 formats 里的一个；得到文件内容（Blob）或文本。 |

### ReportExportContext {#reportexportcontext}

导出时交给导出器的上下文。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `schema` | `ReportDocument` | 当前的报表定义。 |
| `results` | `ReportResults` | 查看器此刻的计算结果，同 getResults()。 |
| `translations` | `ReportViewerTranslations` | 查看器此刻生效的文案。 |
| `timeZone` | `string` | 查看器计算用的时区。 |
| `options` | `Readonly<Record<string, unknown>>` | 调用方给的选项，如文件里的表名。 |

### ReportDataMiddleware {#reportdatamiddleware}

取数中间件：拿到下一层的取数回调，返回包在它外面的一层。

```ts
type ReportDataMiddleware = (next: ReportDataProvider) => ReportDataProvider
```

### ReportRuntimeModel {#reportruntimemodel}

运行时用的报表模型：core 的模型加上渲染、导出与取数中间件。

继承 `ReportModel`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `cardRenderers` | `ReadonlyMap<string, ReportCardRenderer>` | 卡片种类名到渲染的对照。 |
| `viewRenderers` | `ReadonlyMap<string, ReportViewRenderer>` | 扩展视图种类名到渲染的对照。 |
| `overlays` | `readonly ReportOverlay[]` | 按扩展顺序。 |
| `exporters` | `readonly DesignerExporter<ReportExportContext>[]` | 内置在前，传入的按顺序在后。 |

| 方法 | 说明 |
| --- | --- |
| `provider(base: ReportDataProvider): ReportDataProvider` | 把宿主的取数回调包上各扩展的中间件。 |

## 设计器层

### createReportDesignerModel() {#createreportdesignermodel}

```ts
declare function createReportDesignerModel(extensions: readonly ReportDesignerExtension[]): ReportDesignerModel
```

合出设计器用的模型；任何一处重名（含设置分区与引导步骤）都抛 DesignerExtensionError，物料项指向没登记的组时抛 TypeError。同一个数组只合一次。

### ReportDesignerExtension {#reportdesignerextension}

设计器层的扩展：运行时层的全部，加上设计器零件的命令、面板、属性编辑器与 `setup`，以及报表的物料。下表列出它的全部成员，含继承来的。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `about?` | `readonly { readonly label: string; readonly value: string; }[]` | 「关于」页里的几行，如附加包的版本与授权；各款把它们接在自己那几行后面。 |
| `cardRenderers?` | `Readonly<Record<string, ReportCardRenderer>>` | 卡片的渲染，键是卡片种类名。 |
| `cards?` | `Readonly<Record<string, ReportCardKind<never, unknown>>>` | 卡片种类：键是种类名，扩展登记的带点、以扩展 id 的末段开头。 |
| `commands?` | `readonly DesignerCommand<ReportDesignerContext>[]` | 命令：工具栏按钮、右键菜单项与快捷键共用；命令 id 与快捷键不能与内置或别的扩展的重名。 |
| `controls?` | `Readonly<Record<string, ControlKind>>` | 新的编辑方式，键是 control.kind，不能与内建的重名。 |
| `dataProvider?` | `ReportDataMiddleware` | 取数中间件，按扩展顺序一层层包在宿主的 dataProvider 外面，后登记的在最外。 |
| `documentProperties?` | `readonly ReportPropertyDescriptor[]` | 文档级属性，path 相对文档本身，没选中任何对象时属性面板显示它们。 |
| `editors?` | `Partial<PropertyEditorTable<DesignerPropertyEditor>>` | 属性编辑器，按扩展顺序压在设计器内建的之上。 |
| `exporters?` | `readonly DesignerExporter<ReportExportContext>[]` | 导出成文件；内置的 xlsx 在最前。 |
| `fieldSources?` | `readonly DesignerFieldSource[]` | 字段来源：导入字段的对话框里，排在内置的 JSON 样例与 JSON Schema 两页之后。 |
| `id` | `string` | 全局唯一，用包名加功能名：@xihan-flow-pro/simulation。也是模板里扩展数据的键。 |
| `overlays?` | `readonly ReportOverlay[]` | 看板的叠加层；同一层里按扩展顺序，后登记的在上。 |
| `palette?` | `readonly ReportPaletteItem[]` | 物料面板里的项。 |
| `paletteGroups?` | `readonly ReportPaletteGroup[]` | 物料面板的组，排在内置的图表、指标、表格之后。 |
| `paletteSources?` | `readonly DesignerPaletteSource<ReportDesignerContext, unknown>[]` | 物料来源：往物料面板里加的几组，排在各款内置分组之后；id 不能重名，见 collectPaletteSources。At 是各款的落点信息。 |
| `panels?` | `readonly DesignerPanel<ReportDesignerContext>[]` | 面板：各占外框的一个命名区，同一栏按扩展顺序上下排。 |
| `properties?` | `Readonly<Partial<Record<ReportPropertyTarget, readonly ReportPropertyDescriptor[]>>>` | 追加在内置之后的属性，path 相对那类对象本身。 |
| `rules?` | `readonly SchemaRule<ReportDocument, ReportRuleContext>[]` | 校验规则，问题与内置校验的一起进问题列表；问题码以 id 的末段加点开头。 |
| `settings?` | `readonly DesignerSettingsSection[]` | 设置分区：放进设置对话框，分区 id 不能与内置的 general 或别的扩展的重名，见 collectSettingsSections。 |
| `tourSteps?` | `readonly DesignerTourStep<ReportDesignerContext>[]` | 新手引导的步骤：与 designer-shell 的通用步骤、各款的步骤一起按 order 排；id 不能重名，见 collectTourSteps。 |
| `viewRenderers?` | `Readonly<Record<string, ReportViewRenderer>>` | 作主体的扩展视图的渲染，键是视图种类名。 |
| `views?` | `Readonly<Record<string, ReportViewKind<never, unknown>>>` | 主体视图种类：键是种类名，规则同卡片。 |

| 方法 | 说明 |
| --- | --- |
| `issueText?(issue: ValidationIssue): string \| undefined` | 这个扩展自己的问题码的说明文字；返回 undefined 时交给查看器与设计器的文案。 |
| `setup?(context: ReportDesignerContext): void \| (() => void)` | 装上时调用，返回卸下时的清理。 |

### ReportDesignerCommand {#reportdesignercommand}

设计器的命令：`@xihan-ui/designer-kit` 的 `DesignerCommand`，上下文是 `ReportDesignerContext`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `alternateShortcuts?` | `readonly (readonly string[])[]` | 另外几组也能触发这条命令的快捷键，写法同 shortcut，如重做在 Mod+Shift+Z 之外再认 ['Ctrl', 'Y']。与 shortcut 一样查重、一样由 commandForShortcut 命中；提示里只显示 shortcut，快捷键表与 aria-keyshortcuts 全部列出（见 commandShortcuts）。 |
| `icon?` | `IconRecord` | 按钮与菜单项上的图标，图标集见 @xihan-ui/icons；工具栏按图标显示时，没有图标的命令退回显示短文字。 |
| `id` | `string` | 全局唯一；扩展的命令用扩展 id 加点加名字，如 @xihan-flow-pro/simulation.run。 |
| `label` | `string \| ((context: ReportDesignerContext) => string)` | 按钮与菜单项上的文字；给函数时每次刷新现取，随语言变。 |
| `placement?` | `readonly DesignerCommandPlacement[]` | 缺省排列里出现在哪些位置；不给即只经快捷键或 commandLayout 出现。 |
| `shortcut?` | `readonly string[]` | 快捷键，写法同 xh-kbd 的 keys：['Mod', 'Shift', 'P']，Mod 在 macOS 上是 ⌘，其余平台是 Ctrl。 |
| `shortLabel?` | `string \| ((context: ReportDesignerContext) => string)` | 按钮上看得见的短文字：顶栏按钮图标下的那一行，工具栏只显示图标时没有图标的按钮上也写它；不给用 label。名字（读屏与提示）仍取 label，所以短文字要出现在 label 里（不分大小写），开发期不在时报一条告警。 |
| `tone?` | `Tone` | 语气：按钮与菜单项按这族色显示，破坏性命令写 danger。不给即不带语气。 |

| 方法 | 说明 |
| --- | --- |
| `checked?(context: ReportDesignerContext): boolean` | 给了就是开关式命令，按钮与菜单项显示选中状态。 |
| `enabled?(context: ReportDesignerContext): boolean` | 不给即总是可用。 |
| `menu?(context: ReportDesignerContext): readonly DesignerCommandMenuEntry[]` | 菜单命令：每次刷新时现算菜单的各项。 |
| `panel?(context: ReportDesignerContext): DesignerCommandPanel<ReportDesignerContext>` | 弹层命令：每次打开时建出放进弹层的面板。 |
| `run?(context: ReportDesignerContext): void` | 执行命令；按钮、菜单项与快捷键都只在命令此刻可用时调用它。弹层命令与菜单命令可以不给：工具栏上点它们是打开弹层或菜单，不调 run；给了 run，快捷键按下时调它（通常调工具栏的 open 打开同一份）。 |
| `select?(value: string, context: ReportDesignerContext): void` | 菜单命令的条目被选中时调用，value 是条目的 value；写成命令 id 的项选中时执行那条命令，不调它。 |

### ReportDesignerContext {#reportdesignercontext}

命令、面板、物料与扩展装上时拿到的上下文。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `designer` | `XhReportDesigner` | 所在的设计器元素。 |
| `translations` | `ReportDesignerTranslations` | 此刻生效的设计器文案。 |
| `commands` | `DesignerCommandsTranslations` | 四款设计器共用的命令文案，取 designer-shell 语言包的 xh-designer-commands。 |
| `historyTranslations` | `DesignerHistoryTranslations` | 历史记录的文案，取 designer-shell 语言包的 xh-designer-history；撤销、重做与清空历史的确认框与播报用。 |
| `history` | `DesignerHistoryCommandTarget \| undefined` | 撤销历史；还没有报表时为 undefined。内置的撤销、重做与清空历史命令经它读写。 |
| `dialogs` | `Pick<DialogService, 'confirm'>` | 确认框；内置的清空历史命令清空前用它。 |
| `settings` | `DesignerSettings` | 此刻生效的设置：键是「分区 id.条目 id」，各分区没写的条目取了缺省值。 |
| `frame` | `XhDesignerFrameElement \| undefined` | 设计器的外框；还没建出来时为 undefined。内置的「面板」命令经它开关面板。 |

### ReportMenuSubject {#reportmenusubject}

右键菜单落在哪类对象上。

```ts
type ReportMenuSubject = 'card' | 'blank'
```

### ReportSelectionSubject {#reportselectionsubject}

选中工具条落在哪类选中上：看板上的一张卡片，或几张卡片。

```ts
type ReportSelectionSubject = 'card' | 'multiple'
```

### ReportPaletteGroup {#reportpalettegroup}

物料面板的一组。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 全局唯一；扩展的写扩展 id 末段加点加名字。 |
| `label` | `string \| ((context: ReportDesignerContext) => string)` | 组名，可以按此刻的文案生成。 |

### ReportPaletteItem {#reportpaletteitem}

物料面板里的一项：拖到看板上或激活时按模板新建卡片。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 全局唯一；扩展的写扩展 id 末段加点加名字，如 gantt.timeline。 |
| `group` | `string` | 所在的组：内置的 charts、metrics、tables，或某个扩展登记的组。 |
| `label` | `string \| ((context: ReportDesignerContext) => string)` | 物料名，可以按此刻的文案生成。 |
| `icon?` | `IconRecord` | 物料名前的图标；内置的取卡片种类的图标。 |

| 方法 | 说明 |
| --- | --- |
| `template(dataset: string): ReportCardTemplate` | 新卡片；dataset 是报表的第一个数据集，没有数据集时为空串。 |

### ReportCardTemplate {#reportcardtemplate}

新卡片的模板：不写 id，新建时按种类分配；layout 只需写大小。

```ts
type ReportCardTemplate = ReportAddCardInit & { readonly id?: never }
```

### REPORT_TOOLBAR_LAYOUT {#report_toolbar_layout}

工具栏的缺省排列；commandLayout 没写 toolbar 时用它，再把 placement 含 toolbar 的扩展命令追加成一组。

```ts
const REPORT_TOOLBAR_LAYOUT = [
  ['undo', 'redo'],
  ['cut', 'copy', 'paste', 'duplicate', 'delete'],
  ['zoom-out', 'zoom-in', 'zoom-to-fit', 'zoom-to-actual'],
  ['design', 'preview'],
  ['panels', 'settings', 'help'],
]
```

### REPORT_MENU_LAYOUT {#report_menu_layout}

右键菜单的缺省排列：空白处的末尾是编辑 JSON。

```ts
const REPORT_MENU_LAYOUT = {
  card: [['cut', 'copy', 'paste', 'duplicate'], ['delete']],
  blank: [['paste'], ['select-all'], ['zoom-to-fit'], ['edit-json']],
}
```

### REPORT_SELECTION_LAYOUT {#report_selection_layout}

选中工具条（命令落点 selection:&lt;主体&gt;）的缺省排列：创建副本、复制与删除。

```ts
const REPORT_SELECTION_LAYOUT = {
  card: [['duplicate', 'copy', 'delete']],
  multiple: [['duplicate', 'copy', 'delete']],
}
```

### ReportDesignerModel {#reportdesignermodel}

一组设计器扩展合出的东西。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `list` | `readonly ReportDesignerExtension[]` | 设计器内置扩展在前、传入的在后；校验、计算与查看器都拿这一份。 |
| `extensions` | `readonly ReportDesignerExtension[]` | 再加上 core 与 runtime 层内置扩展的全部扩展，面板与命令按它的顺序。 |
| `runtime` | `ReportRuntimeModel` | 运行时层的模型：种类、渲染、导出器与取数中间件。 |
| `commands` | `DesignerCommandTable<ReportDesignerContext>` | 命令 id 到命令的对照：内置的在前，扩展的按登记顺序。 |
| `paletteGroups` | `readonly ReportPaletteGroup[]` | 物料面板的组，内置的在前。 |
| `palette` | `ReadonlyMap<string, ReportPaletteItem>` | 物料项 id 到物料项的对照。 |
| `settings` | `readonly DesignerSettingsSection[]` | 各扩展登记的设置分区，按登记顺序；分区 id 不与基础分区或彼此重名。 |
| `tourSteps` | `readonly DesignerTourStep<ReportDesignerContext>[]` | 新手引导里报表与各扩展的步骤，按登记顺序；id 不重名。 |
