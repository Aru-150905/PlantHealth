import { Component, type ReactNode } from "react"

/**
 * Catches anything the 3D plant throws — a GPU three.js can't use, the lazy chunk failing to
 * download on a weak connection, a stale chunk after a redeploy — and shows the static plant
 * instead. Without it React unmounts the whole app and the farmer sees a white screen.
 */
export default class FallbackBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
