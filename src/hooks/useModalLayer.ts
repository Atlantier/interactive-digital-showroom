import { useEffect, useRef, useState } from 'react'

const layerStack: symbol[] = []
const listeners = new Set<() => void>()

function notifyLayers() {
  listeners.forEach((listener) => listener())
}

export function useModalLayer(active: boolean) {
  const layerIdRef = useRef<symbol | null>(null)
  const [isTopLayer, setIsTopLayer] = useState(false)

  if (layerIdRef.current === null) {
    layerIdRef.current = Symbol('modal-layer')
  }

  useEffect(() => {
    const layerId = layerIdRef.current
    if (!active || !layerId) return

    const updateTopState = () => {
      setIsTopLayer(layerStack.at(-1) === layerId)
    }

    layerStack.push(layerId)
    listeners.add(updateTopState)
    notifyLayers()
    updateTopState()

    return () => {
      listeners.delete(updateTopState)
      const index = layerStack.lastIndexOf(layerId)
      if (index >= 0) layerStack.splice(index, 1)
      setIsTopLayer(false)
      notifyLayers()
    }
  }, [active])

  return isTopLayer
}
