#!/usr/bin/env node

const assert = require('assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const net = require('net')
const os = require('os')
const path = require('path')
const { execFileSync, spawn } = require('child_process')
const grpc = require('@grpc/grpc-js')
const protoLoader = require('@grpc/proto-loader')

const REPOSITORY_ROOT = path.resolve(__dirname, '..', '..')
const PROTO_PATH = path.join(REPOSITORY_ROOT, 'app', 'protos', 'grpc.proto')
const DEFAULT_TIMEOUT_MS = 30_000
const SQLITE_HEADER = 'SQLite format 3\u0000'
const activeEngineProcesses = new Set()
let terminatingFromSignal = false

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))
const hasExited = (processHandle) =>
  !processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null

const handleTerminationSignal = (signal) => {
  if (terminatingFromSignal) return
  terminatingFromSignal = true
  for (const processHandle of activeEngineProcesses) {
    if (hasExited(processHandle)) continue
    try {
      processHandle.kill('SIGTERM')
    } catch {}
  }
  setTimeout(() => {
    for (const processHandle of activeEngineProcesses) {
      if (hasExited(processHandle)) continue
      try {
        processHandle.kill('SIGKILL')
      } catch {}
    }
    process.exit(signal === 'SIGINT' ? 130 : 143)
  }, 5_000).unref()
}

process.once('SIGINT', () => handleTerminationSignal('SIGINT'))
process.once('SIGTERM', () => handleTerminationSignal('SIGTERM'))

const parsePort = (value, fallback, name) => {
  const port = Number(value || fallback)
  assert(Number.isInteger(port) && port > 0 && port < 65536, `${name} must be a valid TCP port`)
  return port
}

const sanitizeRunId = (value) => {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-')
  assert(sanitized.length > 0, 'Run identifier must contain at least one supported character')
  return sanitized
}

const createMetadata = (secret) => {
  const metadata = new grpc.Metadata()
  metadata.add('authorization', `bearer ${secret}`)
  return metadata
}

const loadYakClient = () => {
  const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  })
  return grpc.loadPackageDefinition(packageDefinition).ypb.Yak
}

const unary = (client, method, request, secret, timeoutMs = DEFAULT_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    client[method](request, createMetadata(secret), { deadline: Date.now() + timeoutMs }, (error, response) => {
      if (error) {
        reject(error)
        return
      }
      resolve(response)
    })
  })

const serverStream = (client, method, request, secret, timeoutMs = DEFAULT_TIMEOUT_MS) =>
  new Promise((resolve, reject) => {
    const records = []
    let settled = false
    const call = client[method](request, createMetadata(secret), {
      deadline: Date.now() + timeoutMs,
    })

    call.on('data', (record) => records.push(record))
    call.on('error', (error) => {
      if (settled) return
      settled = true
      reject(error)
    })
    call.on('end', () => {
      if (settled) return
      settled = true
      resolve(records)
    })
  })

const assertPortAvailable = (port) =>
  new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', (error) => reject(new Error(`Port ${port} is unavailable: ${error.message}`)))
    server.listen(port, '127.0.0.1', () => {
      server.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
  })

const waitForExit = (processHandle, timeoutMs) =>
  new Promise((resolve) => {
    if (hasExited(processHandle)) {
      resolve(true)
      return
    }

    const timer = setTimeout(() => {
      processHandle.removeListener('exit', onExit)
      resolve(false)
    }, timeoutMs)
    const onExit = () => {
      clearTimeout(timer)
      resolve(true)
    }
    processHandle.once('exit', onExit)
  })

const closeLogStream = (engine) => {
  if (!engine?.logStream || engine.logStream.writableEnded) return
  engine.logStream.end()
}

const stopEngine = async (engine) => {
  const processHandle = engine?.process
  if (!processHandle || hasExited(processHandle)) {
    closeLogStream(engine)
    return {
      processId: processHandle?.pid || null,
      signal: null,
      forced: false,
      exited: true,
      exitCode: processHandle?.exitCode ?? null,
      signalCode: processHandle?.signalCode ?? null,
    }
  }

  let signal = 'SIGTERM'
  let forced = false
  processHandle.kill(signal)
  let exited = await waitForExit(processHandle, 10_000)
  if (!exited) {
    signal = 'SIGKILL'
    forced = true
    processHandle.kill(signal)
    exited = await waitForExit(processHandle, 10_000)
  }
  closeLogStream(engine)
  assert(exited && hasExited(processHandle), `Engine process ${processHandle.pid} did not exit after ${signal}`)
  return {
    processId: processHandle.pid,
    signal,
    forced,
    exited,
    exitCode: processHandle.exitCode,
    signalCode: processHandle.signalCode,
  }
}

const startEngine = async (Yak, configuration) => {
  fs.mkdirSync(configuration.home, { recursive: true })
  const logPath = path.join(configuration.home, 'engine.log')
  const logStream = fs.createWriteStream(logPath, { flags: 'a' })
  const argumentsList = [
    'grpc',
    '--home',
    configuration.home,
    '--host',
    '127.0.0.1',
    '--port',
    String(configuration.port),
    '--frontend',
    'enterprise',
    '--secret',
    configuration.secret,
    '--project-db',
    configuration.projectDatabaseName,
    '--profile-db',
    configuration.profileDatabaseName,
    '--disable-reverse-server',
  ]
  const processHandle = spawn(configuration.enginePath, argumentsList, {
    cwd: configuration.home,
    env: {
      ...process.env,
      YAKIT_HOME: configuration.home,
      YAK_DEFAULT_PROJECT_DATABASE_NAME: configuration.projectDatabaseName,
      YAK_DEFAULT_PROFILE_DATABASE_NAME: configuration.profileDatabaseName,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  activeEngineProcesses.add(processHandle)
  processHandle.once('exit', () => activeEngineProcesses.delete(processHandle))
  processHandle.stdout.pipe(logStream)
  processHandle.stderr.pipe(logStream)
  let spawnError
  processHandle.once('error', (error) => {
    spawnError = error
  })

  const client = new Yak(`127.0.0.1:${configuration.port}`, grpc.credentials.createInsecure())
  const startedAt = Date.now()
  let lastError

  while (Date.now() - startedAt < configuration.startTimeoutMs) {
    if (spawnError) {
      client.close()
      await stopEngine({ logStream, process: processHandle })
      throw new Error(`Engine failed to start: ${spawnError.message}; inspect ${logPath}`)
    }
    if (hasExited(processHandle)) {
      client.close()
      closeLogStream({ logStream })
      throw new Error(`Engine exited before readiness; inspect ${logPath}`)
    }
    try {
      const response = await unary(client, 'Echo', { text: 'team-sharing-acceptance' }, configuration.secret, 2_000)
      assert.equal(response.result, 'team-sharing-acceptance')
      return {
        ...configuration,
        client,
        logPath,
        logStream,
        process: processHandle,
      }
    } catch (error) {
      lastError = error
      await sleep(500)
    }
  }

  client.close()
  await stopEngine({ logStream, process: processHandle })
  throw new Error(`Engine readiness timed out: ${lastError?.message || 'unknown error'}; inspect ${logPath}`)
}

const closeEngineClient = (engine) => {
  if (!engine?.client) return
  engine.client.close()
  engine.client = undefined
}

const fileSha256 = (filePath) => {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

const contentSha256 = (content) => crypto.createHash('sha256').update(content).digest('hex')

const commandOutput = (executable, argumentsList, options = {}) =>
  execFileSync(executable, argumentsList, {
    encoding: 'utf8',
    windowsHide: true,
    ...options,
  }).trim()

const assertSqliteFile = (filePath) => {
  assert(fs.existsSync(filePath), `SQLite file does not exist: ${filePath}`)
  const stat = fs.statSync(filePath)
  assert(stat.isFile() && stat.size >= SQLITE_HEADER.length, `SQLite file is empty: ${filePath}`)
  assert.equal(fs.readFileSync(filePath).subarray(0, SQLITE_HEADER.length).toString('utf8'), SQLITE_HEADER)
  return stat.size
}

const serializeError = (error) => ({
  name: error?.name || 'Error',
  message: error?.message || String(error),
  stack: error?.stack,
})

const getProjects = (engine, projectName) =>
  unary(
    engine.client,
    'GetProjects',
    {
      ProjectName: projectName,
      Type: 'project',
      FrontendType: 'project',
      Pagination: {
        Page: 1,
        Limit: 100,
        OrderBy: 'updated_at',
        Order: 'desc',
      },
    },
    engine.secret,
  )

const findProject = async (engine, projectName) => {
  const response = await getProjects(engine, projectName)
  return response.Projects.find((project) => project.ProjectName === projectName)
}

const queryPlugin = async (engine, scriptName) => {
  const response = await unary(
    engine.client,
    'QueryYakScript',
    {
      IncludedScriptNames: [scriptName],
      Pagination: {
        Page: 1,
        Limit: 100,
        OrderBy: 'updated_at',
        Order: 'desc',
      },
    },
    engine.secret,
  )
  return response.Data.find((plugin) => plugin.ScriptName === scriptName)
}

const recordCheck = async (report, name, action) => {
  const detail = await action()
  report.checks.push({
    name,
    passed: true,
    detail: detail === undefined ? null : detail,
  })
  return detail
}

const main = async () => {
  const engineSetting = process.env.YAK_TEAM_ACCEPTANCE_ENGINE
  assert(engineSetting, 'YAK_TEAM_ACCEPTANCE_ENGINE is required')
  const enginePath = path.resolve(engineSetting)
  assert(
    fs.existsSync(enginePath) && fs.statSync(enginePath).isFile(),
    `Engine executable does not exist: ${enginePath}`,
  )

  const sqliteSetting = process.env.YAK_TEAM_ACCEPTANCE_SQLITE || 'sqlite3'
  const acceptanceRoot = path.resolve(
    process.env.YAK_TEAM_ACCEPTANCE_ROOT || path.join(os.tmpdir(), 'yakit-team-sharing-acceptance'),
  )
  const defaultRunId = `dual-client-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`
  const runId = sanitizeRunId(process.env.YAK_TEAM_ACCEPTANCE_RUN_ID || defaultRunId)
  const runRoot = path.join(acceptanceRoot, runId)
  assert(!fs.existsSync(runRoot), `Acceptance run directory already exists: ${runRoot}`)
  fs.mkdirSync(runRoot, { recursive: true })

  const portA = parsePort(process.env.YAK_TEAM_ACCEPTANCE_PORT_A, 19187, 'YAK_TEAM_ACCEPTANCE_PORT_A')
  const portB = parsePort(process.env.YAK_TEAM_ACCEPTANCE_PORT_B, 19188, 'YAK_TEAM_ACCEPTANCE_PORT_B')
  const startTimeoutMs = Number(process.env.YAK_TEAM_ACCEPTANCE_START_TIMEOUT_MS || 300_000)
  assert(
    Number.isInteger(startTimeoutMs) && startTimeoutMs >= 30_000,
    'YAK_TEAM_ACCEPTANCE_START_TIMEOUT_MS must be an integer of at least 30000',
  )
  assert.notEqual(portA, portB, 'Client ports must be different')
  await Promise.all([assertPortAvailable(portA), assertPortAvailable(portB)])

  const Yak = loadYakClient()
  const sourceCommit = commandOutput('git', ['rev-parse', 'HEAD'], { cwd: REPOSITORY_ROOT })
  const sourceDirty = Boolean(
    commandOutput('git', ['status', '--porcelain', '--untracked-files=all'], { cwd: REPOSITORY_ROOT }),
  )
  const sqliteVersion = commandOutput(sqliteSetting, ['--version'])
  const secretA = crypto.randomBytes(18).toString('hex')
  const secretB = crypto.randomBytes(18).toString('hex')
  const clientAConfiguration = {
    enginePath,
    home: path.join(runRoot, 'client-a'),
    port: portA,
    profileDatabaseName: 'client-a-profile.db',
    projectDatabaseName: 'client-a-project.db',
    secret: secretA,
    startTimeoutMs,
  }
  const clientBConfiguration = {
    enginePath,
    home: path.join(runRoot, 'client-b'),
    port: portB,
    profileDatabaseName: 'client-b-profile.db',
    projectDatabaseName: 'client-b-project.db',
    secret: secretB,
    startTimeoutMs,
  }
  const report = {
    schemaVersion: 2,
    runId,
    startedAt: new Date().toISOString(),
    completedAt: null,
    result: 'running',
    enginePath,
    provenance: {
      scriptPath: __filename,
      scriptSha256: fileSha256(__filename),
      sourceCommit,
      sourceDirty,
      engineSha256: fileSha256(enginePath),
      sqliteExecutable: sqliteSetting,
      sqliteVersion,
    },
    clients: {
      a: {
        home: clientAConfiguration.home,
        port: portA,
        profileDatabase: path.join(clientAConfiguration.home, clientAConfiguration.profileDatabaseName),
        processIds: [],
      },
      b: {
        home: clientBConfiguration.home,
        port: portB,
        profileDatabase: path.join(clientBConfiguration.home, clientBConfiguration.profileDatabaseName),
        processIds: [],
      },
    },
    artifacts: {},
    cleanup: null,
    checks: [],
  }
  const reportPath = path.join(runRoot, 'acceptance-report.json')
  const projectName = `team-source-${runId}`
  const importedProjectName = `team-imported-${runId}`
  const pluginName = `team-plugin-${runId}`
  const groupName = `team-group-${runId}`
  const projectStateKey = `team-acceptance-state-${runId}`
  const projectState = {
    target: { host: '127.0.0.1', port: 18080 },
    task: { name: `team-task-${runId}`, status: 'completed' },
    testData: {
      request: `GET /team-acceptance/${runId} HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n`,
      response: 'HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\n\r\naccepted',
    },
    testResult: {
      title: `team-result-${runId}`,
      severity: 'info',
      details: `result-${crypto.randomBytes(12).toString('hex')}`,
    },
  }
  const projectStateJson = JSON.stringify(projectState)
  const password = 'TeamTest-2026'
  const pluginOutputMarker = `team-plugin-content-${runId}`
  const pluginContent = `yakit.AutoInitYakit()\nprintln(${JSON.stringify(pluginOutputMarker)})`
  const projectMappingKey = `team-project-mapping:${encodeURIComponent('current')}:1001:2001`
  const pluginMappingKey = `team-plugin-mapping:${encodeURIComponent('current')}:1001:3001`

  let engineA
  let engineB
  let pluginContentReadFromA
  let runError
  let cleanupError

  const writeReport = () => fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')

  try {
    engineA = await startEngine(Yak, clientAConfiguration)
    engineB = await startEngine(Yak, clientBConfiguration)
    report.clients.a.processIds.push(engineA.process.pid)
    report.clients.b.processIds.push(engineB.process.pid)

    await recordCheck(report, 'engine-versions', async () => {
      const [versionA, versionB] = await Promise.all([
        unary(engineA.client, 'Version', {}, secretA),
        unary(engineB.client, 'Version', {}, secretB),
      ])
      return { clientA: versionA, clientB: versionB }
    })

    await recordCheck(report, 'invalid-secret-rejected', async () => {
      const invalidClient = new Yak(`127.0.0.1:${portA}`, grpc.credentials.createInsecure())
      try {
        let rejection
        try {
          await unary(invalidClient, 'Echo', { text: 'must-fail' }, 'invalid-acceptance-secret', 5_000)
        } catch (error) {
          rejection = error
        }
        assert(rejection, 'Engine accepted an invalid secret')
        assert.notEqual(rejection.code, grpc.status.OK)
        assert.match(rejection.details || rejection.message, /secret verify failed/i)
        return { grpcStatus: rejection.code, details: rejection.details }
      } finally {
        invalidClient.close()
      }
    })

    const createdProject = await recordCheck(report, 'client-a-create-project', async () => {
      const response = await unary(
        engineA.client,
        'NewProject',
        {
          ProjectName: projectName,
          Description: JSON.stringify([{ Key: 'acceptance', Value: runId }]),
          Type: 'project',
        },
        secretA,
      )
      assert.equal(response.ProjectName, projectName)
      assert(Number(response.Id) > 0)
      return response
    })

    const sourceProject = await recordCheck(report, 'client-a-query-project', async () => {
      const project = await findProject(engineA, projectName)
      assert(project, `Client A cannot query project ${projectName}`)
      assert.equal(Number(project.Id), Number(createdProject.Id))
      assert(path.isAbsolute(project.DatabasePath))
      return project
    })

    await recordCheck(report, 'client-b-project-isolation-before-import', async () => {
      assert.equal(await findProject(engineB, projectName), undefined)
      return { projectName }
    })

    await recordCheck(report, 'client-a-save-structured-project-state', async () => {
      await unary(
        engineA.client,
        'SetCurrentProject',
        { ProjectName: projectName, Id: createdProject.Id, Type: 'project' },
        secretA,
      )
      await unary(engineA.client, 'SetProjectKey', { Key: projectStateKey, Value: projectStateJson }, secretA)
      const stored = await unary(engineA.client, 'GetProjectKey', { Key: projectStateKey }, secretA)
      assert.deepEqual(JSON.parse(stored.Value), projectState)
      return {
        databasePath: sourceProject.DatabasePath,
        databaseSize: assertSqliteFile(sourceProject.DatabasePath),
        projectStateKey,
        projectStateSha256: contentSha256(stored.Value),
      }
    })

    const exportProgress = await recordCheck(report, 'client-a-export-local-project-archive', async () => {
      await unary(engineA.client, 'SetCurrentProject', { Id: 0, ProjectName: '', Type: 'project' }, secretA)
      try {
        const progress = await serverStream(
          engineA.client,
          'ExportProject',
          {
            Id: createdProject.Id,
            ProjectName: projectName,
            Password: password,
          },
          secretA,
          120_000,
        )
        assert(progress.length > 0, 'ExportProject returned no progress records')
        const completed = [...progress].reverse().find((item) => item.TargetPath)
        assert(completed?.TargetPath, 'ExportProject did not return an archive path')
        assert(fs.existsSync(completed.TargetPath), `Project archive does not exist: ${completed.TargetPath}`)
        const stat = fs.statSync(completed.TargetPath)
        assert(stat.isFile() && stat.size > 0, 'Project archive is empty')
        return {
          records: progress.length,
          targetPath: completed.TargetPath,
          size: stat.size,
          sha256: fileSha256(completed.TargetPath),
          detachedCurrentProjectBeforeExport: true,
        }
      } finally {
        await unary(
          engineA.client,
          'SetCurrentProject',
          { ProjectName: projectName, Id: createdProject.Id, Type: 'project' },
          secretA,
        )
      }
    })
    report.artifacts.projectArchive = exportProgress

    const importProgress = await recordCheck(report, 'client-b-import-local-project-archive', async () => {
      const progress = await serverStream(
        engineB.client,
        'ImportProject',
        {
          LocalProjectName: importedProjectName,
          ProjectFilePath: exportProgress.targetPath,
          Password: password,
          Type: 'project',
        },
        secretB,
        120_000,
      )
      assert(progress.length > 0, 'ImportProject returned no progress records')
      return { records: progress.length, final: progress.at(-1) }
    })

    const importedProject = await recordCheck(report, 'client-b-query-imported-project', async () => {
      const project = await findProject(engineB, importedProjectName)
      assert(project, `Client B cannot query imported project ${importedProjectName}`)
      assert(path.isAbsolute(project.DatabasePath))
      assert.notEqual(path.resolve(project.DatabasePath), path.resolve(sourceProject.DatabasePath))
      return project
    })

    await recordCheck(report, 'client-b-verify-structured-project-state', async () => {
      await unary(
        engineB.client,
        'SetCurrentProject',
        { ProjectName: importedProjectName, Id: importedProject.Id, Type: 'project' },
        secretB,
      )
      const importedState = await unary(engineB.client, 'GetProjectKey', { Key: projectStateKey }, secretB)
      assert.deepEqual(JSON.parse(importedState.Value), projectState)
      return {
        databasePath: importedProject.DatabasePath,
        databaseSize: assertSqliteFile(importedProject.DatabasePath),
        projectStateKey,
        projectStateSha256: contentSha256(importedState.Value),
      }
    })

    await recordCheck(report, 'client-a-imported-name-isolation', async () => {
      assert.equal(await findProject(engineA, importedProjectName), undefined)
      return { projectName: importedProjectName }
    })

    await recordCheck(report, 'client-a-save-plugin', async () => {
      const response = await unary(
        engineA.client,
        'SaveYakScript',
        {
          ScriptName: pluginName,
          Type: 'yak',
          Content: pluginContent,
          Help: `Team acceptance plugin ${runId}`,
          Author: 'team-acceptance',
          Tags: 'team,acceptance',
        },
        secretA,
      )
      assert(Number(response.Id) > 0)
      assert.equal(response.ScriptName, pluginName)
      assert.equal(response.Content, pluginContent)
      return { Id: response.Id, ScriptName: response.ScriptName, UUID: response.UUID }
    })

    await recordCheck(report, 'client-a-query-plugin', async () => {
      const plugin = await queryPlugin(engineA, pluginName)
      assert(plugin)
      assert.equal(plugin.Content, pluginContent)
      pluginContentReadFromA = plugin.Content
      return {
        Id: plugin.Id,
        ScriptName: plugin.ScriptName,
        contentSha256: contentSha256(pluginContentReadFromA),
      }
    })

    await recordCheck(report, 'client-b-plugin-isolation-before-save', async () => {
      assert.equal(await queryPlugin(engineB, pluginName), undefined)
      return { scriptName: pluginName }
    })

    const savedPluginB = await recordCheck(report, 'client-b-save-local-copied-plugin-content', async () => {
      assert.equal(pluginContentReadFromA, pluginContent)
      const response = await unary(
        engineB.client,
        'SaveYakScript',
        {
          ScriptName: pluginName,
          Type: 'yak',
          Content: pluginContentReadFromA,
          Help: `Team acceptance plugin ${runId}`,
          Author: 'team-acceptance',
          Tags: 'team,acceptance',
          OnlineId: 3001,
          OnlineBaseUrl: 'current',
        },
        secretB,
      )
      assert(Number(response.Id) > 0)
      assert.equal(response.ScriptName, pluginName)
      assert.equal(response.Content, pluginContent)
      return { Id: response.Id, ScriptName: response.ScriptName, UUID: response.UUID }
    })

    await recordCheck(report, 'client-b-query-and-execute-local-copied-plugin', async () => {
      const plugin = await queryPlugin(engineB, pluginName)
      assert(plugin)
      assert.equal(plugin.Content, pluginContent)
      assert.equal(contentSha256(plugin.Content), contentSha256(pluginContent))
      const execution = await serverStream(
        engineB.client,
        'Exec',
        { Script: plugin.Content, ScriptId: pluginName },
        secretB,
        120_000,
      )
      assert(execution.length > 0, 'Locally copied plugin produced no execution records')
      const executionText = execution
        .map((record) =>
          [
            record.OutputJson,
            Buffer.from(record.Raw || []).toString('utf8'),
            Buffer.from(record.Message || []).toString('utf8'),
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n')
      assert(executionText.includes(pluginOutputMarker), 'Locally copied plugin output marker was not observed')
      return {
        Id: plugin.Id,
        ScriptName: plugin.ScriptName,
        contentSha256: contentSha256(plugin.Content),
        executionRecords: execution.length,
        outputMarkerSha256: contentSha256(pluginOutputMarker),
      }
    })

    await recordCheck(report, 'client-b-save-plugin-group', async () => {
      const filter = {
        IncludedScriptNames: [pluginName],
        Pagination: {
          Page: 1,
          Limit: 100,
          OrderBy: 'updated_at',
          Order: 'desc',
        },
      }
      await unary(
        engineB.client,
        'SaveYakScriptGroup',
        {
          Filter: filter,
          SaveGroup: [groupName],
          RemoveGroup: [],
        },
        secretB,
      )
      const response = await unary(engineB.client, 'GetYakScriptGroup', filter, secretB)
      assert(response.SetGroup.includes(groupName))
      return { groupName, setGroup: response.SetGroup, allGroup: response.AllGroup }
    })

    await recordCheck(report, 'client-b-query-plugin-group', async () => {
      const response = await unary(engineB.client, 'QueryYakScriptGroup', { All: true }, secretB)
      const group = response.Group.find((item) => item.Value === groupName)
      assert(group)
      assert(Number(group.Total) >= 1)
      return group
    })

    const projectMapping = {
      teamId: 1001,
      projectId: 2001,
      onlineProjectVersion: 1,
      bundleId: `local-transfer-${runId}`,
      bundleSha256: exportProgress.sha256,
      localProjectId: Number(importedProject.Id),
      localProjectName: importedProjectName,
      importedAt: new Date().toISOString(),
      onlineUrl: 'current',
    }
    const pluginMapping = {
      schemaVersion: 1,
      onlineBaseUrl: 'current',
      teamId: 1001,
      teamPluginId: 3001,
      localPluginId: Number(savedPluginB.Id),
      localPluginUUID: savedPluginB.UUID,
      localScriptName: pluginName,
      revision: 1,
      fileHash: contentSha256(pluginContent),
      categoryId: 4001,
      groupIds: [5001],
      installedAt: new Date().toISOString(),
    }

    await recordCheck(report, 'client-b-save-local-mappings', async () => {
      await unary(engineB.client, 'SetKey', { Key: projectMappingKey, Value: JSON.stringify(projectMapping) }, secretB)
      await unary(engineB.client, 'SetKey', { Key: pluginMappingKey, Value: JSON.stringify(pluginMapping) }, secretB)
      const [projectValue, pluginValue] = await Promise.all([
        unary(engineB.client, 'GetKey', { Key: projectMappingKey }, secretB),
        unary(engineB.client, 'GetKey', { Key: pluginMappingKey }, secretB),
      ])
      assert.deepEqual(JSON.parse(projectValue.Value), projectMapping)
      assert.deepEqual(JSON.parse(pluginValue.Value), pluginMapping)
      return { projectMappingKey, pluginMappingKey }
    })

    await recordCheck(report, 'isolated-profile-databases', async () => {
      const profileA = report.clients.a.profileDatabase
      const profileB = report.clients.b.profileDatabase
      assert.notEqual(path.resolve(profileA), path.resolve(profileB))
      return {
        clientA: { path: profileA, size: assertSqliteFile(profileA) },
        clientB: { path: profileB, size: assertSqliteFile(profileB) },
      }
    })

    closeEngineClient(engineB)
    const restartStop = await stopEngine(engineB)
    assert(restartStop.exited, 'Client B engine did not exit before restart')
    await assertPortAvailable(portB)
    report.artifacts.clientBRestart = { stop: restartStop }
    engineB = await startEngine(Yak, clientBConfiguration)
    report.clients.b.processIds.push(engineB.process.pid)
    report.artifacts.clientBRestart.processId = engineB.process.pid

    await recordCheck(report, 'client-b-project-persists-after-restart', async () => {
      const project = await findProject(engineB, importedProjectName)
      assert(project)
      await unary(
        engineB.client,
        'SetCurrentProject',
        { ProjectName: importedProjectName, Id: project.Id, Type: 'project' },
        secretB,
      )
      const stored = await unary(engineB.client, 'GetProjectKey', { Key: projectStateKey }, secretB)
      assert.deepEqual(JSON.parse(stored.Value), projectState)
      return {
        Id: project.Id,
        ProjectName: project.ProjectName,
        DatabasePath: project.DatabasePath,
        projectStateSha256: contentSha256(stored.Value),
      }
    })

    await recordCheck(report, 'client-b-plugin-persists-after-restart', async () => {
      const plugin = await queryPlugin(engineB, pluginName)
      assert(plugin)
      assert.equal(plugin.Content, pluginContent)
      return { Id: plugin.Id, ScriptName: plugin.ScriptName }
    })

    await recordCheck(report, 'client-b-group-persists-after-restart', async () => {
      const response = await unary(
        engineB.client,
        'GetYakScriptGroup',
        {
          IncludedScriptNames: [pluginName],
          Pagination: {
            Page: 1,
            Limit: 100,
            OrderBy: 'updated_at',
            Order: 'desc',
          },
        },
        secretB,
      )
      assert(response.SetGroup.includes(groupName))
      return { groupName, setGroup: response.SetGroup }
    })

    await recordCheck(report, 'client-b-mappings-persist-after-restart', async () => {
      const [projectValue, pluginValue] = await Promise.all([
        unary(engineB.client, 'GetKey', { Key: projectMappingKey }, secretB),
        unary(engineB.client, 'GetKey', { Key: pluginMappingKey }, secretB),
      ])
      assert.deepEqual(JSON.parse(projectValue.Value), projectMapping)
      assert.deepEqual(JSON.parse(pluginValue.Value), pluginMapping)
      return {
        project: JSON.parse(projectValue.Value),
        plugin: JSON.parse(pluginValue.Value),
      }
    })
  } catch (error) {
    runError = error
  } finally {
    closeEngineClient(engineA)
    closeEngineClient(engineB)
    const engineCleanup = await Promise.allSettled([stopEngine(engineA), stopEngine(engineB)])
    const portCleanup = await Promise.allSettled([assertPortAvailable(portA), assertPortAvailable(portB)])
    report.cleanup = {
      engines: engineCleanup.map((result, index) =>
        result.status === 'fulfilled'
          ? { client: index === 0 ? 'a' : 'b', ...result.value }
          : { client: index === 0 ? 'a' : 'b', error: serializeError(result.reason) },
      ),
      ports: portCleanup.map((result, index) => ({
        port: index === 0 ? portA : portB,
        available: result.status === 'fulfilled',
        error: result.status === 'rejected' ? serializeError(result.reason) : undefined,
      })),
      activeEngineProcessCount: activeEngineProcesses.size,
    }
    const rejectedCleanup = [...engineCleanup, ...portCleanup].find((result) => result.status === 'rejected')
    if (rejectedCleanup?.status === 'rejected') cleanupError = rejectedCleanup.reason
    if (!cleanupError && activeEngineProcesses.size > 0) {
      cleanupError = new Error(`${activeEngineProcesses.size} engine process handles remain active`)
    }

    report.completedAt = new Date().toISOString()
    report.result = runError || cleanupError ? 'failed' : 'passed'
    if (runError || cleanupError) {
      report.error = {
        run: runError ? serializeError(runError) : null,
        cleanup: cleanupError ? serializeError(cleanupError) : null,
      }
    }
    writeReport()
  }

  const finalError = runError || cleanupError
  if (finalError) throw new Error(`${finalError.message}; report: ${reportPath}`, { cause: finalError })
  console.log(JSON.stringify({ result: report.result, reportPath, checks: report.checks.length }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
