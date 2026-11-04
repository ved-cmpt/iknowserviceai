import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// jsdom does not implement scrolling, and logs an error when it is called.
window.scrollTo = vi.fn()

afterEach(() => {
  cleanup()
})
