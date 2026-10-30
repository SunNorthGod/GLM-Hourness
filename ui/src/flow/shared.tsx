/**
 * Pieces the flow bar and the /wish entry share: the render guard of the
 * dock entries and the warning mark of the model reminder.
 *
 * A slot entry that throws while rendering is retired from its slot for
 * good, so the entry would vanish without a word; the guard keeps the rest
 * of the composer area on screen, says in the console which entry failed,
 * and renders nothing in its place.
 */
import { Component, type ErrorInfo, type ReactElement, type ReactNode } from 'react'

interface GuardProps {
  /** Which entry this guards, for the console line. */
  readonly entry: string
  readonly children: ReactNode
}

export class RenderGuard extends Component<GuardProps, { readonly failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { readonly failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`hourness-ui: ${this.props.entry} failed to render:`, error, info.componentStack)
  }

  override render(): ReactNode {
    return this.state.failed ? null : this.props.children
  }
}

/** Triangle outline in the warning color, 14 px (the mark in mockup-wish.svg). */
export function WarnIcon(): ReactElement {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M2 14 L8 3 L14 14 Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  )
}
