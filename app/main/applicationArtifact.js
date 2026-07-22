const path = require('path')
const { productConfig } = require('./product')

const getSourceFilename = (sourcePath) => {
  const value = `${sourcePath || ''}`
  try {
    const url = new URL(value)
    return path.basename(decodeURIComponent(url.pathname))
  } catch (error) {
    return path.basename(value.split(/[?#]/, 1)[0])
  }
}

const getBrandedArtifactFilename = (sourcePath) => {
  const sourceFilename = getSourceFilename(sourcePath)
  const extension = path.extname(sourceFilename)
  const stem = sourceFilename.slice(0, sourceFilename.length - extension.length)
  const legacySuffix = stem.replace(/^yakit(?:-pentest)?[-_.]*/i, '')
  const suffix = legacySuffix === stem && stem.includes('-') ? stem.slice(stem.indexOf('-') + 1) : legacySuffix
  return `${productConfig.artifactPrefix}${suffix ? `-${suffix}` : ''}${extension}`
}

const resolveApplicationDownloadPath = (installDirectory, sourcePath, options = {}) => {
  const filename = options.preserveFilename ? getSourceFilename(sourcePath) : getBrandedArtifactFilename(sourcePath)
  if (!filename) throw new Error('无法确定安装文件名')
  return path.join(installDirectory, filename)
}

module.exports = { getBrandedArtifactFilename, resolveApplicationDownloadPath }
