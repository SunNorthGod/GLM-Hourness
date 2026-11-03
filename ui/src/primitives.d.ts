/**
 * react-dom comes from the DSH client module table like React (scripts/
 * ui-modules.mjs) and has no type package here; the one call the bundle
 * makes, the popover's portal, is declared.
 */
declare module 'react-dom' {
  import type { ReactNode, ReactPortal } from 'react'

  export function createPortal(children: ReactNode, container: Element): ReactPortal
}

/**
 * The ui-primitives components the UI bundle uses. The package is not on
 * npm for third parties; DSH hands it over through the client module table
 * (docs/DEVELOPMENT.md §5.6). Props follow the calls in the rc.3 client
 * bundles (reference/dsh-desktop-0.2.1-rc.3/dsh-client-ui-*), limited to
 * what this bundle passes.
 */
declare module '@deepseek-ai/dsh-client-ui-primitives' {
  import type { ButtonHTMLAttributes, ComponentType, InputHTMLAttributes, ReactElement, ReactNode, RefAttributes, RefObject } from 'react'

  export interface IconProps {
    readonly size?: number
    readonly className?: string
  }
  type Icon = ComponentType<IconProps>

  export const Button: ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & { readonly variant?: 'ghost' | 'outline' | 'primary', readonly size?: 'sm' | 'md' }>
  export const Input: ComponentType<InputHTMLAttributes<HTMLInputElement> & RefAttributes<HTMLInputElement>>
  export const Tag: ComponentType<{ readonly tone?: 'neutral' | 'info' | 'danger' | 'success' | 'warning', readonly className?: string, readonly children?: ReactNode }>
  export const StateDot: ComponentType<{ readonly state: 'error' | 'warning' | 'ongoing' | 'idle', readonly className?: string }>
  export const TextShimmer: ComponentType<{ readonly active?: boolean, readonly className?: string, readonly children?: ReactNode }>
  export const Tooltip: ComponentType<{ readonly label: ReactNode, readonly side?: 'top' | 'bottom' | 'right', readonly delayMs?: number, readonly children: ReactElement }>
  export const MarkdownText: ComponentType<{
    readonly text: string
    readonly className?: string
    readonly labels: {
      readonly code: { readonly copyLabel: string, readonly copiedLabel: string, readonly toolbarLabels: { readonly codeLabel: string, readonly wrapLabel: string, readonly unwrapLabel: string } }
      readonly footnotes: string
    }
  }>
  export function SegmentedTabs<T extends string>(props: {
    readonly className?: string
    readonly label: string
    readonly value: T
    readonly onChange: (value: T) => void
    readonly items: readonly { readonly value: T, readonly label: ReactNode, readonly id: string, readonly panelId: string }[]
  }): ReactElement
  export function Menu<T extends string>(props: {
    readonly open: boolean
    readonly onClose: () => void
    readonly items: readonly { readonly id: T, readonly label: ReactNode }[]
    readonly selectedId?: T
    readonly onSelect: (id: T) => void
    readonly align?: 'start' | 'end'
    readonly portal?: boolean
    readonly anchor: ReactElement
  }): ReactElement

  /** Viewport-clamped placement of a panel measured against its anchor (ui-chat useStatDialog); null until measured. ui/src/channel.js uses it. */
  export function useAnchoredPosition(options: { readonly open: boolean, readonly anchorRef: RefObject<Element | null>, readonly panelRef: RefObject<HTMLElement | null>, readonly side?: 'top' | 'bottom', readonly align?: 'start' | 'end', readonly gap: number, readonly margin: number }): { readonly left: number, readonly top: number } | null
  /** Copy text: the Clipboard API, else a hidden textarea and execCommand; false when neither worked. ui/src/channel.js uses it. */
  export function writeClipboard(text: string): Promise<boolean>
  /** Close on a pointerdown outside the root and the panel (ui-chat useStatDialog). ui/src/channel.js uses it. */
  export function useDismissOnOutsidePointer(rootRef: RefObject<Element | null>, open: boolean, setOpen: (open: boolean) => void, panelRef?: RefObject<Element | null>): void

  export const IconGoalOutlineRegular: Icon
  export const IconCheckCircleFillRegular: Icon
  export const IconChevronDownOutlineRegular: Icon
  export const IconChevronLeftOutlineRegular: Icon
  export const IconChevronRightOutlineRegular: Icon
  export const IconPlusOutlineRegular: Icon
  export const IconRefreshOutlineRegular: Icon
  export const IconUserOutlineRegular: Icon
  export const IconSparkleRegular: Icon
  export const IconCloseOutlineRegular: Icon
}
