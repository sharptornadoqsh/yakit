import * as teamCollaboration from '@/services/teamCollaboration'
import { randomString } from '@/utils/randomUtil'
import { PROJECT_BUNDLE_DATA_TYPE } from './projectBundleData'
import { runProjectTransfer, type ProjectTransferIpc } from './projectTransfer'
import type {
  LocalProjectReference,
  ProjectArchiveChunk,
  ProjectArchiveInfo,
  ProjectBundleDataRecord,
  TeamProjectBundleDependencies,
  TeamProjectMapping,
} from './teamProjectBundle'

const unwrapData = <T>(response: any): T => (response?.data?.data ?? response?.data ?? response) as T

const unwrapItems = <T>(response: any, keys: string[] = []): T[] => {
  const data = unwrapData<any>(response)
  if (Array.isArray(data)) return data
  for (const key of [...keys, 'items', 'list', 'data']) {
    if (Array.isArray(data?.[key])) return data[key]
  }
  return []
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds))

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String((error as any)?.message || error || '未知错误')

const findImportedProject = async (
  ipc: ProjectTransferIpc,
  localProjectName: string,
  projectType: string,
): Promise<LocalProjectReference> => {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const response = await ipc.invoke('GetProjects', {
      ProjectName: localProjectName,
      Type: 'all',
      FrontendType: projectType,
      Pagination: { Page: 1, Limit: 20, Order: 'desc', OrderBy: 'updated_at' },
    })
    const projects = Array.isArray(response?.Projects) ? response.Projects : []
    const project = projects.find((item: any) => item?.ProjectName === localProjectName)
    if (project?.Id) return { id: project.Id, name: project.ProjectName }
    await wait(200)
  }
  throw new Error('项目已导入，但无法定位新建的本地项目')
}

const listAllBundleData = async (
  teamId: number | string,
  projectId: number | string,
): Promise<ProjectBundleDataRecord[]> => {
  const records: ProjectBundleDataRecord[] = []
  const seen = new Set<string>()
  const limit = 100
  for (let page = 1; page <= 10000; page += 1) {
    const response = await teamCollaboration.listTestData(teamId, projectId, {
      page,
      limit,
      type: PROJECT_BUNDLE_DATA_TYPE,
    })
    const items = unwrapItems<ProjectBundleDataRecord>(response, ['test_data', 'testData'])
    let added = 0
    items.forEach((item) => {
      const key = String(item.id)
      if (seen.has(key)) return
      seen.add(key)
      records.push(item)
      added += 1
    })
    if (items.length < limit || added === 0) break
  }
  return records
}

const saveMapping = async (mapping: TeamProjectMapping) => {
  const [{ getRemoteHttpSettingGV }, { getRemoteValue, setRemoteValue }] = await Promise.all([
    import('@/utils/envfile'),
    import('@/utils/kv'),
  ])
  const setting = await getRemoteValue(getRemoteHttpSettingGV())
  let onlineUrl = 'current'
  try {
    onlineUrl = String(JSON.parse(setting || '{}')?.BaseUrl || 'current')
  } catch {}
  const key = `team-project-mapping:${encodeURIComponent(onlineUrl)}:${mapping.teamId}:${mapping.projectId}`
  await setRemoteValue(key, JSON.stringify({ ...mapping, onlineUrl }))
}

const getProjectType = async () => ((await import('@/utils/envfile')).isIRify() ? 'ssa_project' : 'project')

const importProjectArchive = async (
  ipc: ProjectTransferIpc,
  filePath: string,
  localProjectName: string,
  projectType: string,
  validateName: boolean,
): Promise<LocalProjectReference> => {
  if (validateName) {
    await ipc.invoke('IsProjectNameValid', {
      ProjectName: localProjectName,
      Description: '',
      FolderId: 0,
      ChildFolderId: 0,
      Type: projectType,
    })
  }
  await runProjectTransfer(ipc, {
    channel: 'ImportProject',
    params: {
      LocalProjectName: localProjectName,
      ProjectFilePath: filePath,
      Password: '',
      FolderId: 0,
      ChildFolderId: 0,
      Type: projectType,
    },
  })
  return { ...(await findImportedProject(ipc, localProjectName, projectType)), type: projectType }
}

export const createDefaultTeamProjectBundleDependencies = (): TeamProjectBundleDependencies => {
  const ipc = window.require('electron').ipcRenderer as ProjectTransferIpc

  return {
    exportLocalProject: async (project) =>
      runProjectTransfer(ipc, {
        channel: 'ExportProject',
        params: { Id: project.id, Password: '' },
        requireTargetPath: true,
      }),
    inspectArchive: (filePath) => ipc.invoke('InspectProjectArchive', filePath) as Promise<ProjectArchiveInfo>,
    readArchiveChunk: (input) => ipc.invoke('ReadProjectArchiveChunk', input) as Promise<ProjectArchiveChunk>,
    createManagedArchive: (input) => ipc.invoke('CreateProjectArchive', input),
    writeManagedArchiveChunk: (input) => ipc.invoke('WriteProjectArchiveChunk', input),
    finalizeManagedArchive: (filePath) => ipc.invoke('FinalizeProjectArchive', filePath) as Promise<ProjectArchiveInfo>,
    importManagedArchive: async (filePath, localProjectName) => {
      const projectType = await getProjectType()
      return importProjectArchive(ipc, filePath, localProjectName, projectType, true)
    },
    replaceLocalProjectFromArchive: async (filePath, existingProject) => {
      const projectId = Number(existingProject.id)
      if (!Number.isSafeInteger(projectId) || projectId <= 0) throw new Error('同名本地项目标识无效')
      const projectType = existingProject.type || (await getProjectType())
      const backupPath = await runProjectTransfer(ipc, {
        channel: 'ExportProject',
        params: { Id: projectId, Password: '' },
        requireTargetPath: true,
      })
      const backup = (await ipc.invoke('InspectProjectArchive', backupPath)) as ProjectArchiveInfo
      if (!Number.isSafeInteger(backup?.size) || backup.size <= 0) throw new Error('同名本地项目备份为空')

      let deleted = false
      try {
        await ipc.invoke('DeleteProject', { Id: projectId, IsDeleteLocal: true, Type: projectType })
        deleted = true
        const imported = await importProjectArchive(ipc, filePath, existingProject.name, projectType, false)
        return { ...imported, backupPath }
      } catch (importError) {
        if (!deleted) throw importError
        try {
          await importProjectArchive(ipc, backupPath, existingProject.name, projectType, false)
        } catch (restoreError) {
          throw new Error(
            `覆盖导入失败，原项目恢复也失败；备份保留在 ${backupPath}。导入错误：${getErrorMessage(
              importError,
            )}；恢复错误：${getErrorMessage(restoreError)}`,
          )
        }
        throw new Error(`覆盖导入失败，原项目已从备份恢复：${getErrorMessage(importError)}`)
      }
    },
    removeManagedArchive: (filePath) => ipc.invoke('RemoveProjectArchive', filePath),
    getProjectSnapshot: async (teamId, projectId) => {
      const response = await teamCollaboration.getProjectSnapshot(teamId, projectId)
      return unwrapData(response)
    },
    updateProjectSnapshot: async (teamId, projectId, input) => {
      const response = await teamCollaboration.updateProjectSnapshot(teamId, projectId, input)
      return unwrapData(response)
    },
    createTestData: async (teamId, projectId, input) => {
      const response = await teamCollaboration.createTestData(teamId, projectId, input)
      return unwrapData(response)
    },
    deleteTestData: (teamId, projectId, dataId) => teamCollaboration.deleteTestData(teamId, projectId, dataId),
    listTestData: listAllBundleData,
    getTestData: async (teamId, projectId, dataId) => {
      const response = await teamCollaboration.getTestData(teamId, projectId, dataId)
      return unwrapData(response)
    },
    saveProjectMapping: saveMapping,
    createBundleId: () => `bundle-${Date.now()}-${randomString(20)}`,
    now: () => new Date().toISOString(),
  }
}
