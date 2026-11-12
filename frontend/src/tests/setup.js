import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach, beforeEach, vi } from 'vitest'

// jsdom does not implement scrolling, and logs an error when it is called.
window.scrollTo = vi.fn()

// The first-visit tour has its own tests (shell.test.jsx). Elsewhere it is already done.
beforeEach(() => {
  try {
    localStorage.setItem('iks-tour-done', '1')
  } catch {
    // Some tests block storage on purpose.
  }
})

afterEach(() => {
  cleanup()
})
