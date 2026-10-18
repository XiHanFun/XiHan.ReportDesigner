---
aside: false
---

# 设计器

`<xh-report-designer>` 可视化编辑报表定义：从物料拖出卡片，把字段拖进卡片，在属性面板里改配置，问题列表随时指出哪里不对。报表存在哪里、谁能改，都由宿主决定。全部属性、方法与事件见[参考 · 设计器](../reference/designer)。

## 注册与样式

设计器要的样式多一份设计器零件（designer-shell）的，也要查看器的，因为画布与预览用的就是查看器的绘制：

<<< @/examples/demos/designer.ts#setup

## 打开与保存

把报表定义写进 `schema` 就装载它，清空撤销历史与选择；之后读 `schema` 得到当前的报表。取数回调与查看器是同一个，画布与预览用它显示示例数据：

<<< @/examples/demos/designer.ts#render

每改一步派发 `schema-change`，detail 带新的报表、这一步的操作与来由（执行、撤销、重做或装载）。设计器不自己存：在画布上按 Ctrl+S（macOS 上 ⌘S）时派发 `save`，宿主把报表存好后调 `markSaved()`，`dirty` 与 `dirty-change` 据此判断有没有未保存的改动：

<<< @/examples/demos/designer.ts#save

<ReportDemo name="designer" />

没给取数回调时，画布上取数的卡片画占位，说明给了取数回调后会显示示例数据。用到计算字段或公式度量时还要给 `expressionEngine`，校验公式也用它。

## 界面

| 区域 | 位置 | 作用 |
| --- | --- | --- |
| 工具栏 `toolbar` | 上方 | 撤销重做、剪贴板、删除、设计与预览的切换，以及扩展登记的命令 |
| 数据 `data` | 左上 | 数据集、字段与报表参数 |
| 物料 `palette` | 左下 | 图表、指标、表格；拖到看板上或激活时新建卡片 |
| 画布 | 中间 | 看板的卡片可以框选、拖动与改大小，吸附在网格上 |
| 问题 `issues` | 画布下方 | 校验问题，点一条选中出问题的对象 |
| 字段栏 `wells` | 右上 | 选中卡片（或主体视图）的维度、度量、系列、列与分组，可以拖进字段、拖动换序 |
| 属性 `properties` | 右下 | 选中对象的属性；选中多张卡片时编辑共同的属性 |

`panels` 写空格分隔的区域名就只显示这些，写空串只留画布；不写全部显示。

- 把字段拖到卡片上，数值字段进度量，其余进维度（明细表与分组报表进列，交叉表进行）；加减维度、度量后，图表与指标卡片按查询里现有的项补全必填的引用。
- 删除被别处用着的字段、参数或数据集时，先弹确认框列出会一并删掉的地方，确认后合为一步撤销。
- `datasetEditing` 决定数据集能改到什么程度：`none` 只读；`fields`（缺省）能改字段的标题、类型与计算字段公式，增删报表参数；`full` 另能增删数据集与字段。
- `readonly` 只能选择、浏览与预览，不能修改。attribute 按三态读：没写或写 `"false"` 可修改，空串、`"true"` 与别的写法只读，移除后回到可修改。这是一处行为变化：此前 `readonly="false"` 也算只读，现在是可修改。
- `mode` 写 `preview` 切到预览，用查看器按 `parameters` 显示报表；切换时派发 `mode-change`。

## 快捷键

焦点在画布上时：

| 按键 | 作用 |
| --- | --- |
| Ctrl/⌘ + Z | 撤销 |
| Ctrl/⌘ + Shift + Z、Ctrl/⌘ + Y | 重做 |
| Ctrl/⌘ + C、X、V | 复制、剪切、粘贴，经系统剪贴板，能在两个设计器之间粘贴 |
| Ctrl/⌘ + D | 再制选中的卡片 |
| Delete、Backspace | 删除选中的对象 |
| Ctrl/⌘ + A | 全选看板上的卡片 |
| 方向键 | 把选中的卡片挪一格；加 Shift 改大小 |
| Esc | 取消选择 |
| Ctrl/⌘ + S | 派发 `save` |

## 命令与菜单

工具栏与右键菜单里的项都是命令，扩展可以登记新的命令（见[扩展](./extensions)）。`commandLayout` 改写它们的排列：写了某个位置，那里就只显示列出的命令，内置的与扩展的命令 id 可以混排。

<<< @/examples/snippets/designer-layout.ts#example

右键点卡片或空白处时派发 `card-contextmenu` 或 `blank-contextmenu`，取消这个事件就不弹内建菜单，宿主可以画自己的；双击卡片派发 `card-dblclick`。

## 用代码编辑

设计器的每一步编辑都是 core 的编辑操作，宿主也可以自己执行：`execute(operations)` 执行一组操作并记为一步撤销，返回新的报表。core 的 `plan…` 函数按报表算出要执行的操作：

<<< @/examples/snippets/designer-api.ts#add

删除字段、参数或数据集用对应的 `plan…` 函数，引用它们的地方一并删掉：

<<< @/examples/snippets/designer-api.ts#remove

另有 `addCard`、`select` 与 `getSelection`、`selectAll`、`copy`、`cut`、`paste`、`duplicate`、`deleteSelection`、`undo`、`redo`、`validate`，以及让卡片露出来的 `revealCard`，和 `canUndo`、`canRedo`、`canPaste`、`canDelete` 这几个只读状态。
