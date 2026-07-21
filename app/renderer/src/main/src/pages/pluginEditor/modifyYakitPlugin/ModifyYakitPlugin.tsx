import React, { memo, useEffect, useRef, useState } from 'react'
import { useInViewport, useMemoizedFn } from 'ahooks'
import { ModifyPluginCallback, PluginEditor, PluginEditorRefProps } from '../pluginEditor/PluginEditor'
import { YakScript } from '@/pages/invoker/schema'
import { ExclamationCircleOutlined } from '@ant-design/icons'
import { RuiYanButton, RuiYanDrawer, RuiYanModal } from '@/components/renyanUI'

import styles from './ModifyYakitPlugin.module.scss'
import { registerShortcutKeyHandle } from '@/utils/globalShortcutKey/utils'
import { getStorageYakitMultipleShortcutKeyEvents } from '@/utils/globalShortcutKey/events/multiple/yakitMultiple'
import { ShortcutKeyPage } from '@/utils/globalShortcutKey/events/pageMaps'
import useShortcutKeyTrigger from '@/utils/globalShortcutKey/events/useShortcutKeyTrigger'

interface ModifyYakitPluginProps {
  getContainer?: HTMLElement
  plugin: YakScript
  visible: boolean
  onCallback: (isSuccess: boolean, data?: ModifyPluginCallback) => void
}

export const ModifyYakitPlugin: React.FC<ModifyYakitPluginProps> = memo((props) => {
  const { getContainer, plugin, visible, onCallback } = props

  const [edit, setEdit] = useState<YakScript>(plugin)
  const [inViewport] = useInViewport(getContainer)

  const editorRef = useRef<PluginEditorRefProps>(null)
  useEffect(() => {
    if (visible && edit) {
      if (editorRef.current) {
        editorRef.current.setEditPlugin({
          id: Number(plugin.Id || 0) || 0,
          name: plugin.ScriptName,
          uuid: plugin.UUID || '',
        })
      }
    }
  }, [visible, edit])

  const onModifyCallback = useMemoizedFn((data: ModifyPluginCallback) => {
    onCallback(true, data)
  })
  // 关闭
  const onCancel = useMemoizedFn(async () => {
    if (editorRef.current) {
      const check = await editorRef.current.onCheckUnSaved()
      if (check) openUnsavedHint()
      else onCallback(false)
    } else {
      onCallback(false)
    }
  })

  const [unSavedHint, setUnSavedHint] = useState<boolean>(false)
  const [unsavedLoading, setUnsavedLoading] = useState<boolean>(false)
  // 未保存的提示框
  const openUnsavedHint = useMemoizedFn(() => {
    if (unSavedHint) return
    setUnSavedHint(true)
  })
  const unsavedHintCallback = useMemoizedFn((val: boolean) => {
    if (val) {
      if (!!editorRef.current) {
        setUnsavedLoading(true)
        editorRef.current.onSaveAndExit((val) => {
          if (val) {
            onCallback(true, val)
          }
          cancelUnsavedHint()
        })
        return
      }
    }
    onCallback(false)
    cancelUnsavedHint()
  })
  const cancelUnsavedHint = useMemoizedFn(() => {
    setUnsavedLoading(false)
    setUnSavedHint(false)
  })

  useEffect(() => {
    if (inViewport) {
      setTimeout(() => {
        registerShortcutKeyHandle(ShortcutKeyPage.YakitMultiple)
        getStorageYakitMultipleShortcutKeyEvents()
      }, 200)
    }
  }, [inViewport])

  useShortcutKeyTrigger('save*pluginEditor', () => {
    if (editorRef.current && inViewport) {
      editorRef.current.onBtnLocalSave()
    }
  })
  return (
    <>
      <RuiYanDrawer
        open={visible}
        width={640}
        title="编辑插件"
        description={plugin.ScriptName}
        closeOnBackdrop={false}
        onClose={onCancel}
      >
        {visible && (
          <PluginEditor
            ref={editorRef}
            title="编辑插件"
            onEditCancel={onModifyCallback}
            enablePageCloseSubscribe={false}
          />
        )}

        <RuiYanModal
          open={unSavedHint}
          width={480}
          title="插件未保存"
          closeOnBackdrop={false}
          onClose={cancelUnsavedHint}
          footer={
            <>
              <RuiYanButton variant="secondary" onClick={() => unsavedHintCallback(false)}>
                不保存
              </RuiYanButton>
              <RuiYanButton loading={unsavedLoading} variant="primary" onClick={() => unsavedHintCallback(true)}>
                保存
              </RuiYanButton>
            </>
          }
        >
          <div className={styles['unsaved-hint-body']}>
            <div className={styles['icon-wrapper']}>
              <ExclamationCircleOutlined className={styles['icon-style']} />
            </div>
            <div className={styles['content']}>
              <div>是否要将插件保存到本地?</div>
            </div>
          </div>
        </RuiYanModal>
      </RuiYanDrawer>
    </>
  )
})
