/** Optional native bridges. The browser preview has neither bridge. */
interface Window {
  webkit?: {
    messageHandlers?: Record<string, { postMessage(value: unknown): void }>;
  };
  pywebview?: { api?: Record<string, (...args: any[]) => Promise<any>> };
  prombeeReady?: boolean;
  prombeeErrors?: { message?: string; [key: string]: unknown }[];
  prombeeMascot?: ReturnType<typeof import("../editor/mascot").mountMascot>;
  prombeeLogoTarget?: typeof import("../editor/desktop-chrome").logoTarget;
  SpeechRecognition?: any;
  webkitSpeechRecognition?: any;
}
