import React, { useEffect, useMemo } from 'react'
import { YakitRoute } from '@/enums/yakitRoute'
import { productConfig } from '@/config/product'
import { YakitRouteToPageInfo } from '@/routes/newRoute'
import { findRenyanMenuPath } from '@/routes/renyanMenu'
import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { RuiYanBreadcrumb, RuiYanPageHeader as RuiYanHeader } from '@/components/renyanUI'

interface RenyanPageHeaderProps {
  route: YakitRoute | string
  fallbackTitle?: string
}

export const RenyanPageHeader: React.FC<RenyanPageHeaderProps> = React.memo((props) => {
  const { route, fallbackTitle } = props
  const { t } = useI18nNamespaces(['layout', 'yakitRoute'])
  const path = useMemo(() => findRenyanMenuPath(route), [route])
  const routeInfo = YakitRouteToPageInfo[route as YakitRoute]

  const getMenuTitle = (index: number) => {
    const item = path[index]
    if (!item) return ''
    const translated = t(item.titleKey)
    return translated === item.titleKey ? item.title : translated
  }

  const title = getMenuTitle(path.length - 1) || fallbackTitle || routeInfo?.label || String(route)
  const descriptionKey = routeInfo?.describeUi
  const translatedDescription = descriptionKey ? t(descriptionKey) : ''
  const description =
    translatedDescription && translatedDescription !== descriptionKey
      ? translatedDescription
      : routeInfo?.describe || ''

  useEffect(() => {
    document.title = `${title} · ${productConfig.displayName}`
    return () => {
      document.title = productConfig.displayName
    }
  }, [title])

  return (
    <RuiYanHeader
      data-shell-region="page-header"
      data-route={route}
      eyebrow={
        <RuiYanBreadcrumb
          items={path.map((item, index) => ({
            key: item.key,
            label: getMenuTitle(index),
          }))}
        />
      }
      title={title}
      description={description}
    />
  )
})
