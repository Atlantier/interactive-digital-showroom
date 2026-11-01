import {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react'

interface RootErrorBoundaryState {
  failed: boolean
}

export class RootErrorBoundary extends Component<
  { children: ReactNode },
  RootErrorBoundaryState
> {
  state: RootErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): RootErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Showroom render recovery activated.', error, info)
  }

  render() {
    if (this.state.failed) {
      return (
        <main
          data-app-error-fallback
          className="grid min-h-screen place-items-center bg-void px-6 text-frost"
        >
          <div className="w-full max-w-md border border-white/12 bg-carbon/95 p-6">
            <p className="font-mono text-[9px] tracking-[0.16em] text-signal">
              RENDER RECOVERY
            </p>
            <h1 className="mt-4 text-2xl">
              The showroom needs a fresh frame.
            </h1>
            <p className="mt-3 text-sm leading-6 text-mist">
              Browser translation or a temporary script conflict
              interrupted rendering. Reload without losing the
              original page URL.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 h-10 border border-signal/40 bg-signal/10 px-4 font-mono text-[10px] text-frost transition-colors hover:bg-signal/15"
            >
              Reload showroom
            </button>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
