# 与宿主集成

报表组件不发网络请求、不存任何东西。宿主负责三件事：按请求取数，存取报表定义，决定谁能看、谁能改。

## 取数回调

查看器与设计器共用同一种取数回调 `dataProvider(request, { signal })`：拿到 core 按报表定义、参数与联动算出的请求，交回 `Promise<DatasetData>`。

| 请求字段 | 内容 |
| --- | --- |
| `dataset` | 数据集 id |
| `parameters` | 数据集参数的取值，已按绑定解析；没给值的参数不出现 |
| `filter` | 已代入参数的筛选树；引用了计算字段时为 `null`，由 core 在取回的行上筛 |
| `sort`、`limit` | 明细视图的排序与行数上限；聚合视图为 `null` |
| `query` | 视图需要的聚合：维度、度量与 `rollups`；明细视图或引用了计算字段时为 `null` |

最直接的做法是把请求原样交给自己的接口：

<<< @/examples/snippets/host.ts#provider

- 同一轮里请求完全相同的几张卡片只调一次回调。
- 参数或联动变了、元素从页面上拿掉时，上一轮的 `signal` 被取消，回调应随之中止请求。
- 回调抛错或拒绝时，这张卡片（或报表主体）显示「数据加载失败」，查看器派发 `load-error`。

## 交回明细，还是交回聚合

回调可以交回两种数据：

| | 交回 | 谁来算 |
| --- | --- | --- |
| 明细行 | `{ kind: 'rows', rows }`，行以字段名为键 | core 在浏览器里筛选、分组、聚合与计算公式 |
| 已聚合的行 | `{ kind: 'aggregated', rows, rollups }`，行以维度 id 与度量 id 为键 | 宿主按 `request.query` 在服务端聚合，core 只做排版、排序与公式 |

请求的 `query` 为 `null` 时只能交回明细行；不为 `null` 时两种都行，数据量大时在服务端聚合就不必把明细搬到浏览器。`avg`、`distinctCount` 这类不能由下层累加的度量，小计与总计要单独算：`query.rollups` 列出要给的分组（每项是一组维度 id，空数组是总计），交回时放在 `rollups` 里。

下面模拟一个按请求聚合的后端，页面下方列出查看器发出的每个请求：

<<< @/examples/demos/aggregated.ts#aggregate

<<< @/examples/demos/aggregated.ts#provider

<ReportDemo name="aggregated" />

## 存取报表定义

报表定义是纯 JSON。设计器派发 `save` 时宿主把 `designer.schema` 存进数据库或文件，存好后调 `markSaved()`；业务页面取出它交给查看器的 `schema`。

`@xihan-report/core` 不依赖 DOM，服务端收到报表定义时可以在 Node 里先校验，有问题就拒收：

<<< @/examples/snippets/server-validate.ts#example

## 权限

- 能不能改报表由宿主决定：只给能改的人打开设计器，或者打开时写 `readonly`；`datasetEditing` 控制数据集能改到什么程度。
- 能看到哪些数据由取数接口决定。请求里的筛选来自报表定义与参数，服务端不能拿它当作权限的依据，要按登录的用户与租户自己加上限制。
- 报表里不含也不执行任何代码，计算字段与公式用受限表达式，导入报表定义不会带来脚本注入。

## 在框架里使用

元素是原生 Web Components，任何框架都能直接用。复杂数据交给元素的属性，不走 attribute；事件是冒泡的 `CustomEvent`。

在 Vue 里，先在 `@vitejs/plugin-vue` 的 `template.compilerOptions` 里写 `isCustomElement: tag => tag.startsWith('xh-')`，免得 `xh-` 开头的标签被当成组件去解析；之后用 `.prop` 把对象交给元素的属性，用 `@` 监听事件：

<<< @/examples/demos/vue-viewer.vue

<ReportDemo name="vue-viewer" />

React 19 起会把对象直接赋给自定义元素的同名属性；事件可以用 `ref` 拿到元素后 `addEventListener` 监听。
