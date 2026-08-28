import { useSyncExternalStore } from "react";

function subscribe(fn: () => void): () => void {
  const online = () => fn();
  window.addEventListener("online", online);
  window.addEventListener("offline", online);
  return () => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", online);
  };
}

function getSnapshot(): boolean {
  return navigator.onLine;
}

/**
 * Reactive browser connectivity flag. Returns `true` when the browser reports
 * an active network connection.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
