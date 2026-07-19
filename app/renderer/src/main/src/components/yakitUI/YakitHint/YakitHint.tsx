import ReactDOM from 'react-dom'
import React, { memo, useMemo, useState } from 'react'
import { HintModal, YakitHintModal } from './YakitHintModal'
import { YakitHintModalProps, YakitHintProps, YakitHintWhiteProps } from './YakitHintType'
import { usePrevious } from 'ahooks'
import { RuiYanButton, RuiYanModal, RuiYanModalWidth } from '@/components/renyanUI'
import { RENYAN_SHELL_ENABLED } from '@/routes/renyanMenu'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'

import classNames from 'classnames'
import styles from './YakitHint.module.scss'

const getRuiYanHintWidth = (width?: number): RuiYanModalWidth => {
  if (!width || width <= 480) return 480
  if (width <= 720) return 720
  return 960
}

const RuiYanHintModal: React.FC<YakitHintModalProps> = (props) => {
  const {
    visible,
    width,
    title,
    content,
    footer,
    footerExtra,
    heardIcon,
    extraIcon,
    okButtonText,
    okButtonProps,
    onOk,
    cancelButtonText,
    cancelButtonProps,
    onCancel,
    children,
  } = props
  const { t } = useI18nNamespaces(['yakitUi'])
  const defaultFooter = (
    <div className={styles['ruiyan-hint-footer']}>
      <div>{footerExtra}</div>
      <div className={styles['ruiyan-hint-footer-actions']}>
        <RuiYanButton
          variant="secondary"
          loading={Boolean(cancelButtonProps?.loading)}
          disabled={cancelButtonProps?.disabled}
          style={cancelButtonProps?.style}
          className={cancelButtonProps?.className}
          onClick={onCancel}
        >
          {cancelButtonText || t('YakitButton.cancel')}
        </RuiYanButton>
        <RuiYanButton
          variant={okButtonProps?.danger || okButtonProps?.colors === 'danger' ? 'danger' : 'primary'}
          loading={Boolean(okButtonProps?.loading)}
          disabled={okButtonProps?.disabled}
          style={okButtonProps?.style}
          className={okButtonProps?.className}
          onClick={onOk}
        >
          {okButtonText || t('YakitButton.ok')}
        </RuiYanButton>
      </div>
    </div>
  )

  return (
    <RuiYanModal
      open={visible}
      title={title || t('YakitModal.friendlyReminder')}
      width={getRuiYanHintWidth(width)}
      onClose={() => onCancel?.()}
      closeOnBackdrop={false}
      footer={footer === null ? undefined : footer || defaultFooter}
    >
      <div className={styles['ruiyan-hint-content']}>
        {heardIcon || extraIcon ? (
          <div className={styles['ruiyan-hint-icon']}>
            {heardIcon}
            {extraIcon}
          </div>
        ) : null}
        <div>{children || content}</div>
      </div>
    </RuiYanModal>
  )
}

export const YakitHint: React.FC<YakitHintProps> = memo((props) => {
  const { mask = true, maskColor, childModal = [], getContainer, visible, ...rest } = props

  const container = useMemo(() => {
    if (!getContainer) return document.body
    return getContainer
  }, [getContainer])

  const modalsPrevious = usePrevious(childModal)

  const [currentTop, setCurrnetTop] = useState<string>('main')

  const modals = useMemo(() => {
    if (!!modalsPrevious && modalsPrevious.length > 0) {
      for (let index in childModal) {
        /** 判断新数据位置是否超出旧数据长度 */
        const position = +index < modalsPrevious.length
        if (position) {
          /** 新数据展示是否为true */
          const isLatest = childModal[index].content.visible === true
          /** 旧数据展示是否为false */
          const isOld = modalsPrevious[index].content.visible === false
          /** 由false变为true时，置顶该弹窗 */
          if (isLatest && isOld) {
            setTimeout(() => {
              setCurrnetTop(childModal[index].key)
            }, 100)
            break
          }
        }
      }
    }

    return childModal
  }, [childModal])

  if (RENYAN_SHELL_ENABLED) {
    return (
      <>
        <RuiYanHintModal {...rest} visible={visible} />
        {modals.map(({ key, content }) => (
          <RuiYanHintModal {...content} key={key} />
        ))}
      </>
    )
  }

  return ReactDOM.createPortal(
    <div
      style={{ backgroundColor: mask && maskColor ? maskColor : '' }}
      className={classNames(
        visible ? styles['yakit-hint-wrapper'] : styles['yakit-hint-hidden-wrapper'],
        'yakit-hint-progress-wrapper',
        {
          [styles['yakit-hint-mask-wrapper']]: mask,
        },
      )}
    >
      <div className={styles['yakit-hint-body']}>
        <YakitHintModal
          {...rest}
          getContainer={getContainer}
          isMask={mask}
          visible={true}
          isTop={currentTop === 'main'}
          setTop={() => setCurrnetTop('main')}
        />
        {modals.map((item) => {
          const { key, content } = item

          return (
            <YakitHintModal
              {...content}
              key={key}
              isMask={mask}
              isTop={currentTop === key}
              setTop={() => setCurrnetTop(key)}
            />
          )
        })}
      </div>
    </div>,
    container,
  )
})

// 拖拽白板 支持自定义
export const YakitHintWhite: React.FC<YakitHintWhiteProps> = memo((props) => {
  const { getContainer, maskColor, onClose, isMask, visible, ...rest } = props
  const container = useMemo(() => {
    if (!getContainer) return document.body
    return getContainer
  }, [getContainer])

  return ReactDOM.createPortal(
    <div
      style={{ backgroundColor: isMask && maskColor ? maskColor : '' }}
      className={classNames(visible ? styles['yakit-hint-wrapper'] : styles['yakit-hint-hidden-wrapper'], {
        [styles['yakit-hint-mask-wrapper']]: isMask,
      })}
    >
      <div
        className={styles['yakit-hint-body']}
        onClick={() => {
          onClose && onClose()
        }}
      >
        <HintModal {...rest} visible={visible} isMask={isMask} />
      </div>
    </div>,
    container,
  )
})
