import { createContext, useContext } from 'react'

export const AnnouncerContext = createContext(() => {})

// Returns announce(message), which reads a status message to screen reader users politely.
export function useAnnounce() {
  return useContext(AnnouncerContext)
}
