import childProcess from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { Worker } from 'worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getDefaultDatabaseEnvironment,
  getDefaultDatabaseName,
  initializeDefaultDatabases,
  migrateLegacyDefaultDatabases,
} from '../defaultDatabase'

const MIGRATION_JOURNAL_NAME = '.ruiyan-default-database-migration.json'
const MIGRATION_LOCK_NAME = '.ruiyan-default-database-migration.lock'
const temporaryDirectories = []

const createTemporaryDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ruiyan-default-database-'))
  temporaryDirectories.push(directory)
  return directory
}

const writeDatabaseFamily = (directory, databaseName, prefix = 'database') => {
  ;['', '-wal', '-shm'].forEach((suffix) => {
    fs.writeFileSync(path.join(directory, `${databaseName}${suffix}`), `${prefix}${suffix || '-main'}`, 'utf8')
  })
}

const expectDatabaseFamily = (directory, databaseName, expected) => {
  ;['', '-wal', '-shm'].forEach((suffix) => {
    expect(fs.readFileSync(path.join(directory, `${databaseName}${suffix}`), 'utf8')).toBe(
      `${expected}${suffix || '-main'}`,
    )
  })
}

const getActiveEngineProcessList = () => {
  if (process.platform === 'win32') {
    return '4242\t1\tyak.exe\r\n'
  }
  return '4242 yak\n'
}

const runConcurrentMigrationWorker = (directory, controlBuffer) =>
  new Worker(
    `
      const fs = require('fs')
      const path = require('path')
      const { parentPort, workerData } = require('worker_threads')
      const { migrateLegacyDefaultDatabases } = require(workerData.modulePath)
      const control = new Int32Array(workerData.controlBuffer)
      const renameSync = fs.renameSync.bind(fs)

      fs.renameSync = (source, target) => {
        if (path.basename(source) === 'default-yakit.db' && path.basename(target) === 'default-RuiYan.db') {
          const active = Atomics.add(control, 0, 1) + 1
          let maximum = Atomics.load(control, 1)
          while (active > maximum && Atomics.compareExchange(control, 1, maximum, active) !== maximum) {
            maximum = Atomics.load(control, 1)
          }
          parentPort.postMessage({ type: 'entered' })
          Atomics.wait(control, 2, 0, 5000)
          try {
            return renameSync(source, target)
          } finally {
            Atomics.sub(control, 0, 1)
          }
        }
        return renameSync(source, target)
      }

      Atomics.wait(control, 3, 0)
      try {
        const records = migrateLegacyDefaultDatabases(workerData.directory, { confirmDatabaseIdle: () => true })
        parentPort.postMessage({ type: 'result', records })
      } catch (error) {
        parentPort.postMessage({ type: 'error', code: error.code, message: error.message })
      }
    `,
    {
      eval: true,
      workerData: {
        controlBuffer,
        directory,
        modulePath: path.resolve('app/main/defaultDatabase.js'),
      },
    },
  )

beforeEach(() => {
  vi.spyOn(childProcess, 'execFileSync').mockReturnValue('')
})

afterEach(() => {
  vi.restoreAllMocks()
  temporaryDirectories.splice(0).forEach((directory) => {
    fs.rmSync(directory, { recursive: true, force: true })
  })
})

describe('睿眼默认数据库', () => {
  it('按版本类别返回睿眼数据库名', () => {
    expect(getDefaultDatabaseName()).toBe('default-RuiYan.db')
    expect(getDefaultDatabaseName('enterprise')).toBe('company-default-RuiYan.db')
    expect(getDefaultDatabaseName('enpritrace')).toBe('company-default-RuiYan.db')
    expect(getDefaultDatabaseName('yakitEE')).toBe('company-default-RuiYan.db')
  })

  it('为本地引擎提供实际生效的数据库环境变量', () => {
    expect(getDefaultDatabaseEnvironment('yakit')).toEqual({
      YAK_DEFAULT_PROJECT_DATABASE_NAME: 'default-RuiYan.db',
    })
    expect(getDefaultDatabaseEnvironment('yakit', 'enterprise')).toEqual({
      YAK_DEFAULT_PROJECT_DATABASE_NAME: 'company-default-RuiYan.db',
    })
    expect(getDefaultDatabaseEnvironment('irify', 'enterprise')).toEqual({
      YAK_DEFAULT_PROFILE_DATABASE_NAME: 'irify-profile-rule.db',
      YAK_DEFAULT_PROJECT_DATABASE_NAME: 'default-irify.db',
      SSA_DATABASE_RAW: 'default-yakssa.db',
    })
  })

  it('无损改名旧数据库及其附属文件', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const targetName = 'default-RuiYan.db'

    writeDatabaseFamily(directory, sourceName)

    const records = migrateLegacyDefaultDatabases(directory)

    expect(records).toEqual([{ from: sourceName, to: targetName }])
    ;['', '-wal', '-shm'].forEach((suffix) => {
      expect(fs.existsSync(path.join(directory, `${sourceName}${suffix}`))).toBe(false)
      expect(fs.existsSync(path.join(directory, `${targetName}${suffix}`))).toBe(true)
    })
    expect(fs.existsSync(path.join(directory, MIGRATION_JOURNAL_NAME))).toBe(false)
    expect(fs.existsSync(path.join(directory, MIGRATION_LOCK_NAME))).toBe(false)
  })

  it('目标数据库存在时保留两份数据并让原默认库继续生效', () => {
    const directory = createTemporaryDirectory()
    writeDatabaseFamily(directory, 'default-yakit.db', 'legacy')
    writeDatabaseFamily(directory, 'default-RuiYan.db', 'current')

    const records = migrateLegacyDefaultDatabases(directory)

    expect(records).toEqual([
      {
        from: 'default-yakit.db',
        to: 'default-RuiYan.db',
        archivedTo: 'default-RuiYan-legacy.db',
      },
    ])
    expectDatabaseFamily(directory, 'default-RuiYan.db', 'legacy')
    expectDatabaseFamily(directory, 'default-RuiYan-legacy.db', 'current')
    expect(fs.readdirSync(directory).join('\n')).not.toMatch(/yakit/i)
  })

  it('冲突归档和源库迁移均按 WAL、SHM、主库次序改名', () => {
    const directory = createTemporaryDirectory()
    writeDatabaseFamily(directory, 'default-yakit.db', 'legacy')
    writeDatabaseFamily(directory, 'default-RuiYan.db', 'current')
    const databaseMoves = []
    const renameSync = fs.renameSync.bind(fs)

    vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (!String(source).endsWith('.tmp')) {
        databaseMoves.push(`${path.basename(source)} -> ${path.basename(target)}`)
      }
      renameSync(source, target)
    })

    migrateLegacyDefaultDatabases(directory)

    expect(databaseMoves).toEqual([
      'default-RuiYan.db-wal -> default-RuiYan-legacy.db-wal',
      'default-RuiYan.db-shm -> default-RuiYan-legacy.db-shm',
      'default-RuiYan.db -> default-RuiYan-legacy.db',
      'default-yakit.db-wal -> default-RuiYan.db-wal',
      'default-yakit.db-shm -> default-RuiYan.db-shm',
      'default-yakit.db -> default-RuiYan.db',
    ])
  })

  it('同步改名失败时保留日志并由后续调用恢复', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const targetName = 'default-RuiYan.db'

    writeDatabaseFamily(directory, sourceName, 'legacy')

    const renameSync = fs.renameSync.bind(fs)
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (path.basename(from) === `${sourceName}-shm` && path.basename(to) === `${targetName}-shm`) {
        throw new Error('模拟改名失败')
      }
      renameSync(from, to)
    })

    expect(() => migrateLegacyDefaultDatabases(directory)).toThrow('模拟改名失败')
    expect(fs.existsSync(path.join(directory, MIGRATION_JOURNAL_NAME))).toBe(true)
    expect(fs.existsSync(path.join(directory, MIGRATION_LOCK_NAME))).toBe(false)

    vi.restoreAllMocks()
    vi.spyOn(childProcess, 'execFileSync').mockReturnValue('')

    expect(migrateLegacyDefaultDatabases(directory)).toEqual([{ from: sourceName, to: targetName }])
    ;['', '-wal', '-shm'].forEach((suffix) => {
      expect(fs.existsSync(path.join(directory, `${sourceName}${suffix}`))).toBe(false)
    })
    expectDatabaseFamily(directory, targetName, 'legacy')
    expect(fs.existsSync(path.join(directory, MIGRATION_JOURNAL_NAME))).toBe(false)
  })

  it('日志状态未更新时依据文件状态恢复中断迁移', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const targetName = 'default-RuiYan.db'

    fs.writeFileSync(path.join(directory, `${targetName}-wal`), 'legacy-wal', 'utf8')
    fs.writeFileSync(path.join(directory, `${sourceName}-shm`), 'legacy-shm', 'utf8')
    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')
    fs.writeFileSync(
      path.join(directory, MIGRATION_JOURNAL_NAME),
      JSON.stringify({
        version: 1,
        from: sourceName,
        to: targetName,
        archivedTo: null,
        operations: [
          { source: `${sourceName}-wal`, target: `${targetName}-wal`, completed: false },
          { source: `${sourceName}-shm`, target: `${targetName}-shm`, completed: false },
          { source: sourceName, target: targetName, completed: false },
        ],
      }),
      'utf8',
    )

    expect(migrateLegacyDefaultDatabases(directory)).toEqual([{ from: sourceName, to: targetName }])
    expectDatabaseFamily(directory, targetName, 'legacy')
    expect(fs.existsSync(path.join(directory, MIGRATION_JOURNAL_NAME))).toBe(false)
  })

  it('日志标记完成但目标缺失时从仍存在的源文件恢复', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const targetName = 'default-RuiYan.db'
    const journalPath = path.join(directory, MIGRATION_JOURNAL_NAME)
    const sourcePath = path.join(directory, sourceName)
    const targetPath = path.join(directory, targetName)
    const journalStatesAtRename = []

    fs.writeFileSync(sourcePath, 'legacy-main', 'utf8')
    fs.writeFileSync(
      journalPath,
      JSON.stringify({
        version: 1,
        from: sourceName,
        to: targetName,
        archivedTo: null,
        operations: [{ source: sourceName, target: targetName, completed: true }],
      }),
      'utf8',
    )
    const renameSync = fs.renameSync.bind(fs)
    vi.spyOn(fs, 'renameSync').mockImplementation((source, target) => {
      if (source === sourcePath && target === targetPath) {
        journalStatesAtRename.push(JSON.parse(fs.readFileSync(journalPath, 'utf8')).operations[0].completed)
      }
      renameSync(source, target)
    })

    expect(migrateLegacyDefaultDatabases(directory)).toEqual([{ from: sourceName, to: targetName }])
    expect(journalStatesAtRename).toEqual([false])
    expect(fs.existsSync(path.join(directory, sourceName))).toBe(false)
    expect(fs.readFileSync(path.join(directory, targetName), 'utf8')).toBe('legacy-main')
    expect(fs.existsSync(path.join(directory, MIGRATION_JOURNAL_NAME))).toBe(false)
  })

  it('兼容没有日志的旧中断状态', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const targetName = 'default-RuiYan.db'

    fs.writeFileSync(path.join(directory, `${targetName}-wal`), 'legacy-wal', 'utf8')
    fs.writeFileSync(path.join(directory, `${sourceName}-shm`), 'legacy-shm', 'utf8')
    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')

    expect(migrateLegacyDefaultDatabases(directory)).toEqual([{ from: sourceName, to: targetName }])
    expectDatabaseFamily(directory, targetName, 'legacy')
    expect(fs.existsSync(path.join(directory, 'default-RuiYan-legacy.db-wal'))).toBe(false)
  })

  it('活动锁存在时拒绝迁移', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'

    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')
    fs.writeFileSync(
      path.join(directory, MIGRATION_LOCK_NAME),
      JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), ownerId: 'other-owner' }),
      'utf8',
    )

    expect(() => migrateLegacyDefaultDatabases(directory)).toThrow('默认数据库迁移正在由另一进程执行')
    expect(fs.readFileSync(path.join(directory, sourceName), 'utf8')).toBe('legacy-main')
    expect(fs.existsSync(path.join(directory, 'default-RuiYan.db'))).toBe(false)
    expect(fs.existsSync(path.join(directory, MIGRATION_LOCK_NAME))).toBe(true)
  })

  it('存活进程持有旧锁时仍拒绝迁移', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'

    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')
    fs.writeFileSync(
      path.join(directory, MIGRATION_LOCK_NAME),
      JSON.stringify({
        pid: process.pid,
        createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        ownerId: 'active-old-owner',
      }),
      'utf8',
    )

    expect(() => migrateLegacyDefaultDatabases(directory)).toThrow('默认数据库迁移正在由另一进程执行')
    expect(fs.readFileSync(path.join(directory, sourceName), 'utf8')).toBe('legacy-main')
    expect(fs.existsSync(path.join(directory, 'default-RuiYan.db'))).toBe(false)
    expect(fs.existsSync(path.join(directory, MIGRATION_LOCK_NAME))).toBe(true)
  })

  it('陈旧旧锁存在时保留原文件并完成迁移', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const lockPath = path.join(directory, MIGRATION_LOCK_NAME)
    const staleTime = new Date(Date.now() - 24 * 60 * 60 * 1000)

    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')
    fs.writeFileSync(
      lockPath,
      JSON.stringify({
        pid: 2147483647,
        createdAt: staleTime.toISOString(),
        ownerId: 'stale-owner',
      }),
      'utf8',
    )
    fs.utimesSync(lockPath, staleTime, staleTime)

    expect(migrateLegacyDefaultDatabases(directory)).toEqual([{ from: sourceName, to: 'default-RuiYan.db' }])
    expect(fs.existsSync(lockPath)).toBe(true)
    expect(fs.readFileSync(path.join(directory, 'default-RuiYan.db'), 'utf8')).toBe('legacy-main')
  })

  it('忽略陈旧旧锁时不删除同一路径上的新锁', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const lockPath = path.join(directory, MIGRATION_LOCK_NAME)
    const staleTime = new Date(Date.now() - 24 * 60 * 60 * 1000)
    let replacementWasDeleted = false

    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 2147483647, ownerId: 'stale-owner' }), 'utf8')
    fs.utimesSync(lockPath, staleTime, staleTime)

    const rmSync = fs.rmSync.bind(fs)
    vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      if (!replacementWasDeleted && target === lockPath) {
        fs.writeFileSync(
          lockPath,
          JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString(), ownerId: 'fresh-owner' }),
          'utf8',
        )
        replacementWasDeleted = true
      }
      rmSync(target, options)
    })

    expect(migrateLegacyDefaultDatabases(directory)).toEqual([{ from: sourceName, to: 'default-RuiYan.db' }])
    expect(replacementWasDeleted).toBe(false)
    expect(fs.existsSync(lockPath)).toBe(true)
  })

  it('双实例同时迁移时仅允许一个实例修改数据库', async () => {
    const directory = createTemporaryDirectory()
    const controlBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 4)
    const control = new Int32Array(controlBuffer)
    fs.writeFileSync(path.join(directory, 'default-yakit.db'), 'legacy-main', 'utf8')
    const workers = [
      runConcurrentMigrationWorker(directory, controlBuffer),
      runConcurrentMigrationWorker(directory, controlBuffer),
    ]
    const outcomes = []
    let entered = 0

    const completed = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('双实例迁移测试超时')), 10000)
      workers.forEach((worker) => {
        worker.on('error', reject)
        worker.on('message', (message) => {
          if (message.type === 'entered') entered += 1
          if (message.type === 'result' || message.type === 'error') outcomes.push(message)
          if (entered >= 2 || (entered >= 1 && outcomes.length >= 1)) {
            Atomics.store(control, 2, 1)
            Atomics.notify(control, 2, 2)
          }
          if (outcomes.length === 2) {
            clearTimeout(timeout)
            resolve()
          }
        })
      })
    })

    Atomics.store(control, 3, 1)
    Atomics.notify(control, 3, 2)
    try {
      await completed
    } finally {
      await Promise.all(workers.map((worker) => worker.terminate()))
    }

    expect(Atomics.load(control, 1)).toBe(1)
    expect(outcomes.filter(({ type }) => type === 'result')).toHaveLength(1)
    expect(outcomes.filter(({ code }) => code === 'DATABASE_MIGRATION_LOCKED')).toHaveLength(1)
    expect(fs.readFileSync(path.join(directory, 'default-RuiYan.db'), 'utf8')).toBe('legacy-main')
  })

  it('旧锁中的 PID 被复用时按租约时间恢复迁移', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const lockPath = path.join(directory, MIGRATION_LOCK_NAME)
    const staleTime = new Date(Date.now() - 24 * 60 * 60 * 1000)

    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')
    fs.writeFileSync(
      lockPath,
      JSON.stringify({ pid: process.pid, createdAt: staleTime.toISOString(), ownerId: 'reused-pid-owner' }),
      'utf8',
    )
    fs.utimesSync(lockPath, staleTime, staleTime)

    expect(migrateLegacyDefaultDatabases(directory)).toEqual([{ from: sourceName, to: 'default-RuiYan.db' }])
    expect(fs.readFileSync(path.join(directory, 'default-RuiYan.db'), 'utf8')).toBe('legacy-main')
  })

  it('发现活动引擎时拒绝移动数据库文件', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    childProcess.execFileSync.mockReturnValue(getActiveEngineProcessList())
    writeDatabaseFamily(directory, sourceName, 'legacy')

    expect(() => migrateLegacyDefaultDatabases(directory)).toThrow('检测到活动的本地引擎')
    expectDatabaseFamily(directory, sourceName, 'legacy')
    expect(fs.existsSync(path.join(directory, 'default-RuiYan.db'))).toBe(false)
  })

  it('无法确认引擎状态时拒绝移动数据库文件', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    childProcess.execFileSync.mockImplementation(() => {
      throw new Error('模拟进程枚举失败')
    })
    writeDatabaseFamily(directory, sourceName, 'legacy')

    expect(() => migrateLegacyDefaultDatabases(directory)).toThrow('无法确认本地引擎状态')
    expectDatabaseFamily(directory, sourceName, 'legacy')
    expect(fs.existsSync(path.join(directory, 'default-RuiYan.db'))).toBe(false)
  })

  it('检测到数据库文件持续写入时拒绝迁移', async () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    const walPath = path.join(directory, `${sourceName}-wal`)
    writeDatabaseFamily(directory, sourceName, 'legacy')
    const worker = new Worker(
      `
        const fs = require('fs')
        const { parentPort, workerData } = require('worker_threads')
        fs.appendFileSync(workerData.walPath, 'x')
        const timer = setInterval(() => fs.appendFileSync(workerData.walPath, 'x'), 5)
        parentPort.postMessage('ready')
        parentPort.once('message', () => {
          clearInterval(timer)
          parentPort.postMessage('stopped')
        })
      `,
      { eval: true, workerData: { walPath } },
    )

    await new Promise((resolve) => worker.once('message', resolve))
    try {
      expect(() => migrateLegacyDefaultDatabases(directory)).toThrow('检测到数据库文件仍在写入')
      expect(fs.existsSync(path.join(directory, 'default-RuiYan.db'))).toBe(false)
    } finally {
      worker.postMessage('stop')
      await worker.terminate()
    }
  })

  it('初始化失败后阻止生成数据库环境并允许后续恢复', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'

    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')
    const renameSync = fs.renameSync.bind(fs)
    vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
      if (path.basename(from) === sourceName) throw new Error('模拟初始化失败')
      renameSync(from, to)
    })

    expect(() => initializeDefaultDatabases(directory)).toThrow('模拟初始化失败')
    expect(() => getDefaultDatabaseEnvironment('yakit')).toThrow('默认数据库名称迁移未完成')
    expect(fs.existsSync(path.join(directory, MIGRATION_JOURNAL_NAME))).toBe(true)

    vi.restoreAllMocks()
    vi.spyOn(childProcess, 'execFileSync').mockReturnValue('')

    expect(initializeDefaultDatabases(directory)).toEqual([{ from: sourceName, to: 'default-RuiYan.db' }])
    expect(getDefaultDatabaseEnvironment('yakit')).toEqual({
      YAK_DEFAULT_PROJECT_DATABASE_NAME: 'default-RuiYan.db',
    })
  })

  it('锁文件清理失败时仍允许本进程继续初始化', () => {
    const directory = createTemporaryDirectory()
    const sourceName = 'default-yakit.db'
    let injected = false
    fs.writeFileSync(path.join(directory, sourceName), 'legacy-main', 'utf8')

    const rmSync = fs.rmSync.bind(fs)
    const rmSyncMock = vi.spyOn(fs, 'rmSync').mockImplementation((target, options) => {
      const basename = path.basename(String(target))
      if (!injected && (basename === MIGRATION_LOCK_NAME || basename.startsWith(`${MIGRATION_LOCK_NAME}.`))) {
        injected = true
        const error = new Error('模拟锁清理失败')
        error.code = 'EPERM'
        throw error
      }
      rmSync(target, options)
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    expect(initializeDefaultDatabases(directory)).toEqual([{ from: sourceName, to: 'default-RuiYan.db' }])
    expect(getDefaultDatabaseEnvironment('yakit')).toEqual({
      YAK_DEFAULT_PROJECT_DATABASE_NAME: 'default-RuiYan.db',
    })

    rmSyncMock.mockRestore()
    fs.writeFileSync(path.join(directory, 'company-default-yakit.db'), 'enterprise-main', 'utf8')
    expect(initializeDefaultDatabases(directory)).toEqual([
      { from: 'company-default-yakit.db', to: 'company-default-RuiYan.db' },
    ])
  })
})
