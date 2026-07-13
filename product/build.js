const { execFileSync } = require('child_process')
const path = require('path')

const repositoryRoot = path.resolve(__dirname, '..')

const normalizeSha = (value) => {
  const sha = `${value || ''}`.trim()
  return /^[0-9a-f]{7,40}$/i.test(sha) ? sha : ''
}

const resolveBuildSha = ({ env = process.env, execute = execFileSync, cwd = repositoryRoot } = {}) => {
  const environmentSha = normalizeSha(env.BUILD_SHA || env.GITHUB_SHA || env.COMMIT_SHA)
  if (environmentSha) return environmentSha

  try {
    return normalizeSha(execute('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' })) || 'unknown'
  } catch (error) {
    return 'unknown'
  }
}

const resolveEdition = (platform, requireEnterpriseLicense = process.env.REACT_APP_REQUIRE_ENTERPRISE_LICENSE) => {
  const editions = {
    yakitEE: '企业版',
    enterprise: '企业版',
    enpritrace: '企业版',
    yakitSE: '轻量企业版',
    'simple-enterprise': '轻量企业版',
    etraceagent: '轻量企业版',
    irify: '代码审计版',
    irifyEE: '代码审计企业版',
    'irify-enterprise': '代码审计企业版',
    memfit: '智能代理版',
  }
  const edition = editions[platform] || '社区版'
  return edition === '企业版' && `${requireEnterpriseLicense}`.toLowerCase() === 'false'
    ? '企业版（免许可证）'
    : edition
}

module.exports = { normalizeSha, resolveBuildSha, resolveEdition }
