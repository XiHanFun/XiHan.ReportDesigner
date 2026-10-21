---
name: xihan-report-changelog-collect
description: 收集 XiHan.ReportDesigner 两个版本或引用之间使用者能感知的变化、核对变更集或更新文档站 docs/changelog.md 时使用。适用于“更新日志”“changelog”“这版改了什么”“补变更集”；不提升版本、不消费变更集，也不发布。
---

# XiHan.ReportDesigner 更新日志整理

## 事实源

- 用户给的起止标签或提交；没给终点用当前 HEAD，没给起点时先提出最近的 `v*` 标签（`git describe --tags --abbrev=0 --match "v*"`）请用户确认。
- `git log <from>..<to>`、实际 diff、`report/.changeset/*.md`。预发布期间已消费的变更集名记在 `report/.changeset/pre.json` 的 `changesets` 里，文件还留在目录中，不要当成新的再收一遍。
- 三个包的 `CHANGELOG.md`（`report/packages/{core,runtime,designer}/`）与 `docs/changelog.md` 现有的分类、语气与格式。

## 收录规则

- 只收使用者能感知的变化，开头标 **新增 / 修复 / 调整 / 移除**：公开 API、`<xh-report-viewer>` 与 `<xh-report-designer>` 的属性 / 事件 / 方法、报表定义结构、计算结果、导出的文件、扩展点、样式外观、语言包文案与问题码。
- CI、测试、文档站、playground、构建与发版脚本、README 不收，除非改变了发出去的产物或用法。
- 每条写使用者得到什么、要做什么，不写「改了某个函数」；包名、元素名、属性与事件用反引号。官方平实口径，不写营销语。
- 同一变化跨 core、runtime、designer 的合成一条；破坏性变化写清旧写法与新写法。
- 三个包锁步同版，`docs/changelog.md` 一版一节，标题照现有格式 `## v<版本>（YYYY-MM-DD）`，日期写计划发布那天。

变更集是逐笔的发布输入，`docs/changelog.md` 是版本级摘要，两者互相核对：使用者能感知的改动没有附变更集的，列出来请用户决定补不补，级别按 `report/.changeset/README.md`。本技能不跑 `VersionUpgrade` 或 `changeset version`，不删变更集，不改版本号；定版本见 `xihan-report-version-release`。
