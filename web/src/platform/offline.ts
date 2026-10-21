import { registerSW } from "virtual:pwa-register";

export interface PwaStatusState {
  needRefresh: boolean;
  offlineReady: boolean;
}

export function initPwa(
  onStatusChange: (status: PwaStatusState) => void
): {
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
} {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return {
      updateServiceWorker: async () => {},
    };
  }

  let needRefresh = false;
  let offlineReady = false;

  const updateServiceWorker = registerSW({
    onNeedRefresh() {
      needRefresh = true;
      onStatusChange({ needRefresh, offlineReady });
    },
    onOfflineReady() {
      offlineReady = true;
      onStatusChange({ needRefresh, offlineReady });
    },
    onRegisterError(error: unknown) {
      console.warn("PWA registration error:", error);
    },
  });

  return { updateServiceWorker };
}
