/*
 * Copyright (c) 2021-Present XiHanFun and contributors.
 * Licensed under the MIT License. See LICENSE in the project root for license information.
 */

// 命令的排列：工具栏只留撤销重做与预览，卡片的右键菜单只留复制、创建副本与删除。

const designer = document.querySelector('xh-report-designer')!

// #region example
designer.commandLayout = {
  'toolbar': [['undo', 'redo'], ['preview']],
  'menu:card': [['copy', 'duplicate'], ['delete']],
}
// #endregion example
