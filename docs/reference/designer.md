# 设计器

<!-- 本页由 docs/scripts/gen-reference.mjs 从源码生成，不要手改；源码变了之后在 docs/ 运行 pnpm gen。 -->

`@xihan-report/designer` 的公开接口。样式在 `@xihan-report/designer/style.css`，还要同时引入 `@xihan-ui/designer-shell/style.css` 与 `@xihan-report/runtime/style.css`。

## `<xh-report-designer>`

注册 &lt;xh-report-designer&gt; 与它用到的查看器、UI 元素与 designer-shell 零件；import 时不注册。

### 属性

| 属性 | attribute | 类型 | 说明 |
| --- | --- | --- | --- |
| `schema` | — | `ReportDocument \| undefined` | 报表定义：赋值即装载（清空历史与选择）；赋回当前这一份不重新装载。读取得到当前报表。 |
| `dataProvider` | — | `ReportDataProvider \| undefined` | 与查看器同一个取数回调，画布与预览用；不给时画布画占位。 |
| `expressionEngine` | — | `ExpressionEngine \| undefined` | 表达式引擎：计算字段与公式度量要用，校验公式也用它。 |
| `formatter` | — | `ReportFormatter \| undefined` | 值的显示文字；缺省按格式说明调 formatValue。 |
| `parameters` | — | `ParameterValues \| undefined` | 预览与画布取数用的报表参数取值。 |
| `commandLayout` | — | `DesignerCommandLayout \| undefined` | 工具栏、顶栏（header）、右键菜单（menu:card、menu:blank）与选中工具条（selection:card、selection:multiple）的命令排列；写了某个位置就只显示列出的命令。 |
| `translations` | — | `Partial<ReportDesignerTranslations> \| undefined` | 元素自己的文案，压在全局配置之上。 |
| `locale` | `locale` | `string \| undefined` | BCP 47 语言标记；缺省取全局配置。 |
| `timeZone` | `time-zone` | `string \| undefined` | IANA 时区；缺省取运行环境所在的时区。 |
| `readonly` | `readonly` | `boolean \| undefined` | 只读：可选择、浏览与预览，不能修改；缺省可修改。attribute 写 "false" 是可修改，其余写法是只读。 |
| `mode` | `mode` | `ReportDesignerMode \| undefined` | design 或 preview，缺省 design。 |
| `defaultLayout` | — | `DesignerLayout \| undefined` | 面板布局的缺省：设置里还没有 layout.panels 时用它，「恢复默认布局」也回到它；不给时各面板停在登记的位置，全部显示。面板 id 见 REPORT_DESIGNER_PANELS，另有扩展登记的面板。用户挪了面板、改了显隐或大小，整份布局写进设置的 layout.panels（DESIGNER_SETTING_KEYS.layout）并派发 settings-change。 |
| `datasetEditing` | `dataset-editing` | `ReportDatasetEditing \| undefined` | 缺省 fields。 |
| `settings` | — | `DesignerSettings \| undefined` | 设置的值：扁平的键值，键是「分区 id.条目 id」，如 general.theme；没写的键取条目的缺省值。赋值即生效；用户在设置对话框里改了以后设计器换成新的一份并派发 settings-change。 |
| `settingsPolicy` | — | `DesignerSettingsPolicy \| undefined` | 宿主对设置条目的管控：键是条目键或分区 id，hidden 不显示，locked 只读、说明换成「由所在系统管理」。 |
| `settingsStorageKey` | `settings-storage-key` | `string \| undefined` | 设置存在根所在窗口 localStorage 的哪个键下：给了，连上文档时若没赋 settings 就从这里读，用户改了设置就写回去，标了 secret 的条目不存；读写失败派发 settings-storage-error。不给就不读写。同名 attribute settings-storage-key。 |
| `brands` | — | `readonly PropertySwatchOption[] \| undefined` | 设置里主题色的预设：value 是品牌 id（写成设计器根上的 data-brand），color 是色板格子的颜色。不给且没给 registerBrand 时没有主题色这一项。 |
| `registerBrand` | — | `((id: string, color: string) => () => void) \| undefined` | 注册自定义主题色，形状与 @xihan-ui/tokens 的 registerBrand 相同；给了才许在设置里自定义主题色。 |
| `historyLimit` | `history-limit` | `number \| undefined` | 撤销步数上限，缺省 100；在下一次装载（赋 schema）时生效。同名 attribute history-limit。 |

### 存取器

| 属性 | 读写 | 类型 | 说明 |
| --- | --- | --- | --- |
| `extensions` | 可读写 | `readonly ReportDesignerExtension[] \| undefined` | 扩展：卡片与视图种类、渲染、属性编辑器、命令、面板与物料都从这里来，内置扩展自动排在最前。赋值时当场合并查重，冲突抛 DesignerExtensionError、什么都不变；各扩展的 setup 在元素连上文档时调用、断开时清理。同一个扩展对象换了引用当作卸下再装上，宿主要保持引用稳定。去掉的扩展登记的种类在报表里原样保留，画布上画占位。 |
| `canUndo` | 只读 | `boolean` | 能不能撤销；只读时为 false。 |
| `canRedo` | 只读 | `boolean` | 能不能重做；只读时为 false。 |
| `dirty` | 只读 | `boolean` | 有未保存的修改。 |
| `canPaste` | 只读 | `boolean` | 编辑模型里留着可粘贴的内容。 |
| `canDelete` | 只读 | `boolean` | deleteSelection() 此刻能删掉东西：选中了卡片、列表项或联动，或 datasetEditing 允许删的数据面板对象。 |
| `historyState` | 只读 | `HistorySnapshot` | 撤销历史的快照：各步的说明按此刻的语言取好；还没有报表时只有起点。 |

### 方法

| 方法 | 说明 |
| --- | --- |
| `execute(operations: readonly ReportOperation[], options?: ExecuteOptions): ReportDocument` | 执行一组操作并记为一步撤销；返回新文档。还没有报表时抛错。 |
| `undo(): boolean` | 撤销一步；只读或没有可撤销的时返回 false。 |
| `redo(): boolean` | 重做一步；只读或没有可重做的时返回 false。 |
| `goToHistory(position: number): boolean` | 跳到撤销历史里的一步或起点（historyState 里的位置号）；只读、预览、拖动中或位置号不认识时返回 false。 |
| `clearHistory(): void` | 清空撤销与重做；报表与是否已保存不变。只读或拖动中时什么都不做。 |
| `markSaved(): void` | 把当前位置记为保存点。 |
| `addCard(init: ReportAddCardInit, options?: ExecuteOptions): DashboardCard` | 新增卡片并选中它；报表主体不是看板时抛错。 |
| `addPaletteItem(id: string): DashboardCard \| undefined` | 照点物料的做法新建一张卡片：放到第一个空位、选中它并滚到看得见的地方，返回新卡片；只读、主体不是看板或没有这个物料项时什么都不做，返回 undefined。顶栏的插入钮调它。 |
| `select(selection: Partial<ReportSelection>): void` | 换成给出的选择：给了 data 只选数据面板里的对象，否则选 cards，再带 item 或 link 之一。 |
| `selectAll(): void` | 选中看板上的全部卡片；主体不是看板时清空选择。 |
| `getSelection(): ReportSelection` | 当前的选择。 |
| `deleteSelection(): boolean` | 删除选中的对象：卡片、列表项或联动直接删；数据面板里的字段、参数与数据集按 datasetEditing 能删时删，会一并删掉别处时先弹确认框，确认后合为一步撤销。返回是否删除（或已弹出确认框）。 |
| `copy(): ReportClipboard \| undefined` | 复制选中的卡片，同时写进系统剪贴板；没有选中卡片时返回 undefined。 |
| `cut(): ReportClipboard \| undefined` | 复制后删除选中的卡片，同时写进系统剪贴板；只读或没有选中卡片时返回 undefined。 |
| `paste(clipboard?: ReportClipboard): ReportSelection` | 粘贴卡片，不给 clipboard 时用最近一次复制的内容；返回新的选择。 |
| `duplicate(): ReportSelection` | 复制选中的卡片并当场粘贴，不经剪贴板；返回新的选择。 |
| `validate(): readonly ValidationIssue[]` | 按当前的表达式引擎校验报表。 |
| `refresh(): Promise<void>` | 丢掉缓存的数据，画布重新取数计算。 |
| `scrollToCard(id: string): void` | 滚动到卡片。 |
| `revealCard(id: string): void` | 卡片不在画布的可见区时才滚动到它。 |
| `highlightCard(id: string \| null): void` | 在画布上标出一张卡片（画悬停框），null 撤掉；不改选择、不滚动。页面结构面板悬停或聚焦到一行时用它。 |
| `canImportData(kind: ReportDataImportKind): boolean` | 这种导入此刻能不能做：只读、预览态或 datasetEditing 不够时不能（导入数据集与字段要 full，导入参数要 fields 起）；导入字段还要在数据面板里选中一个数据集或它的字段。 |
| `openDataImport(kind: ReportDataImportKind): boolean` | 打开导入对话框：dataset 从 JSON 样例或 JSON Schema 新建一个数据集，fields 往选中的数据集里加字段，parameters 从 JSON Schema（也可以是样例）加报表参数。对话框里还有扩展登记的字段来源页（fieldSources）。导入的字段只取值字段，同名的保留现有的，一次导入记一步撤销。此刻不能做时返回 false。 |
| `revealItem(ref: ReportItemRef): void` | 选中列表项所在的卡片并让它可见。 |
| `getViewport(): Viewport` | 视口：屏幕坐标（画布可见区的左上角为原点）= 画布坐标 × zoom + (x, y)；画布坐标是实际尺寸下画布里的像素，zoom 为 1 时是实际尺寸。画布还没有布局时 x、y 为 0。 |
| `setViewport(viewport: Viewport): void` | 设置视口：缩放夹进 10%–400%，平移落在画布能滚到的范围里；此后尺寸变化不再自动适配。 |
| `zoomToFit(): void` | 缩放到整块内容的高度落进可见区，宽度总是铺满可见区，不放大到实际尺寸以上；此后画布或内容的尺寸变了就重新适配，直到改了缩放、设置视口或在画布上按下指针。 |
| `zoomIn(): void` | 以可见区中心放大一档。 |
| `zoomOut(): void` | 以可见区中心缩小一档。 |
| `zoomToActual(): void` | 以可见区中心缩放到实际尺寸。 |
| `openSettings(section?: string): void` | 打开设置对话框，给了分区 id 就显示那一页：基础是 general，扩展的是它登记的分区 id。 |

### 事件

事件都是冒泡的 `CustomEvent`。

| 事件 | detail | 说明 |
| --- | --- | --- |
| `schema-change` | `{ schema: ReportDocument, operations: readonly ReportOperation[], kind: ReportSchemaChangeKind }` | 报表变了：schema 是新的报表，operations 是这一步的操作，kind 说明是执行、撤销、重做还是装载。 |
| `selection-change` | `ReportSelection` | 选择变了，detail 是新的选择。 |
| `dirty-change` | `{ dirty: boolean }` | 与保存点相比有没有改动变了。 |
| `history-change` | `HistorySnapshot` | 撤销历史变了：执行（含并入上一步）、撤销、重做、跳转、装载、清空与保存之后都派发，拖动等事务进行中不派发。detail 是此刻的 historyState。 |
| `issues-change` | `{ issues: readonly ValidationIssue[] }` | 报表的校验问题变了。 |
| `save` | `Record<string, never>` | 在画布上按了 Ctrl+S（macOS 上 ⌘S）；保存由宿主做，存好后调 markSaved()。 |
| `mode-change` | `{ mode: ReportDesignerMode }` | 在设计与预览之间切换了。 |
| `card-dblclick` | `{ id: string }` | 双击了一张卡片。 |
| `card-contextmenu` | `{ id: string, x: number, y: number }` | 可取消；不取消时弹内建右键菜单。 |
| `blank-contextmenu` | `{ x: number, y: number }` | 可取消；不取消时弹内建右键菜单。 |
| `settings-change` | `{ key: string, value: JsonValue \| undefined, settings: DesignerSettings }` | 在设置对话框里改了一条设置，或在外框上挪了面板（键是 layout.panels，值是整份布局）：设计器已换成新的 settings 并生效（主题、主题色、扩展读的值与面板布局）；value 为 undefined 表示删掉这个键、回到缺省值。宿主存起来，下次赋回 settings。 |
| `settings-storage-error` | `VisualEnvironmentStorageError` | 读写 settingsStorageKey 指的本机存储失败（内容不是对象、无痕窗口、配额满）；设置留在内存里。 |
| `viewport-change` | `{ viewport: Viewport }` | 视口变了：缩放、适合窗口、setViewport 与滚动画布都会派发。 |

## 函数

### defineReportDesigner() {#definereportdesigner}

```ts
declare function defineReportDesigner(): void
```

注册 &lt;xh-report-designer&gt; 与它用到的查看器、UI 元素与 designer-shell 零件；import 时不注册。

### readReportClipboard() {#readreportclipboard}

```ts
declare function readReportClipboard(text: string): ReportClipboard | undefined
```

从剪贴板文本读出卡片与联动；不是报表的剪贴板、版本不支持或内容不合格时为 undefined。

### writeReportClipboard() {#writereportclipboard}

```ts
declare function writeReportClipboard(clipboard: ReportClipboard): string
```

把卡片与联动写成剪贴板文本。

## 类型

### ReportDesignerMode {#reportdesignermode}

设计或预览。

```ts
type ReportDesignerMode = 'design' | 'preview'
```

### ReportDatasetEditing {#reportdatasetediting}

数据集能改到什么程度：none 只读；fields 能改字段的标题、类型与计算字段公式，增删报表参数；full 另能增删数据集与字段。

```ts
type ReportDatasetEditing = 'none' | 'fields' | 'full'
```

### ReportSchemaChangeKind {#reportschemachangekind}

schema-change 的来由。

```ts
type ReportSchemaChangeKind = 'execute' | 'undo' | 'redo' | 'load'
```

### REPORT_DESIGNER_PANELS {#report_designer_panels}

设计器的面板 id：宿主写 defaultLayout、settingsPolicy（layout.panels.&lt;面板 id&gt;）与 commandLayout（panel:&lt;面板 id&gt;）时用。

```ts
const REPORT_DESIGNER_PANELS = {
  datasets: 'datasets',
  parameters: 'parameters',
  palette: 'palette',
  wells: 'wells',
  properties: 'properties',
  issues: 'issues',
  history: 'history',
  outline: 'outline',
} as const
```

### ReportSelection {#reportselection}

选择：看板上的卡片，以及可选的一个列表项或一条以选中卡片为源的联动；或者数据面板里的一个对象，这时不选卡片、列表项与联动。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `cards` | `readonly string[]` | 选中的卡片 id。 |
| `item?` | `ReportItemRef` | 选中的列表项。 |
| `link?` | `string` | 选中的联动 id；它的源卡片也在 cards 里。 |
| `data?` | `ReportDataRef` | 数据面板里选中的对象。 |

### ReportItemRef {#reportitemref}

选中的列表项：报表主体或卡片里某个列表的一项（列、分组、维度、度量、系列）。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `card?` | `string` | 所在的卡片；报表主体的列表项不写。 |
| `list` | `ItemList` | 所在的列表：dimensions、measures、series、rows、columns、groups。 |
| `id` | `string` | 列表项的 id。 |

### ReportDataRef {#reportdataref}

数据面板里选中的对象：数据集、数据集的字段或报表参数。

```ts
type ReportDataRef = | { readonly kind: 'dataset', readonly dataset: string } | { readonly kind: 'field', readonly dataset: string, readonly name: string } | { readonly kind: 'parameter', readonly name: string }
```

### ReportAddCardInit {#reportaddcardinit}

新增卡片的参数：id 缺省时按卡片种类分配，layout 只写大小时放到第一个空位。

```ts
type ReportAddCardInit = | (BuiltinNewCard extends infer C ? C extends BuiltinNewCard ? Omit<C, 'id'> & { readonly id?: string } : never : never) | ReportAddExtensionCardInit
```

### ReportAddExtensionCardInit {#reportaddextensioncardinit}

待新增的扩展卡片：同 NewExtensionCard，id 可以不给。

继承 `Partial<DataBinding>`。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `id?` | `string` |  |
| `kind` | `ReportExtensionKind` |  |
| `title?` | `string` |  |
| `description?` | `string` |  |
| `layout` | `CardPlacement` |  |
| `query?` | `ReportQuery` |  |
| `view?` | `DataView` |  |
| `extensions?` | `ReportExtensionData` |  |
| `[key: string]` | `unknown` |  |

### ReportClipboard {#reportclipboard}

剪贴板里的内容：卡片，以及源卡片与目标都在其中的联动。

| 属性 | 类型 | 说明 |
| --- | --- | --- |
| `cards` | `readonly DashboardCard[]` | 复制的卡片。 |
| `links` | `readonly DashboardLink[]` | 源卡片与全部目标都在复制范围里的联动。 |

### ReportDesignerTranslations {#reportdesignertranslations}

设计器的内建文案。

文案键是 `xh-report-designer`，中文在 `@xihan-report/runtime/locale` 的 `reportZhCN` 里。

| 键 | 类型 | 说明 | 中文 |
| --- | --- | --- | --- |
| `label` | `string` | 设计器的可及名。 | 报表设计器 |
| `canvas` | `string` |  | 画布 |
| `datasets` | `string` | 数据集与报表参数两块卡片的标题。 | 数据集 |
| `parameters` | `string` |  | 报表参数 |
| `wells` | `string` | 字段栏的标题。 | 字段 |
| `lists` | `Readonly<Record<string, string>>` | 字段栏各列表的名字：dimensions、measures、series、rows、columns（交叉表的列维度）、groups、tableColumns（明细表与分组报表的列）。 | （按键对照） |
| `palette` | `string` | 物料面板的标题，也是外框里这个区的名字。 | 物料 |
| `properties` | `string` | 属性面板的标题，也是外框里这个区的名字。 | 属性 |
| `issues` | `string` | 问题列表的标题，也是外框里这个区的名字。 | 问题 |
| `datasetsHelp` | `string` | 数据集卡片的帮助。 | 报表用到的数据集与字段。把字段拖到卡片或字段栏上；选中一个，在属性里改标题、类型与公式。 |
| `parametersHelp` | `string` | 报表参数卡片的帮助。 | 报表参数在报表上方填写，筛选与公式里按名字引用。 |
| `paletteHelp` | `string` | 物料卡片的帮助。 | 图表、指标与表格。拖到看板上，或点一下放到第一个空位。 |
| `wellsHelp` | `string` | 字段栏卡片的帮助。 | 选中卡片的维度、度量、系列与列。把字段拖进来，拖动换序，点叉移除。 |
| `propertiesHelp` | `string` | 属性卡片的帮助。 | 选中对象的属性。选中多张卡片时只列它们共有的属性。 |
| `issuesHelp` | `string` | 问题卡片的帮助。 | 报表的校验问题。点一条选中出问题的对象。 |
| `insertToolbar` | `string` | 顶栏那一条插入钮的名字。 | 插入卡片 |
| `selectionToolbar` | `string` | 选中卡片时浮在选中框上方那一条工具条的名字。 | 选中的卡片 |
| `sizeUnit` | `string` | 尺寸徽标里卡片宽高的单位：看板按格计。 | 格 |
| `importDataset` | `string` | 命令「导入数据集」的文字，也是这时导入对话框的标题。 | 导入数据集 |
| `importParameters` | `string` | 命令「导入参数」的文字，也是这时导入对话框的标题。 | 导入参数 |
| `insertCard` | `(label: string): string` | 顶栏插入钮的名字与提示，label 是物料名。 | （按参数生成） |
| `statusDocument` | `(datasets: number, cards: number \| undefined): string` | 状态栏左段没选中时：数据集数，主体是看板时再写卡片数（不是看板时 cards 为 undefined）。 | （按参数生成） |
| `statusCell` | `(column: number, row: number, width: number, height: number): string` | 状态栏左段选中一张卡片时：它左上角所在的列与行（从 1 数起）和占的格数。 | （按参数生成） |
| `statusZoom` | `string` | 状态栏右段缩放那一项的标签。 | 缩放 |
| `paletteGroups` | `Readonly<Record<string, string>>` | 物料分组：charts、metrics、tables。 | （按键对照） |
| `cardTypes` | `Readonly<Record<string, string>>` | 物料与卡片种类：chart.&lt;图表类型&gt;、metric、table.&lt;视图类型&gt;。 | （按键对照） |
| `objectKinds` | `Readonly<Record<string, string>>` | 属性面板标题下的对象种类。 | （按键对照） |
| `propertyGroups` | `Readonly<Record<string, string>>` | 属性分组名，键同 REPORT_PROPERTY_GROUPS。 | （按键对照） |
| `propertyLabels` | `Readonly<Record<string, string>>` | 属性名：键为 formatJsonPath(path)，也可写 `<对象种类>:<路径>` 覆盖。 | （按键对照） |
| `optionLabels` | `Readonly<Record<string, string>>` | 下拉选项：键为 `<路径>=<值>`，没有时再找 `<值>`。 | （按键对照） |
| `selected` | `(count: number): string` | 多个对象选中时的标题。 | （按参数生成） |
| `emptyDashboard` | `string` | 看板上还没有卡片时的提示。 | 把图表、指标或表格拖到这里 |
| `links` | `string` | 字段栏里以选中卡片为源的联动：段名、新增按钮与一条联动的名字（源维度与目标卡片数）。 | 联动 |
| `addLink` | `string` |  | 新增联动 |
| `linkLabel` | `(dimension: string, targets: number): string` |  | （按参数生成） |
| `wellsEmpty` | `string` | 字段栏没有编辑对象（看板上没有选中、或选中了多张卡片）时的提示。 | 选中一张卡片，在这里编辑它的字段 |
| `emptyList` | `string` | 字段栏的空列表提示。 | 把字段拖到这里 |
| `placeholder` | `string` | 没给取数回调时卡片上的占位说明。 | 给了取数回调后这里显示示例数据 |
| `issue` | `(issue: ReportDesignerIssueDetails): string` | 问题说明。 | （按参数生成） |
| `addDataset` | `string` | 数据面板的新增按钮。 | 新增数据集 |
| `addField` | `string` |  | 新增字段 |
| `addParameter` | `string` |  | 新增参数 |
| `removeTitle` | `(name: string): string` | 删除会一并删掉别处时的确认框：标题、说明（各删几处）与确认按钮。 | （按参数生成） |
| `removeCascade` | `(cascade: ReportDesignerCascade): string` |  | （按参数生成） |
| `removeConfirm` | `string` |  | 删除 |
| `historyStep` | `(step: ReportHistoryStepText): string` | 撤销栈里一步的说明：动作加对象名，如「删除卡片「销售额」」「删除 3 个卡片」。 | （按参数生成） |

## 全部导出

### card-icons

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `REPORT_CARD_TYPE_ICONS` | 常量 | 内置卡片种类的图标，图标集见 @xihan-ui/icons；扩展的卡片种类不在其中。 |

### editor

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `readReportClipboard` | 函数 | 从剪贴板文本读出卡片与联动；不是报表的剪贴板、版本不支持或内容不合格时为 undefined。 |
| `REPORT_CLIPBOARD_PRODUCT` | 常量 | 剪贴板包的产品名。 |
| `REPORT_CLIPBOARD_VERSION` | 常量 | 剪贴板包的版本。 |
| `ReportAddCardInit` | 类型 | 新增卡片的参数：id 缺省时按卡片种类分配，layout 只写大小时放到第一个空位。 |
| `ReportAddExtensionCardInit` | 接口 | 待新增的扩展卡片：同 NewExtensionCard，id 可以不给。 |
| `ReportClipboard` | 接口 | 剪贴板里的内容：卡片，以及源卡片与目标都在其中的联动。 |
| `ReportDataRef` | 类型 | 数据面板里选中的对象：数据集、数据集的字段或报表参数。 |
| `ReportItemRef` | 接口 | 选中的列表项：报表主体或卡片里某个列表的一项（列、分组、维度、度量、系列）。 |
| `ReportSelection` | 接口 | 选择：看板上的卡片，以及可选的一个列表项或一条以选中卡片为源的联动；或者数据面板里的一个对象，这时不选卡片、列表项与联动。 |
| `writeReportClipboard` | 函数 | 把卡片与联动写成剪贴板文本。 |

### extensions

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `createReportDesignerModel` | 函数 | 合出设计器用的模型；任何一处重名都抛 DesignerExtensionError，物料项指向没登记的组时抛 TypeError。 |
| `REPORT_DESIGNER_EXTENSION` | 常量 | 设计器的内置扩展：内置命令、物料、页面结构与历史记录面板。 |
| `REPORT_DESIGNER_HELP_URL` | 常量 | 内置命令 help 打开的帮助页：报表文档站的设计器一页。 |
| `REPORT_DESIGNER_PANELS` | 常量 | 设计器的面板 id：宿主写 defaultLayout、settingsPolicy（layout.panels.&lt;面板 id&gt;）与 commandLayout（panel:&lt;面板 id&gt;）时用。 |
| `REPORT_MENU_LAYOUT` | 常量 | 右键菜单的缺省排列。 |
| `REPORT_SELECTION_LAYOUT` | 常量 | 选中工具条（命令落点 selection:&lt;主体&gt;）的缺省排列：创建副本、复制与删除。 |
| `REPORT_TOOLBAR_LAYOUT` | 常量 | 工具栏的缺省排列；commandLayout 没写 toolbar 时用它，再把 placement 含 toolbar 的扩展命令追加成一组。 |
| `ReportCardTemplate` | 类型 | 新卡片的模板：不写 id，新建时按种类分配；layout 只需写大小。 |
| `ReportDesignerCommand` | 类型 | 设计器的命令。 |
| `ReportDesignerContext` | 接口 | 命令、面板、物料与扩展装上时拿到的上下文。 |
| `ReportDesignerExtension` | 接口 | 报表设计器层的扩展：运行时层的全部字段，加上属性编辑器、命令、面板、物料与 setup。 |
| `ReportDesignerModel` | 接口 | 一组设计器扩展合出的东西。 |
| `ReportMenuSubject` | 类型 | 右键菜单落在哪类对象上。 |
| `ReportPaletteGroup` | 接口 | 物料面板的一组。 |
| `ReportPaletteItem` | 接口 | 物料面板里的一项：拖到看板上或激活时按模板新建卡片。 |
| `ReportPropertyEditor` | 类型 | 属性编辑器。 |
| `ReportSelectionSubject` | 类型 | 选中工具条落在哪类选中上：看板上的一张卡片，或几张卡片。 |

### field-import

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `ReportDataImportKind` | 类型 | 导入对话框为谁打开：新建一个数据集、往一个数据集里加字段，或加报表参数。 |

### report-designer

| 名称 | 种类 | 说明 |
| --- | --- | --- |
| `defineReportDesigner` | 函数 | 注册 &lt;xh-report-designer&gt; 与它用到的查看器、UI 元素与 designer-shell 零件；import 时不注册。 |
| `REPORT_DESIGNER_TAG` | 常量 | 设计器的标签名。 |
| `ReportDatasetEditing` | 类型 | 数据集能改到什么程度：none 只读；fields 能改字段的标题、类型与计算字段公式，增删报表参数；full 另能增删数据集与字段。 |
| `ReportDesignerEventMap` | 接口 | 设计器派发的事件。 |
| `ReportDesignerMode` | 类型 | 设计或预览。 |
| `ReportSchemaChangeKind` | 类型 | schema-change 的来由。 |
| `XhReportDesigner` | 类 | 报表设计器 &lt;xh-report-designer&gt;：编辑报表定义，画布与预览按 dataProvider 取数显示示例数据。 |
