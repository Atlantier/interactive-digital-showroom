import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { installTranslationResilience } from 'translation-resilience'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'
import 'lenis/dist/lenis.css'
import App from './App'
import { RootErrorBoundary } from './components/layout/RootErrorBoundary'
import './styles/index.css'

installTranslationResilience()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
