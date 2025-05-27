import { useEffect, useRef } from 'react';

/**
 * Custom hook for setting up intervals that can be safely used within React components.
 * The interval is cleared when the component unmounts.
 * 
 * @param callback The function to call on each interval
 * @param delay The delay in milliseconds (or null to pause)
 */
export function useInterval(callback: () => void, delay: number | null) {
  const savedCallback = useRef<() => void>();

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    function tick() {
      savedCallback.current?.();
    }
    if (delay !== null) {
      const id = setInterval(tick, delay);
      return () => clearInterval(id);
    }
  }, [delay]);
} 