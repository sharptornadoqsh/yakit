import React from 'react'
import { YakitRoute } from '@/enums/yakitRoute'

export const RuiYanModuleIcon: React.FC<{ route: YakitRoute | string; className?: string }> = ({
  route,
  className,
}) => {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'square' as const }

  const glyph = (() => {
    switch (route) {
      case YakitRoute.MITMHacker:
        return (
          <>
            <path d="M4 16V8l8-4 8 4v8l-8 4-8-4Z" {...common} />
            <path d="M8 12h8M12 8v8" {...common} />
          </>
        )
      case YakitRoute.DB_HTTPHistory:
        return (
          <>
            <path d="M5 5h14v14H5z" {...common} />
            <path d="M8 9h8M8 12h8M8 15h5" {...common} />
          </>
        )
      case YakitRoute.HTTPFuzzer:
        return (
          <>
            <path d="M4 7h12M4 12h16M8 17h12" {...common} />
            <path d="m14 4 3 3-3 3M10 14l-3 3 3 3" {...common} />
          </>
        )
      case YakitRoute.DataCompare:
        return (
          <>
            <path d="M4 5h6v14H4zM14 5h6v14h-6z" {...common} />
            <path d="m9 10 3 2-3 2M15 14l-3-2 3-2" {...common} />
          </>
        )
      case YakitRoute.BatchExecutorPage:
      case YakitRoute.PoC:
        return (
          <>
            <path d="M12 3v4M12 17v4M3 12h4M17 12h4" {...common} />
            <circle cx="12" cy="12" r="6" {...common} />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
          </>
        )
      case YakitRoute.Mod_Brute:
        return (
          <>
            <path d="M7 11V8a5 5 0 0 1 10 0v3M5 11h14v10H5z" {...common} />
            <path d="M12 15v3" {...common} />
          </>
        )
      case YakitRoute.Codec:
        return (
          <>
            <path d="M4 7h10M10 3l4 4-4 4M20 17H10M14 13l-4 4 4 4" {...common} />
          </>
        )
      case YakitRoute.Plugin_Hub:
        return (
          <>
            <path d="M5 5h6v6H5zM13 5h6v6h-6zM5 13h6v6H5z" {...common} />
            <path d="M16 13v6M13 16h6" {...common} />
          </>
        )
      case YakitRoute.AddYakitScript:
        return (
          <>
            <path d="M5 4h14v16H5z" {...common} />
            <path d="m9 9-2 3 2 3M13 15h4" {...common} />
          </>
        )
      case YakitRoute.DB_Risk:
        return (
          <>
            <path d="m12 3 9 17H3L12 3Z" {...common} />
            <path d="M12 9v5M12 17v1" {...common} />
          </>
        )
      case YakitRoute.YakRunner_ScanHistory:
        return (
          <>
            <circle cx="12" cy="12" r="8" {...common} />
            <path d="M12 7v5l4 2M3 5h4" {...common} />
          </>
        )
      case YakitRoute.Beta_ConfigNetwork:
        return (
          <>
            <circle cx="12" cy="12" r="3" {...common} />
            <path
              d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"
              {...common}
            />
          </>
        )
      default:
        return <path d="M4 4h16v16H4z" {...common} />
    }
  })()

  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
      {glyph}
    </svg>
  )
}
