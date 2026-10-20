// @vitest-environment jsdom
/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

import type { DashboardView, QueryResult, ReportDocument } from '@xihan-report/core'
import type { XhReportViewer } from '@xihan-report/runtime'
import type { ReportDesignerContext, ReportDesignerExtension, ReportDesignerImporter, XhReportDesigner } from '../src'
import { formatJsonPath } from '@xihan-ui/core/json'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createReportDesignerModel, defineReportDesigner, REPORT_DESIGNER_EXTENSION, REPORT_IMPORT_TEMPLATE_COMMAND } from '../src'

const board: ReportDocument = {
  schemaVersion: 1,
  id: 'board',
  datasets: [{ id: 'sales', fields: [{ name: 'region', type: 'string' }, { name: 'amount', type: 'number' }] }],
  body: {
    type: 'dashboard',
    grid: { columns: 12, rowHeight: 40 },
    cards: [{
      id: 'lanes',
      kind: 'lanes.board',
      title: '泳道',
      layout: { x: 0, y: 0, w: 6, h: 4 },
      dataset: 'sales',
      query: { dimensions: [{ id: 'region', field: 'region' }], measures: [{ id: 'amount', aggregate: 'sum', field: 'amount' }] },
    }],
  },
}

interface Probe {
  readonly runs: (readonly string[])[]
  readonly updates: number[]
  readonly setups: string[]
}

/** 一个外来扩展：卡片种类与渲染、追加的属性、物料、命令、面板与 setup，都记到 probe 里。 */
function lanesExtension(probe: Probe): ReportDesignerExtension {
  return {
    id: '@acme/lanes',
    cards: {
      'lanes.board': {
        data: 'query',
        compute: (_card, input) => (input.query as QueryResult).rows.map(row => String(row.region)),
      },
    },
    cardRenderers: {
      'lanes.board': (body, result) => {
        const list = document.createElement('ul')
        for (const lane of result.value as readonly string[]) {
          const item = document.createElement('li')
          item.textContent = lane
          list.append(item)
        }
        body.replaceChildren(list)
        return undefined
      },
    },
    properties: { 'card:lanes.board': [{ path: ['wip'], group: 'display', control: { kind: 'number', integer: true, min: 0 } }] },
    paletteGroups: [{ id: 'lanes.planning', label: 'Planning' }],
    palette: [{
      id: 'lanes.board',
      group: 'lanes.planning',
      label: 'Lanes',
      template: dataset => ({ kind: 'lanes.board', layout: { w: 6, h: 4 }, dataset, query: { dimensions: [], measures: [] } }),
    }],
    commands: [{
      id: '@acme/lanes.count',
      label: 'Count lanes',
      placement: ['toolbar', 'menu:card'],
      shortcut: ['Mod', 'Shift', 'L'],
      run: ({ designer }) => {
        probe.runs.push(designer.getSelection().cards)
      },
    }],
    panels: [{
      region: { name: 'lanes', position: 'end', label: 'Lanes' },
      create: (context: ReportDesignerContext) => {
        const element = document.createElement('div')
        element.dataset.test = 'lanes-panel'
        element.textContent = context.translations.label
        return {
          element,
          update: ({ designer }) => {
            probe.updates.push(designer.getSelection().cards.length)
          },
        }
      },
    }],
    setup: () => {
      probe.setups.push('up')
      return () => {
        probe.setups.push('down')
      }
    },
  }
}

function newProbe(): Probe {
  return { runs: [], updates: [], setups: [] }
}

beforeAll(() => {
  defineReportDesigner()
  Element.prototype.scrollIntoView ??= function () {}
})

beforeEach(() => {
  vi.spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get').mockReturnValue(20)
})

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

async function mount(extensions: readonly ReportDesignerExtension[] | undefined, options: { readonly provider?: boolean } = {}): Promise<XhReportDesigner> {
  const designer = document.createElement('xh-report-designer')
  // 用例里不自动开始新手引导，引导的用例自己打开
  designer.autoTour = false
  designer.extensions = extensions
  if (options.provider)
    designer.dataProvider = async () => ({ kind: 'rows', rows: [{ region: 'East', amount: 10 }, { region: 'West', amount: 5 }, { region: 'East', amount: 1 }] })
  designer.schema = board
  document.body.append(designer)
  await designer.updateComplete
  return designer
}

async function settle(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 300))
  await new Promise(resolve => setTimeout(resolve, 0))
}

function card(designer: XhReportDesigner, id: string): HTMLElement {
  return designer.querySelector(`[data-part="card"][data-card="${id}"]`)!
}

function toolbar(designer: XhReportDesigner): (string | null)[] {
  return [...designer.querySelectorAll('[data-region="toolbar"] button[value]')].map(item => item.getAttribute('value'))
}

function menuEntries(designer: XhReportDesigner): (string | null)[] {
  return [...designer.querySelectorAll('xh-context-menu [data-xh-part="positioner"] > [data-xh-part="content"] [data-xh-part="item"]')].map(item => item.getAttribute('value'))
}

/** 菜单栏上一张菜单里的命令 id；没有这张菜单时为 undefined。 */
function menubarItems(designer: XhReportDesigner, menu: string): string[] | undefined {
  const menubar = designer.querySelector<HTMLElement & { collection?: { value: string, items?: { value: string }[] }[] }>('xh-menubar')!
  return menubar.collection!.find(node => node.value === menu)?.items!.map(item => item.value.slice(menu.length + 1))
}

describe('createReportDesignerModel', () => {
  it('内置命令与物料在最前，扩展的按顺序在后；同一个数组只合一次', () => {
    const extensions = [lanesExtension(newProbe())]
    const model = createReportDesignerModel(extensions)
    expect(model.list[0]).toBe(REPORT_DESIGNER_EXTENSION)
    expect([...model.commands.keys()].slice(0, 2)).toEqual(['undo', 'redo'])
    expect([...model.commands.keys()].at(-1)).toBe('@acme/lanes.count')
    expect(model.paletteGroups.map(group => group.id)).toEqual(['charts', 'metrics', 'tables', 'lanes.planning'])
    expect([...model.palette.keys()].at(-1)).toBe('lanes.board')
    expect(createReportDesignerModel(extensions)).toBe(model)
  })

  it('物料指向没登记的组时抛 TypeError；两个扩展的物料或命令重名抛冲突', () => {
    const lanes = lanesExtension(newProbe())
    expect(() => createReportDesignerModel([{ ...lanes, paletteGroups: [] }])).toThrow(TypeError)
    expect(() => createReportDesignerModel([lanes, { id: '@acme/again', palette: [{ ...lanes.palette![0]!, group: 'charts' }] }]))
      .toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'palette-item' }))
    expect(() => createReportDesignerModel([lanes, { id: '@acme/again', commands: [{ id: 'undo', label: 'Undo', run: () => {} }] }]))
      .toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'command' }))
  })

  it('菜单栏的菜单：designer-shell 内置的四张在前，报表的数据菜单与扩展登记的在后；菜单 id 与数据菜单重名抛冲突', () => {
    const model = createReportDesignerModel([{ id: '@acme/tools', menubarMenus: [{ id: 'acme', label: 'Acme', order: 60 }] }])
    expect(model.menubarMenus.map(menu => [menu.id, menu.order])).toEqual([['file', 0], ['edit', 10], ['view', 20], ['help', 90], ['data', 30], ['acme', 60]])
    expect(() => createReportDesignerModel([{ id: '@acme/again', menubarMenus: [{ id: 'data', label: 'Data' }] }]))
      .toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'menubar-menu', key: 'data', extensions: ['@xihan-report/designer', '@acme/again'] }))
  })
})

describe('<xh-report-designer>：导入模板', () => {
  const template: ReportDocument = { ...board, id: 'imported', title: '导入的模板', body: { ...(board.body as DashboardView), cards: [] } }

  /** 读出文件的文字（jsdom 的 Blob 没有 text()）。 */
  function readText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.addEventListener('load', () => resolve(String(reader.result)))
      reader.addEventListener('error', () => reject(reader.error))
      reader.readAsText(blob)
    })
  }

  /** 读 .json 文件、把内容当成整份报表模板的导入器。 */
  const jsonImporter: ReportDesignerImporter = {
    id: '@acme/templates.json',
    fileTypes: ['.json', 'application/json'],
    accepts: source => source.kind === 'file' && (source.name?.endsWith('.json') ?? false),
    import: async source => ({ document: JSON.parse(await readText(source.file!)) as ReportDocument }),
  }

  function withImporters(...importers: ReportDesignerImporter[]): ReportDesignerExtension {
    return { id: '@acme/templates', importers }
  }

  /** 挂上选文件对话框，选中给定的文件；accept 是最近一次弹出时对话框的 accept。 */
  function chooseFile(file: File): { opened: () => number, accept: () => string | undefined } {
    let opened = 0
    let accept: string | undefined
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      opened++
      accept = this.accept
      expect(this.type).toBe('file')
      Object.defineProperty(this, 'files', { value: [file] })
      this.dispatchEvent(new Event('change'))
    })
    return { opened: () => opened, accept: () => accept }
  }

  const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0))

  /** 等到 done 成立，最多等 50 个宏任务。 */
  async function until(done: () => boolean): Promise<void> {
    for (let i = 0; i < 50 && !done(); i++)
      await flush()
  }

  function importErrors(designer: XhReportDesigner): { importer?: string, error: unknown }[] {
    const seen: { importer?: string, error: unknown }[] = []
    designer.addEventListener('import-error', event => seen.push((event as CustomEvent<{ importer?: string, error: unknown }>).detail))
    return seen
  }

  it('没有登记导入器时命令表里没有导入模板：工具栏、右键菜单都看不到，importTemplate() 不弹对话框', async () => {
    expect(createReportDesignerModel([]).commands.has(REPORT_IMPORT_TEMPLATE_COMMAND)).toBe(false)
    const designer = await mount(undefined)
    const picker = chooseFile(new File(['{}'], 'a.json'))
    expect(toolbar(designer)).not.toContain(REPORT_IMPORT_TEMPLATE_COMMAND)
    expect(menubarItems(designer, 'data')).not.toContain(REPORT_IMPORT_TEMPLATE_COMMAND)
    designer.querySelector('[data-part="surface"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(menuEntries(designer)).not.toContain(REPORT_IMPORT_TEMPLATE_COMMAND)
    expect([designer.canImportTemplate, designer.importTemplate(), picker.opened()]).toEqual([false, false, 0])
  })

  it('登记了导入器：工具栏最前面是导入模板，选文件对话框的 accept 取导入器的 fileTypes；选中的文件交给导入器，模板整份换上、记一步撤销，撤销回到原样', async () => {
    expect(createReportDesignerModel([withImporters(jsonImporter)]).commands.has(REPORT_IMPORT_TEMPLATE_COMMAND)).toBe(true)
    const designer = await mount([withImporters(jsonImporter)])
    const before = designer.schema!
    designer.select({ cards: ['lanes'] })
    const kinds: string[] = []
    designer.addEventListener('schema-change', event => kinds.push((event as CustomEvent<{ kind: string }>).detail.kind))
    const picker = chooseFile(new File([JSON.stringify(template)], 'sales.json', { type: 'application/json' }))
    expect([toolbar(designer)[0], menubarItems(designer, 'data')!.at(-1)]).toEqual([REPORT_IMPORT_TEMPLATE_COMMAND, REPORT_IMPORT_TEMPLATE_COMMAND])
    designer.querySelector<HTMLButtonElement>(`[data-region="toolbar"] button[value="${REPORT_IMPORT_TEMPLATE_COMMAND}"]`)!.click()
    await until(() => kinds.length > 0)
    await designer.updateComplete
    expect([picker.opened(), picker.accept()]).toEqual([1, '.json,application/json'])
    expect([designer.schema, kinds, designer.getSelection()]).toEqual([template, ['execute'], { cards: [] }])
    expect(designer.historyState.entries.at(-1)!.label).toBe('Import template')
    expect(designer.undo()).toBe(true)
    expect(designer.schema).toEqual(before)
  })

  it('导入不成功时派发 import-error：没有导入器接下的文件不带 importer，导入器抛错或给出的不是报表对象时带上导入器的 id；报表不变', async () => {
    const failing: ReportDesignerImporter = {
      id: '@acme/templates.broken',
      accepts: source => source.name === 'broken.xml',
      import: () => {
        throw new Error('bad')
      },
    }
    const shapeless: ReportDesignerImporter = { id: '@acme/templates.shapeless', accepts: source => source.name === 'shapeless.txt', import: () => ({ document: 'x' as unknown as ReportDocument }) }
    const designer = await mount([withImporters(jsonImporter, failing, shapeless)])
    const before = designer.schema
    const errors = importErrors(designer)
    for (const name of ['other.csv', 'broken.xml', 'shapeless.txt']) {
      chooseFile(new File(['<x/>'], name))
      expect(designer.importTemplate()).toBe(true)
      await flush()
      vi.restoreAllMocks()
    }
    expect(errors.map(error => error.importer)).toEqual([undefined, '@acme/templates.broken', '@acme/templates.shapeless'])
    expect(designer.schema).toBe(before)
  })

  it('只读或预览态不能导入：命令不可用，importTemplate() 不弹对话框', async () => {
    const designer = await mount([withImporters(jsonImporter)])
    const picker = chooseFile(new File(['{}'], 'a.json'))
    designer.readonly = true
    await designer.updateComplete
    expect([designer.canImportTemplate, designer.importTemplate()]).toEqual([false, false])
    expect(designer.querySelector<HTMLButtonElement>(`[data-region="toolbar"] button[value="${REPORT_IMPORT_TEMPLATE_COMMAND}"]`)!.disabled).toBe(true)
    designer.readonly = false
    designer.mode = 'preview'
    await designer.updateComplete
    expect([designer.canImportTemplate, designer.importTemplate(), picker.opened()]).toEqual([false, false, 0])
  })
})

describe('<xh-report-designer>：扩展', () => {
  it('扩展卡片按种类计算并交给它的渲染；属性面板列出种类的取数属性与扩展追加的属性', async () => {
    const designer = await mount([lanesExtension(newProbe())], { provider: true })
    await settle()
    expect([...card(designer, 'lanes').querySelectorAll('li')].map(item => item.textContent)).toEqual(['East', 'West'])
    expect(designer.validate()).toEqual([])
    designer.select({ cards: ['lanes'] })
    await designer.updateComplete
    const panel = designer.querySelector('xh-designer-properties')!
    expect(panel.targets![0]!.descriptors.map(descriptor => formatJsonPath(descriptor.path))).toEqual(['title', 'description', 'dataset', 'parameters', 'query.filter', 'query.limit', 'wip'])
    expect(designer.querySelector('[data-part="well"][data-list="dimensions"]')).not.toBeNull()
  })

  it('物料、工具栏、右键菜单与快捷键带上扩展的；commandLayout 改写工具栏排列', async () => {
    const probe = newProbe()
    const designer = await mount([lanesExtension(probe)])
    const palette = designer.querySelector('xh-designer-palette')!
    expect(palette.groups!.map(group => group.label)).toEqual(['Charts', 'Metrics', 'Tables', 'Planning'])
    expect(palette.groups!.at(-1)!.items).toEqual([{ id: 'lanes.board', label: 'Lanes', payload: 'lanes.board' }])
    palette.dispatchEvent(new CustomEvent('item-activate', { detail: { id: 'lanes.board', payload: 'lanes.board' } }))
    const added = (designer.schema!.body as DashboardView).cards.at(-1)!
    expect(added).toMatchObject({ kind: 'lanes.board', dataset: 'sales', layout: { w: 6, h: 4 } })
    expect(designer.getSelection()).toEqual({ cards: [added.id] })

    await designer.updateComplete
    expect(toolbar(designer).at(-1)).toBe('@acme/lanes.count')
    card(designer, 'lanes').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }))
    expect(menuEntries(designer)).toEqual(['cut', 'copy', 'paste', 'duplicate', 'delete', '@acme/lanes.count'])
    designer.querySelector('xh-context-menu')!.dispatchEvent(new CustomEvent('item-select', { detail: { value: '@acme/lanes.count' } }))
    designer.querySelector('[data-part="scroller"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'L', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }))
    expect(probe.runs).toEqual([['lanes'], ['lanes']])

    designer.commandLayout = { toolbar: [['undo', '@acme/lanes.count']] }
    await designer.updateComplete
    expect(toolbar(designer)).toEqual(['undo', '@acme/lanes.count'])
  })

  it('扩展的命令写 placement menubar:<菜单> 落进菜单栏，在数据菜单里接在导入之后；扩展登记的菜单按 order 排在数据与帮助之间；commandLayout 改写一张菜单', async () => {
    const designer = await mount([{
      id: '@acme/tools',
      menubarMenus: [{ id: 'acme', label: 'Acme', order: 60 }],
      commands: [
        { id: '@acme/tools.sync', label: 'Sync', placement: ['menubar:data'], run: () => {} },
        { id: '@acme/tools.go', label: 'Go', placement: ['menubar:acme'], run: () => {} },
      ],
    }])
    const menubar = designer.querySelector<HTMLElement & { collection?: { value: string }[] }>('xh-menubar')!
    expect(menubar.collection!.map(node => node.value)).toEqual(['file', 'edit', 'view', 'data', 'acme', 'help'])
    expect([menubarItems(designer, 'data'), menubarItems(designer, 'acme')]).toEqual([['import-dataset', 'import-fields', 'import-parameters', '@acme/tools.sync'], ['@acme/tools.go']])
    designer.commandLayout = { 'menubar:data': [['import-parameters']], 'menubar:acme': [] }
    await designer.updateComplete
    expect([menubarItems(designer, 'data'), menubarItems(designer, 'acme')]).toEqual([['import-parameters'], undefined])
  })

  it('面板登记到外框的区，状态变化时 update，去掉扩展时撤掉；setup 在连上文档时调用，换引用当作卸下再装上（面板按面板对象比对，同一个面板不重建）', async () => {
    const probe = newProbe()
    const lanes = lanesExtension(probe)
    const designer = await mount([lanes])
    const panel = designer.querySelector<HTMLElement>('[data-test="lanes-panel"]')!
    expect(panel.closest('[data-region="lanes"]')).not.toBeNull()
    expect(panel.textContent).toBe('Report designer')
    expect(probe.setups).toEqual(['up'])
    const before = probe.updates.length
    designer.select({ cards: ['lanes'] })
    await designer.updateComplete
    expect(probe.updates.slice(before).at(-1)).toBe(1)

    designer.extensions = [{ ...lanes }]
    expect(probe.setups).toEqual(['up', 'down', 'up'])
    expect(designer.querySelector('[data-test="lanes-panel"]')).toBe(panel)
    designer.extensions = []
    await designer.updateComplete
    expect(probe.setups).toEqual(['up', 'down', 'up', 'down'])
    expect(designer.querySelector('[data-test="lanes-panel"]')).toBeNull()
    expect(designer.querySelector('xh-designer-frame')!.regions!.map(region => region.name)).not.toContain('lanes')
  })

  it('去掉扩展后种类留在报表里：画布画占位写着种类名，问题报 unknown-kind；再装上恢复', async () => {
    const lanes = lanesExtension(newProbe())
    const designer = await mount([lanes], { provider: true })
    await settle()
    designer.extensions = undefined
    await settle()
    expect((designer.schema!.body as DashboardView).cards[0]).toEqual((board.body as DashboardView).cards[0])
    expect(card(designer, 'lanes').getAttribute('data-state')).toBe('placeholder')
    expect(card(designer, 'lanes').textContent).toContain('lanes.board')
    expect(designer.validate().map(issue => issue.code)).toEqual(['unknown-kind'])
    expect(designer.querySelector('xh-designer-issues')!.items!.length).toBe(1)

    designer.extensions = [lanes]
    await settle()
    expect(designer.validate()).toEqual([])
    expect([...card(designer, 'lanes').querySelectorAll('li')].map(item => item.textContent)).toEqual(['East', 'West'])
  })

  it('画布取数经过扩展的中间件；改标题不重新取数，换了扩展才重新取数', async () => {
    const lanes = lanesExtension(newProbe())
    const calls: string[] = []
    const logging: ReportDesignerExtension = {
      id: '@acme/logging',
      dataProvider: next => async (request, context) => {
        calls.push(request.dataset)
        return next(request, context)
      },
    }
    const fetched: string[] = []
    const designer = document.createElement('xh-report-designer')
    designer.autoTour = false
    designer.extensions = [lanes, logging]
    designer.dataProvider = async (request) => {
      fetched.push(request.dataset)
      return { kind: 'rows', rows: [{ region: 'East', amount: 10 }, { region: 'West', amount: 5 }] }
    }
    designer.schema = board
    document.body.append(designer)
    await settle()
    expect([calls, fetched]).toEqual([['sales'], ['sales']])
    designer.execute([{ type: 'updateCard', id: 'lanes', changes: [{ path: ['title'], value: '看板泳道' }] }])
    await settle()
    expect([calls, fetched]).toEqual([['sales'], ['sales']])
    designer.extensions = [lanes]
    await settle()
    expect([calls, fetched]).toEqual([['sales'], ['sales', 'sales']])
    expect([...card(designer, 'lanes').querySelectorAll('li')].map(item => item.textContent)).toEqual(['East', 'West'])
  })

  it('扩展冲突时赋值抛错，设计器保持原来的扩展', async () => {
    const lanes = lanesExtension(newProbe())
    const designer = await mount([lanes])
    const before = designer.extensions
    expect(() => {
      designer.extensions = [lanes, { ...lanes }]
    }).toThrow(expect.objectContaining({ code: 'designer.extension-conflict' }))
    expect(() => {
      designer.extensions = [{ id: '@acme/clash', panels: [{ region: { name: 'canvas', position: 'center' }, create: () => ({ element: document.createElement('div') }) }] }]
    }).toThrow(expect.objectContaining({ code: 'designer.extension-conflict', space: 'panel' }))
    expect(designer.extensions).toBe(before)
    expect(designer.querySelector('[data-test="lanes-panel"]')).not.toBeNull()
  })

  it('预览态的查看器拿到同一组扩展', async () => {
    const lanes = lanesExtension(newProbe())
    const designer = await mount([lanes], { provider: true })
    designer.mode = 'preview'
    await designer.updateComplete
    const viewer = designer.querySelector<XhReportViewer>('xh-report-viewer')!
    expect(viewer.extensions).toContain(lanes)
    await viewer.refresh()
    expect([...viewer.querySelectorAll('[data-card="lanes"] li')].map(item => item.textContent)).toEqual(['East', 'West'])
  })
})

describe('<xh-report-designer>：叠加层', () => {
  it('画布上照查看器画扩展的叠加层：mode 为 designer，没给取数回调时卡片是 placeholder；挪动卡片后按新位置重画', async () => {
    const scenes: { mode: string, cards: string[] }[] = []
    const badge: ReportDesignerExtension = {
      id: '@acme/badge',
      overlays: [{
        id: '@acme/badge.corner',
        layer: 'above',
        render: (container, scene, context) => {
          scenes.push({ mode: context.mode, cards: scene.cards.map(item => `${item.card.id}@${item.layout.x},${item.layout.y}:${item.status}`) })
          container.textContent = String(scene.cards.length)
        },
      }],
    }
    const designer = await mount([lanesExtension(newProbe()), badge])
    await settle()
    const grid = designer.querySelector('[data-part="content"] [data-part="dashboard"]')!
    expect(grid.lastElementChild?.getAttribute('data-overlay')).toBe('@acme/badge.corner')
    expect(scenes.at(-1)).toEqual({ mode: 'designer', cards: ['lanes@0,0:placeholder'] })
    const body = designer.schema!.body as DashboardView
    designer.schema = { ...designer.schema!, body: { ...body, cards: [{ ...body.cards[0]!, layout: { x: 3, y: 1, w: 6, h: 4 } }] } }
    await designer.updateComplete
    await settle()
    expect(scenes.at(-1)!.cards).toEqual(['lanes@3,1:placeholder'])
  })
})
