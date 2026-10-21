来源：https://report.docs.xihanfun.com/guide/extensions

# 扩展

报表设计器的能力可以由扩展加进来：新的卡片与主体视图种类、它们的渲染与属性、画在看板上的叠加层、新的导出格式、包在取数回调外面的中间件，以及设计器里的物料、命令与面板。内置的图表、指标与表格卡片，内置的 xlsx 导出，走的也是同一套扩展。全部接口见[参考 · 扩展](../reference/extensions)。

## 按实例传入，分三层

扩展是一个普通对象，交给元素的 `extensions` 属性，或 core 各入口的 `extensions` 选项，只对这一个实例生效，没有全局登记。

| 层 | 类型 | 用在哪里 | 在上一层之上加的 |
| --- | --- | --- | --- |
| core | `ReportCoreExtension` | `validateDocument`、`computeCard` 等 core 入口 | 卡片与视图种类（校验、计算、补全绑定）、属性、问题说明、校验规则、编辑方式 |
| 运行时 | `ReportRuntimeExtension` | `<xh-report-viewer>` | 卡片与视图的渲染、叠加层、导出器、取数中间件 |
| 设计器 | `ReportDesignerExtension` | `<xh-report-designer>` | 物料组与物料项、物料来源、导入器、命令、面板、属性编辑器、`setup` |

一层是下一层的超集，所以同一个扩展写成三个对象、一层包着一层：业务页面只引运行时层，打包里没有设计器的代码；Node 里只引 core 层。下面用一个示例扩展 `@acme/goal` 走一遍：它登记一种「目标进度」卡片，显示完成值与目标的进度条。


## 命名

- 扩展的 `id` 用包名加功能名，如 `@acme/goal`；它也是报表里扩展数据的键。
- 卡片与视图种类、物料项、物料组的名字带点、以 id 的末段开头：`goal.progress`、`goal.items`；命令、导出器与叠加层的 id 写完整的扩展 id 加点加名字：`@acme/goal.raise`。
- 扩展自己的问题码同样以末段加点开头，如 `goal.target-positive`。
- 合并时任何一处重名都抛 `DesignerExtensionError`（码 `designer.extension-conflict`），元素保持原来的扩展不变。同一个扩展数组只合并一次，宿主要保持引用稳定。

## core 层：种类

一种卡片声明自己的取数形状 `data`：`query` 同图表与指标卡片，卡片上有 `dataset`、`parameters` 与聚合查询 `query`；`view` 同表格卡片，带一个明细表、分组报表或交叉表；`none` 不取数。core 据此生成取数请求、校验数据绑定、算出联动维度，种类自己只管多出来的字段：

```ts
/** 目标进度卡片在报表里多出来的两个字段。 */
export interface GoalCard extends CardBase {
  readonly value?: string
  readonly target?: number
}

/** 交给渲染的值。 */
export interface GoalValue {
  readonly value: number
  readonly target: number
}

const goalProgress: ReportCardKind<GoalCard, GoalValue> = {
  data: 'query',
  validate: (card, check) => {
    const issues: SchemaIssue[] = []
    if (card.value === undefined || !check.measures.has(card.value))
      issues.push({ code: 'goal.value-measure', path: [...check.path, 'value'] })
    if (typeof card.target !== 'number' || !(card.target > 0))
      issues.push({ code: 'goal.target-positive', path: [...check.path, 'target'] })
    return issues
  },
  compute: (card, input) => ({
    value: Number((input.query as QueryResult).total[card.value!] ?? 0),
    target: card.target!,
  }),
  fillBindings: (card, ids) => (card.value !== undefined && ids.measures.includes(card.value)) || ids.measures[0] === undefined
    ? []
    : [{ path: ['value'], value: ids.measures[0] }],
}
```

- `validate` 查种类自己的字段，问题路径以 `check.path` 开头；`check.measures`、`check.dimensions` 是查询里的度量与维度 id，`check.fieldType` 查字段类型。
- `compute` 把跑好的查询结果换成交给渲染的值。
- `fillBindings` 在设计器的字段栏加减维度、度量之后补全必填的引用：返回要改的属性，路径从卡片算起。

种类、属性与问题说明合成 core 层的扩展：

```ts
export const goalCore: ReportCoreExtension = {
  id: '@acme/goal',
  cards: { 'goal.progress': goalProgress },
  properties: {
    'card:goal.progress': [
      { path: ['value'], group: 'data', label: '完成值', control: { kind: 'measure' }, required: true },
      { path: ['target'], group: 'data', label: '目标', control: { kind: 'number', exclusiveMin: 0 }, required: true },
    ],
  },
  issueText: (issue) => {
    if (issue.code === 'goal.value-measure')
      return '完成值要是查询里的一个度量'
    if (issue.code === 'goal.target-positive')
      return '目标要是大于 0 的数'
    return undefined
  },
}
```

- `properties` 按对象种类追加属性：`card:<种类>`、`chart:<图表类型>`、`series`、`metric`、`view:<视图类型>`、`column`、`dimension`、`measure`、`field`、`parameter`、`link` 等，追加在内置之后，与内置的同路径时抛错；`documentProperties` 追加在报表本身上。
- `issueText` 给出自己问题码的说明，设计器的问题列表照样显示。
- 主体视图种类 `views` 写法相同，取数形状只能是 `query` 或 `none`。

报表里用到扩展登记的种类，而元素没装这个扩展时，校验报 `unknown-kind`：查看器显示「报表定义有问题」，设计器里卡片原样保留、画种类名占位，不会丢数据。

## 运行时层：渲染与叠加层

渲染拿到卡片的内容区、算好的结果与渲染上下文。上一轮画过的元素还在内容区里，同种卡片复用它们、只换数据，刷新与联动时就不会闪。示例用 UI 的 `<xh-progress>` 画进度条，元素里写好它的部件：

```ts
/** 线形进度条：<xh-progress> 里写 root > track > range 三层部件。 */
function createProgress(): XhProgressElement {
  const part = (name: string): HTMLDivElement => {
    const node = document.createElement('div')
    node.dataset.xhPart = name
    return node
  }
  const root = part('root')
  const track = part('track')
  track.append(part('range'))
  root.append(track)
  const progress = document.createElement('xh-progress') as XhProgressElement
  progress.append(root)
  return progress
}
```

```ts
cardRenderers: {
  'goal.progress': (body, result, context) => {
    const { value, target } = result.value as GoalValue
    const progress = body.querySelector<XhProgressElement>('xh-progress') ?? createProgress()
    const caption = body.querySelector('p') ?? document.createElement('p')
    progress.max = target
    progress.value = Math.min(value, target)
    progress.setAttribute('aria-label', result.card.title ?? result.card.id)
    progress.tone = value >= target ? 'success' : 'brand'
    caption.textContent = `${context.text(value, { kind: 'number', grouping: true }, 'number')} / ${context.text(target, { kind: 'number', grouping: true }, 'number')}`
    if (progress.parentElement !== body || caption.parentElement !== body)
      body.replaceChildren(progress, caption)
    return undefined
  },
},
```

渲染上下文的 `text` 按值格式写出显示文字，`translations` 是查看器此刻的文案。渲染返回 `RenderedChart` 或 `RenderedTable`（UI 的图表或表格元素，加上由点按明细查出取值的函数）时，查看器给它接上联动与下钻；只画自己的内容时返回 `undefined`。

叠加层铺满看板，画在卡片之下（`below`）或之上（`above`），不接指针，适合边框装饰、卡片之间的连线、角标。场景给出每张卡片的网格位置、相对看板的像素矩形、状态与算好的结果；看板排好、卡片状态或看板大小变了时调用：

```ts
overlays: [{
  id: '@acme/goal.reached',
  layer: 'below',
  render: (container, scene) => {
    container.replaceChildren(...scene.cards.flatMap((item) => {
      const goal = item.result?.value as GoalValue | undefined
      if (item.card.kind !== 'goal.progress' || item.status !== 'ready' || goal === undefined || goal.value < goal.target)
        return []
      const halo = document.createElement('div')
      Object.assign(halo.style, {
        position: 'absolute',
        boxSizing: 'border-box',
        left: `calc(${item.rect.x}px - var(--xh-space-1))`,
        top: `calc(${item.rect.y}px - var(--xh-space-1))`,
        width: `calc(${item.rect.width}px + 2 * var(--xh-space-1))`,
        height: `calc(${item.rect.height}px + 2 * var(--xh-space-1))`,
        borderRadius: 'var(--xh-radius-md)',
        border: 'var(--xh-stroke-thick) solid var(--xh-fg-success)',
      })
      return [halo]
    }))
  },
}],
```

上面给达成目标的卡片外面垫一圈描边。设计器的画布上同样画叠加层，上下文的 `mode` 是 `designer`。

## 运行时层：导出与取数中间件

导出器写明能导出的格式，`export(format)` 交给登记了这种格式的第一个导出器：

```ts
exporters: [{
  id: '@acme/goal.csv',
  label: 'CSV',
  formats: ['csv'],
  export: async (_format, context) => {
    const lines = context.results.cards
      .filter(item => item.result.card.kind === 'goal.progress')
      .map((item) => {
        const goal = item.result.value as GoalValue
        return [item.result.card.title ?? item.result.card.id, goal.value, goal.target].join(',')
      })
    return ['卡片,完成值,目标', ...lines].join('\n')
  },
}],
```

取数中间件拿到下一层的取数回调，返回包在它外面的一层，按扩展顺序一层层包在宿主的 `dataProvider` 外面，后登记的在最外。鉴权、缓存、记录耗时、把几个数据集拼起来都可以写在这里：

```ts
dataProvider: next => async (request, context) => {
  const started = performance.now()
  try {
    return await next(request, context)
  }
  finally {
    onFetch({ dataset: request.dataset, milliseconds: Math.round(performance.now() - started) })
  }
},
```

装到查看器上：

```ts
const goal = createGoalRuntime((record) => {
  fetches.textContent = `取数 ${record.dataset}：${record.milliseconds} ms`
})
const viewer = document.createElement('xh-report-viewer')
viewer.extensions = [goal]
viewer.dataProvider = async () => ({ kind: 'rows', rows })
viewer.schema = schema
```

## 设计器层：物料与命令

物料组与物料项让新种类出现在物料面板里，拖到看板上或激活时按模板新建卡片：

```ts
paletteGroups: [{ id: 'goal.items', label: '目标' }],
palette: [{
  id: 'goal.progress',
  group: 'goal.items',
  label: '目标进度',
  template: dataset => ({
    kind: 'goal.progress',
    title: '目标进度',
    layout: { w: 4, h: 3 },
    dataset,
    query: { dimensions: [], measures: [] },
    target: 100000,
  }),
}],
```

命令写 `placement` 决定出现在工具栏（`toolbar`）、菜单栏的哪张菜单（`menubar:file`、`menubar:edit`、`menubar:view`、`menubar:data`、`menubar:help`，排在那张菜单收尾的一组之前；「数据」菜单接在导入之后）、右键菜单（`menu:card`、`menu:blank`）还是选中工具条（`selection:card`、`selection:multiple`），`enabled` 决定可不可用，`shortcut` 可以绑快捷键；宿主再用 `commandLayout` 改排列：

```ts
commands: [{
  id: '@acme/goal.raise',
  label: '目标提高一成',
  placement: ['menu:card'],
  enabled: ({ designer }) => !designer.readonly && selectedGoal(designer) !== undefined,
  run: ({ designer }) => {
    const card = selectedGoal(designer)
    if (card?.target !== undefined)
      designer.execute([{ type: 'updateCard', id: card.id, changes: [{ path: ['target'], value: Math.round(card.target * 1.1) }] }])
  },
}],
```


物料面板最下面多出「目标」一组；右键点一张目标进度卡片，菜单里有「目标提高一成」，执行后目标变成原来的 1.1 倍，可以撤销。

设计器层还可以登记：

- `panels`：放进设计器外框某个区的面板，或开一个新区；它同样记在面板布局里，用户能隐藏、挪动与浮出，「面板」菜单里也能开关它。
- `menubarMenus`：菜单栏上的菜单 `{ id, label, order? }`，`order` 写在 30–80 之间，排在「视图」与「帮助」之间（报表的「数据」菜单是 30），命令写 `menubar:<菜单 id>` 落进去；没有命令的菜单不出现。菜单 id 与内置的或别的扩展的重名时，给 `extensions` 赋值就抛 `DesignerExtensionError`。
- `tourSteps`：新手引导里的几步，`order` 从 200 起，排在报表的几步之后；id 写扩展 id 加点，不能重名。`target` 指要高亮的目标：`{ panel }` 一块面板，`{ command }` 工具栏上的一条命令，`{ region }` 外框的区，`{ menubar }` 菜单栏上的一张菜单（菜单 id，如 `file`、`data`，窄屏时落在「菜单」钮上），`{ selector }` 设计器里的任意节点；目标看不见的那步自动跳过。
- `about`：设置「关于」页里的几行 `{ label, value }`，如附加包的版本与授权。
- `fieldSources`：导入对话框里在 JSON 样例、JSON Schema 两页之后多出的来源页。页里拿到内容（样例、Schema 或现成的字段）后交给对话框，推断、预览与确认走对话框自己的，导进报表时照内置两页的规则。
- `paletteSources`：物料来源，往物料面板里加几组（如附加包的「我的物料」、模板库），接在所有物料组后面，每次刷新面板时现取。条目被点按时交给来源的 `insert(item, context)`；拖到看板上放下时再带上落点 `ReportPaletteDrop`，即指针所在的格（`x` 列、`y` 行，从 0 起）。插什么、插在哪由来源自己定，如经 `context.designer.addCard()` 新建卡片。来源 id 不能重名；只读或报表主体不是看板时物料面板只能浏览。
- `importers`：导入器，把选中的文件换成一份整份的报表模板，见下文。
- `editors`：属性编辑器，按编辑方式（`byControl`）、属性路径（`byPath`）或对象种类加路径（`byTarget`）换掉设计器内建的编辑器，后登记的压前面的。
- `setup`：元素连上文档时调用，返回断开时的清理。

登记了导入器，工具栏最前面与「数据」菜单的末尾就多一条「导入模板」（命令 `import-template`）；一个导入器都没有时没有这条命令。点它弹出选文件对话框，只列各导入器 `fileTypes` 写的类型（MIME 类型或扩展名，都没写时不限）。选中的文件按扩展顺序问 `accepts`，第一个接下的 `import(source, context)` 给出 `{ document }`：整份换上当前报表、清空选择，记一步撤销；给出 `undefined` 就不载入。没有导入器接下、导入器抛错或给出的不是报表对象时派发 `import-error`，报表不变；载入的模板有校验问题时照常列在问题卡片里。

```ts
const jsonTemplate: ReportDesignerImporter = {
  id: '@acme/templates.json',
  fileTypes: ['.json', 'application/json'],
  accepts: source => source.name?.endsWith('.json') ?? false,
  import: async source => ({ document: JSON.parse(await source.file!.text()) as ReportDocument }),
}

const templates: ReportDesignerExtension = { id: '@acme/templates', importers: [jsonTemplate] }
designer.extensions = [templates]
designer.addEventListener('import-error', (event) => {
  const { importer, error } = (event as ReportDesignerEventMap['import-error']).detail
  console.warn('导入失败', importer, error)
})
```

## 扩展数据

报表里的各个对象都可以带 `extensions`，键是扩展 id，值是这个扩展自己的 JSON 对象，例如在数据集上记下数据源连接、在卡片上记下大屏版式。校验只查它是对象，编辑操作与剪贴板原样带过去：

```json
{ "id": "sales", "fields": [], "extensions": { "@acme/connector": { "source": "warehouse.orders" } } }
```
