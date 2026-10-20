/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 命令的排列：工具栏只留撤销重做与预览，卡片的右键菜单只留复制、创建副本与删除；宿主的操作挂进菜单栏，模板标题放在菜单栏右边。

const designer = document.querySelector('xh-report-designer')!

// #region example
designer.commandLayout = {
  'toolbar': [['undo', 'redo'], ['preview']],
  'menu:card': [['copy', 'duplicate'], ['delete']],
}
// #endregion example

// #region host-menubar
designer.extensions = [{
  id: 'acme.host',
  commands: [
    { id: 'acme.new', label: '新建', shortcut: ['Mod', 'Alt', 'N'], placement: ['menubar:file'], run: () => location.assign('/reports/new') },
    { id: 'acme.back', label: '返回列表', placement: ['menubar:file', 'toolbar'], run: () => history.back() },
  ],
}]
const title = document.createElement('span')
title.slot = 'menubar-end'
title.textContent = '销售看板 · 已保存'
designer.append(title)
// #endregion host-menubar
