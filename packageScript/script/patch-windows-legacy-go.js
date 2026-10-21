const fs = require('fs')
const path = require('path')

const replaceOnce = (source, before, after) => {
  if (!source.includes(before) || source.indexOf(before) !== source.lastIndexOf(before)) {
    throw new Error('固定 Go 源码与 Windows legacy 补丁上下文不一致')
  }
  return source.replace(before, after)
}

const patchRuntime = (source) => {
  let result = replaceOnce(
    source,
    '//go:cgo_import_dynamic runtime._GetSystemDirectoryA GetSystemDirectoryA%2 "kernel32.dll"',
    '//go:cgo_import_dynamic runtime._GetSystemDirectoryA GetSystemDirectoryA%2 "kernel32.dll"\n' +
      '//go:cgo_import_dynamic runtime._GetSystemDirectoryW GetSystemDirectoryW%2 "kernel32.dll"',
  )
  result = replaceOnce(result, '\t_GetSystemDirectoryA,', '\t_GetSystemDirectoryA,\n\t_GetSystemDirectoryW,')
  result = replaceOnce(
    result,
    'func windowsLoadSystemLib(name []uint16) uintptr {\n' +
      '\treturn stdcall3(_LoadLibraryExW, uintptr(unsafe.Pointer(&name[0])), 0, _LOAD_LIBRARY_SEARCH_SYSTEM32)\n}',
    `var windowsCanSearchSystem32 bool
var legacySysDirectory [_MAX_PATH + 1]uint16
var legacySysDirectoryLen int

func windowsLoadSystemLib(name []uint16) uintptr {
\tif windowsCanSearchSystem32 {
\t\treturn stdcall3(_LoadLibraryExW, uintptr(unsafe.Pointer(&name[0])), 0, _LOAD_LIBRARY_SEARCH_SYSTEM32)
\t}
\t// Runtime initialization precedes heap initialization; keep the path on the stack.
\tvar absoluteName [_MAX_PATH + 1]uint16
\tif legacySysDirectoryLen+len(name) > len(absoluteName) {
\t\tthrow("system DLL path too long")
\t}
\tcopy(absoluteName[:], legacySysDirectory[:legacySysDirectoryLen])
\tcopy(absoluteName[legacySysDirectoryLen:], name)
\treturn stdcall3(_LoadLibraryExW, uintptr(unsafe.Pointer(&absoluteName[0])), 0, 0)
}`,
  )
  return replaceOnce(
    result,
    'func loadOptionalSyscalls() {',
    `func loadOptionalSyscalls() {
\tkernel32 := [...]uint16{'k', 'e', 'r', 'n', 'e', 'l', '3', '2', '.', 'd', 'l', 'l', 0}
\tk32 := stdcall1(_LoadLibraryW, uintptr(unsafe.Pointer(&kernel32[0])))
\tif k32 == 0 {
\t\tthrow("kernel32.dll not found")
\t}
\twindowsCanSearchSystem32 = windowsFindfunc(k32, []byte("AddDllDirectory\\000")) != nil
\tif !windowsCanSearchSystem32 {
\t\tn := stdcall2(_GetSystemDirectoryW, uintptr(unsafe.Pointer(&legacySysDirectory[0])), uintptr(len(legacySysDirectory)))
\t\tif n == 0 || n >= uintptr(len(legacySysDirectory)-1) {
\t\t\tthrow("Unable to determine system directory")
\t\t}
\t\tlegacySysDirectory[n] = '\\\\'
\t\tlegacySysDirectoryLen = int(n) + 1
\t}`,
  )
}

const patchSyscall = (source) => {
  let result = replaceOnce(
    source,
    'func syscall_loadsystemlibrary(filename *uint16) (handle, err uintptr) {',
    'func syscall_loadsystemlibrary(filename *uint16, absoluteFilepath *uint16) (handle, err uintptr) {',
  )
  result = replaceOnce(
    result,
    '\t}{filename, 0, _LOAD_LIBRARY_SEARCH_SYSTEM32}\n\tc.args = uintptr(noescape(unsafe.Pointer(&args)))',
    `\t}{filename, 0, _LOAD_LIBRARY_SEARCH_SYSTEM32}
\tif !windowsCanSearchSystem32 {
\t\targs.lpFileName = absoluteFilepath
\t\targs.flags = 0
\t}
\tc.args = uintptr(noescape(unsafe.Pointer(&args)))`,
  )
  const start = result.indexOf('func syscall_loadsystemlibrary(')
  const end = result.indexOf('\n}', start) + 2
  const body = result.slice(start, end)
  return (
    result.slice(0, start) +
    replaceOnce(body, '\tKeepAlive(filename)', '\tKeepAlive(filename)\n\tKeepAlive(absoluteFilepath)') +
    result.slice(end)
  )
}

const patchDll = (source) => {
  let result = replaceOnce(
    source,
    'func loadsystemlibrary(filename *uint16) (handle uintptr, err Errno)',
    'func loadsystemlibrary(filename *uint16, absoluteFilepath *uint16) (handle uintptr, err Errno)',
  )
  result = replaceOnce(
    result,
    '\tif sysdll.IsSystemDLL[name] {\n\t\th, e = loadsystemlibrary(namep)',
    `\tif sysdll.IsSystemDLL[name] && name != "kernel32.dll" {
\t\tabsoluteFilepath, err := legacySystemDLLPath(name)
\t\tif err != nil {
\t\t\treturn nil, err
\t\t}
\t\th, e = loadsystemlibrary(namep, absoluteFilepath)`,
  )
  return (
    result +
    `
// Build the fallback path outside the runtime's small nosplit syscall frame.
// kernel32.dll is already a loaded system module and bootstraps this lookup.
func legacySystemDLLPath(name string) (*uint16, error) {
\tkernel32, err := LoadDLL("kernel32.dll")
\tif err != nil {
\t\treturn nil, err
\t}
\tdefer kernel32.Release()
\tgetDirectory, err := kernel32.FindProc("GetSystemDirectoryW")
\tif err != nil {
\t\treturn nil, err
\t}
\tbuffer := make([]uint16, MAX_PATH+1)
\tn, _, callErr := getDirectory.Call(uintptr(unsafe.Pointer(&buffer[0])), uintptr(len(buffer)))
\tif n == 0 {
\t\treturn nil, callErr
\t}
\tif n >= uintptr(len(buffer)) {
\t\treturn nil, Errno(206)
\t}
\treturn UTF16PtrFromString(UTF16ToString(buffer[:n]) + "\\\\" + name)
}
`
  )
}

if (require.main === module) {
  const root = process.argv[2]
  for (const [name, transform] of [
    ['runtime/os_windows.go', patchRuntime],
    ['runtime/syscall_windows.go', patchSyscall],
    ['syscall/dll_windows.go', patchDll],
  ]) {
    const file = path.join(root, 'src', name)
    const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    fs.writeFileSync(`${file}.legacy-original`, original, 'utf8')
    fs.writeFileSync(file, transform(original), 'utf8')
  }
  console.log('Windows legacy Go 加载兼容补丁已应用')
}

module.exports = { patchRuntime, patchSyscall, patchDll, replaceOnce }
