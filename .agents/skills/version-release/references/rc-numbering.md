# rc 号怎么推

changesets 预发布号 `-rc.N` 里的 N 不记在 `pre.json`，按包**当前的** `version` 推：当前版本没有预发布后缀时 N=0，是 `x.y.z-rc.k` 时 N=k+1，fixed 组取组里最大的。基线同样取当前 `version`，再按变更集里最高的级别 `semver.inc`；`1.0.0-rc.k` 升 major、minor 还是 patch 都得 `1.0.0`。

所以 1.0.0 的 rc 期间，每次定版本都落在 `1.0.0-rc.<下一个号>`。

## 续 rc

`pre.json` 是 `mode: pre`、`tag: rc` 时，加好变更集后在 `report/`：

```bash
pwsh scripts/release/VersionUpgrade.ps1 -Channel keep -Level derived -Yes
```

`1.0.0-rc.1` 续出 `1.0.0-rc.2`。用掉的变更集记进 `pre.json` 的 `changesets`，文件留在目录里。

## 转正

`-Channel release` 退出预发布：出 `1.0.0`，`pre.json` 与预发布期间留着的变更集（含 `first-release.md`）一并删掉，各包 CHANGELOG 依次是 1.0.0 与之前各个 rc 的节。标签 `v1.0.0`。

## 从 0.0.0 首发直接落到 rc.1（已做过）

从 0.0.0 进 rc 只会出 `1.0.0-rc.0`。首发时的做法，结果是 `build: v1.0.0-rc.1` 那一笔：

1. `pnpm exec changeset pre enter rc`，必须在第 2 步之前，`initialVersions` 才记下真实的 0.0.0。
2. 三个公开包的 `version` 临时改成 `1.0.0-rc.0`，playground 不动。
3. `VersionUpgrade.ps1 -Channel keep -Level derived -Yes`，推导出 `1.0.0-rc.0 -> 1.0.0-rc.1`。

## 拿不准时先在临时 worktree 里试

```bash
git worktree add --detach <临时目录>/report-rc-trial HEAD
# 没提交的变更集先拷进 <临时目录>/report-rc-trial/report/.changeset/
cd <临时目录>/report-rc-trial/report
pnpm install --frozen-lockfile --ignore-scripts
pwsh scripts/release/VersionUpgrade.ps1 -Channel keep -Level derived -Yes
RELEASE_TAG=v<推出的版本> node scripts/release/check-release-tag.mjs
```

试完在 Windows 上用 `cmd /c "rmdir /s /q <Windows 路径>"` 删目录（不跟进 node_modules 里的链接），再在主检出 `git worktree prune`。不要把主检出的 node_modules 接进临时 worktree。
