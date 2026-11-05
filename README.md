<div align="center">

<h1>XiHan.ReportDesigner</h1>

<h3>A fast, lightweight, efficient and thoughtfully built framework-agnostic report designer</h3>

<p>
  <a href="https://github.com/XiHanFun/XiHan.ReportDesigner/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/XiHanFun/XiHan.ReportDesigner/ci.yml?branch=dev&style=flat-square&label=CI" /></a>
  <a href="https://www.npmjs.com/package/@xihan-report/designer"><img alt="npm" src="https://img.shields.io/npm/v/@xihan-report/designer?style=flat-square&logo=npm&logoColor=white&color=cb3837" /></a>
  <a href="./LICENSE"><img alt="MIT License" src="https://img.shields.io/github/license/XiHanFun/XiHan.ReportDesigner?style=flat-square&color=green" /></a>
  <a href="https://github.com/XiHanFun/XiHan.ReportDesigner/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/XiHanFun/XiHan.ReportDesigner?style=flat-square&logo=github&label=Stars&color=1f6feb" /></a>
  <a href="https://gitee.com/XiHanFun/XiHan.ReportDesigner"><img alt="Gitee Stars" src="https://gitee.com/XiHanFun/XiHan.ReportDesigner/badge/star.svg" /></a>
  <a href="https://gitcode.com/XiHanFun/XiHan.ReportDesigner"><img alt="GitCode Stars" src="https://gitcode.com/XiHanFun/XiHan.ReportDesigner/star/badge.svg" /></a>
</p>

<p>
  <a href="https://report.docs.xihanfun.com"><b>Docs</b></a> ·
  <a href="#getting-started"><b>Getting Started</b></a> ·
  <a href="https://report.docs.xihanfun.com/changelog"><b>Changelog</b></a>
</p>

<p><b>English</b> | <a href="./README_cn.md">简体中文</a></p>

</div>

XiHan.ReportDesigner is a framework-agnostic report designer delivered as Web Components. It designs data reports and dashboards visually, with data supplied by the consumer through callbacks. It is part of the XiHanFun open-source ecosystem.

## Features

| Feature | Description |
| --- | --- |
| Framework-agnostic | Native Web Components for Vue, React, Angular and pages without a framework |
| No third-party dependencies | Nothing third-party at runtime |
| Templates are data | Templates are JSON that neither contain nor execute code |
| Data stays with you | Components make no network requests; data, storage and permissions go through callbacks |
| Reports and dashboards | Detail, pivot and dashboard views, with xlsx export |

## Getting Started

```bash
pnpm add @xihan-report/core @xihan-report/runtime @xihan-ui/styles
```

```ts
import { defineReportViewer } from '@xihan-report/runtime'
import '@xihan-ui/styles/index.css'
import '@xihan-report/runtime/style.css'

defineReportViewer()

const viewer = document.createElement('xh-report-viewer')
viewer.dataProvider = dataProvider
viewer.schema = schema
document.body.append(viewer)
```

Report definitions and data callbacks are covered in the [quickstart](https://report.docs.xihanfun.com/quickstart).

## Packages

| Package | Description |
| --- | --- |
| `@xihan-report/core` | Model layer: report schema, dataset descriptions, calculation and editing commands, with no DOM dependency |
| `@xihan-report/runtime` | Runtime: report and dashboard viewing, with export from the `/xlsx` entry |
| `@xihan-report/designer` | Designer: visual report design |

Dependencies run `designer → runtime → core`, and business pages only need `runtime`.

## Local Development

Requires Node.js 24+ and pnpm 11+. The development preview runs at `http://localhost:5193`.

```bash
cd report
pnpm install
pnpm dev
```

## Ecosystem

| Project | Description |
| --- | --- |
| [XiHan.Framework](https://github.com/XiHanFun/XiHan.Framework) | .NET microkernel development framework |
| [XiHan.UI](https://github.com/XiHanFun/XiHan.UI) | Framework-agnostic headless UI component library |
| [XiHan.BasicApp](https://github.com/XiHanFun/XiHan.BasicApp) | A beautifully crafted general-purpose admin kernel built on XiHan.Framework and XiHan.UI |
| [XiHan.FlowDesigner](https://github.com/XiHanFun/XiHan.FlowDesigner) | Framework-agnostic flow designer |
| [XiHan.FormDesigner](https://github.com/XiHanFun/XiHan.FormDesigner) | Framework-agnostic form designer |
| [XiHan.PrintDesigner](https://github.com/XiHanFun/XiHan.PrintDesigner) | Framework-agnostic print designer |

## Documentation

The documentation site is written in Chinese.

[Viewer](https://report.docs.xihanfun.com/guide/viewer) · [Designer](https://report.docs.xihanfun.com/guide/designer) · [Dashboards](https://report.docs.xihanfun.com/guide/dashboard) · [Changelog](https://report.docs.xihanfun.com/changelog)

## Contributing

[Issues](https://github.com/XiHanFun/XiHan.ReportDesigner/issues) and pull requests are welcome. Commits follow Conventional Commits, and changes must pass the CI gates. Community: QQ group [462371834](https://qm.qq.com/q/qYp1Urv3z2). Support the project: [sponsorship page](https://docs.xihanfun.com/cosmos/sponsor).

## License

[MIT](./LICENSE) © 2021-Present XiHanFun and contributors. The XiHan.ReportDesigner name, interface design and original visual expression belong to the author.
