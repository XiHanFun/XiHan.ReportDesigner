/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DefaultTheme } from 'vitepress'
import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineXiHanConfig } from '@xihanfun/vitepress-theme/config'

const title = '曦寒报表设计器文档'
const description = '框架无关的报表设计器与查看器，以 Web Components 交付'
const keywords = '曦寒,曦寒懿,报表设计器,报表查看器,数据看板,交叉表,透视表,Web Components,XiHanFun,XiHan.ReportDesigner'

const sourceRoot = fileURLToPath(new URL('../', import.meta.url))

// 三个公开包锁步同版，导航上的版本号取 core 的
const { version } = JSON.parse(readFileSync(new URL('../../report/packages/core/package.json', import.meta.url), 'utf8')) as { version: string }

const guideSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: '开始',
    collapsed: false,
    items: [
      { text: '介绍', link: '/introduction' },
      { text: '快速开始', link: '/quickstart' },
    ],
  },
  {
    text: '指南',
    collapsed: false,
    items: [
      { text: '报表结构', link: '/guide/structure' },
      { text: '看板与卡片', link: '/guide/dashboard' },
      { text: '透视与交叉表', link: '/guide/pivot' },
      { text: '联动与下钻', link: '/guide/linking' },
      { text: '查看器', link: '/guide/viewer' },
      { text: '设计器', link: '/guide/designer' },
      { text: '导出', link: '/guide/export' },
      { text: '扩展', link: '/guide/extensions' },
      { text: '与宿主集成', link: '/guide/host' },
    ],
  },
]

// 参考页由 scripts/gen-reference.mjs 从源码生成
const referenceSidebar: DefaultTheme.SidebarItem[] = [
  {
    text: '报表定义',
    collapsed: false,
    items: [
      { text: '报表定义类型', link: '/reference/schema' },
      { text: '属性', link: '/reference/properties' },
      { text: '问题码', link: '/reference/issues' },
    ],
  },
  {
    text: 'API',
    collapsed: false,
    items: [
      { text: '查看器', link: '/reference/viewer' },
      { text: '设计器', link: '/reference/designer' },
      { text: '扩展', link: '/reference/extensions' },
      { text: '模型层 core', link: '/reference/core' },
    ],
  },
]

// 每个顶部导航板块各自一份侧栏，由路径前缀决定用哪一份；首页是 layout: home，不落任何一份。
const sidebar: DefaultTheme.Sidebar = {
  '/reference/': referenceSidebar,
  '/': guideSidebar,
}

const nav: DefaultTheme.NavItem[] = [
  { text: '指南', link: '/introduction', activeMatch: '^/(introduction|quickstart|guide/.*)$' },
  { text: '参考', link: '/reference/schema', activeMatch: '^/reference/' },
  {
    text: '生态',
    items: [
      {
        text: '官方生态',
        items: [
          { text: '开发框架', link: 'https://framework.docs.xihanfun.com' },
          { text: '视图组件', link: 'https://ui.docs.xihanfun.com' },
          { text: '基础应用', link: 'https://basicapp.docs.xihanfun.com' },
          { text: '打印设计器', link: 'https://print.docs.xihanfun.com' },
          { text: '表单设计器', link: 'https://form.docs.xihanfun.com' },
          { text: '报表设计器', link: '/' },
        ],
      },
    ],
  },
  {
    text: '支持',
    items: [
      { text: '公约', link: 'https://docs.xihanfun.com/cosmos/code-of-conduct' },
      { text: '参与', link: 'https://docs.xihanfun.com/cosmos/contributing' },
      { text: '赞助', link: 'https://docs.xihanfun.com/cosmos/sponsor' },
    ],
  },
  {
    text: `v${version}`,
    items: [{ text: '更新日志', link: '/changelog' }],
  },
]

/** 取代码文件里 `#region name` 与 `#endregion name` 之间的行，去掉公共缩进。 */
function region(source: string, name: string): string {
  const lines = source.split(/\r?\n/)
  const start = lines.findIndex(line => new RegExp(`#region ${name}\\b`).test(line))
  const end = lines.findIndex((line, index) => index > start && new RegExp(`#endregion ${name}\\b`).test(line))
  if (start < 0 || end < 0)
    throw new Error(`[docs] region ${name} not found`)
  const picked = lines.slice(start + 1, end)
  const indent = Math.min(...picked.filter(line => line.trim() !== '').map(line => /^ */.exec(line)![0].length))
  return picked.map(line => line.slice(indent)).join('\n')
}

/** 机读正文：`<<< @/路径#片段` 换成代码块，示例舞台去掉。 */
async function machineReadable(body: string): Promise<string> {
  const out: string[] = []
  for (const line of body.split(/\r?\n/)) {
    const snippet = /^<<< @\/([^\s#]+)(?:#(\S+))?/.exec(line)
    if (snippet !== null) {
      const [, path, name] = snippet
      const source = await readFile(`${sourceRoot}${path}`, 'utf8')
      const code = name === undefined ? source.trimEnd() : region(source, name)
      out.push(`\`\`\`${extname(path!).slice(1)}`, code, '```')
      continue
    }
    if (/^<ReportDemo\b.*\/>\s*$/.test(line))
      continue
    out.push(line)
  }
  return out.join('\n')
}

export default defineXiHanConfig({
  title,
  description,
  keywords,
  repo: 'XiHan.ReportDesigner',
  llms: {
    title: '曦寒报表设计器',
    summary:
      '框架无关的报表设计器与查看器：以原生 Web Components 交付，报表定义是纯 JSON，按数据集与参数取数后在浏览器里算出明细表、分组报表、交叉表与看板；看板的卡片可以联动、表格可以下钻，结果可以导出 Excel；设计器可视化编辑报表，按实例传入的扩展登记新的卡片与视图种类、渲染、叠加层、导出器、取数中间件、属性编辑器、命令与面板。',
    site: 'https://report.docs.xihanfun.com',
    sections: [
      { dir: '.', label: '开始' },
      { dir: 'guide', label: '指南' },
      { dir: 'reference', label: '参考' },
    ],
    bundles: [
      { name: 'guide', label: '指南', dirs: ['guide'] },
      { name: 'reference', label: '参考', dirs: ['reference'] },
    ],
    transform: machineReadable,
  },
  // 报表三个包经 link: 指向 report/，里面的 @xihan-ui/* 会从 report/ 工作区解析；去重成文档站装的这一份，
  // 页面上只有一份 UI，全局配置（中文语言包）与元素注册表才是同一份
  vite: {
    resolve: {
      dedupe: ['@xihan-ui/core', '@xihan-ui/designer-kit', '@xihan-ui/designer-shell', '@xihan-ui/expression', '@xihan-ui/icons', '@xihan-ui/viz', '@xihan-ui/web-components', '@xihan-ui/xlsx'],
    },
  },
  // Vue 示例里的 xh- 标签都是自定义元素，不当作 Vue 组件解析
  vue: {
    template: {
      compilerOptions: {
        isCustomElement: tag => tag.startsWith('xh-'),
      },
    },
  },
  themeConfig: {
    nav,
    sidebar,
  },
})
