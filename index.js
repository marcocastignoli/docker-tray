const { app, Menu, Tray, BrowserWindow } = require('electron')
const { Docker } = require('node-docker-api');
const path = require('path');
const docker = new Docker({ socketPath: '/var/run/docker.sock' });

let appIcon = null
let wins = {}

function refresh() {
  docker.container.list()
    .then(containers => {
      const menu_items = containers.map(c => ({
        label: `${c.data.Names.join(' ')} - ${c.data.Image}`,
        submenu: [
          {
            label: 'Stop',
            click: () => {
              c.stop().then(() => refresh())
            }
          },
          {
            label: 'Logs',
            click: () => {
              if (wins[c.data.Id]) {
                wins[c.data.Id].show()
              } else {
                wins[c.data.Id] = new BrowserWindow({ width: 800, height: 600, webPreferences: { nodeIntegration: true } })
                wins[c.data.Id].on('close', (event) => {
                  event.preventDefault()
                  wins[c.data.Id].hide()
                  event.returnValue = false
                  return false
                })
                wins[c.data.Id].setMenuBarVisibility(false)
                wins[c.data.Id].loadFile('logs.html')
                wins[c.data.Id].webContents.on('did-finish-load', () => {
                  c.logs({
                    follow: true,
                    stdout: true,
                    stderr: true
                  })
                    .then(stream => {
                      stream.on('data', info => {
                        if (wins[c.data.Id].webContents) {
                          wins[c.data.Id].webContents.send('ping', info.toString());
                        }
                      })
                      stream.on('error', err => {
                        if (wins[c.data.Id].webContents) {
                          wins[c.data.Id].webContents.send('ping', err.toString());
                        }
                      })
                    })
                })
              }
            }
          }
        ]
      }))
      const contextMenu = Menu.buildFromTemplate(menu_items)

      // Make a change to the context menu
      contextMenu.items[1].checked = false

      // Call this again for Linux because we modified the context menu
      appIcon.setContextMenu(contextMenu)
    })
    .catch(error => console.log(error));
}

const imgPath = path.join(process.resourcesPath, 'logo.png')

app.on('ready', () => {
  appIcon = new Tray(imgPath)

  const promisifyStream = stream => new Promise((resolve, reject) => {
    stream.on('data', data => refresh())
    stream.on('end', resolve)
    stream.on('error', reject)
  })
  docker.events({
    since: ((new Date().getTime() / 1000) - 60).toFixed(0)
  })
    .then(stream => promisifyStream(stream))
    .catch(error => console.log(error))

  refresh()

})