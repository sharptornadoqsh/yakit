const path = require('path')
const handlerHelper = require('./handlers/handleStreamWithContext')

const registerProjectExportHandler = (win, stream, streamMap, token, client, archiveStore) => {
  let targetPath = ''
  let failed = false
  let canceled = false
  let fileStream
  const transfer = {
    cancel: () => {
      canceled = true
      fileStream?.cancel()
    },
  }
  const send = (channel, data) => {
    if (!win || win.isDestroyed?.()) return
    win.webContents.send(channel, data)
  }
  const deliverArchive = async () => {
    if (!targetPath) throw new Error('导出文件路径缺失')
    const fileName = path
      .basename(targetPath.replace(/\\/g, '/'))
      .replace(/\.yakitproject(\.enc)?$/i, (_match, encrypted) => `.ruiyanproject${encrypted ? '.enc' : ''}`)
    const archive = await archiveStore.createArchive({ fileName })
    try {
      if (canceled) throw new Error('项目导出已取消')
      fileStream = client.ReadFile({ FilePath: targetPath, BufSize: 1024 * 1024, FileSystem: 'local' })
      let offset = 0
      for await (const chunk of fileStream) {
        if (canceled) throw new Error('项目导出已取消')
        const data = Buffer.from(chunk.Data || [])
        if (!data.length) continue
        await archiveStore.writeArchiveChunk({ filePath: archive.filePath, offset, data: data.toString('base64') })
        offset += data.length
      }
      if (canceled) throw new Error('项目导出已取消')
      if (offset === 0) throw new Error('导出归档为空')
      return (await archiveStore.finalizeArchive(archive.filePath)).filePath
    } catch (error) {
      fileStream?.cancel()
      await archiveStore.removeArchive(archive.filePath)
      throw error
    }
  }
  const exportWindow = {
    webContents: {
      send: (channel, data) => {
        if (channel === `${token}-data`) {
          if (data.TargetPath) targetPath = data.TargetPath
          send(channel, { ...data, TargetPath: '', Percent: Math.min(data.Percent, 0.99) })
        } else if (channel === `${token}-error`) {
          failed = true
          send(channel, data)
        } else if (channel === `${token}-end` && !failed) {
          streamMap.set(token, transfer)
          deliverArchive()
            .then((filePath) => send(`${token}-data`, { TargetPath: filePath, Percent: 1, Verbose: '项目导出完成' }))
            .catch((error) => send(`${token}-error`, `项目导出文件整理失败：${error.message}`))
            .finally(() => {
              if (streamMap.get(token) === transfer) streamMap.delete(token)
              send(channel)
            })
        } else {
          send(channel, data)
        }
      },
    },
  }
  handlerHelper.registerHandler(exportWindow, stream, streamMap, token)
}

module.exports = { registerProjectExportHandler }
