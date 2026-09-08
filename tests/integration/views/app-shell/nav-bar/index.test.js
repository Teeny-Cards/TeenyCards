import { describe, test, expect, afterEach } from 'vite-plus/test'
import { shallowMount } from '@vue/test-utils'
import { page } from 'vite-plus/test/browser/context'
import NavBar from '@/views/app-shell/nav-bar/index.vue'
import UiIcon from '@/components/ui-kit/icon.vue'
import '@/styles/main.css'

// ── Helpers ───────────────────────────────────────────────────────────────────

let wrapper
let restore_client_height

function mountNavBar() {
  wrapper = shallowMount(NavBar)
  return wrapper
}

// The onMounted handler reads the real `<nav>` element's clientHeight, which
// depends on layout this environment doesn't produce (Tailwind isn't compiled
// here — see scroll-region/index.test.js). Stubbing the getter lets the tests
// pin a concrete box height instead of asserting on an unstyled 0.
function stubClientHeight(px) {
  const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight')
  Object.defineProperty(Element.prototype, 'clientHeight', {
    configurable: true,
    get: () => px
  })
  // Restored from afterEach rather than inline at the end of each test, so a
  // failing assertion can't leak the stub into every test that follows.
  restore_client_height = () => Object.defineProperty(Element.prototype, 'clientHeight', descriptor)
}

afterEach(async () => {
  restore_client_height?.()
  restore_client_height = undefined
  wrapper?.unmount()
  wrapper = undefined
  document.documentElement.style.removeProperty('--nav-height')
  await page.viewport(414, 896)
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NavBar — logo lockup responsive classes', () => {
  test('the logo icon carries both the mobile height and the desktop height class', () => {
    mountNavBar()

    const icon = wrapper.findComponent(UiIcon)

    expect(icon.exists()).toBe(true)
    expect(icon.classes()).toContain('h-8')
    expect(icon.classes()).toContain('sm:h-9')
  })

  test('the wordmark carries both the mobile text size and the desktop text size class', () => {
    mountNavBar()

    const lockup = wrapper.find('[data-testid="nav-bar__logo-lockup"]')

    expect(lockup.classes()).toContain('text-3xl')
    expect(lockup.classes()).toContain('sm:text-4xl')
  })

  test('the lockup row carries min-h-9 to hold the line box across breakpoints', () => {
    mountNavBar()

    const lockup = wrapper.find('[data-testid="nav-bar__logo-lockup"]')

    expect(lockup.exists()).toBe(true)
    expect(lockup.classes()).toContain('min-h-9')
  })
})

describe('NavBar — logo lockup visibility (feat/mobile-header-collapse)', () => {
  // getComputedStyle only resolves a real value once the element is connected
  // to the document — the other describes in this file never need that, so
  // this stays a local helper rather than changing mountNavBar for everyone.
  function mountNavBarAttached() {
    wrapper = shallowMount(NavBar, { attachTo: document.body })
    return wrapper
  }

  test('the logo lockup is not rendered below sm', async () => {
    await page.viewport(375, 812)
    mountNavBarAttached()

    const lockup = wrapper.find('[data-testid="nav-bar__logo-lockup"]')

    expect(getComputedStyle(lockup.element).display).toBe('none')
  })

  test('the logo lockup renders from sm and up', async () => {
    await page.viewport(1280, 900)
    mountNavBarAttached()

    const lockup = wrapper.find('[data-testid="nav-bar__logo-lockup"]')

    expect(getComputedStyle(lockup.element).display).not.toBe('none')
  })
})

describe('NavBar — --nav-height stays constant across breakpoints', () => {
  test('publishes --nav-height as clientHeight + 24px at a mobile viewport', async () => {
    await page.viewport(375, 812)
    stubClientHeight(60)

    mountNavBar()

    expect(document.documentElement.style.getPropertyValue('--nav-height')).toBe('84px')
  })

  test('publishes the same --nav-height for the same row height at a desktop viewport', async () => {
    await page.viewport(1280, 900)
    stubClientHeight(60)

    mountNavBar()

    expect(document.documentElement.style.getPropertyValue('--nav-height')).toBe('84px')
  })
})
