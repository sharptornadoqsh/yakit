import * as teamCollaboration from '@/services/teamCollaboration'
import { createAndUploadProjectShareBundle, type ProjectSharePluginSummary } from './projectShareBundle'
import type { ProjectShareRuntimeDependencies } from './projectShareRuntime'

export interface CreateElectronProjectShareRuntimeDependenciesInput {
  installPlugin?: ProjectShareRuntimeDependencies['installPlugin']
}

const createError = (code: string) => Object.assign(new Error(code), { code })
const isPositiveInteger = (value: number) => Number.isSafeInteger(value) && value > 0

const unwrapV2Data = <T>(response: { data?: T } | T): T => {
  if (response && typeof response === 'object' && 'data' in response) {
    return (response as { data: T }).data
  }
  return response as T
}

const decodeProjectSharePlugin = (contentBase64: string) => {
  const binary = globalThis.atob(contentBase64)
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes)
  } catch {
    throw createError('project_share_plugin_utf8_invalid')
  }
  const encoded = new TextEncoder().encode(content)
  if (encoded.byteLength !== bytes.byteLength || encoded.some((byte, index) => byte !== bytes[index])) {
    throw createError('project_share_plugin_utf8_invalid')
  }
  return content
}

const toYakScriptParameters = (plugin: ProjectSharePluginSummary) =>
  plugin.metadata.params.map((parameter) => ({
    Field: parameter.field,
    FieldVerbose: parameter.fieldVerbose,
    Required: parameter.required,
    TypeVerbose: parameter.typeVerbose,
    DefaultValue: parameter.defaultValue,
    ExtraSetting: parameter.extraSetting,
    Help: parameter.help,
    Group: parameter.group || '',
    MethodType: parameter.methodType || '',
    JsonSchema: parameter.jsonSchema || '',
    UISchema: parameter.uiSchema || '',
    SuggestionDataExpression: parameter.suggestionDataExpression || '',
  }))

const installLocalProjectSharePlugin: ProjectShareRuntimeDependencies['installPlugin'] = async ({
  plugin,
  contentBase64,
}) => {
  const { ipcRenderer } = window.require('electron')
  const response = await ipcRenderer.invoke('QueryYakScript', {
    IncludedScriptNames: [plugin.scriptName],
    Pagination: { Page: 1, Limit: 10, OrderBy: 'updated_at', Order: 'desc' },
  })
  const existing = (Array.isArray(response?.Data) ? response.Data : []).filter(
    (item) => item?.ScriptName === plugin.scriptName,
  )
  if (existing.length > 1) throw createError('project_share_local_plugin_ambiguous')
  const current = existing[0]
  const saved = await ipcRenderer.invoke('SaveYakScript', {
    ...(isPositiveInteger(Number(current?.Id)) ? { Id: Number(current.Id) } : {}),
    ScriptName: plugin.scriptName,
    Type: plugin.type,
    Content: decodeProjectSharePlugin(contentBase64),
    Params: toYakScriptParameters(plugin),
    Help: plugin.metadata.help,
    Author: plugin.metadata.author,
    Tags: plugin.metadata.tags.join(','),
    UUID: typeof current?.UUID === 'string' ? current.UUID : '',
  })
  if (!isPositiveInteger(Number(saved?.Id))) {
    throw createError('project_share_local_plugin_save_failed')
  }
}

export const createElectronProjectShareRuntimeDependencies = ({
  installPlugin = installLocalProjectSharePlugin,
}: CreateElectronProjectShareRuntimeDependenciesInput = {}): ProjectShareRuntimeDependencies => {
  const { ipcRenderer } = window.require('electron')
  const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>

  return {
    createAndUploadBundle: (input) =>
      createAndUploadProjectShareBundle(input, {
        exportProjectArchive: (request, operationToken) => invoke('ExportProjectShareArchive', request, operationToken),
        stagePlugin: (request) => invoke('StageProjectSharePlugin', request),
        createBundle: (request) => invoke('CreateProjectShareBundle', request),
        readBundleChunk: (request) => invoke('ReadProjectShareBundleChunk', request),
        removeManagedHandle: (handle) => invoke('RemoveProjectShareManagedHandle', handle),
        createRemoteBundle: async (teamId, projectId, request) =>
          unwrapV2Data(await teamCollaboration.createProjectShareBundle(teamId, projectId, request)),
        uploadRemoteChunk: async (teamId, projectId, bundleId, index, request) =>
          unwrapV2Data(
            await teamCollaboration.uploadProjectShareBundleChunk(teamId, projectId, bundleId, index, request),
          ),
        finalizeRemoteBundle: async (teamId, projectId, bundleId) =>
          unwrapV2Data(await teamCollaboration.finalizeProjectShareBundle(teamId, projectId, bundleId)),
      }),
    createShare: async (teamId, projectId, request) =>
      unwrapV2Data(await teamCollaboration.createProjectShare(teamId, projectId, request)),
    prepareImport: async (request) => unwrapV2Data(await teamCollaboration.prepareProjectShareImport(request)),
    resumeImport: async (receiptId) => unwrapV2Data(await teamCollaboration.resumeProjectShareImport(receiptId)),
    heartbeatImport: async (receiptId) => unwrapV2Data(await teamCollaboration.heartbeatProjectShareImport(receiptId)),
    completeImport: async (receiptId) => unwrapV2Data(await teamCollaboration.completeProjectShareImport(receiptId)),
    failImport: async (receiptId, request) =>
      unwrapV2Data(await teamCollaboration.failProjectShareImport(receiptId, request)),
    getClientContext: () => invoke('GetProjectShareClientContext'),
    listRecoveries: () => invoke('ListProjectShareRecoveries'),
    upsertRecovery: (request) => invoke('UpsertProjectShareRecovery', request),
    releaseRecoveryHandle: (request) => invoke('ReleaseProjectShareManagedHandle', request),
    removeRecovery: (request) => invoke('RemoveProjectShareRecovery', request),
    downloadImportBundle: (request) => invoke('DownloadProjectShareImportBundle', request),
    extractBundle: (handle) => invoke('ExtractProjectShareBundle', handle),
    readPluginContent: (handle) => invoke('ReadProjectSharePluginContent', handle),
    importProjectArchive: (request, operationToken) => invoke('ImportProjectShareArchive', request, operationToken),
    resolveImportedProject: (receiptId) => invoke('ResolveProjectShareImportedProject', receiptId),
    installPlugin,
  }
}
