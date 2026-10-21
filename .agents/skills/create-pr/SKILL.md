---
name: xihan-report-create-pr
description: 为 XiHan.ReportDesigner 准备、审查或创建 Pull Request 时使用。适用于生成 PR 标题与正文、比较当前分支和基线、填写仓库模板或执行 gh pr create；普通代码审查不使用。
---

# XiHan.ReportDesigner 创建 PR

## 前置检查

- 读 `git status --short --branch`；有 rebase、merge、未解决冲突或 detached HEAD 时不建 PR。
- 分支按 `AGENTS.md`「分支与 worktree」分组：`feat/<名>`、`fix/<名>`、`issue/<编号>`、`pr/<编号>-review`；还是 `claude/<名>` 这类工具前缀的，推送前改名。`issue/<编号>` 分支在「关联 Issue」填这个编号。
- base 是 `dev`；`main` 只接收发版，不无依据地改成 `main`。
- 用 `git log <base>..HEAD`、`git diff --stat <base>...HEAD` 与完整 diff 总结整条分支，不只看最后一笔。
- 核对提交信息、变更集（`report/.changeset/*.md`）、参考页（改了报表定义类型、属性、问题码、公开 API 或它们的注释，`docs/reference/` 要随 `pnpm gen` 重新生成）、语言包（新文案每种语言都有）、文档与测试是否与实际改动一致。

## PR 内容

严格使用 `.github/PULL_REQUEST_TEMPLATE.md` 的结构：关联 Issue、变更类型、变更说明、影响范围、自测清单、破坏性变更、补充说明 / 截图。

- 标题用 Conventional Commit 形态，scope 取 `core`、`runtime`、`designer`、`docs`、`repo`，概括使用者能感知的影响。
- 影响范围按模板写模型层 core、运行时 runtime、设计器 designer、构建工程或文档，再点名受影响的元素、报表定义字段与扩展点，不堆文件名。
- 自测清单只勾实际跑过的：`report/` 的 `pnpm lint`、`build`、`typecheck`、`test`；动了包的产物或 `exports` 的补 `gate:publish` 与 `smoke --pack`；改了 `docs/` 的补 `gate:gen`、`check:examples`、`lint`、`typecheck`、`build`。没跑或失败的写明原因。「未引入第三方运行时依赖」「模板仍是纯数据」两条对照 diff 核过再勾。
- 公开面变化要有正确级别的变更集；破坏性变化写清旧写法与新写法。界面上的改动在「补充说明 / 截图」附 playground 或文档站的截图。

只要求草稿时只输出标题和正文，不写远程。明确要求创建 PR 时，确认分支已推送后用 `gh pr create --base dev`；可以推送当前分支，但不 force push、不合并、不改其他远端状态。创建后返回 PR 链接。
