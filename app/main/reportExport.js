const fs = require('fs')
const path = require('path')
const AdmZip = require('adm-zip')

const inlineScript = (script) => `<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`
const serializeData = (value) =>
  JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')
const offlinePolicy =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:\">"

const readAsset = (zip, name) => {
  const normalized = path.posix.normalize(name.replace(/^\.\//, ''))
  const entry = !normalized.startsWith('../') && zip.getEntry(normalized)
  if (!entry || entry.isDirectory) throw new Error(`报告缺少本地资源：${name}`)
  return entry.getData()
}

const inlineCss = (zip, name) => {
  const mimeTypes = {
    '.gif': 'image/gif',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
  }
  return readAsset(zip, name)
    .toString('utf8')
    .replace(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi, (match, quote, url) => {
      if (url.startsWith('data:') || url.startsWith('#')) return match
      const resource = path.posix.join(path.posix.dirname(name), url)
      const mime = mimeTypes[path.posix.extname(resource)] || 'application/octet-stream'
      return `url("data:${mime};base64,${readAsset(zip, resource).toString('base64')}")`
    })
}

const parseReportItems = (JsonRaw) => {
  let items
  try {
    items = JSON.parse(JsonRaw)
  } catch {
    throw new Error('报告数据解析失败，请重新生成报告')
  }
  if (!Array.isArray(items) || !items.some((item) => item && String(item.content ?? item.data ?? '').trim())) {
    throw new Error('没有可导出的报告内容')
  }
  return items
}

const createOfflineReportHtml = (zipPath, JsonRaw) => {
  const items = parseReportItems(JsonRaw)
  const zip = new AdmZip(zipPath)
  let html = readAsset(zip, 'index.html').toString('utf8')
  html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (_, name) => {
    const script =
      name === './js/init.js'
        ? `let initData = ${serializeData(JSON.stringify(items))}`
        : readAsset(zip, name).toString('utf8')
    return inlineScript(script)
  })
  html = html.replace(
    /<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/gi,
    (_, name) => `<style>${inlineCss(zip, name)}</style>`,
  )
  return html.replace('<head>', `<head>${offlinePolicy}`)
}

const createOfflineRiskHtml = (zipPath, { data, language = 'zh' }) => {
  if (!Array.isArray(data) || data.length === 0) throw new Error('没有可导出的风险记录')
  const locale = ['zh', 'zh-TW', 'en'].includes(language) ? language : 'en'
  const zip = new AdmZip(zipPath)
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${offlinePolicy}<title>RuiYan</title>
    <style>${inlineCss(zip, 'modules/risk/antd.min.css')}</style></head><body><div id="root"></div>
    ${inlineScript(readAsset(zip, 'modules/risk/runtime.js').toString('utf8'))}
    ${inlineScript(`const initData = ${serializeData(data)}`)}
    ${inlineScript(readAsset(zip, `js/risk/${locale}.js`).toString('utf8'))}</body></html>`
}

const writeReportFile = (filename, html) => {
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`
  try {
    fs.writeFileSync(temporary, html, { encoding: 'utf8', flag: 'wx' })
    fs.renameSync(temporary, filename)
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
  }
}

module.exports = { createOfflineReportHtml, createOfflineRiskHtml, writeReportFile }
