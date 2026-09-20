export const PROJECT_IMPORT_ACCEPT =
  '.ruiyanproject,.ruiyanproject.enc,.yakitproject,.yakitproject.enc,.db,.sqlite,.sqlite3'

export const validateProjectImportPath = (value: string): string => {
  const path = value.trim()
  if (!path) throw new Error('请选择项目归档或 SQLite 数据库文件')
  if (/\.html?$/i.test(path)) throw new Error('HTML 是风险报告，不是项目归档；请选择导出的项目文件或 SQLite 数据库')
  if (!/\.(?:(?:ruiyan|yakit)project(?:\.enc)?|db|sqlite3?)$/i.test(path)) {
    throw new Error('项目格式不支持：请选择 .ruiyanproject、.yakitproject（可带 .enc）或 SQLite 数据库')
  }
  return path
}
