import { MutableRefObject } from 'react'
import { YakitModalConfirm } from '@/components/yakitUI/YakitModal/YakitModalConfirm'
import { YakitRoute } from '@/enums/yakitRoute'
import { keepSearchNameMapStore } from '@/store/keepSearchName'
import { YakitSecondaryConfirmProps } from '@/store/tabSubscribe'

// 多开页面的一级页面关闭确认框
export const onModalSecondaryConfirm = (
  props?: YakitSecondaryConfirmProps,
  visibleRef?: MutableRefObject<boolean>,
  route?: YakitRoute,
) => {
  if (visibleRef) visibleRef.current = true
  const originalModalAfterClose = props?.modalAfterClose
  let modal = YakitModalConfirm({
    width: 420,
    type: 'white',
    onCancelText: '不保存',
    onOkText: '保存',
    keyboard: false,
    zIndex: 1010,
    onCloseX: () => {
      modal.destroy()
    },
    footerStyle: { padding: '0 24px 24px' },
    footer: undefined,
    ...(props || {}),
    modalAfterClose: () => {
      if (visibleRef) visibleRef.current = false
      originalModalAfterClose?.()
    },
    onOk: () => {
      if (route) {
        keepSearchNameMapStore.removeKeepSearchRouteNameMap(route)
      }
      if (props?.onOk) {
        props.onOk(modal)
      } else {
        modal.destroy()
      }
    },
    onCancel: () => {
      if (props?.onCancel) {
        props.onCancel(modal)
      } else {
        modal.destroy()
      }
    },
    content: props?.content,
  })
  props?.getModal?.(modal)
  return modal
}
