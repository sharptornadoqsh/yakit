module.exports = {
  cancelHandler: (streamMap, callback) => {
    return async (e, token) => {
      const stream = streamMap.get(token)
      streamMap.delete(token)
      stream && stream.cancel()
      callback && callback(token)
    }
  },
  registerHandler: (windows, stream, streamMap, token, { terminalOnError = false } = {}) => {
    const currentStream = streamMap.get(token)
    if (!!currentStream) {
      return
    }

    let settled = false
    const entry = terminalOnError
      ? {
          cancel: () => {
            cleanup()
            stream.cancel()
          },
        }
      : stream
    const cleanup = () => {
      settled = true
      if (streamMap.get(token) === entry) streamMap.delete(token)
      stream.removeListener('data', onData)
      stream.removeListener('end', onEnd)
    }
    const onClose = () => {
      if (!settled) onError(new Error('项目导入连接已关闭，请重试'))
      stream.removeListener('error', onError)
    }
    const onData = (data) => {
      if (terminalOnError && settled) return
      if (!windows) {
        return
      }
      windows.webContents.send(`${token}-data`, data)
    }
    const onError = (error) => {
      if (terminalOnError && settled) return
      if (terminalOnError) cleanup()
      if (!windows) {
        return
      }
      windows.webContents.send(`${token}-error`, error?.details || error?.message || String(error))
    }
    const onEnd = () => {
      if (terminalOnError && settled) return
      if (terminalOnError) cleanup()
      streamMap.delete(token)
      if (!windows) {
        return
      }
      windows.webContents.send(`${token}-end`)
    }
    streamMap.set(token, entry)
    stream.on('data', onData)
    stream.on('error', onError)
    stream.on('end', onEnd)
    if (terminalOnError) stream.once('close', onClose)
  },
}
