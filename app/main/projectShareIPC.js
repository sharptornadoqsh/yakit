const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const LOCAL_IMPORT_NAME_PATTERN = /^__yakit_share_([1-9][0-9]*)_[0-9a-f]{32}$/

const errorWithCode = (code) => {
  const error = new Error(code)
  error.code = code
  return error
}

const isPositiveInteger = (value) => Number.isSafeInteger(value) && value > 0
const isNonNegativeInteger = (value) => Number.isSafeInteger(value) && value >= 0
const isNonEmptyString = (value) => typeof value === 'string' && value.trim() === value && value.length > 0

const requireExactKeys = (value, keys, code) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw errorWithCode(code)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw errorWithCode(code)
  }
}

const sanitizeProgress = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => {
      const normalized = key.toLowerCase()
      return !normalized.includes('path') && !normalized.includes('password') && !normalized.includes('token')
    }),
  )
}

const projectID = (project) => Number(project?.Id ?? project?.id)
const projectName = (project) => String(project?.ProjectName ?? project?.project_name ?? project?.name ?? '')
const projectFolderID = (project) => Number(project?.FolderId ?? project?.folder_id ?? 0)
const projectChildFolderID = (project) => Number(project?.ChildFolderId ?? project?.child_folder_id ?? 0)
const projectType = (project) => String(project?.Type ?? project?.type ?? project?.FrontendType ?? '')

const registerProjectShareIPC = ({
  ipcMain,
  win,
  getClient,
  bundleStore,
  recoveryStore,
  getClientId,
  getOnlineContext,
  wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}) => {
  const transfers = new Map()

  const send = (channel, value) => {
    if (!win || win.isDestroyed?.()) return
    win.webContents?.send(channel, value)
  }

  const callUnary = (method, params) =>
    new Promise((resolve, reject) => {
      const client = getClient()
      const callback = (error, response) => {
        if (error) reject(error)
        else resolve(response)
      }
      try {
        const result = client[method](params, callback)
        if (result && typeof result.then === 'function') result.then(resolve, reject)
      } catch (error) {
        reject(error)
      }
    })

  const runTransfer = ({ method, params, operationToken, requireTargetPath = false }) => {
    if (!isNonEmptyString(operationToken)) return Promise.reject(errorWithCode('project_share_operation_token_invalid'))
    if (transfers.has(operationToken)) return Promise.reject(errorWithCode('project_share_transfer_in_progress'))
    return new Promise((resolve, reject) => {
      let settled = false
      let targetPath = ''
      let stream
      const finish = (callback, value) => {
        if (settled) return
        settled = true
        transfers.delete(operationToken)
        callback(value)
      }
      try {
        stream = getClient()[method](params)
      } catch (error) {
        reject(error)
        return
      }
      transfers.set(operationToken, {
        stream,
        reject: (error) => finish(reject, error),
      })
      stream.on('data', (data) => {
        if (typeof data?.TargetPath === 'string' && data.TargetPath) targetPath = data.TargetPath
        send(`${operationToken}-data`, sanitizeProgress(data))
      })
      stream.on('error', () => {
        send(`${operationToken}-error`, 'project_share_transfer_failed')
        finish(reject, errorWithCode('project_share_transfer_failed'))
      })
      stream.on('end', () => {
        if (requireTargetPath && !targetPath) {
          finish(reject, errorWithCode('project_share_export_path_missing'))
          return
        }
        send(`${operationToken}-end`)
        finish(resolve, targetPath)
      })
    })
  }

  const queryProjects = async (name) => {
    const response = await callUnary('GetProjects', {
      ProjectName: name,
      Type: 'all',
      Pagination: {
        Page: 1,
        Limit: 100,
        Order: 'desc',
        OrderBy: 'updated_at',
      },
    })
    return Array.isArray(response?.Projects) ? response.Projects : []
  }

  const matchesRecoveryLocation = (project, record) => {
    const type = projectType(project)
    return (
      projectFolderID(project) === record.folderId &&
      projectChildFolderID(project) === record.childFolderId &&
      (!type || type === record.projectType)
    )
  }

  const findImportedProject = async (record, allowWait) => {
    const attempts = allowWait ? 25 : 1
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const matches = (await queryProjects(record.localImportName)).filter(
        (project) => projectName(project) === record.localImportName && matchesRecoveryLocation(project, record),
      )
      if (matches.length > 1) throw errorWithCode('local_import_project_ambiguous')
      if (matches.length === 1 && isPositiveInteger(projectID(matches[0]))) return matches[0]
      if (attempt + 1 < attempts) await wait(200)
    }
    return null
  }

  const findProjectByID = async (record) => {
    const candidates = await queryProjects('')
    const matches = candidates.filter(
      (project) => projectID(project) === record.localProjectId && matchesRecoveryLocation(project, record),
    )
    if (matches.length !== 1) throw errorWithCode('local_import_project_not_found')
    return matches[0]
  }

  const advanceRecovery = (record, status, localProjectId) =>
    recoveryStore.upsert({
      expectedRevision: record.revision,
      record: {
        ...record,
        status,
        ...(localProjectId === undefined ? {} : { localProjectId }),
      },
    })

  const validateFinalName = async (record) => {
    try {
      await callUnary('IsProjectNameValid', {
        ProjectName: record.localProjectName,
        Description: '',
        FolderId: record.folderId,
        ChildFolderId: record.childFolderId,
        Type: record.projectType,
      })
    } catch {
      throw errorWithCode('local_project_name_conflict')
    }
  }

  const renameImportedProject = async (record, project) => {
    await validateFinalName(record)
    const localProjectId = projectID(project)
    if (!isPositiveInteger(localProjectId) || localProjectId !== record.localProjectId) {
      throw errorWithCode('local_import_project_not_found')
    }
    await callUnary('UpdateProject', {
      ...project,
      Id: localProjectId,
      ProjectName: record.localProjectName,
      FolderId: record.folderId,
      ChildFolderId: record.childFolderId,
      Type: record.projectType,
    })
    const completed = await advanceRecovery(record, 'project_imported', localProjectId)
    return {
      record: completed,
      project: {
        localProjectId,
        localProjectName: completed.localProjectName,
      },
    }
  }

  const validateImportInput = (input) => {
    requireExactKeys(
      input,
      [
        'receiptId',
        'handle',
        'localImportName',
        'finalLocalProjectName',
        'password',
        'folderId',
        'childFolderId',
        'type',
      ],
      'project_share_import_request_invalid',
    )
    const importMatch =
      typeof input.localImportName === 'string' ? input.localImportName.match(LOCAL_IMPORT_NAME_PATTERN) : null
    if (
      !isPositiveInteger(input.receiptId) ||
      !UUID_PATTERN.test(input.handle) ||
      !importMatch ||
      Number(importMatch[1]) !== input.receiptId ||
      !isNonEmptyString(input.finalLocalProjectName) ||
      typeof input.password !== 'string' ||
      !isNonNegativeInteger(input.folderId) ||
      !isNonNegativeInteger(input.childFolderId) ||
      !isNonEmptyString(input.type)
    ) {
      throw errorWithCode('project_share_import_request_invalid')
    }
  }

  const validateRecoveryImport = (record, input) => {
    if (
      !record ||
      record.receiptId !== input.receiptId ||
      record.localImportName !== input.localImportName ||
      record.localProjectName !== input.finalLocalProjectName ||
      record.folderId !== input.folderId ||
      record.childFolderId !== input.childFolderId ||
      record.projectType !== input.type ||
      !record.managedHandles.some((item) => item.kind === 'project_archive' && item.handle === input.handle)
    ) {
      throw errorWithCode('project_share_recovery_state_invalid')
    }
  }

  const resolveImportedProject = async (record, allowWait) => {
    if (isPositiveInteger(record.localProjectId)) {
      const existing = await findProjectByID(record)
      if (record.status === 'renaming_project') return renameImportedProject(record, existing)
      return {
        record,
        project: {
          localProjectId: record.localProjectId,
          localProjectName: record.localProjectName,
        },
      }
    }
    if (record.status !== 'importing_project') {
      throw errorWithCode('project_share_recovery_state_invalid')
    }
    const imported = await findImportedProject(record, allowWait)
    if (!imported) return null
    const localProjectId = projectID(imported)
    const renaming = await advanceRecovery(record, 'renaming_project', localProjectId)
    return renameImportedProject(renaming, imported)
  }

  ipcMain.handle('ExportProjectShareArchive', async (_event, input, operationToken) => {
    requireExactKeys(input, ['projectId', 'password'], 'project_share_export_request_invalid')
    if (!isPositiveInteger(input.projectId) || typeof input.password !== 'string') {
      throw errorWithCode('project_share_export_request_invalid')
    }
    const targetPath = await runTransfer({
      method: 'ExportProject',
      params: {
        Id: input.projectId,
        Password: input.password,
      },
      operationToken,
      requireTargetPath: true,
    })
    return bundleStore.importProjectArchive(targetPath)
  })

  ipcMain.handle('StageProjectSharePlugin', (_event, input) => bundleStore.stagePlugin(input))
  ipcMain.handle('CreateProjectShareBundle', (_event, input) => bundleStore.createBundle(input))
  ipcMain.handle('ReadProjectShareBundleChunk', (_event, input) => bundleStore.readBundleChunk(input))
  ipcMain.handle('InspectProjectShareBundle', (_event, handle) => bundleStore.inspectBundle(handle))
  ipcMain.handle('GetProjectShareClientContext', () => ({
    clientId: getClientId(),
  }))
  ipcMain.handle('DownloadProjectShareImportBundle', (_event, input) => {
    requireExactKeys(input, ['receiptId', 'expectedSize', 'expectedSha256'], 'project_share_download_request_invalid')
    const context = getOnlineContext()
    return bundleStore.downloadImportBundle({
      ...input,
      baseUrl: context.baseUrl,
      authorization: context.authorization,
      clientId: getClientId(),
    })
  })
  ipcMain.handle('ExtractProjectShareBundle', (_event, handle) => bundleStore.extractBundle(handle))
  ipcMain.handle('ReadProjectSharePluginContent', (_event, handle) => bundleStore.readPluginContent(handle))

  ipcMain.handle('ImportProjectShareArchive', async (_event, input, operationToken) => {
    validateImportInput(input)
    let record = await recoveryStore.get(input.receiptId)
    validateRecoveryImport(record, input)
    const resolved = await resolveImportedProject(record, false)
    if (resolved) return resolved.project
    const filePath = await bundleStore.resolveManagedHandlePath(input.handle, 'project_archive')
    await callUnary('IsProjectNameValid', {
      ProjectName: input.localImportName,
      Description: '',
      FolderId: input.folderId,
      ChildFolderId: input.childFolderId,
      Type: input.type,
    })
    try {
      await runTransfer({
        method: 'ImportProject',
        params: {
          LocalProjectName: input.localImportName,
          ProjectFilePath: filePath,
          Password: input.password,
          FolderId: input.folderId,
          ChildFolderId: input.childFolderId,
          Type: input.type,
        },
        operationToken,
      })
    } catch {
      throw errorWithCode('local_import_outcome_unknown')
    }
    record = await recoveryStore.get(input.receiptId)
    const imported = await resolveImportedProject(record, true)
    if (!imported) throw errorWithCode('local_import_outcome_unknown')
    return imported.project
  })

  ipcMain.handle('ResolveProjectShareImportedProject', async (_event, receiptId) => {
    if (!isPositiveInteger(receiptId)) throw errorWithCode('project_share_recovery_record_invalid')
    const record = await recoveryStore.get(receiptId)
    if (!record) return null
    const resolved = await resolveImportedProject(record, true)
    return resolved?.project || null
  })

  ipcMain.handle('CancelProjectShareTransfer', async (_event, operationToken) => {
    const transfer = transfers.get(operationToken)
    if (!transfer) return
    transfers.delete(operationToken)
    transfer.stream.cancel?.()
    transfer.reject(errorWithCode('project_share_transfer_cancelled'))
  })

  ipcMain.handle('RemoveProjectShareManagedHandle', (_event, handle) => bundleStore.removeManagedHandle(handle))
  ipcMain.handle('ReleaseProjectShareManagedHandle', async (_event, input) => {
    const record = await recoveryStore.releaseHandle(input)
    await bundleStore.removeManagedHandle(input.handle).catch(() => undefined)
    return record
  })
  ipcMain.handle('ListProjectShareRecoveries', () => recoveryStore.list())
  ipcMain.handle('UpsertProjectShareRecovery', (_event, input) => recoveryStore.upsert(input))
  ipcMain.handle('RemoveProjectShareRecovery', (_event, input) => recoveryStore.remove(input))
}

module.exports = {
  registerProjectShareIPC,
}
