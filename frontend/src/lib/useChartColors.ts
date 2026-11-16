import { useMemo } from 'react'
import { useTheme } from '../context/ThemeContext'

/** Resolves theme CSS variables to concrete colours (SVG attributes cannot rely on var()). */
export function useChartColors() {
  const { theme } = useTheme()
  return useMemo(() => {
    const read = (name: string) => {
      const raw = getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim().split(/\s+/).join(',')
      return `rgb(${raw})`
    }
    return {
      accent: read('accent'), good: read('good'), warn: read('warn'), bad: read('bad'),
      muted: read('muted'), line: read('line'), surface: read('surface'), ink: read('ink'),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme])
}
