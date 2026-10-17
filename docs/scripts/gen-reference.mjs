/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 从源码生成 reference/ 下的参考页：属性取自 @xihan-report/core 的属性描述，中文名与问题说明取自 reportZhCN，
// 类型、元素的属性、方法与事件取自 report/packages 的 TypeScript 源码与注释，设计器零件的共有类型经 TypeScript 读出。
// 带 --check 时只比对，与已提交的页面不一致就列出并以非零退出。

import { existsSync, readFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import * as core from '@xihan-report/core'
import { reportZhCN } from '@xihan-report/runtime/locale'
import ts from 'typescript'

const docsDir = fileURLToPath(new URL('../', import.meta.url))
const repoDir = join(docsDir, '..')
const checkOnly = process.argv.includes('--check')

const GENERATED = '<!-- 本页由 docs/scripts/gen-reference.mjs 从源码生成，不要手改；源码变了之后在 docs/ 运行 pnpm gen。 -->'

const t = reportZhCN.translations['xh-report-designer']

function packageSource(...parts) {
  return join(repoDir, 'report', 'packages', ...parts)
}

// —— Markdown ——

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 行内代码；含 {{ 的写成 v-pre 的 <code>，免得被当成 Vue 插值。 */
function code(text, cell = false) {
  if (text.includes('{{'))
    return `<code v-pre>${escapeHtml(text).replace(/\|/g, '&#124;')}</code>`
  const body = cell ? text.replace(/\|/g, '\\|') : text
  return body.includes('`') ? `\`\` ${body} \`\`` : `\`${body}\``
}

/** 注释里的一段话：反引号里的按代码写，其余转义尖括号、花括号与表格里的竖线。 */
function prose(text, cell = false) {
  return text.split(/(`[^`]*`)/).map((part, index) => {
    if (index % 2 === 1)
      return code(part.slice(1, -1), cell)
    const escaped = escapeHtml(part).replace(/\{\{/g, '&#123;&#123;')
    return cell ? escaped.replace(/\|/g, '\\|') : escaped
  }).join('')
}

/** 注释里折行的两段接起来：两边都是 ASCII 字母数字时补一个空格。 */
function joinWrapped(left, right) {
  return /[\w)]$/.test(left) && /^[\w(`]/.test(right) ? `${left} ${right}` : `${left}${right}`
}

/** 注释按段落与列表项分块：普通行接到上一块，列表项另起一块。 */
function docBlocks(doc) {
  const blocks = []
  for (const line of doc.split('\n').map(item => item.trim()).filter(Boolean)) {
    if (line.startsWith('- ') || blocks.length === 0)
      blocks.push(line)
    else
      blocks[blocks.length - 1] = joinWrapped(blocks.at(-1), line)
  }
  return blocks
}

/** 注释写进表格单元格：并成一行，列表项另起一行。 */
function cellDoc(doc) {
  return docBlocks(doc).map(block => prose(block, true)).join('<br>')
}

/** 注释写成段落：列表项保留为 Markdown 列表。 */
function blockDoc(doc) {
  return docBlocks(doc).map((block, index) => {
    const text = prose(block)
    if (index === 0)
      return text
    return block.startsWith('- ') ? `\n${text}` : `\n\n${text}`
  }).join('')
}

function table(head, rows) {
  if (rows.length === 0)
    return ''
  return [
    `| ${head.join(' | ')} |`,
    `| ${head.map(() => '---').join(' | ')} |`,
    ...rows.map(row => `| ${row.join(' | ')} |`),
  ].join('\n')
}

function page(title, intro, sections) {
  return `${[`# ${title}`, GENERATED, intro, ...sections].filter(Boolean).join('\n\n')}\n`
}

function anchorOf(name) {
  return name.toLowerCase()
}

// —— TypeScript 源码 ——

const sourceCache = new Map()

function sourceFile(file) {
  let source = sourceCache.get(file)
  if (source === undefined) {
    source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true)
    sourceCache.set(file, source)
  }
  return source
}

function flat(node) {
  return node.getText().replace(/\s+/g, ' ').trim()
}

/** 节点的注释原文：按行去掉注释符号，文中的 @xihan-ui/... 之类不当作标签。 */
function jsdoc(node) {
  const doc = ts.getJSDocCommentsAndTags(node).filter(item => item.kind === ts.SyntaxKind.JSDoc).at(-1)
  if (doc === undefined)
    return ''
  return doc.getText()
    .replace(/^\/\*\*/, '')
    .replace(/\*\/$/, '')
    .split('\n')
    .map(line => line.replace(/^\s*\* ?/, '').trimEnd())
    .join('\n')
    .trim()
}

function nameOf(node) {
  const name = node.name
  if (name === undefined)
    return ''
  return ts.isStringLiteral(name) || ts.isIdentifier(name) || ts.isPrivateIdentifier(name) ? name.text : name.getText()
}

function hasModifier(node, kind) {
  return ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some(modifier => modifier.kind === kind)
}

function isExported(statement) {
  return hasModifier(statement, ts.SyntaxKind.ExportKeyword)
}

function declarationsOf(source) {
  const found = new Map()
  for (const statement of source.statements) {
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations)
        found.set(declaration.name.getText(), { node: declaration, statement, exported: isExported(statement) })
      continue
    }
    const name = nameOf(statement)
    if (name !== '')
      found.set(name, { node: statement, statement, exported: isExported(statement) })
  }
  return found
}

function declaration(file, name) {
  const found = declarationsOf(sourceFile(file)).get(name)
  if (found === undefined)
    throw new Error(`[gen-reference] ${name} not found in ${file}`)
  return found
}

/** 参数列表：带缺省值的参数写成可选，不写缺省值。 */
function parameters(node) {
  return node.parameters.map((parameter) => {
    const optional = parameter.questionToken !== undefined || parameter.initializer !== undefined
    const rest = parameter.dotDotDotToken === undefined ? '' : '...'
    const type = parameter.type === undefined ? '' : `: ${flat(parameter.type)}`
    return `${rest}${parameter.name.getText()}${optional ? '?' : ''}${type}`
  }).join(', ')
}

function signature(name, node) {
  const typeParameters = node.typeParameters === undefined ? '' : `<${node.typeParameters.map(flat).join(', ')}>`
  const returns = node.type === undefined ? '' : `: ${flat(node.type)}`
  return `${name}${typeParameters}(${parameters(node)})${returns}`
}

/** 接口的成员：函数类型的属性当作方法。 */
function interfaceMembers(file, name) {
  const { node } = declaration(file, name)
  if (!ts.isInterfaceDeclaration(node))
    throw new Error(`[gen-reference] ${name} is not an interface`)
  return node.members.map((member) => {
    const memberName = ts.isIndexSignatureDeclaration(member) ? `[${parameters(member)}]` : nameOf(member)
    const doc = jsdoc(member)
    const optional = member.questionToken !== undefined
    const readonly = hasModifier(member, ts.SyntaxKind.ReadonlyKeyword)
    if (ts.isMethodSignature(member))
      return { kind: 'method', name: memberName, signature: signature(memberName, member), doc, optional }
    if (ts.isPropertySignature(member) && member.type !== undefined && ts.isFunctionTypeNode(member.type))
      return { kind: 'method', name: memberName, signature: signature(memberName, member.type), doc, optional }
    return { kind: 'property', name: memberName, type: member.type === undefined ? 'unknown' : flat(member.type), doc, optional, readonly }
  })
}

function heritageOf(node) {
  return (node.heritageClauses ?? []).flatMap(clause => clause.types.map(flat))
}

/** 元素类：注册的属性、声明的字段与存取器、公开方法。 */
function classMembers(file, className) {
  const { node } = declaration(file, className)
  const config = new Map()
  const properties = []
  const accessors = new Map()
  const methods = []
  for (const member of node.members) {
    const name = nameOf(member)
    const isStatic = hasModifier(member, ts.SyntaxKind.StaticKeyword)
    if (isStatic && ts.isPropertyDeclaration(member) && name === 'properties' && member.initializer !== undefined && ts.isObjectLiteralExpression(member.initializer)) {
      for (const property of member.initializer.properties) {
        const options = {}
        if (ts.isObjectLiteralExpression(property.initializer)) {
          for (const item of property.initializer.properties)
            options[nameOf(item)] = item.initializer.getText()
        }
        config.set(nameOf(property), options)
      }
      continue
    }
    if (isStatic || ts.isPrivateIdentifier(member.name ?? member) || hasModifier(member, ts.SyntaxKind.ProtectedKeyword) || hasModifier(member, ts.SyntaxKind.PrivateKeyword))
      continue
    if (ts.isPropertyDeclaration(member) && hasModifier(member, ts.SyntaxKind.DeclareKeyword)) {
      properties.push({ name, type: flat(member.type), doc: jsdoc(member) })
      continue
    }
    if (ts.isGetAccessorDeclaration(member)) {
      const entry = accessors.get(name) ?? { name }
      Object.assign(entry, { type: flat(member.type), doc: jsdoc(member) || entry.doc })
      accessors.set(name, entry)
      continue
    }
    if (ts.isSetAccessorDeclaration(member)) {
      const entry = accessors.get(name) ?? { name }
      Object.assign(entry, { writable: true, doc: entry.doc || jsdoc(member) })
      accessors.set(name, entry)
      continue
    }
    if (ts.isMethodDeclaration(member) && !hasModifier(member, ts.SyntaxKind.OverrideKeyword))
      methods.push({ name, signature: signature(name, member), doc: jsdoc(member) })
  }
  const attribute = (name) => {
    const options = config.get(name)
    if (options === undefined || options.attribute === 'false')
      return undefined
    if (options.attribute !== undefined)
      return options.attribute.replace(/^'|'$/g, '')
    return name.toLowerCase()
  }
  return {
    properties: properties.filter(property => config.has(property.name)).map(property => ({ ...property, attribute: attribute(property.name) })),
    accessors: [...accessors.values()],
    methods,
  }
}

/** 字符串字面量联合的取值。 */
function literalUnion(file, name) {
  const { node } = declaration(file, name)
  const type = node.type
  const members = ts.isUnionTypeNode(type) ? type.types : [type]
  return members.map((member) => {
    if (!ts.isLiteralTypeNode(member) || !ts.isStringLiteral(member.literal))
      throw new Error(`[gen-reference] ${name} is not a string literal union`)
    return member.literal.text
  })
}

function functionSignature(file, name) {
  const { node } = declaration(file, name)
  return { signature: signature(name, node), doc: jsdoc(node) }
}

// —— 包里的类型：按包名经 TypeScript 解析，读出成员（含继承来的）与注释 ——

const probeFile = join(docsDir, '.gen-reference-probe.ts').replace(/\\/g, '/')
const probeOptions = {
  target: ts.ScriptTarget.ES2023,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  strict: true,
  skipLibCheck: true,
  noEmit: true,
  types: [],
}
const probes = new Map()

/**
 * 从包入口读一个类型：imports 是 [包名, 名字] 的列表，expression 是要读的类型（可以带类型参数）；
 * 返回 TypeScript 的检查器与类型。
 */
function probeType(imports, expression) {
  const key = `${JSON.stringify(imports)}#${expression}`
  const cached = probes.get(key)
  if (cached !== undefined)
    return cached
  const text = `${imports.map(([specifier, name]) => `import type { ${name} } from '${specifier}'`).join('\n')}\nexport type Probe = ${expression}\n`
  const host = ts.createCompilerHost(probeOptions)
  const getSourceFile = host.getSourceFile.bind(host)
  host.getSourceFile = (file, language, ...rest) => (file === probeFile ? ts.createSourceFile(file, text, language) : getSourceFile(file, language, ...rest))
  const fileExists = host.fileExists.bind(host)
  host.fileExists = file => file === probeFile || fileExists(file)
  const program = ts.createProgram([probeFile], probeOptions, host)
  const errors = ts.getPreEmitDiagnostics(program).filter(item => item.file?.fileName === probeFile)
  if (errors.length > 0)
    throw new Error(`[gen-reference] cannot resolve ${expression}: ${ts.flattenDiagnosticMessageText(errors[0].messageText, '\n')}`)
  const checker = program.getTypeChecker()
  const probe = program.getSourceFile(probeFile).statements.find(statement => ts.isTypeAliasDeclaration(statement))
  const result = { checker, type: checker.getTypeAtLocation(probe.name), node: probe }
  probes.set(key, result)
  return result
}

/** 从包入口读一个导出类型。 */
function packageType(specifier, name) {
  return probeType([[specifier, name]], name)
}

/** 包里一个字符串字面量联合的取值。 */
function packageLiterals(specifier, name) {
  const { type } = packageType(specifier, name)
  const members = type.isUnion() ? type.types : [type]
  return members.map((member) => {
    if (!member.isStringLiteral())
      throw new Error(`[gen-reference] ${name} from ${specifier} is not a string literal union`)
    return member.value
  })
}

const TYPE_FORMAT = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope

/** 包里一个接口（或对象类型）的全部成员：类型代入了类型参数，注释取声明处的原文。 */
function typeMembers({ checker, type, node }) {
  return checker.getPropertiesOfType(type).map((symbol) => {
    const declarationNode = symbol.declarations?.[0]
    const optional = (symbol.flags & ts.SymbolFlags.Optional) !== 0
    const doc = declarationNode === undefined ? '' : jsdoc(declarationNode)
    const memberType = checker.getNonNullableType(checker.getTypeOfSymbolAtLocation(symbol, node))
    const calls = memberType.getCallSignatures()
    const typeNode = declarationNode !== undefined && (ts.isPropertySignature(declarationNode) || ts.isPropertyDeclaration(declarationNode)) ? declarationNode.type : undefined
    if (calls.length === 1 && (declarationNode === undefined || ts.isMethodSignature(declarationNode) || (typeNode !== undefined && ts.isFunctionTypeNode(typeNode))))
      return { kind: 'method', name: symbol.name, signature: `${symbol.name}${checker.signatureToString(calls[0], undefined, TYPE_FORMAT)}`, doc, optional }
    return { kind: 'property', name: symbol.name, type: checker.typeToString(memberType, undefined, TYPE_FORMAT), doc, optional }
  })
}

// —— 渲染 API ——

function memberTable(members) {
  const properties = members.filter(member => member.kind === 'property')
  return table(['属性', '类型', '说明'], properties.map(member => [
    code(member.optional ? `${member.name}?` : member.name, true),
    code(member.type, true),
    cellDoc(member.doc),
  ]))
}

function methodTable(methods) {
  return table(['方法', '说明'], methods.map(method => [code(method.optional ? method.signature.replace('(', '?(') : method.signature, true), cellDoc(method.doc)]))
}

function interfaceSection(file, name, level = '###', intro = '') {
  const { node } = declaration(file, name)
  const members = interfaceMembers(file, name)
  const heritage = heritageOf(node)
  const methods = members.filter(member => member.kind === 'method')
  return [
    `${level} ${name} {#${anchorOf(name)}}`,
    blockDoc(jsdoc(node)),
    intro,
    heritage.length > 0 ? `继承 ${heritage.map(item => code(item)).join('、')}。` : '',
    memberTable(members),
    methodTable(methods),
  ].filter(Boolean).join('\n\n')
}

/** 文案接口：每个键的类型、说明与 reportZhCN 里的中文；带参数的文案写出中文的示例。 */
function translationsSection(file, name, key) {
  const zh = reportZhCN.translations[key]
  const sample = (member) => {
    const value = zh[member.name]
    if (typeof value === 'string')
      return prose(value, true)
    if (typeof value === 'function')
      return '（按参数生成）'
    if (value !== null && typeof value === 'object')
      return '（按键对照）'
    return '—'
  }
  const members = interfaceMembers(file, name)
  return [
    `### ${name} {#${anchorOf(name)}}`,
    blockDoc(jsdoc(declaration(file, name).node)),
    `文案键是 ${code(key)}，中文在 ${code('@xihan-report/runtime/locale')} 的 ${code('reportZhCN')} 里。`,
    table(['键', '类型', '说明', '中文'], members.map(member => [
      code(member.name, true),
      code(member.kind === 'method' ? member.signature.slice(member.name.length) : member.type, true),
      cellDoc(member.doc),
      sample(member),
    ])),
  ].filter(Boolean).join('\n\n')
}

/**
 * 包里的接口：成员含继承来的，按名字排。title 是小节名；imports 与 expression 同 probeType，
 * 不给 expression 时读 title 这个类型。
 */
function packageInterfaceSection(imports, title, intro, expression = title) {
  const members = typeMembers(probeType(imports, expression)).sort((a, b) => a.name.localeCompare(b.name))
  return [
    `### ${title} {#${anchorOf(title)}}`,
    intro,
    memberTable(members),
    methodTable(members.filter(member => member.kind === 'method')),
  ].filter(Boolean).join('\n\n')
}

/** 类型别名：注释加类型本身。 */
function typeSection(file, name) {
  const { node } = declaration(file, name)
  return [`### ${name} {#${anchorOf(name)}}`, blockDoc(jsdoc(node)), `\`\`\`ts\ntype ${name}${node.typeParameters === undefined ? '' : `<${node.typeParameters.map(flat).join(', ')}>`} = ${flat(node.type)}\n\`\`\``].filter(Boolean).join('\n\n')
}

function eventTable(file, name) {
  return table(['事件', 'detail', '说明'], interfaceMembers(file, name).map((member) => {
    const detail = /^CustomEvent<(.*)>$/.exec(member.type)?.[1] ?? member.type
    return [code(member.name, true), code(detail, true), cellDoc(member.doc)]
  }))
}

function elementSections(file, className, eventMap) {
  const { properties, accessors, methods } = classMembers(file, className)
  return [
    '### 属性',
    table(['属性', 'attribute', '类型', '说明'], properties.map(property => [
      code(property.name, true),
      property.attribute === undefined ? '—' : code(property.attribute, true),
      code(property.type, true),
      cellDoc(property.doc),
    ])),
    accessors.length > 0 ? '### 存取器' : '',
    table(['属性', '读写', '类型', '说明'], accessors.map(accessor => [
      code(accessor.name, true),
      accessor.writable ? '可读写' : '只读',
      code(accessor.type, true),
      cellDoc(accessor.doc ?? ''),
    ])),
    '### 方法',
    methodTable(methods),
    '### 事件',
    '事件都是冒泡的 `CustomEvent`。',
    eventTable(file, eventMap),
  ].filter(Boolean).join('\n\n')
}

/** 函数签名写成 TypeScript 代码块。 */
function fence(text) {
  return `\`\`\`ts\ndeclare function ${text}\n\`\`\``
}

function functionSection(file, name) {
  const { signature: text, doc } = functionSignature(file, name)
  return [`### ${name}() {#${anchorOf(name)}}`, fence(text), blockDoc(doc)].filter(Boolean).join('\n\n')
}

/** 常量：注释加取值。 */
function constantSection(file, name) {
  const { node, statement } = declaration(file, name)
  return [`### ${name} {#${anchorOf(name)}}`, blockDoc(jsdoc(statement)), `\`\`\`ts\nconst ${name} = ${node.initializer.getText()}\n\`\`\``].filter(Boolean).join('\n\n')
}

// —— 全部导出 ——

function resolveModule(fromFile, specifier) {
  const base = join(dirname(fromFile), specifier)
  for (const candidate of [`${base}.ts`, join(base, 'index.ts')]) {
    if (existsSync(candidate))
      return candidate
  }
  throw new Error(`[gen-reference] cannot resolve ${specifier} from ${fromFile}`)
}

const KIND_NAMES = {
  [ts.SyntaxKind.FunctionDeclaration]: '函数',
  [ts.SyntaxKind.ClassDeclaration]: '类',
  [ts.SyntaxKind.InterfaceDeclaration]: '接口',
  [ts.SyntaxKind.TypeAliasDeclaration]: '类型',
  [ts.SyntaxKind.VariableDeclaration]: '常量',
}

/** 注释的第一句。 */
function summary(doc) {
  const first = docBlocks(doc)[0] ?? ''
  const stop = first.indexOf('。')
  return stop >= 0 ? first.slice(0, stop + 1) : first
}

/** 入口文件导出的全部名字，按来源模块分组；转导出的外部包标注来源。 */
function exportIndex(entry) {
  const groups = new Map()
  const add = (module, name, info) => {
    const list = groups.get(module) ?? []
    if (!list.some(item => item.name === name))
      list.push({ name, ...info })
    groups.set(module, list)
  }
  /** 常量的说明：没写注释的字符串数组常量写出取值。 */
  const constantDoc = (statement, declarationNode) => {
    const doc = summary(jsdoc(statement))
    if (doc !== '')
      return doc
    let initializer = declarationNode.initializer
    while (initializer !== undefined && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer)))
      initializer = initializer.expression
    if (initializer !== undefined && ts.isArrayLiteralExpression(initializer) && initializer.elements.every(element => ts.isStringLiteral(element)))
      return `取值：${initializer.elements.map(element => `\`${element.text}\``).join('、')}。`
    return ''
  }
  const describe = (file, name) => {
    const source = sourceFile(file)
    const found = declarationsOf(source).get(name)
    if (found !== undefined) {
      if (found.node.kind === ts.SyntaxKind.VariableDeclaration)
        return { kind: '常量', doc: constantDoc(found.statement, found.node) }
      return { kind: KIND_NAMES[found.node.kind] ?? '—', doc: summary(jsdoc(found.node)) }
    }
    const reexport = source.statements.find(statement => ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined && (statement.exportClause?.elements ?? []).some(element => element.name.text === name))
    if (reexport === undefined)
      throw new Error(`[gen-reference] ${name} not found in ${file}`)
    return { kind: reexport.isTypeOnly ? '类型' : '常量', doc: `转导出自 ${reexport.moduleSpecifier.text}` }
  }
  const collect = (file, module) => {
    const source = sourceFile(file)
    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement)) {
        const specifier = statement.moduleSpecifier?.text
        if (specifier === undefined)
          continue
        if (!specifier.startsWith('.')) {
          const kind = statement.isTypeOnly ? '类型' : '常量'
          for (const element of statement.exportClause?.elements ?? [])
            add(module, element.name.text, { kind, doc: `转导出自 ${specifier}` })
          continue
        }
        const target = resolveModule(file, specifier)
        const targetModule = target.slice(entry.root.length + 1).replace(/\\/g, '/').replace(/\.ts$/, '')
        if (statement.exportClause === undefined) {
          collect(target, targetModule)
          continue
        }
        for (const element of statement.exportClause.elements)
          add(targetModule, element.name.text, describe(target, (element.propertyName ?? element.name).text))
        continue
      }
      if (!isExported(statement))
        continue
      if (ts.isVariableStatement(statement)) {
        for (const item of statement.declarationList.declarations)
          add(module, item.name.getText(), { kind: '常量', doc: constantDoc(statement, item) })
        continue
      }
      const name = nameOf(statement)
      if (name !== '')
        add(module, name, { kind: KIND_NAMES[statement.kind] ?? '—', doc: summary(jsdoc(statement)) })
    }
  }
  collect(entry.file, entry.file.slice(entry.root.length + 1).replace(/\\/g, '/').replace(/\.ts$/, ''))
  return groups
}

function exportIndexSection(title, entry) {
  const groups = exportIndex(entry)
  const parts = [`## ${title}`]
  for (const [module, items] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    parts.push(`### ${module}`)
    parts.push(table(['名称', '种类', '说明'], items.sort((a, b) => a.name.localeCompare(b.name)).map(item => [code(item.name, true), item.kind, prose(item.doc, true)])))
  }
  return parts.join('\n\n')
}

// —— 属性 ——

/** 属性的中文名：先找带对象种类的键，再找种类的前一段，最后按路径。 */
function propertyName(kind, key) {
  const labels = t.propertyLabels
  return labels[`${kind}:${key}`] ?? labels[`${kind.split('.')[0]}:${key}`] ?? labels[key] ?? key
}

function optionName(key, value) {
  return t.optionLabels[`${key}=${value}`] ?? t.optionLabels[String(value)]
}

/** JSON 编辑的属性：取值的形状。 */
const JSON_SHAPES = {
  parameters: '数据集参数名到[操作数](./schema#operand)的对照，见 [DataBinding](./schema#databinding)',
  sort: '[RowSortRule](./schema#rowsortrule) 的数组',
  options: '[ParameterOption](./schema#parameteroption) 的数组',
  targets: '[LinkTarget](./schema#linktarget) 的数组',
  annotations: '[CartesianAnnotationSpec](./schema#cartesianannotationspec) 的数组',
  indicators: '[RadarIndicatorSpec](./schema#radarindicatorspec) 的数组',
  thresholds: '数值的数组，由小到大',
}

/** 标签输入编辑的属性：每一项是什么。 */
const TAG_SHAPES = {
  levels: '维度 id 的数组，由上到下',
}

const FORMAT_KIND_NAMES = { number: '数值', percent: '百分比', date: '日期', rmbUpper: '人民币大写' }

function describeControl(control, key) {
  switch (control.kind) {
    case 'number': {
      const range = [
        control.min === undefined ? undefined : `≥ ${control.min}`,
        control.exclusiveMin === undefined ? undefined : `> ${control.exclusiveMin}`,
        control.max === undefined ? undefined : `≤ ${control.max}`,
      ].filter(Boolean)
      const unit = control.unit === undefined ? '' : `（${control.unit}）`
      return `${control.integer ? '整数' : '数值'}${unit}${range.length > 0 ? `，${range.join('，')}` : ''}`
    }
    case 'text':
      return `${control.multiline ? '多行文本' : '文本'}${control.placeholder === undefined ? '' : `，写作 ${code(control.placeholder, true)}`}`
    case 'boolean':
      return '布尔'
    case 'select':
      return control.options.map((option) => {
        const name = optionName(key, option.value)
        return name === undefined ? code(String(option.value), true) : `${code(String(option.value), true)} ${name}`
      }).join('、')
    case 'tags':
      if (TAG_SHAPES[key] === undefined)
        throw new Error(`[gen-reference] no shape for tags property ${key}`)
      return TAG_SHAPES[key]
    case 'format':
      return `[值格式](./schema#formatspec)${control.kinds === undefined ? '' : `，限${control.kinds.map(kind => FORMAT_KIND_NAMES[kind] ?? kind).join('、')}`}`
    case 'filter':
      return '[筛选条件树](./schema#filtergroup)'
    case 'json':
      if (JSON_SHAPES[key] === undefined)
        throw new Error(`[gen-reference] no shape for json property ${key}`)
      return JSON_SHAPES[key]
    case 'dataset':
      return '报表里的数据集 id'
    case 'field':
      return `所在数据集的字段名${control.types === undefined ? '' : `，限${control.types.map(type => optionName('', type) ?? type).join('、')}字段`}`
    case 'dimension':
      return '所在查询的维度 id'
    case 'measure':
      return '所在查询的度量 id'
    case 'queryKey':
      return '所在查询的维度或度量 id'
    case 'parameterValue':
      return '按参数的类型与是否多选取值'
    case 'card':
      return '看板上的卡片 id'
    case 'cardDimension':
      return '源卡片上能发出取值的维度 id'
    default:
      throw new Error(`[gen-reference] unknown property control kind: ${control.kind}`)
  }
}

function describeCondition(condition, kind) {
  if (condition === undefined)
    return ''
  if (condition.all !== undefined)
    return condition.all.map(item => describeCondition(item, kind)).join('且')
  if (condition.any !== undefined)
    return condition.any.map(item => describeCondition(item, kind)).join('或')
  if (condition.not !== undefined)
    return `不满足「${describeCondition(condition.not, kind)}」`
  const key = condition.path.join('.')
  const translated = propertyName(kind, key)
  const name = translated === key ? code(key, true) : `「${translated}」`
  if (condition.filled === true)
    return `写了${name}`
  if (condition.filled === false)
    return `没写${name}`
  if (condition.oneOf !== undefined)
    return `${name}为 ${condition.oneOf.map(value => code(String(value), true)).join('、')} 之一`
  if ('equals' in condition) {
    const value = condition.equals
    if (typeof value === 'boolean')
      return value ? `${name}打开` : `${name}关闭`
    return `${name}为 ${code(String(value), true)}`
  }
  throw new Error(`[gen-reference] unknown property condition ${JSON.stringify(condition)}`)
}

function propertyTable(kind, descriptors) {
  return table(['属性', '名称', '分组', '取值', '必填'], descriptors.map((descriptor) => {
    const key = descriptor.path.join('.')
    const condition = describeCondition(descriptor.visibleWhen, kind)
    return [
      code(key, true),
      propertyName(kind, key),
      t.propertyGroups[descriptor.group] ?? descriptor.group,
      `${describeControl(descriptor.control, key)}${condition === '' ? '' : `；${condition}时显示`}`,
      descriptor.required ? '是' : '可省',
    ]
  }))
}

function propertiesPage() {
  const groups = core.REPORT_PROPERTY_GROUPS.map(group => `${code(group)} ${t.propertyGroups[group]}`).join('、')
  const charts = core.CHART_TYPES.flatMap(type => [
    `### ${t.cardTypes[`chart.${type}`]} ${code(type)} {#chart-${type}}`,
    propertyTable(`chart.${type}`, core.chartProperties(type)),
  ])
  const views = ['table', 'group', 'crosstab'].flatMap(type => [
    `### ${t.cardTypes[`table.${type}`]} ${code(type)} {#view-${type}}`,
    propertyTable(`view.${type}`, core.viewProperties(type)),
  ])
  return page('属性', [
    '设计器的属性面板按下面的描述编辑报表里的对象。属性路径相对所在对象，嵌套属性用点连接；「名称」是属性面板里的中文名，「分组」是属性面板里的分区。',
    `分组的先后：${groups}。扩展可以给已有对象追加属性，路径不能与这里的重复。`,
  ].join('\n\n'), [
    '## 报表 {#document}',
    '没有选中任何对象时，属性面板编辑报表本身。路径相对 [ReportDocument](./schema#reportdocument)。',
    propertyTable('document', core.documentProperties()),
    '## 看板 {#dashboard}',
    '主体是看板、没有选中卡片时编辑看板。路径相对 [DashboardView](./schema#dashboardview)。',
    propertyTable('dashboard', core.dashboardProperties()),
    '## 卡片 {#card}',
    '卡片自身的属性。图表与指标卡片带查询，还有取数属性；表格卡片的取数属性在它的视图上，见[视图](#view)。',
    '### 图表与指标卡片 {#card-query}',
    propertyTable('card', core.cardProperties({ kind: 'chart' })),
    '### 表格卡片 {#card-table}',
    propertyTable('card', core.cardProperties({ kind: 'table' })),
    '## 图表 {#chart}',
    '图表卡片的图表配置，路径相对 [ChartSpec](./schema#chartspec)。柱线图的系列另见[系列](#series)。',
    ...charts,
    '### 系列 {#series}',
    '柱线图的一条系列，路径相对 [CartesianSeriesSpec](./schema#cartesianseriesspec)。',
    propertyTable('series', core.seriesProperties()),
    '## 指标 {#metric}',
    '指标卡片的指标配置，路径相对 [MetricSpec](./schema#metricspec)。',
    propertyTable('metric', core.metricProperties()),
    '## 视图 {#view}',
    '报表主体或表格卡片的视图，路径相对视图本身。',
    ...views,
    '## 字段栏里的项 {#items}',
    '在字段栏里选中一项时编辑它。',
    '### 列 {#column}',
    '明细表与分组报表的一列，路径相对 [TableColumn](./schema#tablecolumn)。',
    propertyTable('column', core.tableColumnProperties()),
    '### 分组 {#group-level}',
    '分组报表的一级分组，路径相对 [GroupLevel](./schema#grouplevel)。',
    propertyTable('group', core.groupLevelProperties()),
    '### 维度 {#dimension}',
    '查询或交叉表的一个维度，路径相对 [Dimension](./schema#dimension)。',
    propertyTable('dimension', core.dimensionProperties()),
    '### 度量 {#measure}',
    '查询或交叉表的一个度量，路径相对 [Measure](./schema#measure)。',
    propertyTable('measure', core.measureProperties()),
    '## 数据 {#data}',
    '在数据面板里选中字段或参数时编辑它。',
    '### 字段 {#field}',
    '数据集的一个字段，路径相对 [DatasetField](./schema#datasetfield)。',
    propertyTable('field', core.datasetFieldProperties()),
    '### 参数 {#parameter}',
    '报表的一个参数，路径相对 [ReportParameter](./schema#reportparameter)。',
    propertyTable('parameter', core.parameterProperties()),
    '## 联动 {#link}',
    '看板的一条联动，路径相对 [DashboardLink](./schema#dashboardlink)。',
    propertyTable('link', core.linkProperties()),
  ])
}

// —— 报表定义类型 ——

const SCHEMA_FILES = [
  ['报表与参数', 'document.ts'],
  ['数据集与取数', 'dataset.ts'],
  ['视图与看板', 'view.ts'],
  ['查询', 'query.ts'],
  ['筛选与排序', 'filter.ts'],
  ['图表', 'chart.ts'],
  ['取值', 'value.ts'],
  ['值格式', 'format.ts'],
  ['扩展数据', 'extension.ts'],
]

/** 转导出的类型里能列出取值的：取值来自 core 导出的常量。 */
const KNOWN_VALUES = {
  AggregateKind: 'AGGREGATE_KINDS',
  FilterOperator: 'FILTER_OPERATORS',
  SortDirection: 'SORT_DIRECTIONS',
  NullsPosition: 'NULLS_POSITIONS',
}

function schemaNames() {
  const names = new Set()
  for (const [, file] of SCHEMA_FILES) {
    const source = sourceFile(packageSource('core', 'src', 'schema', file))
    for (const [name, found] of declarationsOf(source)) {
      if (found.exported && (ts.isInterfaceDeclaration(found.node) || ts.isTypeAliasDeclaration(found.node)))
        names.add(name)
    }
    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement) && statement.isTypeOnly) {
        for (const element of statement.exportClause?.elements ?? [])
          names.add(element.name.text)
      }
    }
  }
  return names
}

/** 类型文字里出现的本页类型名换成页内链接。 */
function linkedType(text, names) {
  const html = escapeHtml(text).replace(/\|/g, '&#124;').replace(/\[/g, '&#91;').replace(/\]/g, '&#93;').replace(/\b[A-Z]\w*\b/g, word => (names.has(word) ? `<a href="#${anchorOf(word)}">${word}</a>` : word))
  return `<code>${html}</code>`
}

function valuesTable(values) {
  return table(['取值', '中文名'], values.map(value => [code(String(value), true), optionName('', value) ?? '—']))
}

function schemaPage() {
  const names = schemaNames()
  const sections = []
  for (const [title, file] of SCHEMA_FILES) {
    const path = packageSource('core', 'src', 'schema', file)
    const source = sourceFile(path)
    sections.push(`## ${title}`)
    for (const statement of source.statements) {
      if (ts.isExportDeclaration(statement) && statement.moduleSpecifier !== undefined) {
        if (!statement.isTypeOnly)
          continue
        for (const element of statement.exportClause?.elements ?? []) {
          const name = element.name.text
          const constant = KNOWN_VALUES[name]
          sections.push(`### ${name} {#${anchorOf(name)}}`)
          sections.push(`转导出自 ${code(statement.moduleSpecifier.text)}。${constant === undefined ? '' : `取值见常量 ${code(constant)}：`}`)
          if (constant !== undefined)
            sections.push(valuesTable(core[constant]))
        }
        continue
      }
      if (!isExported(statement))
        continue
      if (ts.isInterfaceDeclaration(statement)) {
        const name = nameOf(statement)
        const members = interfaceMembers(path, name)
        const heritage = heritageOf(statement)
        sections.push([
          `### ${name} {#${anchorOf(name)}}`,
          blockDoc(jsdoc(statement)),
          heritage.length > 0 ? `继承 ${heritage.map(item => linkedType(item, names)).join('、')} 的字段。` : '',
          table(['字段', '类型', '必填', '中文名', '说明'], members.map(member => [
            code(member.name, true),
            member.kind === 'method' ? code(member.signature, true) : linkedType(member.type, names),
            member.optional ? '可省' : '是',
            t.propertyLabels[member.name] ?? '—',
            cellDoc(member.doc),
          ])),
        ].filter(Boolean).join('\n\n'))
        continue
      }
      if (ts.isTypeAliasDeclaration(statement)) {
        const name = nameOf(statement)
        const type = statement.type
        const parts = [`### ${name} {#${anchorOf(name)}}`, blockDoc(jsdoc(statement))]
        if (name === 'DateBucket') {
          parts.push('取值见常量 `DATE_BUCKETS`：')
          parts.push(valuesTable(core.DATE_BUCKETS))
        }
        else if (name === 'FieldType') {
          parts.push('取值见常量 `FIELD_TYPES`：')
          parts.push(valuesTable(core.FIELD_TYPES))
        }
        else if (ts.isUnionTypeNode(type) && type.types.every(item => ts.isTypeReferenceNode(item))) {
          parts.push(`取其一：${type.types.map(item => linkedType(flat(item), names)).join('、')}。`)
        }
        else {
          parts.push(`类型：${linkedType(flat(type), names)}`)
        }
        sections.push(parts.filter(Boolean).join('\n\n'))
      }
    }
  }
  return page('报表定义类型', [
    `报表定义 ${code('ReportDocument')} 的全部类型，按 ${code('@xihan-report/core')} 的源码列出。当前 schema 版本 ${code('REPORT_SCHEMA_VERSION')} 为 ${code(String(core.REPORT_SCHEMA_VERSION))}。`,
    '报表定义是纯 JSON：数据集只描述字段与参数，不含数据；数据由取数回调按请求交回。各对象都可以带 `extensions`，放扩展自己的数据，见[扩展数据](#reportextensible)。「中文名」是设计器属性面板里的叫法，详见[属性](./properties)。',
  ].join('\n\n'), sections)
}

// —— 问题码 ——

/** 按问题码生成中文说明：参数写成 {名}；返回说明与用到的参数名。 */
function sampleIssue(issueCode) {
  const keys = []
  const params = new Proxy({}, {
    get(_, key) {
      if (typeof key !== 'string')
        return undefined
      if (!keys.includes(key))
        keys.push(key)
      return `{${key}}`
    },
  })
  return { text: t.issue({ code: issueCode, params }), keys }
}

function issueTable(codes) {
  return table(['问题码', '说明', '参数'], codes.map((issueCode) => {
    const { text, keys } = sampleIssue(issueCode)
    return [code(issueCode, true), prose(text, true), keys.map(key => code(key, true)).join('、') || '—']
  }))
}

function issuesPage() {
  const checker = packageSource('core', 'src', 'validate', 'checker.ts')
  const errors = packageSource('core', 'src', 'engine', 'errors.ts')
  return page('问题码', [
    '校验问题由 `validateDocument`、查看器的 `issues` 与设计器的问题列表给出，参数取值的问题由 `resolveParameters` 与查看器给出。问题不带文案，只有问题码、路径与参数；下表的说明来自中文语言包 `reportZhCN`，其中的 {名} 是参数，实际文案只含问题给出的参数。',
    '报表的问题都是错误级：有问题的报表定义查看器不取数，显示「报表定义有问题」；参数取值有问题时显示「报表参数缺少或取值不合格」。',
  ].join('\n\n'), [
    '## 通用问题码',
    `来自 ${code('@xihan-ui/designer-kit/schema')} 的 ${code('CommonIssueCode')}，按类型读取与属性检查时报出。`,
    issueTable(packageLiterals('@xihan-ui/designer-kit/schema', 'CommonIssueCode')),
    '## 报表的问题码',
    blockDoc(jsdoc(declaration(checker, 'REPORT_ISSUE_CODES').statement)),
    issueTable(core.REPORT_ISSUE_CODES),
    '## 参数取值的问题',
    blockDoc(jsdoc(declaration(packageSource('core', 'src', 'engine', 'parameters.ts'), 'PARAMETER_ISSUE_CODES').statement)),
    issueTable(core.PARAMETER_ISSUE_CODES),
    '## 扩展的问题码',
    '扩展自己的问题码写作扩展 id 的末段、一个点、码，如 `gantt.no-dates`；说明由扩展登记的 `issueText` 给出，设计器问题列表照样显示。',
    '## 计算错误',
    blockDoc(jsdoc(declaration(errors, 'ReportComputeError').node)),
    `${code('ReportComputeError')} 的码：${literalUnion(errors, 'ComputeErrorCode').map(item => code(item)).join('、')}。`,
  ])
}

// —— 查看器 ——

function viewerPage() {
  const viewer = packageSource('runtime', 'src', 'viewer', 'report-viewer.ts')
  const extensions = packageSource('runtime', 'src', 'extensions.ts')
  const translations = packageSource('runtime', 'src', 'translations.ts')
  const format = packageSource('runtime', 'src', 'viewer', 'format.ts')
  const tableFile = packageSource('runtime', 'src', 'viewer', 'table.ts')
  const charts = packageSource('runtime', 'src', 'viewer', 'charts.ts')
  const root = packageSource('runtime', 'src')
  return page('查看器', `${code('@xihan-report/runtime')} 的公开接口：查看器元素与相关类型。样式在 ${code('@xihan-report/runtime/style.css')}。`, [
    `## ${code('<xh-report-viewer>')}`,
    blockDoc(functionSignature(viewer, 'defineReportViewer').doc),
    elementSections(viewer, 'XhReportViewer', 'ReportViewerEventMap'),
    '## 函数',
    functionSection(viewer, 'defineReportViewer'),
    '## 取数',
    typeSection(viewer, 'ReportDataProvider'),
    interfaceSection(viewer, 'ReportDataContext'),
    '## 结果与事件',
    interfaceSection(extensions, 'ReportResults'),
    typeSection(viewer, 'ReportViewerIssue'),
    interfaceSection(tableFile, 'TableCellRef'),
    interfaceSection(charts, 'ChartPress'),
    '## 显示文字',
    typeSection(format, 'ReportFormatter'),
    interfaceSection(format, 'ReportFormatContext'),
    translationsSection(translations, 'ReportViewerTranslations', 'xh-report-viewer'),
    exportIndexSection('全部导出', { root, file: join(root, 'index.ts') }),
    exportIndexSection(`${code('@xihan-report/runtime/locale')} 的导出`, { root, file: join(root, 'locale.ts') }),
    exportIndexSection(`${code('@xihan-report/runtime/xlsx')} 的导出`, { root, file: join(root, 'xlsx', 'index.ts') }),
  ])
}

// —— 设计器 ——

function designerPage() {
  const designer = packageSource('designer', 'src', 'report-designer.ts')
  const editor = packageSource('designer', 'src', 'editor.ts')
  const translations = packageSource('runtime', 'src', 'designer-translations.ts')
  const root = packageSource('designer', 'src')
  return page('设计器', `${code('@xihan-report/designer')} 的公开接口。样式在 ${code('@xihan-report/designer/style.css')}，还要同时引入 ${code('@xihan-ui/designer-shell/style.css')} 与 ${code('@xihan-report/runtime/style.css')}。`, [
    `## ${code('<xh-report-designer>')}`,
    blockDoc(functionSignature(designer, 'defineReportDesigner').doc),
    elementSections(designer, 'XhReportDesigner', 'ReportDesignerEventMap'),
    '## 函数',
    functionSection(designer, 'defineReportDesigner'),
    functionSection(editor, 'readReportClipboard'),
    functionSection(editor, 'writeReportClipboard'),
    '## 类型',
    typeSection(designer, 'ReportDesignerMode'),
    typeSection(designer, 'ReportDatasetEditing'),
    typeSection(designer, 'ReportSchemaChangeKind'),
    constantSection(designer, 'REPORT_DESIGNER_PANELS'),
    interfaceSection(editor, 'ReportSelection'),
    interfaceSection(editor, 'ReportItemRef'),
    typeSection(editor, 'ReportDataRef'),
    typeSection(editor, 'ReportAddCardInit'),
    interfaceSection(editor, 'ReportAddExtensionCardInit'),
    interfaceSection(editor, 'ReportClipboard'),
    translationsSection(translations, 'ReportDesignerTranslations', 'xh-report-designer'),
    exportIndexSection('全部导出', { root, file: join(root, 'index.ts') }),
  ])
}

// —— 扩展 ——

function extensionsPage() {
  const coreExtensions = packageSource('core', 'src', 'extensions.ts')
  const runtimeExtensions = packageSource('runtime', 'src', 'extensions.ts')
  const designerExtensions = packageSource('designer', 'src', 'extensions.ts')
  const context = packageSource('runtime', 'src', 'viewer', 'context.ts')
  return page('扩展', `扩展按实例传入：查看器与设计器的 ${code('extensions')} 属性，以及 core 各入口的 ${code('extensions')} 选项。扩展分三层，逐层是超集：core 层只有纯数据与纯函数，运行时层加渲染、叠加层、导出与取数中间件，设计器层再加物料、命令、面板与属性编辑器。四款设计器共有的部分来自 ${code('@xihan-ui/designer-kit')} 与 ${code('@xihan-ui/designer-shell')}。`, [
    '## core 层',
    functionSection(coreExtensions, 'createReportModel'),
    interfaceSection(coreExtensions, 'ReportCoreExtension'),
    packageInterfaceSection([['@xihan-ui/designer-kit', 'DesignerExtensionCore'], ['@xihan-report/core', 'ReportDocument, ReportRuleContext']], 'DesignerExtensionCore', `${code('ReportCoreExtension')} 继承的共有部分，出自 ${code('@xihan-ui/designer-kit')}，类型参数代入报表的。`, 'DesignerExtensionCore<ReportDocument, ReportRuleContext>'),
    interfaceSection(coreExtensions, 'ReportCardKind'),
    interfaceSection(coreExtensions, 'ReportViewKind'),
    typeSection(coreExtensions, 'ReportCardData'),
    typeSection(coreExtensions, 'ReportViewData'),
    interfaceSection(coreExtensions, 'ReportKindInput'),
    interfaceSection(coreExtensions, 'ReportKindCheck'),
    interfaceSection(coreExtensions, 'ReportQueryIds'),
    typeSection(coreExtensions, 'ReportPropertyTarget'),
    interfaceSection(coreExtensions, 'ReportRuleContext'),
    interfaceSection(coreExtensions, 'ReportModel'),
    interfaceSection(coreExtensions, 'ReportKindEntry'),
    '## 运行时层',
    functionSection(runtimeExtensions, 'createReportRuntimeModel'),
    interfaceSection(runtimeExtensions, 'ReportRuntimeExtension'),
    typeSection(runtimeExtensions, 'ReportCardRenderer'),
    typeSection(runtimeExtensions, 'ReportViewRenderer'),
    typeSection(runtimeExtensions, 'ReportRendered'),
    interfaceSection(context, 'RenderContext'),
    interfaceSection(runtimeExtensions, 'ReportOverlay'),
    interfaceSection(runtimeExtensions, 'ReportScene'),
    interfaceSection(runtimeExtensions, 'ReportSceneCard'),
    interfaceSection(runtimeExtensions, 'ReportOverlayContext'),
    packageInterfaceSection([['@xihan-ui/designer-kit', 'DesignerExporter'], ['@xihan-report/runtime', 'ReportExportContext']], 'DesignerExporter', `导出器的形状，出自 ${code('@xihan-ui/designer-kit')}，上下文代入报表的 ${code('ReportExportContext')}。`, 'DesignerExporter<ReportExportContext>'),
    interfaceSection(runtimeExtensions, 'ReportExportContext'),
    typeSection(runtimeExtensions, 'ReportDataMiddleware'),
    interfaceSection(runtimeExtensions, 'ReportRuntimeModel'),
    '## 设计器层',
    functionSection(designerExtensions, 'createReportDesignerModel'),
    packageInterfaceSection([['@xihan-report/designer', 'ReportDesignerExtension']], 'ReportDesignerExtension', `设计器层的扩展：运行时层的全部，加上设计器零件的命令、面板、属性编辑器与 ${code('setup')}，以及报表的物料。下表列出它的全部成员，含继承来的。`),
    packageInterfaceSection([['@xihan-report/designer', 'ReportDesignerCommand']], 'ReportDesignerCommand', `设计器的命令：${code('@xihan-ui/designer-kit')} 的 ${code('DesignerCommand')}，上下文是 ${code('ReportDesignerContext')}。`),
    interfaceSection(designerExtensions, 'ReportDesignerContext'),
    typeSection(designerExtensions, 'ReportMenuSubject'),
    interfaceSection(designerExtensions, 'ReportPaletteGroup'),
    interfaceSection(designerExtensions, 'ReportPaletteItem'),
    typeSection(designerExtensions, 'ReportCardTemplate'),
    constantSection(designerExtensions, 'REPORT_TOOLBAR_LAYOUT'),
    constantSection(designerExtensions, 'REPORT_MENU_LAYOUT'),
    interfaceSection(designerExtensions, 'ReportDesignerModel'),
  ])
}

// —— 模型层 ——

function corePage() {
  const root = packageSource('core', 'src')
  return page('模型层 core', `${code('@xihan-report/core')} 是纯 TypeScript 的模型层：报表定义的类型、校验、取数请求、计算、编辑操作与扩展的合并，不依赖 DOM，浏览器、Node.js 与其它 JavaScript 运行环境里都能用。报表定义的字段见[报表定义类型](./schema)，属性见[属性](./properties)。下表按源码模块列出全部导出。`, [
    exportIndexSection('全部导出', { root, file: join(root, 'index.ts') }),
  ])
}

// —— 输出 ——

const pages = {
  'reference/schema.md': schemaPage(),
  'reference/properties.md': propertiesPage(),
  'reference/issues.md': issuesPage(),
  'reference/viewer.md': viewerPage(),
  'reference/designer.md': designerPage(),
  'reference/extensions.md': extensionsPage(),
  'reference/core.md': corePage(),
}

const stale = []
for (const [relative, content] of Object.entries(pages)) {
  const target = join(docsDir, relative)
  const current = existsSync(target) ? await readFile(target, 'utf8') : undefined
  if (current === content)
    continue
  stale.push(relative)
  if (!checkOnly) {
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, content)
  }
}

if (checkOnly && stale.length > 0) {
  console.error(`参考页与源码不一致，在 docs/ 运行 pnpm gen 重新生成：\n${stale.map(item => `  ${item}`).join('\n')}`)
  process.exit(1)
}
console.log(stale.length === 0 ? '参考页已是最新' : `已生成：${stale.join('、')}`)
