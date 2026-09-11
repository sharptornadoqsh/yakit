const fs = require('fs')
const path = require('path')
const vm = require('vm')
const { createRequire } = require('module')
const crypto = require('crypto')

const reportSources = [
  'app/renderer/src/main/src/pages/risks/YakitRiskTable/htmlTemplate.ts',
  'report/renderReport.js',
  'scripts/build-report-assets.js',
]
const digest = (value) => crypto.createHash('sha256').update(value).digest('hex')

const validateReportAssets = (projectRoot = path.resolve(__dirname, '..')) => {
  const AdmZip = require('adm-zip')
  const zip = new AdmZip(path.join(projectRoot, 'report/template.zip'))
  const entry = zip.getEntry('report-assets-manifest.json')
  if (!entry) throw new Error('报告资源未构建，请先执行主渲染器构建')
  const manifest = JSON.parse(entry.getData().toString('utf8'))
  for (const name of reportSources) {
    if (manifest.sources[name] !== digest(fs.readFileSync(path.join(projectRoot, name))))
      throw new Error(`报告资源需要重新构建：${name}`)
  }
  for (const [name, expected] of Object.entries(manifest.assets)) {
    const asset = zip.getEntry(name)
    if (!asset || digest(asset.getData()) !== expected) throw new Error(`报告资源校验失败：${name}`)
  }
}

const buildReportAssets = (projectRoot = path.resolve(__dirname, '..')) => {
  const rendererRoot = path.join(projectRoot, 'app/renderer/src/main')
  const rendererRequire = createRequire(path.join(rendererRoot, 'package.json'))
  const esbuild = createRequire(rendererRequire.resolve('vite/package.json'))('esbuild')
  const zipPath = path.join(projectRoot, 'report/template.zip')
  const docxRequire = createRequire(rendererRequire.resolve('html-docx-js/package.json'))
  const JSZip = docxRequire('jszip')
  const zip = new JSZip(fs.readFileSync(zipPath))
  const templateSource = fs.readFileSync(
    path.join(rendererRoot, 'src/pages/risks/YakitRiskTable/htmlTemplate.ts'),
    'utf8',
  )
  const context = vm.createContext({})
  vm.runInContext(templateSource.replace(/^export /gm, ''), context)
  const runtime = esbuild.buildSync({
    stdin: {
      contents: `import React from 'react'; import ReactDOM from 'react-dom'; import moment from 'moment';
        import { Table, Tag, Descriptions, Input, Space, Button } from 'antd';
        import { SearchOutlined } from '@ant-design/icons';
        Object.assign(window, { React, ReactDOM, moment, antd: { Table, Tag, Descriptions, Input, Space, Button }, icons: { SearchOutlined } });`,
      resolveDir: rendererRoot,
      loader: 'js',
    },
    write: false,
    bundle: true,
    minify: true,
    format: 'iife',
    platform: 'browser',
    define: { 'process.env.NODE_ENV': '"production"' },
  }).outputFiles[0].contents
  zip.file('modules/risk/runtime.js', Buffer.from(runtime))
  zip.file('modules/risk/antd.min.css', fs.readFileSync(rendererRequire.resolve('antd/dist/antd.min.css')))
  for (const [language, name] of Object.entries({
    zh: 'getHtmlTemplate',
    'zh-TW': 'getHtmlZhTWTemplate',
    en: 'getHtmlEnTemplate',
  })) {
    const html = vm.runInContext(`${name}()`, context)
    const match = html.match(/<script type="text\/babel">([\s\S]*?)<\/script>/)
    if (!match) throw new Error(`风险报告模板缺少渲染脚本：${language}`)
    const code = esbuild.transformSync(match[1], {
      loader: 'jsx',
      minify: true,
      jsxFactory: 'React.createElement',
      jsxFragment: 'React.Fragment',
    }).code
    zip.file(`js/risk/${language}.js`, Buffer.from(code))
  }
  let html = zip.file('index.html').asText()
  if (!html.includes('./js/renderReport.js')) {
    const start = html.indexOf('      try {\r\n        let newInitData = JSON.parse(initData);')
    const end = html.indexOf('      window.onload = function () {', start)
    if (start < 0 || end < start) throw new Error('报告模板初始化入口发生变化，请核对模板源码')
    html = `${html.slice(0, start)}</script><script src="./js/renderReport.js"></script><script>${html.slice(end)}`
  }
  html = html.replace('<link rel="stylesheet" href="./js/steps/steps.css">', '')
  zip.file('index.html', Buffer.from(html))
  zip.file('js/renderReport.js', fs.readFileSync(path.join(projectRoot, 'report/renderReport.js')))
  const assets = Object.fromEntries(
    Object.values(zip.files)
      .filter((entry) => !entry.dir && entry.name !== 'report-assets-manifest.json')
      .map((entry) => [entry.name, digest(entry.asNodeBuffer())]),
  )
  const sources = Object.fromEntries(
    reportSources.map((name) => [name, digest(fs.readFileSync(path.join(projectRoot, name)))]),
  )
  zip.file('report-assets-manifest.json', Buffer.from(JSON.stringify({ sources, assets })))
  fs.writeFileSync(zipPath, zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' }))
}

if (require.main === module) {
  buildReportAssets()
  console.log('离线报告资源构建完成')
}
module.exports = { buildReportAssets, validateReportAssets }
