import { BrowserWindow, Menu, type MenuItemConstructorOptions } from 'electron'
import { IpcChannel, type MenuCommand, type MeshFormat, type RecentProject } from '../shared/api'
import { readRecentProjects, watchRecents } from './recents'

const APP_NAME = '3dev editor'

let refreshId = 0
let shownRecents = ''

export function installAppMenu(): void {
  watchRecents(() => {
    void refreshRecentMenu()
  })
  Menu.setApplicationMenu(Menu.buildFromTemplate(template()))
  Menu.getApplicationMenu()
    ?.getMenuItemById('file')
    ?.submenu?.on('menu-will-show', () => {
      void refreshRecentMenu()
    })
  void refreshRecentMenu()
}

export async function refreshRecentMenu(): Promise<void> {
  const id = ++refreshId
  const projects = await readRecentProjects()
  if (id !== refreshId) return
  const key = projects.map((project) => `${project.name}\n${project.jsonPath}`).join('\n')
  if (key === shownRecents) return
  const item = Menu.getApplicationMenu()?.getMenuItemById('open-recent')
  if (!item) return
  item.submenu = Menu.buildFromTemplate(recentItems(projects))
  shownRecents = key
}

function template(): MenuItemConstructorOptions[] {
  const file: MenuItemConstructorOptions = {
    id: 'file',
    label: 'Arquivo',
    submenu: [
      { label: 'Novo', accelerator: 'CmdOrCtrl+N', click: () => send({ kind: 'new' }) },
      { label: 'Abrir', accelerator: 'CmdOrCtrl+O', click: () => send({ kind: 'open' }) },
      { id: 'open-recent', label: 'Abrir recente', submenu: recentItems([]) },
      { label: 'Salvar', accelerator: 'CmdOrCtrl+S', click: () => send({ kind: 'save' }) },
      { type: 'separator' },
      {
        label: 'Exportar',
        submenu: [
          { label: 'OpenSCAD', click: () => send({ kind: 'export-scad' }) },
          modelItem('STL', 'stl'),
          modelItem('OBJ', 'obj'),
          modelItem('3MF', '3mf')
        ]
      }
    ]
  }
  const edit: MenuItemConstructorOptions = {
    label: 'Editar',
    submenu: [
      { label: 'Desfazer', accelerator: 'CmdOrCtrl+Z', click: () => send({ kind: 'undo' }) },
      {
        label: 'Refazer',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => send({ kind: 'redo' })
      },
      { type: 'separator' },
      { role: 'cut', label: 'Recortar' },
      { role: 'copy', label: 'Copiar' },
      { role: 'paste', label: 'Colar' },
      { role: 'selectAll', label: 'Selecionar tudo' }
    ]
  }
  const render: MenuItemConstructorOptions = {
    label: 'Render',
    submenu: [{ label: 'Renderizar', accelerator: 'F6', click: () => send({ kind: 'render' }) }]
  }
  const windowMenu: MenuItemConstructorOptions = {
    label: 'Janela',
    submenu: windowItems()
  }
  const menus = [file, edit, render, windowMenu]
  if (process.platform === 'darwin') menus.unshift(appMenu())
  else menus.push(helpMenu())
  return menus
}

function appMenu(): MenuItemConstructorOptions {
  return {
    label: APP_NAME,
    submenu: [
      { role: 'about', label: `Sobre o ${APP_NAME}` },
      { type: 'separator' },
      { role: 'hide', label: 'Ocultar' },
      { role: 'hideOthers', label: 'Ocultar outros' },
      { role: 'unhide', label: 'Mostrar todos' },
      { type: 'separator' },
      { role: 'quit', label: 'Sair' }
    ]
  }
}

function helpMenu(): MenuItemConstructorOptions {
  return {
    label: 'Ajuda',
    submenu: [{ role: 'about', label: `Sobre o ${APP_NAME}` }]
  }
}

function windowItems(): MenuItemConstructorOptions[] {
  const items: MenuItemConstructorOptions[] = [
    { role: 'minimize', label: 'Minimizar' },
    { role: 'zoom', label: 'Zoom' },
    { role: 'close', label: 'Fechar' }
  ]
  if (process.platform === 'darwin') {
    items.push({ type: 'separator' }, { role: 'front', label: 'Trazer todas para a frente' })
  }
  return items
}

function modelItem(label: string, format: MeshFormat): MenuItemConstructorOptions {
  return { label, click: () => send({ kind: 'export-model', format }) }
}

function recentItems(projects: RecentProject[]): MenuItemConstructorOptions[] {
  if (projects.length === 0) return [{ label: 'Nenhum recente', enabled: false }]
  return projects.map((project) => ({
    label: menuLabel(project.name),
    click: () => send({ kind: 'open-recent', jsonPath: project.jsonPath })
  }))
}

function menuLabel(label: string): string {
  return label.replaceAll('&', '&&')
}

function send(command: MenuCommand): void {
  const window = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  window?.webContents.send(IpcChannel.menuCommand, command)
}
