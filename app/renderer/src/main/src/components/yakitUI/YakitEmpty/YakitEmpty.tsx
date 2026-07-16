import { Empty } from 'antd'
import React from 'react'
import { YakitEmptyProps } from './YakitEmptyType'
import classNames from 'classnames'
import styles from './YakitEmpty.module.scss'

import { useI18nNamespaces } from '@/i18n/useI18nNamespaces'
import { useEmptyImage } from '@/hook/useResultEmpty/SearchEmpty'
import { useRuiYanVisual } from '@/components/renyanUI/RuiYanVisualContext'

/**
 * @description:YakitEmpty
 * @augments YakitEmptyProps 继承antd的 Empty 默认属性
 */
export const YakitEmpty: React.FC<YakitEmptyProps> = (props) => {
  const { title, titleClassName, image, imageStyle, ...restProps } = props
  const { t, i18n } = useI18nNamespaces(['yakitUi'])
  const ruiYanVisual = useRuiYanVisual()

  const emptyImageTarget = useEmptyImage('empty')
  const routeEmptyAsset = ruiYanVisual?.stateAssets.empty
  const resolvedImage = routeEmptyAsset ? (
    <img style={{ userSelect: 'none' }} draggable={false} src={routeEmptyAsset} alt="" />
  ) : (
    image || <img style={{ userSelect: 'none' }} draggable={false} src={emptyImageTarget} alt="" />
  )

  return (
    <Empty
      image={resolvedImage}
      imageStyle={
        imageStyle
          ? imageStyle
          : routeEmptyAsset
            ? { height: 136, width: 216, margin: '18px auto' }
            : {
                height: 200,
                width: 200,
                margin: '24px auto',
              }
      }
      {...restProps}
      description={
        props.descriptionReactNode ? (
          props.descriptionReactNode
        ) : (
          <div className={styles['yakit-empty']} style={{ userSelect: 'none' }}>
            <div className={classNames(styles['yakit-empty-title'], titleClassName)}>
              {title || t('YakitEmpty.noData')}
            </div>
            <div className={styles['yakit-empty-description']}>{props.description}</div>
          </div>
        )
      }
    >
      {props.children}
    </Empty>
  )
}
