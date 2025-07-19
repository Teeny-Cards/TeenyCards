declare module 'body-scroll-lock' {
  interface BodyScrollOptions {
    reserveScrollBarGap?: boolean
    allowTouchMove?: (el: Element) => boolean
  }

  export function disableBodyScroll(
    targetElement: Element | HTMLElement,
    options?: BodyScrollOptions
  ): void

  export function enableBodyScroll(targetElement: Element | HTMLElement): void

  export function clearAllBodyScrollLocks(): void
}
