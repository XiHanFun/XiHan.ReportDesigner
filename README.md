<div align="center">
<h1>XiHan.ReportDesigner</h1>

<p><b>A fast, lightweight, efficient and thoughtfully built framework-agnostic report designer</b></p>

<p>Delivered as Web Components: design data reports and dashboards visually, with data supplied by the host through callbacks</p>

<p><b>English</b> | <a href="./README_cn.md">简体中文</a></p>

<p>
  <a href="https://github.com/XiHanFun/XiHan.ReportDesigner/stargazers"><img alt="GitHub Stars" src="https://img.shields.io/github/stars/XiHanFun/XiHan.ReportDesigner?style=flat-square&logo=github&label=Stars&color=1f6feb" /></a>
  <a href="https://gitee.com/XiHanFun/XiHan.ReportDesigner"><img alt="Gitee Stars" src="https://gitee.com/XiHanFun/XiHan.ReportDesigner/badge/star.svg" /></a>
  <a href="https://gitcode.com/XiHanFun/XiHan.ReportDesigner"><img alt="GitCode Stars" src="https://gitcode.com/XiHanFun/XiHan.ReportDesigner/star/badge.svg" /></a>
</p>

<p>
  <img alt="Web Components" src="https://img.shields.io/badge/Web_Components-29ABE2?style=flat-square&logo=webcomponentsdotorg&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white" />
  <a href="https://www.npmjs.com/package/@xihan-report/designer"><img alt="npm" src="https://img.shields.io/npm/v/@xihan-report/designer?style=flat-square&logo=npm&logoColor=white" /></a>
  <a href="./LICENSE"><img alt="License" src="https://img.shields.io/github/license/XiHanFun/XiHan.ReportDesigner?style=flat-square&color=green" /></a>
</p>

<p>
  <a href="https://report.docs.xihanfun.com"><img alt="Docs" src="https://img.shields.io/badge/Docs-report.docs.xihanfun.com-2496ED?style=flat-square&logo=readthedocs&logoColor=white" /></a>
  <a href="https://deepwiki.com/XiHanFun/XiHan.ReportDesigner"><img alt="Ask DeepWiki" src="https://deepwiki.com/badge.svg" /></a>
  <a href="https://qm.qq.com/q/qYp1Urv3z2"><img alt="QQ Group" src="https://img.shields.io/badge/QQ_Group-462371834-EB1923?style=flat-square&logo=tencentqq&logoColor=white" /></a>
</p>

</div>

## Introduction

XiHan.ReportDesigner is a framework-agnostic report designer delivered as native Web Components, so it works in Vue, React, Angular or framework-free pages alike. It is part of the XiHanFun open-source ecosystem.

## Principles

- **Framework-agnostic** - delivered as native Web Components, bound to no frontend framework
- **No third-party runtime dependencies** - nothing third-party ships at runtime
- **Templates are data** - a template is plain JSON that neither contains nor runs code, so importing one cannot inject scripts
- **The host owns the data** - components make no network requests; data, storage and permissions are handed to the host through callbacks

## Packages

| Package | Description |
| --- | --- |
| `@xihan-report/core` | Model layer: report schema, dataset descriptions, calculation and edit commands; pure TypeScript, no DOM |
| `@xihan-report/runtime` | Runtime: report and dashboard viewing for business pages; the `/xlsx` subpath lays reports out as sheets written by `@xihan-ui/xlsx` |
| `@xihan-report/designer` | Designer: visual report designer |

Dependencies point `designer → runtime → core`. Business pages only need the runtime; the designer is loaded only where templates are edited.

## Development

Requires Node.js 24+ and pnpm 11+.

```bash
cd report
pnpm install
pnpm build
```

Other commands: `pnpm typecheck`, `pnpm test`, `pnpm lint`.

Development preview (a demo of the report viewer and designer, not a product): start it from `report/` and open http://localhost:5193 .

```bash
pnpm dev
```

## Related projects

- [XiHan.Framework](https://github.com/XiHanFun/XiHan.Framework) - .NET modular development framework
- [XiHan.UI](https://github.com/XiHanFun/XiHan.UI) - Framework-agnostic headless UI component library
- [XiHan.BasicApp](https://github.com/XiHanFun/XiHan.BasicApp) - A polished general-purpose admin core built on XiHan.Framework and XiHan.UI
- [XiHan.PrintDesigner](https://github.com/XiHanFun/XiHan.PrintDesigner) - Framework-agnostic print designer
- [XiHan.FlowDesigner](https://github.com/XiHanFun/XiHan.FlowDesigner) - Framework-agnostic flow designer
- [XiHan.FormDesigner](https://github.com/XiHanFun/XiHan.FormDesigner) - Framework-agnostic form designer

## Contributing

Issues and pull requests are welcome. Commits follow the conventional commits format, and changes must pass CI lint, type checking, build and tests.

## Sponsorship

If this project helps your work, you are welcome to buy the author a coffee.

Sponsorship page: https://docs.xihanfun.com/cosmos/sponsor

## Copyright & License

Copyright (c) 2021-Present XiHanFun and contributors.

Licensed under the MIT License; see [License](./LICENSE).

The XiHan.ReportDesigner name, interface visual design and original visual expression belong to the author. Third-party services follow their own licenses and terms.

This project is provided for learning and reference only; the author assumes no risk arising from its use.
