---
name: xihan-report-version-release
description: 为 XiHan.ReportDesigner 定版本、消费变更集、续 rc 预发布或转正式版、打 v* 标签、看 Release 工作流发 npm 与部署文档站，或发完核对 dist-tags、补跑冒烟时使用。适用于“发版”“升版本”“打标签”“rc.N”“冒烟失败”；只有用户明确要求时才推送、打标签或触发发布。
---

# XiHan.ReportDesigner 版本发布

## 前置条件

- 工作区无冲突、没有进行中的 merge / rebase，在 `dev` 上做；detached HEAD 不发版。
- 三个公开包 `@xihan-report/core`、`runtime`、`designer` 经 changesets 的 `fixed` 组锁步同版；版本真源是三包的 `version`，预发布状态在 `report/.changeset/pre.json`。
- 标签写 `v<版本>`（如 `v1.0.0-rc.2`），打在 `main` 历史里的提交上，标签号等于三包版本、预发布通道与 `pre.json` 一致：本地用 `RELEASE_TAG=<标签> node scripts/release/check-release-tag.mjs` 核，Release 工作流开头也核这两条。
- 推送、合并 main、打标签、发布都要用户当时明确同意；同意一次只管这一次。

## 准备版本

1. 核对上一个 `v*` 标签以来的变更集与实际改动对得上（`xihan-report-changelog-collect`）。
2. 在 `report/` 跑 `scripts/release/VersionUpgrade.bat`（或 `pwsh scripts/release/VersionUpgrade.ps1`），不替用户预选通道与级别。参数：`-Channel keep|alpha|beta|rc|release`、`-Level derived|major|minor|patch`（强制级别要同时给 `-Reason`，理由会进 CHANGELOG）、`-Yes` 跳过确认、`-DryRun` 只打印计划。rc 号怎么推、怎么续与转正见 [references/rc-numbering.md](references/rc-numbering.md)。
3. 核对三包同版、各包 `CHANGELOG.md`、`pre.json` 与被消费的变更集；同一笔在 `docs/changelog.md` 补这一版的一节，日期写计划发布那天（导航上的版本号取 core 的版本，不用改）。
4. 门禁全跑：`report/` 的 `pnpm lint`、`build`、`typecheck`、`test`、`gate:publish`、`smoke --pack`，`docs/` 的 `gate:gen`、`check:examples`、`lint`、`typecheck`、`build`，再 `git diff --check`。全过才提交 `build: v<版本>`。
5. 推 dev，等 CI 全绿；`git fetch . dev:main` 把 main 快进到 dev（不是快进就停下查），推 main，等 CI 全绿。推上去的提交不再 amend 或 rebase。

## 发布

用户明确要求后，在 main 的版本提交上打附注标签并推送：

```bash
git tag -a v<版本> -m "v<版本>" main
git push origin v<版本>
```

Release 工作流（`.github/workflows/release.yml`）依次是：核对标签 → 发到 npm（构建、`gate:publish`、`changeset publish` 带 provenance，凭组织级 `NPM_TOKEN`）→ 发布后冒烟（`smoke.mjs --version` 在空项目里装刚发的版本、类型检查与打包）→ 部署文档站（调 `deploy-docs.yml`）。只看 `gh run view <run-id>` 的摘要，要日志时只取失败的 job。npm 包的版本不建 GitHub Release。

发完核对：

```bash
npm view @xihan-report/core dist-tags
npm view @xihan-report/runtime dist-tags
npm view @xihan-report/designer dist-tags
```

还没发过正式版时，预发布版会同时进 `rc` 与 `latest`；npm 给新包首发自动建的 `0.0.0-stage` 占位不是我们发的。

### 冒烟报找不到版本

冒烟报「npm 上找不到 …」、E404、ETARGET、No matching version 时，多半是 npm 还没同步完（脚本只等 12 × 10 秒，新版本可能晚到十分钟）：

1. 等 `npm view @xihan-report/core@<版本> version` 取得到。
2. `gh run rerun <run-id> --failed` 补跑冒烟与部署。job 卡在 in_progress、`--failed` 被拒时，改用 `gh run rerun --job <冒烟的 job id>`，job id 在 `gh run view <run-id>` 的 JOBS 列表里。

其他失败停下报原文。不删标签重打、不移动标签掩盖问题、不手改 dist、不重复发已存在的版本。

## 文档站部署

- 文档站随 Release 部署。`deploy-docs.yml` 只部署已经发布的版本：当前版本有标签、main 上的包与标签一致、npm 上查得到；不满足时跳过部署，不是失败。
- 两次发版之间挑进 main 的纯文档修正，推到 main 后（改了 `docs/` 或 `report/`）也会触发部署；进了 main 以后立刻把 main 合回 dev。
- 部署后打开 https://report.docs.xihanfun.com 看导航上的版本号、「更新日志」与 `llms.txt`。`docs/public/CNAME`、`docs/public/.nojekyll` 与部署工作流属于站点契约，不删。
