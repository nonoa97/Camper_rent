import { useRef } from 'react'

export function useSwipe(
  onLeft: () => void,
  onRight: () => void,
  threshold = 50,
) {
  const touchStartX = useRef(0)
  return {
    onTouchStart: (e: React.TouchEvent) => { touchStartX.current = e.touches[0].clientX },
    onTouchEnd: (e: React.TouchEvent) => {
      const delta = touchStartX.current - e.changedTouches[0].clientX
      if (delta > threshold) onLeft()
      else if (delta < -threshold) onRight()
    },
  }
}
