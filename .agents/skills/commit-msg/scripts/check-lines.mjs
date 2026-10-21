#!/usr/bin/env node
// 检查提交信息每行不超过 100 个字符（按 Unicode 字符计），超出时列出行号并以 1 退出。
// 用法：node check-lines.mjs [消息文件]；不给文件时读标准输入。

import { readFileSync } from 'node:fs'
import process from 'node:process'

const LIMIT = 100
const text = readFileSync(process.argv[2] ?? 0, 'utf8')
const long = text
  .split(/\r?\n/)
  .map((line, index) => ({ line: index + 1, length: [...line].length }))
  .filter(({ length }) => length > LIMIT)

for (const { line, length } of long)
  console.error(`第 ${line} 行 ${length} 个字符，超过 ${LIMIT}`)

process.exit(long.length > 0 ? 1 : 0)
