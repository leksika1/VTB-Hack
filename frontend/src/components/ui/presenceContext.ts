import { createContext, useContext } from 'react';

export const ClosingContext = createContext(false);

/** true while the surrounding Presence plays its exit animation */
export function usePresenceClosing(): boolean {
  return useContext(ClosingContext);
}
