const { ipcMain } = require('electron')
const path = require('path')
const { getAppConfigDir } = require('../filePath')
const { createProjectArchiveStore } = require('../projectArchive')
const { createProjectShareBundleStore } = require('../projectShareBundle')
const { registerProjectShareIPC } = require('../projectShareIPC')
const { createProjectShareRecoveryStore } = require('../projectShareRecoveryStore')
const { registerProjectExportHandler } = require('../projectExport')
const { inspectProjectImportFile, importProjectWithReceipt, callProjectRpc } = require('../projectImport')

module.exports = (win, getClient) => {
  const projectArchiveStore = createProjectArchiveStore()
  const exportArchiveStore = createProjectArchiveStore(path.join(getAppConfigDir(), 'project-exports'))
  const projectShareRecoveryStore = createProjectShareRecoveryStore()
  const projectShareBundleStore = createProjectShareBundleStore({
    isHandleReferenced: projectShareRecoveryStore.isHandleReferenced,
  })

  registerProjectShareIPC({
    ipcMain,
    win,
    getClient,
    bundleStore: projectShareBundleStore,
    recoveryStore: projectShareRecoveryStore,
    getClientId: () => require('../httpServer').getCollaborationClientID(),
    getOnlineContext: () => {
      const { HttpSetting, USER_INFO } = require('../state')
      return {
        baseUrl: HttpSetting.httpBaseURL,
        authorization: USER_INFO.token || '',
      }
    },
  })

  // asyncSetCurrentProject wrapper
  const asyncSetCurrentProject = (params) => {
    return new Promise((resolve, reject) => {
      getClient().SetCurrentProject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('SetCurrentProject', async (e, params) => {
    return await asyncSetCurrentProject(params)
  })

  // asyncGetCurrentProject wrapper
  const asyncGetCurrentProjectEx = (params) => {
    return new Promise((resolve, reject) => {
      getClient().GetCurrentProjectEx(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('GetCurrentProjectEx', async (e, params) => {
    return await asyncGetCurrentProjectEx(params)
  })

  const asyncGetSSAWorkbenchDashboard = (params) => {
    return new Promise((resolve, reject) => {
      getClient().GetSSAWorkbenchDashboard(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('GetSSAWorkbenchDashboard', async (e, params) => {
    return await asyncGetSSAWorkbenchDashboard(params)
  })

  // asyncGetProjects wrapper
  const asyncGetProjects = (params) => {
    return new Promise((resolve, reject) => {
      getClient().GetProjects(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('GetProjects', async (e, params) => {
    return await asyncGetProjects(params)
  })

  // asyncNewProject wrapper
  const asyncNewProject = (params) => {
    return new Promise((resolve, reject) => {
      getClient().NewProject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('NewProject', async (e, params) => {
    return await asyncNewProject(params)
  })

  // asyncUpdateProject wrapper
  const asyncUpdateProject = (params) => {
    return new Promise((resolve, reject) => {
      getClient().UpdateProject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('UpdateProject', async (e, params) => {
    return await asyncUpdateProject(params)
  })

  // asyncIsProjectNameValid wrapper
  const asyncIsProjectNameValid = (params) => {
    return callProjectRpc(getClient(), 'IsProjectNameValid', params)
  }
  ipcMain.handle('IsProjectNameValid', async (e, params) => {
    return await asyncIsProjectNameValid(params)
  })

  // asyncRemoveProject wrapper
  const asyncRemoveProject = (params) => {
    return new Promise((resolve, reject) => {
      getClient().RemoveProject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('RemoveProject', async (e, params) => {
    return await asyncRemoveProject(params)
  })

  // asyncDeleteProject wrapper
  const asyncDeleteProject = (params) => {
    return new Promise((resolve, reject) => {
      getClient().DeleteProject(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('DeleteProject', async (e, params) => {
    return await asyncDeleteProject(params)
  })

  // asyncGetDefaultProjectEx wrapper
  const asyncGetDefaultProjectEx = (params) => {
    return new Promise((resolve, reject) => {
      getClient().GetDefaultProjectEx(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('GetDefaultProjectEx', async (e, params) => {
    return await asyncGetDefaultProjectEx(params)
  })

  const asyncGetTemporaryProjectEx = (params) => {
    return new Promise((resolve, reject) => {
      getClient().GetTemporaryProjectEx(params, (err, data) => {
        if (err) {
          reject(err)
          return
        }
        resolve(data)
      })
    })
  }
  ipcMain.handle('GetTemporaryProjectEx', async (e, params) => {
    return await asyncGetTemporaryProjectEx(params)
  })

  const handlerHelper = require('./handleStreamWithContext')

  const streamExportProjectMap = new Map()
  ipcMain.handle('cancel-ExportProject', handlerHelper.cancelHandler(streamExportProjectMap))
  ipcMain.handle('ExportProject', (e, params, token) => {
    const client = getClient()
    const stream = client.ExportProject(params)
    registerProjectExportHandler(win, stream, streamExportProjectMap, token, client, exportArchiveStore)
  })

  const streamImportProjectMap = new Map()
  ipcMain.handle('cancel-ImportProject', handlerHelper.cancelHandler(streamImportProjectMap))
  const importInspectionMap = new Map()
  ipcMain.handle('cancel-InspectProjectImportFile', handlerHelper.cancelHandler(importInspectionMap))
  ipcMain.handle('InspectProjectImportFile', async (_event, filePath, token) => {
    if (!token || importInspectionMap.has(token)) throw new Error('项目文件校验标识无效或重复')
    const controller = new AbortController()
    const cancel = () => controller.abort()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      cancel()
    }, 120000)
    const owner = _event.sender || win.webContents
    const entry = { cancel }
    importInspectionMap.set(token, entry)
    owner.once?.('destroyed', cancel)
    try {
      return await inspectProjectImportFile(filePath, { signal: controller.signal })
    } catch (error) {
      if (timedOut) throw new Error('项目文件内容校验超时，请检查磁盘或重新选择文件')
      throw error
    } finally {
      clearTimeout(timer)
      owner.removeListener?.('destroyed', cancel)
      if (importInspectionMap.get(token) === entry) importInspectionMap.delete(token)
    }
  })
  ipcMain.handle('ImportProject', async (e, params, token) => {
    if (!token || streamImportProjectMap.has(token)) throw new Error('项目导入操作标识无效或重复')
    const controller = new AbortController()
    const entry = { cancel: () => controller.abort() }
    const owner = e.sender || win.webContents
    const send = (channel, value) => {
      if (!controller.signal.aborted && !owner.isDestroyed?.()) owner.send(channel, value)
    }
    streamImportProjectMap.set(token, entry)
    owner.once?.('destroyed', entry.cancel)
    try {
      const receipt = await importProjectWithReceipt(getClient(), params, {
        signal: controller.signal,
        onProgress: (progress) =>
          send(`${token}-data`, { ...progress, Percent: Math.min(progress.Percent || 0, 0.99) }),
      })
      send(`${token}-end`, receipt)
      return receipt
    } finally {
      owner.removeListener?.('destroyed', entry.cancel)
      if (streamImportProjectMap.get(token) === entry) streamImportProjectMap.delete(token)
    }
  })

  ipcMain.handle('InspectProjectArchive', (e, filePath) => projectArchiveStore.inspectArchive(filePath))
  ipcMain.handle('ReadProjectArchiveChunk', (e, params) => projectArchiveStore.readArchiveChunk(params))
  ipcMain.handle('CreateProjectArchive', (e, params) => projectArchiveStore.createArchive(params))
  ipcMain.handle('WriteProjectArchiveChunk', (e, params) => projectArchiveStore.writeArchiveChunk(params))
  ipcMain.handle('FinalizeProjectArchive', (e, filePath) => projectArchiveStore.finalizeArchive(filePath))
  ipcMain.handle('RemoveProjectArchive', (e, filePath) => projectArchiveStore.removeArchive(filePath))
}
