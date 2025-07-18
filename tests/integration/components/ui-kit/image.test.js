import { shallowMount } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import Image from '@/components/ui-kit/image.vue'

// Mock the async component import
vi.mock('vue', async () => {
  const actual = await vi.importActual('vue')
  return {
    ...actual,
    defineAsyncComponent: vi.fn((loader) => {
      return {
        name: 'MockedSvgImage',
        template: '<div class="mocked-svg-image"></div>'
      }
    })
  }
})

// Test basic rendering
it('renders properly with required src prop', () => {
  const wrapper = shallowMount(Image, {
    props: {
      src: 'binder-clip'
    }
  })

  expect(wrapper.exists()).toBe(true)
})

// Test src prop is required
it('requires src prop', () => {
  expect(Image.props.src.required).toBe(true)
})

// Test src prop is passed to the async component
it('passes src prop to the async component', () => {
  const testSrc = 'binder-clip'
  const wrapper = shallowMount(Image, {
    props: {
      src: testSrc
    }
  })

  // Check that the teeny-image attribute is set with the src value
  expect(wrapper.attributes('teeny-image')).toBe(testSrc)
})

// Test with different src values
it('renders with different src values', async () => {
  const wrapper = shallowMount(Image, {
    props: {
      src: 'binder-clip'
    }
  })

  expect(wrapper.attributes('teeny-image')).toBe('binder-clip')

  // Update src prop
  await wrapper.setProps({ src: 'image2' })

  expect(wrapper.attributes('teeny-image')).toBe('image2')
})
