const path = require('path')
const release = require('./renyan-release')
const { writeWorkflowValue } = require('./create-renyan-build-metadata')

const repositoryRoot = path.resolve(__dirname, '../..')

const toWorkflowPath = (filePath) => path.relative(repositoryRoot, filePath).replace(/\\/g, '/')

const writeContextOutputs = (context, outputPath) => {
  writeWorkflowValue(outputPath, 'release_tag', context.releaseTag)
  writeWorkflowValue(outputPath, 'release_title', context.releaseTitle)
  writeWorkflowValue(outputPath, 'package_version', context.packageVersion)
}

const run = async () => {
  const command = process.argv[2]

  if (command === 'validate-context') {
    const context = release.validateReleaseContext()
    release.printAuditSummary(context, [])
    writeContextOutputs(context, process.env.GITHUB_OUTPUT)
    return
  }

  if (command === 'prepare') {
    const context = release.validateReleaseContext()
    const result = await release.prepareReleaseAssets({
      context,
      downloadedDirectory: path.resolve(process.env.DOWNLOADED_ARTIFACTS_DIRECTORY || 'downloaded-artifacts'),
      assetsDirectory: path.resolve(process.env.RELEASE_ASSETS_DIRECTORY || 'release-assets'),
      workDirectory: path.resolve(process.env.RELEASE_WORK_DIRECTORY || 'release-work'),
    })
    release.printAuditSummary(context, result.files)
    writeContextOutputs(context, process.env.GITHUB_OUTPUT)
    writeWorkflowValue(process.env.GITHUB_OUTPUT, 'release_plan_path', toWorkflowPath(result.planPath))
    writeWorkflowValue(process.env.GITHUB_OUTPUT, 'release_asset_count', result.assetPaths.length)
    writeWorkflowValue(process.env.GITHUB_OUTPUT, 'release_build_info_path', toWorkflowPath(result.buildInfoPath))
    return
  }

  if (command === 'publish') {
    await release.publishRelease({
      planPath: path.resolve(process.env.RELEASE_PLAN_PATH || 'release-work/release-plan.json'),
    })
    return
  }

  throw new Error(`不支持的 Release 命令：${command}`)
}

if (require.main === module) {
  run().catch((error) => {
    console.error(error.message)
    process.exitCode = 1
  })
}

module.exports = { ...release, run, writeContextOutputs }
