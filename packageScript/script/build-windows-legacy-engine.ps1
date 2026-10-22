param(
  [Parameter(Mandatory = $true)][string]$Output
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if ($env:GITHUB_ACTIONS -ne 'true') { throw '此脚本仅供 GitHub Actions 准备工件使用' }
$Repo = [IO.Path]::GetFullPath("$PSScriptRoot/../..")
$Lock = Get-Content -LiteralPath "$Repo/product/windows-legacy-engine.json" -Raw | ConvertFrom-Json
if ($env:REQUESTED_ENGINE_VERSION -and $env:REQUESTED_ENGINE_VERSION -ne $Lock.engineVersion) {
  throw "Windows legacy 固定版本为 $($Lock.engineVersion)"
}
if ($Lock.distribution -ne 'prebuilt' -or $Lock.engine.asset -ne 'yak_windows_legacy_amd64.exe') {
  throw 'Windows legacy 必须使用固定预编译工件'
}
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
$Engine = Download-Locked $Lock.engine 'yak.exe'
Copy-Item -LiteralPath $Engine -Destination "$Output/yak.exe" -Force
Write-Output "固定预编译引擎：$($Lock.engineVersion)，$($Lock.engine.url)，SHA256=$($Lock.engine.sha256)"
$SdkZip = Download-Locked $Lock.ucrt 'sdk.zip'
$InspectionZip = Download-Locked $Lock.inspectionTool 'inspection.zip'
Expand-Archive -LiteralPath $SdkZip -DestinationPath "$Work/sdk"
Expand-Archive -LiteralPath $InspectionZip -DestinationPath "$Work/inspection"
$RuntimeDir = "$Work/sdk/$($Lock.ucrt.directory)"
$Runtime = @(Get-ChildItem -LiteralPath $RuntimeDir -File -Filter '*.dll')
if ($Runtime.Count -ne $Lock.ucrt.fileCount) { throw 'UCRT 集合不完整' }
if (-not (Test-Path -LiteralPath "$RuntimeDir/ucrtbase.dll")) { throw 'UCRT 主组件缺失' }
foreach ($File in $Runtime) {
  if ($File.Name -notmatch '^(ucrtbase|api-ms-win-[a-z0-9-]+)\.dll$') { throw 'UCRT 文件集合异常' }
  Copy-Item -LiteralPath $File.FullName -Destination "$Output/$($File.Name)" -Force
}
$Files = @()
$Imports = @()
$Objdump = "$Work/inspection/mingw64/bin/objdump.exe"
$InspectionVersion = (& $Objdump --version) -join "`n"
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
  distribution = 'prebuilt'
  sourceRepository = $Lock.sourceRepository
  sourceCommit = $Lock.sourceCommit
  engine = @{ asset = $Lock.engine.asset; url = $Lock.engine.url; sha256 = $Lock.engine.sha256 }
  inspectionTool = @{ name = $Lock.inspectionTool.name; version = $InspectionVersion; sha256 = $Lock.inspectionTool.sha256 }
  ucrt = @{ package = $Lock.ucrt.package; version = $Lock.ucrt.version; sha512 = $Lock.ucrt.sha512; sha256 = (Get-FileHash -LiteralPath $SdkZip).Hash.ToLower() }
  files = $Files
  win7Verification = 'pending'
}
Write-Json "$Output/build.json" $Metadata
[IO.File]::WriteAllText("$Output/yak.exe.sha256.txt", ($Files | Where-Object name -eq 'yak.exe').sha256 + "`n", $Utf8)
Write-Output "Windows legacy 固定预编译工件准备完成；待 Win7 实测"
