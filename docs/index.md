---
layout: home
title: 曦寒报表设计器
titleTemplate: 框架无关的报表设计、查看与看板

hero:
  name: 曦寒报表设计器
  text: 框架无关的报表设计器
  tagline: 原生 Web Components · 报表定义即 JSON · 明细、分组、交叉表与看板 · 联动下钻 · 导出 Excel
  image:
    src: /images/logo.png
    alt: 曦寒报表设计器
  actions:
    - theme: brand
      text: 快速开始
      link: /quickstart

    - theme: alt
      text: 介绍
      link: /introduction

features:
  - title: 框架无关
    icon: 🧩
    details: 以原生 Web Components 交付，Vue、React、Angular 或不用框架的页面都能直接使用；同一页面放多个实例互不影响。
    link: /introduction
    linkText: 了解设计原则

  - title: 报表定义即数据
    icon: 📄
    details: 报表是纯 JSON：数据集、参数与主体视图；计算字段与公式度量用受限表达式，不执行任何代码。
    link: /guide/structure
    linkText: 了解报表结构

  - title: 数据由宿主提供
    icon: 🔌
    details: 组件不发网络请求。取数回调拿到算好的请求，交回明细行，或在服务端聚合后交回汇总行。

  - title: 明细、分组与交叉表
    icon: 📊
    details: 明细表带格式、排序、冻结列与合计；分组报表按多级分组出组头与小计；交叉表按行列维度透视，出小计与总计。
    link: /guide/pivot
    linkText: 了解交叉表

  - title: 看板与联动
    icon: 🧭
    details: 柱线、饼、漏斗、雷达、桑基、热力与层级图，指标卡带对比与迷你图，表格卡片；点一下图表或表格筛选其它卡片，表格的格子可以下钻。
    link: /guide/dashboard
    linkText: 了解看板

  - title: 可视化设计器与扩展
    icon: 🎨
    details: 物料、字段栏、属性面板、问题列表、撤销重做与预览；按实例传入扩展，登记新的卡片与视图种类、渲染、导出器与面板。
---
