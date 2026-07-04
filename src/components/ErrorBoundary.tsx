import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches render errors in any tab so a single component failure shows a
 * recoverable fallback instead of blanking the whole app. Data lives in
 * localStorage, so a reload always recovers the user's logs.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error('Forgelog render error:', error, info.componentStack)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[70dvh] flex flex-col items-center justify-center text-center px-8">
          <div className="text-4xl mb-3">🛠️</div>
          <h2 className="text-xl font-extrabold mb-1.5">Something glitched</h2>
          <p className="text-ink-dim text-[15px] mb-6 max-w-xs">
            This screen hit an error. Your data is safe on your device — a reload usually
            fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-xl px-5 py-3 text-[15px] font-bold bg-gradient-to-b from-ember-hi to-ember text-black active:opacity-80"
          >
            Reload Hammerlog
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
