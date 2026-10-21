---
name: xihan-report-commit-msg
description: 根据 XiHan.ReportDesigner 当前暂存区生成提交信息时使用。适用于“提交信息”“commit msg”“msg”或提交前概括 staged changes；只生成消息，不负责暂存、解决冲突或执行提交。
---

# XiHan.ReportDesigner 提交信息

## 工作流

1. 运行 `git status --short --branch`；有未解决冲突或进行中的 merge / rebase 时停下指出，不生成假定已完成的消息。
2. 只读 `git diff --cached --stat`、`git diff --cached` 与 `git log -20 --oneline`；未暂存的改动不纳入，除非用户明确要求。
3. 暂存区为空时直接说明，不按工作区或聊天内容猜消息。
4. 把全部暂存改动归纳成一个意图，写一行标题；要正文时写改了什么、为什么这样设计（源码注释只写做什么，设计理由写在这里），以及跑过哪些门禁。
5. 交出前核一遍行宽：消息写进文件后运行 `node .agents/skills/commit-msg/scripts/check-lines.mjs <文件>`，或经管道传入；核已有提交用 `git log -1 --format=%B | node .agents/skills/commit-msg/scripts/check-lines.mjs`。退出码不是 0 就改到通过为止。

## 格式

`<type>(<scope>): <中文说明>`，type 取 `feat`、`fix`、`refactor`、`perf`、`docs`、`style`、`test`、`build`、`ci`、`chore`、`revert`。

- scope 取 `core`、`runtime`、`designer`、`docs`、`repo`，跨几层时组合，如 `feat(runtime,designer)`；不逐文件罗列。
- 发版那一笔固定写 `build: v<版本>`；改依赖、锁文件与工作区配置用 `build`。
- 删除或改名公开 API、元素的属性 / 事件 / 方法、报表定义结构、问题码或扩展点时在 type 后加 `!`，并确认附了 major 变更集。
- 标题与正文每行不超过 100 个字符，按字符数计，一个汉字算一个；说明以中文开头，写使用者能感知的结果，不写「改了某文件」。
- 不加任何署名行，如 `Co-Authored-By`、`Generated with`。

只要求消息时，最终只输出标题（要正文时再附正文），不附解释、代码块或候选列表。
