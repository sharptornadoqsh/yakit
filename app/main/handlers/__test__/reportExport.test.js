// @vitest-environment node
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'

const root = path.resolve(process.env.REPORT_TEST_ROOT || '.')
const actual = createRequire(path.join(root, 'package.json'))
const renderer = createRequire(path.join(root, 'app/renderer/src/main/package.json'))
const { JSDOM, ResourceLoader, VirtualConsole } = actual('jsdom')
const testRoot = path.resolve('.Codex/report-export-repair-20260911/unit')
const folders = []
const windows = []
fs.mkdirSync(testRoot, { recursive: true })

class LocalResources extends ResourceLoader {
  fetch(url, options) {
    if (/^https?:/.test(url)) return Promise.reject(new Error('测试环境已断网'))
    return super.fetch(url, options)
  }
}

const openHtml = async (filename) => {
  const source = fs.readFileSync(filename, 'utf8')
  const virtualConsole = new VirtualConsole()
  const dom = new JSDOM(source, {
    url: pathToFileURL(filename).href,
    runScripts: 'dangerously',
    resources: new LocalResources(),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      window.matchMedia = (media) => ({
        matches: false,
        media,
        addListener() {},
        removeListener() {},
        addEventListener() {},
        removeEventListener() {},
      })
    },
  })
  windows.push(dom.window)
  await new Promise((resolve) => {
    if (dom.window.document.readyState === 'complete') resolve()
    else dom.window.addEventListener('load', resolve, { once: true })
  })
  return dom.window
}

afterEach(() => {
  windows.splice(0).forEach((window) => window.close())
  folders.splice(0).forEach((folder) => {
    if (!path.resolve(folder).startsWith(testRoot + path.sep)) throw new Error('测试目录越界')
    fs.rmSync(folder, { recursive: true, force: true })
  })
})

const setup = (cancel = false) => {
  const directory = fs.mkdtempSync(path.join(testRoot, 'export-'))
  folders.push(directory)
  const handlers = new Map()
  class ReportWindow {
    constructor() {
      this.webContents = {
        executeJavaScript: (code) => this.window.eval(code),
        printToPDF: async () => Buffer.from('%PDF-test'),
      }
    }
    async loadFile(filename) {
      this.window = await openHtml(filename)
    }
    isDestroyed() {
      return false
    }
    destroy() {
      this.window?.close()
    }
  }
  for (const name of ['app/main/utils/nodeFiles.js', 'app/main/handlers/assets.js']) {
    const filename = path.join(root, name)
    const requireFile = createRequire(filename)
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
      module,
      Buffer,
      console,
      setTimeout,
      clearTimeout,
      __dirname: path.dirname(filename),
      require: (id) => {
        if (id === 'electron')
          return {
            app: { getPath: () => directory },
            ipcMain: { handle: (key, callback) => handlers.set(key, callback) },
            BrowserWindow: ReportWindow,
          }
        if (id === '../filePath') return { getHtmlTemplateDir: () => path.join(root, 'report') }
        if (id === 'electron-is-dev') return false
        if (id === 'os') return { tmpdir: () => directory }
        if (id === './fileSystemDialog')
          return { handleSaveFileSystem: async () => ({ filePath: cancel ? undefined : path.join(directory, 'risk') }) }
        if (id === './handleStreamWithContext') return { cancelHandler: () => () => {}, registerHandler: () => {} }
        return requireFile(id)
      },
    })
    const getClient = () => {
      throw new Error('导出测试不连接真实引擎')
    }
    if (typeof module.exports === 'function') module.exports({}, getClient)
    else module.exports.register({}, getClient)
  }
  return { directory, invoke: (name, params) => handlers.get(name)(null, params), handlers }
}

const getRiskTemplate = (language) => {
  const context = vm.createContext({})
  vm.runInContext(
    fs
      .readFileSync(path.join(root, 'app/renderer/src/main/src/pages/risks/YakitRiskTable/htmlTemplate.ts'), 'utf8')
      .replace(/^export /gm, ''),
    context,
  )
  const name = { zh: 'getHtmlTemplate', 'zh-TW': 'getHtmlZhTWTemplate', en: 'getHtmlEnTemplate' }[language]
  return vm.runInContext(`${name}()`, context)
}

describe('风险报告离线交付', () => {
  it.each(['zh', 'zh-TW', 'en'])(
    '输出 %s 自包含文件并保留特殊报文',
    async (language) => {
      const { invoke } = setup()
      const directory = await invoke('export-risk-html', {
        htmlContent: getRiskTemplate(language),
        language,
        fileName: 'risk-report',
        data: [
          { Id: 1, Title: '报告样本', Severity: 'high', RequestString: '</script><请求>', ResponseString: '响应样本' },
        ],
      })
      const html = fs.readFileSync(path.join(directory, 'risk-report.html'), 'utf8')
      const dom = new JSDOM(html)
      expect(dom.window.document.querySelectorAll('script[src], link[rel="stylesheet"][href]')).toHaveLength(0)
      expect(html).toContain('响应样本')
      expect(dom.window.document.querySelectorAll('script:not([src])').length).toBeGreaterThan(1)
      dom.window.close()
      const window = await openHtml(path.join(directory, 'risk-report.html'))
      await new Promise((resolve) => window.setTimeout(resolve, 50))
      expect(window.document.querySelector('#root').textContent).toContain('报告样本')
    },
    20000,
  )

  it('取消保存时不生成交付文件', async () => {
    const { directory, invoke } = setup(true)
    expect(
      await invoke('export-risk-html', { htmlContent: getRiskTemplate('zh'), fileName: 'risk', data: [{ Id: 1 }] }),
    ).toBe('')
    expect(fs.readdirSync(directory)).toEqual([])
  })
})

describe('安全测试报告完整性', () => {
  it('顶层饼图和横向柱图保留原始数值与方向', () => {
    const dom = new JSDOM('<div id="content"></div>')
    const charts = []
    vm.runInNewContext(fs.readFileSync(path.join(root, 'report/renderReport.js'), 'utf8'), {
      document: dom.window.document,
      window: {},
      location: { search: '' },
      URLSearchParams,
      initData: JSON.stringify([
        { type: 'pie-graph', content: '[{"key":"PIE_MARKER","value":7}]' },
        { type: 'bar-graph', direction: true, content: '[{"key":"BAR_MARKER","value":7}]' },
      ]),
      createEcharts: (type, value) => charts.push({ type, value }),
      $: () => ({ append() {} }),
      renderToc: () => '',
      tocItems: [],
    })
    expect(charts).toHaveLength(2)
    expect(charts[0].value.option.series[0].data).toEqual([{ name: 'PIE_MARKER', value: 7 }])
    expect(charts[1].value.option.xAxis.type).toBe('value')
    expect(charts[1].value.option.yAxis.data).toEqual(['BAR_MARKER'])
    dom.window.close()
  })

  it('原始文本和损坏表格不会清空前后有效正文', async () => {
    const { directory, invoke } = setup()
    const result = await invoke('DownloadHtmlReport', {
      outputDir: directory,
      reportName: '全文报告',
      JsonRaw: JSON.stringify([
        { type: 'markdown', content: '# FIRST_MARKER' },
        { type: 'raw', content: 'HTTP/1.1 200 OK\r\n\r\nRAW_MARKER' },
        { type: 'json-table', content: '{invalid-table' },
        { type: 'markdown', content: '# LAST_MARKER' },
      ]),
    })
    expect(result.ok).toBe(true)
    const output = path.join(result.outputDir, 'index.html')
    const window = await openHtml(output)
    const text = window.document.querySelector('#content').textContent
    for (const marker of ['FIRST_MARKER', 'RAW_MARKER', 'LAST_MARKER', '{invalid-table']) expect(text).toContain(marker)
    const standalone = path.join(directory, 'moved.html')
    fs.copyFileSync(output, standalone)
    const moved = await openHtml(standalone)
    expect(moved.document.querySelector('#content').textContent).toBe(text)
  }, 20000)

  it.each(['[]', '', '-', 'null', '{}', '[{"type":"markdown","content":""}]'])(
    '拒绝空或无效报告 %s',
    async (JsonRaw) => {
      const { directory, invoke } = setup()
      await expect(
        invoke('DownloadHtmlReport', { outputDir: directory, reportName: 'empty', JsonRaw }),
      ).rejects.toThrow()
      expect(fs.readdirSync(directory)).toEqual([])
    },
  )

  it('重复导出不会删除同名目录中无关文件', async () => {
    const { directory, invoke } = setup()
    const folder = path.join(directory, 'report')
    fs.mkdirSync(folder)
    fs.writeFileSync(path.join(folder, 'user-note.txt'), 'KEEP')
    await invoke('DownloadHtmlReport', {
      outputDir: directory,
      reportName: 'report',
      JsonRaw: '[{"type":"markdown","content":"REPORT_MARKER"}]',
    })
    expect(fs.readFileSync(path.join(folder, 'user-note.txt'), 'utf8')).toBe('KEEP')
  }, 20000)

  it('保留单层风险表格和普通 JSON 条目', async () => {
    const { directory, invoke } = setup()
    const result = await invoke('DownloadHtmlReport', {
      outputDir: directory,
      reportName: 'typed',
      JsonRaw: JSON.stringify([
        {
          type: 'raw',
          content: JSON.stringify({
            type: 'risk-list',
            data: [{ host: { sort: 1, value: 'HOST_MARKER' }, risk: { sort: 2, value: 'RISK_MARKER' } }],
          }),
        },
        { type: 'json', content: '{"key":"JSON_MARKER"}' },
      ]),
    })
    const window = await openHtml(path.join(result.outputDir, 'index.html'))
    expect(window.document.querySelector('#content table')?.textContent).toContain('HOST_MARKER')
    expect(window.document.querySelector('#content').textContent).toContain('JSON_MARKER')
  }, 20000)

  it.each([
    [{ type: 'raw', content: '{"type":"report-cover","data":"security"}' }],
    [{ type: 'json-table', content: '{"header":[],"data":[]}' }],
  ])(
    '拒绝只有元数据或空表格的报告',
    async (items) => {
      const { directory, invoke } = setup()
      await expect(
        invoke('DownloadHtmlReport', { outputDir: directory, reportName: 'blank', JsonRaw: JSON.stringify([items]) }),
      ).rejects.toThrow()
      expect(fs.readdirSync(directory)).toEqual([])
    },
    20000,
  )

  it('Word 渲染完整的 251 条而非界面当前页', async () => {
    const { handlers, invoke } = setup()
    expect(handlers.has('RenderReportWordHtml')).toBe(true)
    const html = await invoke('RenderReportWordHtml', {
      reportName: '完整报告',
      JsonRaw: JSON.stringify(
        Array.from({ length: 251 }, (_, i) => ({ type: 'markdown', content: `ITEM_${i + 1}_END` })),
      ),
    })
    const dom = new JSDOM(html)
    expect(dom.window.document.body.textContent).toContain('ITEM_1_END')
    expect(dom.window.document.body.textContent).toContain('ITEM_251_END')
    expect(dom.window.document.querySelectorAll('script, canvas')).toHaveLength(0)
    dom.window.close()
  }, 20000)
})

describe('报告资源构建边界', () => {
  const loadBuilder = (requireModule) => {
    const module = { exports: {} }
    vm.runInNewContext(fs.readFileSync(path.join(root, 'scripts/build-report-assets.js'), 'utf8'), {
      module,
      require: requireModule,
      Buffer,
      console,
      __dirname: path.join(root, 'scripts'),
    })
    return module.exports
  }

  it('打包校验只依赖根目录依赖', () => {
    const builder = loadBuilder((name) =>
      name === 'module'
        ? {
            createRequire: () => {
              throw new Error('包装阶段不应解析渲染器依赖')
            },
          }
        : actual(name),
    )
    expect(() => builder.validateReportAssets(root)).not.toThrow()
  })

  it('渲染资源构建使用渲染器已有依赖', () => {
    const directory = fs.mkdtempSync(path.join(testRoot, 'build-'))
    folders.push(directory)
    for (const name of [
      'report/template.zip',
      'report/renderReport.js',
      'scripts/build-report-assets.js',
      'app/renderer/src/main/src/pages/risks/YakitRiskTable/htmlTemplate.ts',
    ]) {
      const target = path.join(directory, name)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.copyFileSync(path.join(root, name), target)
    }
    const modules = path.join(directory, 'app/renderer/src/main/node_modules')
    fs.symlinkSync(path.join(root, 'app/renderer/src/main/node_modules'), modules, 'junction')
    try {
      const builder = loadBuilder((name) => {
        if (name === 'adm-zip') throw new Error('渲染器构建没有安装根目录依赖')
        return actual(name)
      })
      expect(() => builder.buildReportAssets(directory)).not.toThrow()
      expect(() => actual('./scripts/build-report-assets').validateReportAssets(directory)).not.toThrow()
    } finally {
      fs.unlinkSync(modules)
    }
  }, 20000)
})
