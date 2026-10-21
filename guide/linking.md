来源：https://report.docs.xihanfun.com/guide/linking

# 联动与下钻

看板上的卡片可以互相筛选：在一张卡片上点选一个值，别的卡片只显示与它相关的数据，这叫联动。表格的格子还会报出行主操作，宿主据此打开明细、跳到另一张报表，这叫下钻。


点环形图的一个区域，柱图与订单表只剩这个区域；再点柱图的一个月，订单表只剩这个月。再点一次同一个值取消选中，或点参数栏旁的「清除联动」。点订单表的格子，下方记下 `action` 事件带出的取值。

## 写联动

联动写在看板的 `links` 上：

```ts
const links: DashboardLink[] = [
  {
    id: 'byRegion',
    card: 'regions',
    dimension: 'region',
    targets: [{ card: 'months', field: 'region' }, { card: 'orders', field: 'region' }],
  },
  {
    id: 'byMonth',
    card: 'months',
    dimension: 'month',
    targets: [{ card: 'orders', field: 'date' }],
  },
]
```

| 字段 | 含义 |
| --- | --- |
| `id` | 联动的身份，在看板内唯一；选中值按它记 |
| `card` | 源卡片 |
| `dimension` | 源卡片上发出取值的维度：图表与指标卡片是查询的维度 id，表格卡片按视图是明细表的列 id、分组报表的分组 id、交叉表的行列维度 id |
| `targets` | 目标：每个目标写卡片与它数据集里的字段 |

在源卡片上选中一个值，每个目标卡片就多一个「字段 属于 选中值」的筛选条件，与卡片自己的筛选同时满足。源维度带日期粒度时，条件也带同一粒度：上面按月的柱图联动到订单表的 `date` 字段，比较的是月份。一张卡片可以同时是一个联动的源和另一个联动的目标。

## 选中与取消

- 点图表的一个数据点，或表格卡片的一个格子，按以它为源的各联动切换选中值；同一个值再点一次就取消。
- 源图表把选中的值强调出来。
- 只有筛选变了的卡片重新取数计算，其余卡片保持原样。
- 看板有联动时，参数栏旁出现「清除联动」按钮；也可以调 `clearSelections()`。

选中值变化时查看器派发 `selections-change`，detail 的 `value` 是联动 id 到选中值的对照：

```ts
viewer.addEventListener('selections-change', (event) => {
  const { value } = (event as ReportViewerEventMap['selections-change']).detail
  log.textContent = `联动：${JSON.stringify(value)}`
})
```

宿主要自己管选中值（比如写进地址栏、在几个查看器之间同步）时写 `selections` 属性。这时查看器只派发事件、不自己改，宿主把新值写回去。

## 点按事件

- 图表的数据点被点中时，查看器转发 `datum-press`：`card` 是卡片 id，`link` 与 `value` 是这次点按对应的联动与源维度上的取值，与联动无关时为 null，`chart` 是图表元素原样的明细。
- 表格的行主操作（点一个格子，或焦点行上按 Enter）派发 `action`，用来下钻。

## 下钻

`action` 的 detail 说明点中的是哪一格：

```ts
viewer.addEventListener('action', (event) => {
  const { card, kind, column, values } = (event as ReportViewerEventMap['action']).detail
  log.textContent = `下钻：卡片 ${card}，${kind} 行，列 ${column}，${JSON.stringify(values)}`
})
```

| 字段 | 含义 |
| --- | --- |
| `card` | 看板里的表格卡片；报表主体是表格时为 null |
| `kind` | 行的种类：`detail` 明细行（交叉表是成员行）、`group` 组头、`subtotal` 小计 |
| `column` | 点中的列：明细表与分组报表是列 id 或分组 id，交叉表的值格是度量 id、行表头格是行维度 id；按 Enter 时为 null |
| `values` | 这一行（与这一列）在各维度上的取值，键的写法与联动的 `dimension` 相同 |
| `link`、`value` | 表格卡片作联动源时，这次点按对应的联动与取值 |

查看器只报出点中了什么，打开哪张报表、带什么参数由宿主决定。常见的做法是把 `values` 换成另一张明细报表的参数，交给另一个查看器或跳转页面：

```ts
viewer.addEventListener('action', (event) => {
  const { values } = (event as ReportViewerEventMap['action']).detail
  if (typeof values.region === 'string')
    detailViewer.parameters = { region: values.region }
})
```
