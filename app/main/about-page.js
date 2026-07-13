const fields = {
  displayName: 'display-name',
  shortName: 'short-name',
  clientVersion: 'client-version',
  engineVersion: 'engine-version',
  buildSha: 'build-sha',
  edition: 'edition',
  supportName: 'support-name',
  copyright: 'copyright',
}

const parameters = new URLSearchParams(window.location.search)
const displayName = parameters.get('displayName')

if (displayName) document.title = `关于 ${displayName}`

Object.entries(fields).forEach(([parameter, elementId]) => {
  const value = parameters.get(parameter)
  const element = document.getElementById(elementId)
  if (value && element) element.textContent = value
})
