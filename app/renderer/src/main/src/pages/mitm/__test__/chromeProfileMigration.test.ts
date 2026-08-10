import { describe, expect, it } from 'vitest'
import { migrateLegacyChromeProfileCache, migrateLegacyChromeProfileRemoteCache } from '../chromeProfileMigration'

const productChromeProfilePath = 'C:\\Users\\tester\\AppData\\Roaming\\RuiYan\\projects\\chrome-profile'

describe('Chrome 用户目录缓存迁移', () => {
  it('迁移默认值和历史项中的完整旧目录', () => {
    const cache = {
      defaultValue: 'D:\\ProgramFiles\\Yakit\\yakit-projects\\chrome-profile',
      options: [
        {
          value: 'D:/work/YAKIT/yakit-projects/CHROME-PROFILE/',
          label: 'D:/work/YAKIT/yakit-projects/CHROME-PROFILE/',
        },
        {
          value: '\\\\server\\share\\Yakit\\yakit-projects\\chrome-profile',
          label: '\\\\server\\share\\Yakit\\yakit-projects\\chrome-profile',
        },
      ],
    }

    const result = migrateLegacyChromeProfileCache(cache, productChromeProfilePath)

    expect(result).toEqual({
      changed: true,
      cache: {
        defaultValue: productChromeProfilePath,
        options: [
          { value: productChromeProfilePath, label: productChromeProfilePath },
          { value: productChromeProfilePath, label: productChromeProfilePath },
        ],
      },
    })
  })

  it('保留自定义目录、相似目录和历史顺序', () => {
    const cache = {
      defaultValue: 'E:\\ChromeProfiles\\personal',
      options: [
        { value: 'E:\\ChromeProfiles\\personal', label: '个人配置' },
        { value: 'C:\\backup\\chrome-profile', label: 'C:\\backup\\chrome-profile' },
        {
          value: 'C:\\x\\Yakit\\yakit-projects\\chrome-profile-backup',
          label: 'C:\\x\\Yakit\\yakit-projects\\chrome-profile-backup',
        },
        {
          value: 'D:\\ProgramFiles\\Yakit\\yakit-projects\\chrome-profile',
          label: 'D:\\ProgramFiles\\Yakit\\yakit-projects\\chrome-profile',
        },
      ],
    }

    const result = migrateLegacyChromeProfileCache(cache, productChromeProfilePath)

    expect(result.cache).toEqual({
      defaultValue: 'E:\\ChromeProfiles\\personal',
      options: [
        { value: 'E:\\ChromeProfiles\\personal', label: '个人配置' },
        { value: 'C:\\backup\\chrome-profile', label: 'C:\\backup\\chrome-profile' },
        {
          value: 'C:\\x\\Yakit\\yakit-projects\\chrome-profile-backup',
          label: 'C:\\x\\Yakit\\yakit-projects\\chrome-profile-backup',
        },
        { value: productChromeProfilePath, label: productChromeProfilePath },
      ],
    })
  })

  it('不修改作为输入的缓存对象', () => {
    const legacyPath = 'D:\\ProgramFiles\\Yakit\\yakit-projects\\chrome-profile'
    const cache = {
      defaultValue: legacyPath,
      options: [{ value: legacyPath, label: legacyPath }],
    }

    migrateLegacyChromeProfileCache(cache, productChromeProfilePath)

    expect(cache).toEqual({
      defaultValue: legacyPath,
      options: [{ value: legacyPath, label: legacyPath }],
    })
  })

  it('没有旧目录时保持原引用并标记无需写回', () => {
    const cache = {
      defaultValue: 'E:\\ChromeProfiles\\personal',
      options: [{ value: 'E:\\ChromeProfiles\\personal', label: '个人配置' }],
    }

    const result = migrateLegacyChromeProfileCache(cache, productChromeProfilePath)

    expect(result.changed).toBe(false)
    expect(result.cache).toBe(cache)
  })

  it('使用既有缓存键写回迁移后的完整缓存结构', async () => {
    const legacyPath = 'D:\\ProgramFiles\\Yakit\\yakit-projects\\chrome-profile'
    let readKey = ''
    let writtenKey = ''
    let writtenValue = ''

    const changed = await migrateLegacyChromeProfileRemoteCache(productChromeProfilePath, {
      read: async (key) => {
        readKey = key
        return {
          defaultValue: legacyPath,
          options: [{ value: legacyPath, label: legacyPath }],
        }
      },
      write: async (key, value) => {
        writtenKey = key
        writtenValue = value
      },
    })

    expect(changed).toBe(true)
    expect(readKey).toBe('mitm_save_user_data_dir')
    expect(writtenKey).toBe('mitm_save_user_data_dir')
    expect(JSON.parse(writtenValue)).toEqual({
      defaultValue: productChromeProfilePath,
      options: [{ value: productChromeProfilePath, label: productChromeProfilePath }],
    })
  })

  it('缓存中没有旧目录时不写回', async () => {
    let writeCount = 0

    const changed = await migrateLegacyChromeProfileRemoteCache(productChromeProfilePath, {
      read: async () => ({
        defaultValue: 'E:\\ChromeProfiles\\personal',
        options: [{ value: 'E:\\ChromeProfiles\\personal', label: '个人配置' }],
      }),
      write: async () => {
        writeCount += 1
      },
    })

    expect(changed).toBe(false)
    expect(writeCount).toBe(0)
  })
})
