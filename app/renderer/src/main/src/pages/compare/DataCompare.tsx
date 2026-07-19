import React, { useEffect, useState, useRef, useImperativeHandle, useLayoutEffect, useMemo } from 'react'
import * as monacoEditor from 'monaco-editor/esm/vs/editor/editor.api'
import styles from './DataCompare.module.scss'
import { RuiYanButton, RuiYanIcon, RuiYanToolbar } from '@/components/renyanUI'
import { RemoveIcon } from '@/assets/newIcon'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { useHttpFlowStore } from '@/store/httpFlow'
import { useTheme } from '@/hook/useTheme'
import { applyYakitMonacoTheme } from '@/utils/monacoSpec/theme'
import { randomString } from '@/utils/randomUtil'
import { useEditorFontSize, fontSizeOptions } from '@/store/editorFontSize'
import { useUpdateEffect, useMemoizedFn } from 'ahooks'
import { showByRightContext } from '@/components/yakitUI/YakitMenu/showByRightContext'
import { YakitMenuItemType } from '@/components/yakitUI/YakitMenu/YakitMenu'
import { buildCompareSummary, formatCompareBytes, type CompareMode } from './compareMetrics'

const { ipcRenderer } = window.require('electron')

interface textModelProps {
  content: string
  language: string
}

interface DataCompareProps {
  leftData?: string
  rightData?: string
}

interface CodeComparisonRef {
  onChangeLineConversion: () => void
  onNavigate: (direction: 'previous' | 'next') => void
  onSwap: () => void
  onClear: () => void
}

export const DataCompare: React.FC<DataCompareProps> = (props) => {
  const { leftData, rightData } = props
  const [noWrap, setNoWrap] = useState<boolean>(false)

  const [left, setLeft] = useState<string>(leftData || '')
  const [right, setRight] = useState<string>(rightData || '')
  const [mode, setMode] = useState<CompareMode>('text')
  const [editorVersion, setEditorVersion] = useState(0)
  const { t } = useI18nNamespaces(['comparer'])

  const codeComparisonRef = useRef<CodeComparisonRef>(null)
  const displayLeft = useMemo(() => (mode === 'bytes' ? formatCompareBytes(left) : left), [left, mode])
  const displayRight = useMemo(() => (mode === 'bytes' ? formatCompareBytes(right) : right), [mode, right])
  const summary = useMemo(() => buildCompareSummary(left, right, mode), [left, mode, right])

  const changeMode = (nextMode: CompareMode) => {
    if (nextMode === mode) return
    setMode(nextMode)
    setEditorVersion((version) => version + 1)
  }

  const swapContent = () => {
    if (mode === 'text') {
      codeComparisonRef.current?.onSwap()
      return
    }
    setLeft(right)
    setRight(left)
    setEditorVersion((version) => version + 1)
  }

  const clearContent = () => {
    if (mode === 'text') {
      codeComparisonRef.current?.onClear()
      return
    }
    setLeft('')
    setRight('')
    setEditorVersion((version) => version + 1)
  }

  return (
    <div className={styles['data-compare-page']}>
      <RuiYanToolbar
        className={styles['compare-command-bar']}
        leading={
          <div className={styles['compare-heading']}>
            <strong>{t('DataCompare.comparer')}</strong>
          </div>
        }
        actions={
          <div className={styles['compare-summary']}>
            <small>{mode === 'text' ? '文本差异' : '字节差异'}</small>
            <small>
              左 {summary.leftLength} / 右 {summary.rightLength} {summary.unit}
            </small>
            <small>差异位置 {summary.differenceCount}</small>
          </div>
        }
      />
      <div className={styles['compare-editor']}>
        <CodeComparison
          key={`${mode}-${editorVersion}`}
          ref={codeComparisonRef}
          noWrap={noWrap}
          setNoWrap={setNoWrap}
          leftCode={displayLeft}
          setLeftCode={mode === 'text' ? setLeft : undefined}
          rightCode={displayRight}
          setRightCode={mode === 'text' ? setRight : undefined}
          originalEditable={mode === 'text'}
          readOnly={mode === 'bytes'}
          initialLanguage={mode === 'bytes' ? 'plaintext' : 'yak'}
          useStoredCompareData={mode === 'text' && editorVersion === 0}
        />
      </div>
      <div className={styles['compare-action-bar']}>
        <div className={styles['compare-mode-switch']} role="group" aria-label="差异模式">
          <RuiYanButton
            variant={mode === 'text' ? 'secondary' : 'ghost'}
            size="small"
            aria-pressed={mode === 'text'}
            onClick={() => changeMode('text')}
          >
            文本
          </RuiYanButton>
          <RuiYanButton
            variant={mode === 'bytes' ? 'secondary' : 'ghost'}
            size="small"
            aria-pressed={mode === 'bytes'}
            onClick={() => changeMode('bytes')}
          >
            字节
          </RuiYanButton>
        </div>
        <div className={styles['compare-actions']}>
          <RuiYanButton variant="ghost" size="small" onClick={() => codeComparisonRef.current?.onNavigate('previous')}>
            上一处
          </RuiYanButton>
          <RuiYanButton variant="ghost" size="small" onClick={() => codeComparisonRef.current?.onNavigate('next')}>
            下一处
          </RuiYanButton>
          <span className={styles['command-divider']} />
          <RuiYanButton size="small" onClick={swapContent}>
            交换
          </RuiYanButton>
          <RuiYanButton size="small" onClick={clearContent}>
            清空
          </RuiYanButton>
          <RuiYanButton
            variant={noWrap ? 'secondary' : 'primary'}
            size="small"
            icon={<RuiYanIcon name="packet" />}
            onClick={() => codeComparisonRef.current?.onChangeLineConversion()}
          >
            换行
          </RuiYanButton>
        </div>
      </div>
    </div>
  )
}

interface DataCompareModalProps {
  onClose: () => void
  leftTitle?: string
  leftCode: string
  rightTitle?: string
  rightCode: string
  loadCallBack?: () => void
  readOnly?: boolean
}

export const DataCompareModal: React.FC<DataCompareModalProps> = (props) => {
  const { onClose, leftCode, rightCode, leftTitle, rightTitle, loadCallBack, readOnly = false } = props
  const { t, i18n } = useI18nNamespaces(['comparer'])

  useEffect(() => {
    loadCallBack && loadCallBack()
  })
  return (
    <div className={styles['data-compare-modal']}>
      <div className={styles['header']}>
        <div className={styles['title']}>{t('DataCompareModal.codeCompare')}</div>
        <div className={styles['close']}>
          <RemoveIcon onClick={() => onClose()} />
        </div>
      </div>
      <div className={styles['content']}>
        {leftTitle && rightTitle && (
          <div className={styles['content-title']}>
            <div className={styles['content-title-left']}>{leftTitle}</div>
            <div className={styles['content-title-right']}>{rightTitle}</div>
          </div>
        )}
        <div className={styles['code']}>
          <CodeComparison leftCode={leftCode} rightCode={rightCode} fontSize={12} readOnly={readOnly} />
        </div>
      </div>
      {/* <div className={styles['footer']}>
                <YakitButton type="outline2" onClick={()=>onClose()}>取消</YakitButton>
                <YakitButton>合并</YakitButton>
            </div> */}
    </div>
  )
}

interface CodeComparisonProps {
  noWrap?: boolean
  setNoWrap?: (b: boolean) => void
  leftCode: string
  setLeftCode?: (s: string) => void
  rightCode: string
  setRightCode?: (s: string) => void
  ref?: any
  originalEditable?: boolean
  readOnly?: boolean
  fontSize?: number
  initialLanguage?: string
  useStoredCompareData?: boolean
}

export const CodeComparison: React.FC<CodeComparisonProps> = React.forwardRef((props, ref) => {
  const {
    noWrap,
    setNoWrap,
    leftCode,
    setLeftCode,
    rightCode,
    setRightCode,
    originalEditable = true,
    readOnly,
    initialLanguage = 'yak',
    useStoredCompareData = true,
  } = props
  const { t } = useI18nNamespaces(['yakitUi'])
  const { fontSize, initFontSize, setFontSize } = useEditorFontSize()
  const diffDivRef = useRef(null)
  const monaco = monacoEditor.editor
  const diffEditorRef = useRef<monacoEditor.editor.IStandaloneDiffEditor>()
  const diffIndexRef = useRef(-1)
  const [language, setLanguage] = useState<string>('')
  // 从store获取对比数据
  const { token, dataMap } = useHttpFlowStore()
  const { theme } = useTheme()

  const disposeDiffEditor = () => {
    const editor = diffEditorRef.current
    if (!editor) return
    const model = editor.getModel()
    diffEditorRef.current = undefined
    editor.dispose()
    model?.original?.dispose()
    model?.modified?.dispose()
  }

  // 构建右键菜单数据
  const rightContextMenu = useMemo<YakitMenuItemType[]>(
    () => [
      {
        key: 'font-size',
        label: t('YakitEditor.fontSize'),
        children: fontSizeOptions.map((size) => ({
          key: `font-size-${size}`,
          label: `${size}${fontSize === size ? '\u00A0\u00A0\u00A0✓' : ''}`,
        })),
      },
      { key: 'change-all-occurrences', label: 'Change All Occurrences', keyDesc: 'Ctrl+F2' },
      { type: 'divider' },
      { key: 'cut', label: 'Cut' },
      { key: 'copy', label: 'Copy' },
      { key: 'paste', label: 'Paste' },
      { type: 'divider' },
      { key: 'command-palette', label: 'Command Palette', keyDesc: 'F1' },
    ],
    [fontSize, t],
  )

  // 右键菜单点击处理
  const handleContextMenuClick = useMemoizedFn((key: string, editor: monacoEditor.editor.IStandaloneCodeEditor) => {
    if (key.startsWith('font-size-')) {
      const size = parseInt(key.replace('font-size-', ''))
      if (!isNaN(size) && fontSizeOptions.includes(size)) {
        setFontSize(size)
      }
      return
    }
    switch (key) {
      case 'change-all-occurrences':
        editor.focus()
        editor.trigger('keyboard', 'editor.action.changeAll', null)
        break
      case 'cut':
        editor.focus()
        document.execCommand('cut')
        break
      case 'copy':
        editor.focus()
        document.execCommand('copy')
        break
      case 'paste':
        editor.focus()
        navigator.clipboard.readText().then((text) => {
          const selection = editor.getSelection()
          if (selection) {
            editor.executeEdits('paste', [
              {
                range: selection,
                text: text,
                forceMoveMarkers: true,
              },
            ])
          }
        })
        break
      case 'command-palette':
        editor.focus()
        editor.trigger('keyboard', 'editor.action.quickCommand', null)
        break
    }
  })

  useImperativeHandle(ref, () => ({
    // 减少父组件获取的DOM元素属性,只暴露给父组件需要用到的方法
    onChangeLineConversion: () => {
      changeLineConversion()
    },
    onNavigate: (direction: 'previous' | 'next') => {
      const changes = diffEditorRef.current?.getLineChanges() || []
      if (changes.length === 0 || !diffEditorRef.current) return
      const offset = direction === 'next' ? 1 : -1
      diffIndexRef.current = (diffIndexRef.current + offset + changes.length) % changes.length
      const lineNumber = changes[diffIndexRef.current].modifiedStartLineNumber
      const editor = diffEditorRef.current.getModifiedEditor()
      editor.setPosition({ lineNumber, column: 1 })
      editor.revealLineInCenter(lineNumber)
      editor.focus()
    },
    onSwap: () => {
      const currentModel = diffEditorRef.current?.getModel()
      const currentLeft = currentModel?.original.getValue() ?? leftCode
      const currentRight = currentModel?.modified.getValue() ?? rightCode
      setLeftCode?.(currentRight)
      setRightCode?.(currentLeft)
      diffIndexRef.current = -1
      setModelEditor({ content: currentRight, language }, { content: currentLeft, language }, language)
    },
    onClear: () => {
      setLeftCode?.('')
      setRightCode?.('')
      diffIndexRef.current = -1
      setModelEditor({ content: '', language }, { content: '', language }, language)
    },
  }))

  //监听theme设置monaco主题
  useLayoutEffect(() => {
    applyYakitMonacoTheme(theme)
  }, [theme])

  useEffect(() => {
    initFontSize()
  }, [])

  const changeLineConversion = () => {
    if (!diffEditorRef.current) return
    const nextNoWrap = !noWrap
    diffEditorRef.current.updateOptions({ wordWrap: nextNoWrap ? 'off' : 'on' })
    setNoWrap?.(nextNoWrap)
  }
  const setModelEditor = (left?: textModelProps, right?: textModelProps, language = 'yak') => {
    if (!diffEditorRef.current) return
    const previousModel = diffEditorRef.current.getModel()
    const leftModel = monaco.createModel(left ? left.content : '', left ? left.language : language)
    leftModel.onDidChangeContent((e) => {
      if (setLeftCode) setLeftCode(leftModel.getValue())
    })
    const rightModel = monaco.createModel(right ? right.content : '', right ? right.language : language)
    if (setRightCode)
      rightModel.onDidChangeContent((e) => {
        setRightCode(rightModel.getValue())
      })
    diffEditorRef.current.setModel({
      original: leftModel,
      modified: rightModel,
    })
    previousModel?.original?.dispose()
    previousModel?.modified?.dispose()
  }
  useEffect(() => {
    //如果存在先销毁以前的组件
    disposeDiffEditor()
    //替换 invoke("create-compare-token")
    const getCreateCompareTokenRes = () => {
      if (token) {
        return { token, info: dataMap.get(token) }
      }
      const data = Array.from(dataMap.entries()).pop()
      if (data?.length) {
        return {
          token: data[0],
          info: data?.[1],
        }
      } else {
        return { token: `compare-${randomString(50)}` }
      }
    }
    const res = getCreateCompareTokenRes()
    // 获取生成diff组件的ref
    if (!diffDivRef || !diffDivRef.current) return

    const diff = diffDivRef.current as unknown as HTMLDivElement
    diffEditorRef.current = monaco.createDiffEditor(diff, {
      enableSplitViewResizing: false,
      originalEditable,
      automaticLayout: true,
      wordWrap: noWrap ? 'off' : 'on',
      readOnly,
      fontSize,
      contextmenu: false,
    })

    if (useStoredCompareData && !!res.info) {
      const { info } = res
      if (info.type === 1) {
        const { left } = info
        setLanguage(left.language)
        if (setLeftCode) setLeftCode(left.content)
        setModelEditor(left, undefined, left.language)
      }

      if (info.type === 2) {
        const { right, left } = info
        setLanguage(right.language)
        if (setRightCode) setRightCode(right.content)
        if (left) {
          setLeftCode?.(left.content)
          setModelEditor(left, right, right.language)
        } else {
          setModelEditor(undefined, right, right.language)
        }
      }
    } else {
      setLanguage(initialLanguage)
      if (setLeftCode) setLeftCode(leftCode)
      if (setRightCode) setRightCode(rightCode)
      setModelEditor(
        {
          content: leftCode,
          language: initialLanguage,
        },
        {
          content: rightCode,
          language: initialLanguage,
        },
        initialLanguage,
      )
    }

    const dataChannel = `${res.token}-data`
    const handleTokenData = (e, tokenDataRes) => {
      const { left, right } = tokenDataRes.info

      setModelEditor(left, right, language || left?.language || right?.language)

      if (tokenDataRes.info.type === 1) if (setLeftCode) setLeftCode(left.content)
      if (tokenDataRes.info.type === 2) if (setRightCode) setRightCode(right.content)
    }
    if (useStoredCompareData) ipcRenderer.on(dataChannel, handleTokenData)

    return () => {
      if (useStoredCompareData) ipcRenderer.removeListener(dataChannel, handleTokenData)
      disposeDiffEditor()
    }
  }, [])

  useUpdateEffect(() => {
    diffEditorRef.current?.updateOptions({ fontSize })
  }, [fontSize])

  // 注册自定义右键菜单
  useEffect(() => {
    if (!diffEditorRef.current) return

    const originalEditor = diffEditorRef.current.getOriginalEditor()
    const modifiedEditor = diffEditorRef.current.getModifiedEditor()

    const disposables: monacoEditor.IDisposable[] = []

    ;[originalEditor, modifiedEditor].forEach((editor: monacoEditor.editor.IStandaloneCodeEditor) => {
      const disposable = editor.onContextMenu((e) => {
        e.event.preventDefault()
        e.event.stopPropagation()

        showByRightContext(
          {
            data: rightContextMenu,
            onClick: ({ key }) => {
              handleContextMenuClick(key, editor)
            },
          },
          e.event.posx,
          e.event.posy,
          true,
        )
      })
      disposables.push(disposable)
    })

    return () => {
      disposables.forEach((d) => d.dispose())
    }
  }, [rightContextMenu])

  return <div ref={diffDivRef} style={{ width: '100%', height: '100%' }}></div>
})
