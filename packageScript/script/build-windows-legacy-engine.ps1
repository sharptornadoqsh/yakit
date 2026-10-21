param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Output
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if ($env:GITHUB_ACTIONS -ne 'true') { throw '此脚本仅供 GitHub Actions 构建使用' }
$Repo = [IO.Path]::GetFullPath("$PSScriptRoot/../..")
$Lock = Get-Content -LiteralPath "$Repo/product/windows-legacy-engine.json" -Raw | ConvertFrom-Json
if ($env:REQUESTED_ENGINE_VERSION -and $env:REQUESTED_ENGINE_VERSION -ne $Lock.engineVersion) {
  throw "Windows legacy 固定版本为 $($Lock.engineVersion)"
}
$Source = (Resolve-Path -LiteralPath $Source).Path
if ((git -C $Source rev-parse HEAD).Trim() -ne $Lock.sourceCommit) { throw '引擎源码提交不匹配' }
$Output = [IO.Path]::GetFullPath($Output)
New-Item -ItemType Directory -Path $Output -Force | Out-Null
$Work = Join-Path $env:RUNNER_TEMP ('ruiyan-legacy-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $Work | Out-Null
$Utf8 = [Text.UTF8Encoding]::new($false)
function Write-Json($File, $Value) {
  [IO.File]::WriteAllText($File, ($Value | ConvertTo-Json -Depth 12) + "`n", $Utf8)
}
function Download-Locked($Definition, $Name) {
  $File = Join-Path $Work $Name
  Invoke-WebRequest -Uri $Definition.url -OutFile $File -TimeoutSec 300
  if ($Definition.sha256) {
    if ((Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLower() -ne $Definition.sha256) {
      throw "下载摘要不匹配：$Name"
    }
  } else {
    $Expected = [Convert]::ToHexString([Convert]::FromBase64String($Definition.sha512))
    if ((Get-FileHash -LiteralPath $File -Algorithm SHA512).Hash -ne $Expected) {
      throw "下载摘要不匹配：$Name"
    }
  }
  return $File
}
$PatchDirectory = Join-Path $Work 'upstream-patches'
New-Item -ItemType Directory -Path $PatchDirectory | Out-Null
$PatchEvidence = @()
foreach ($Patch in $Lock.upstreamPatches) {
  $Original = "$Source/.github/patch_go122/$Patch"
  $File = "$PatchDirectory/$Patch"
  node "$PSScriptRoot/patch-windows-legacy-go.js" --normalize-patch $Original $File
  $Evidence = @{
    name = $Patch
    sha256 = (Get-FileHash -LiteralPath $Original -Algorithm SHA256).Hash.ToLower()
    normalizedSha256 = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLower()
    parsed = $false
    applied = $false
  }
  $PatchEvidence += $Evidence
  Write-Json "$Output/upstream-patches.json" @{ sourceCommit = $Lock.sourceCommit; patches = $PatchEvidence }
  git -C $Work apply --numstat -- $File
  $Evidence.parsed = $true
  Write-Json "$Output/upstream-patches.json" @{ sourceCommit = $Lock.sourceCommit; patches = $PatchEvidence }
  Write-Output "上游补丁格式检查通过：$Patch"
}
$GoZip = Download-Locked $Lock.go 'go.zip'
$CcZip = Download-Locked $Lock.compiler 'compiler.zip'
$SdkZip = Download-Locked $Lock.ucrt 'sdk.zip'
Expand-Archive -LiteralPath $GoZip -DestinationPath "$Work/go-dist"
Expand-Archive -LiteralPath $CcZip -DestinationPath "$Work/compiler"
Expand-Archive -LiteralPath $SdkZip -DestinationPath "$Work/sdk"
$env:GOROOT = "$Work/go-dist/go"
$env:GOPATH = "$Work/gopath"
$env:GOTOOLCHAIN = 'local'
$env:GOOS = 'windows'
$env:GOARCH = 'amd64'
$env:CGO_ENABLED = '1'
$env:CC = "$Work/compiler/mingw64/bin/gcc.exe"
$env:CXX = "$Work/compiler/mingw64/bin/g++.exe"
$env:PATH = "$env:GOROOT/bin;$Work/compiler/mingw64/bin;$env:GOPATH/bin;$env:PATH"
$env:CGO_CFLAGS = '-O2 -g -D_WIN32_WINNT=0x0601'
$env:CGO_LDFLAGS = '-static'
$Go = "$env:GOROOT/bin/go.exe"
$GoVersion = (& $Go version) -join "`n"
$CcVersion = (& $env:CC -dumpfullversion) -join "`n"
if ($CcVersion.Trim() -ne $Lock.compiler.version) { throw 'C 编译器版本不匹配' }
if ($GoVersion -notmatch 'go1\.22\.12 windows/amd64') { throw 'Go 版本不匹配' }
foreach ($Patch in $PatchEvidence) {
  $File = "$PatchDirectory/$($Patch.name)"
  git -C $env:GOROOT apply --check --reverse --ignore-space-change $File
  git -C $env:GOROOT apply --reverse --ignore-space-change $File
  $Patch.applied = $true
  Write-Json "$Output/upstream-patches.json" @{ sourceCommit = $Lock.sourceCommit; patches = $PatchEvidence }
}
node "$PSScriptRoot/patch-windows-legacy-go.js" $env:GOROOT
$RuntimeSource = "$env:GOROOT/src/runtime/os_windows.go"
$PatchedRuntime = [IO.File]::ReadAllText($RuntimeSource)
$ProbeLog = @()
try {
  $ProbeLog += '宿主检查：正常 DLL 搜索能力分支'
  $ProbeLog += (& $Go run "$PSScriptRoot/windows-legacy-loader-probe.go")
  $Needle = 'windowsFindfunc(k32, []byte("AddDllDirectory\000")) != nil'
  if (-not $PatchedRuntime.Contains($Needle)) { throw '加载探针缺少固定补丁上下文' }
  [IO.File]::WriteAllText($RuntimeSource, $PatchedRuntime.Replace($Needle, 'false'), $Utf8)
  $ProbeLog += '宿主检查：模拟缺少 DLL 搜索能力，覆盖绝对路径分支；不是 Win7 实测'
  $ProbeLog += (& $Go run "$PSScriptRoot/windows-legacy-loader-probe.go")
} finally {
  [IO.File]::WriteAllText($RuntimeSource, $PatchedRuntime, $Utf8)
  [IO.File]::WriteAllText("$Output/loader-probe.txt", ($ProbeLog -join "`n") + "`n", $Utf8)
}
Push-Location $Source
try {
  & $Go mod download
  & $Go run -gcflags=all="-N -l" common/yak/yakdoc/generate_doc/generate_doc.go common/yak/yakdoc/doc/doc.gob.zst
  & $Go run -gcflags=all="-N -l" common/yak/yaklib/codec/codegrpc/doc/codec_doc.go common/yak/yaklib/codec/codegrpc/codec.gob.zst
  & $Go build -o "$Work/yak-cli.exe" common/yak/cmd/yak.go
  & "$Work/yak-cli.exe" embed-fs-hash --override --all
  & $Go build -o "$Work/gzip-embed.exe" ./common/utils/gzip_embed/gzip-embed
  foreach ($Pair in @(
    @('common/ai/aid/aitool/buildinaitools/yakscripttools/yakscriptforai', $false),
    @('common/ai/aid/aireact/skills', $true),
    @('common/coreplugin/base-yak-plugin', $true),
    @('common/syntaxflow/sfbuildin/buildin', $true),
    @('common/aiforge/buildinforge', $true)
  )) {
    $GzipArgs = @('-cache', '--source', "./$($Pair[0])", '--gz', "./$($Pair[0]).tar.gz", '--no-embed')
    if ($Pair[1]) { $GzipArgs += '--root-path' }
    & "$Work/gzip-embed.exe" @GzipArgs
  }
  $BuildTime = (git show -s --format=%cI).Trim()
  $Ldflags = "-s -w -X 'main.goVersion=$GoVersion' -X 'main.gitHash=$($Lock.sourceCommit)' -X 'main.buildTime=$BuildTime' -X 'main.yakVersion=$($Lock.engineVersion)'"
  & $Go build -trimpath -tags gzip_embed -ldflags $Ldflags -o "$Output/yak.exe" -v common/yak/cmd/yak.go
  $BuildInfo = (& $Go version -m "$Output/yak.exe") -join "`n"
  [IO.File]::WriteAllText("$Output/go-build-info.txt", $BuildInfo + "`n", $Utf8)
} finally {
  Pop-Location
}
$RuntimeDir = "$Work/sdk/$($Lock.ucrt.directory)"
$Runtime = @(Get-ChildItem -LiteralPath $RuntimeDir -File -Filter '*.dll')
if ($Runtime.Count -ne $Lock.ucrt.fileCount) { throw 'UCRT 集合不完整' }
if (-not (Test-Path -LiteralPath "$RuntimeDir/ucrtbase.dll")) { throw 'UCRT 主组件缺失' }
foreach ($File in $Runtime) {
  if ($File.Name -notmatch '^(ucrtbase|api-ms-win-[a-z0-9-]+)\.dll$') { throw 'UCRT 文件集合异常' }
  Copy-Item -LiteralPath $File.FullName -Destination "$Output/$($File.Name)"
}
$Files = @()
$Imports = @()
$Objdump = "$Work/compiler/mingw64/bin/objdump.exe"
$SystemDlls = @(
  'advapi32.dll', 'bcrypt.dll', 'crypt32.dll', 'dnsapi.dll', 'iphlpapi.dll', 'kernel32.dll',
  'msvcrt.dll', 'netapi32.dll', 'ntdll.dll', 'ole32.dll', 'oleaut32.dll', 'psapi.dll',
  'rpcrt4.dll', 'secur32.dll', 'shell32.dll', 'shlwapi.dll', 'user32.dll', 'userenv.dll',
  'version.dll', 'winmm.dll', 'winhttp.dll', 'wininet.dll', 'ws2_32.dll', 'wtsapi32.dll',
  'dbghelp.dll', 'setupapi.dll', 'wintrust.dll', 'normaliz.dll', 'mswsock.dll', 'gdi32.dll'
)
foreach ($File in @(Get-Item -LiteralPath "$Output/yak.exe") + @(Get-ChildItem -LiteralPath $Output -Filter '*.dll')) {
  $Pe = (& $Objdump -p $File.FullName) -join "`n"
  if ($Pe -notmatch 'pei-x86-64') { throw "引擎或运行库架构错误：$($File.Name)" }
  $Dlls = @([regex]::Matches($Pe, 'DLL Name:\s*(\S+)') | ForEach-Object { $_.Groups[1].Value.ToLower() })
  foreach ($Dll in $Dlls) {
    if ($Dll -match '^(api-ms-|ext-ms-)' -and -not (Test-Path -LiteralPath "$Output/$Dll")) {
      throw "存在未随包部署的 APISet 依赖：$Dll"
    }
    if ($Dll -match '^(libgcc|libstdc|libwinpthread|bcryptprimitives|vcruntime|msvcp)') {
      throw "存在未锁定的引擎运行依赖：$Dll"
    }
    if ($SystemDlls -notcontains $Dll -and -not (Test-Path -LiteralPath "$Output/$Dll")) {
      throw "存在未识别的引擎传递依赖：$Dll"
    }
  }
  if ($File.Name -eq 'yak.exe' -and $Pe -match '\b(GetSystemTimePreciseAsFileTime|GetTempPath2W|WaitOnAddress|SetThreadDescription|ProcessPrng)\b') {
    throw '引擎包含 Win7 不具备的静态导入'
  }
  $Imports += @{ file = $File.Name; imports = $Dlls; pe = $Pe }
  $Files += @{
    name = $File.Name
    sha256 = (Get-FileHash -LiteralPath $File.FullName).Hash.ToLower()
    fileVersion = $File.VersionInfo.FileVersion
  }
}
Write-Json "$Output/imports.json" $Imports
$Metadata = @{
  engineVersion = $Lock.engineVersion
  revision = $Lock.revision
  sourceRepository = $Lock.sourceRepository
  sourceCommit = $Lock.sourceCommit
  go = @{ version = $GoVersion; sha256 = $Lock.go.sha256 }
  compiler = @{ version = $CcVersion; sha256 = $Lock.compiler.sha256; cflags = $env:CGO_CFLAGS; ldflags = $env:CGO_LDFLAGS }
  patches = $PatchEvidence
  loaderPatchSha256 = (Get-FileHash -LiteralPath "$PSScriptRoot/patch-windows-legacy-go.js").Hash.ToLower()
  runtimeSha256 = (Get-FileHash -LiteralPath "$env:GOROOT/src/runtime/os_windows.go").Hash.ToLower()
  syscallSha256 = (Get-FileHash -LiteralPath "$env:GOROOT/src/runtime/syscall_windows.go").Hash.ToLower()
  dllSha256 = (Get-FileHash -LiteralPath "$env:GOROOT/src/syscall/dll_windows.go").Hash.ToLower()
  ucrt = @{ package = $Lock.ucrt.package; version = $Lock.ucrt.version; sha512 = $Lock.ucrt.sha512; sha256 = (Get-FileHash -LiteralPath $SdkZip).Hash.ToLower() }
  files = $Files
  win7Verification = 'pending'
}
Write-Json "$Output/build.json" $Metadata
[IO.File]::WriteAllText("$Output/yak.exe.sha256.txt", ($Files | Where-Object name -eq 'yak.exe').sha256 + "`n", $Utf8)
Write-Output "Windows legacy 构建完成，源码 $($Lock.sourceCommit)；待 Win7 实测"
