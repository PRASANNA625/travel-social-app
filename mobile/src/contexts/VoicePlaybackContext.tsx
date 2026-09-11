import { createContext, useContext, useRef, useState, type ReactNode } from "react";

interface VoicePlaybackContextValue {
  activeKey: string | null;
  requestPlay: (key: string, onForceStop: () => void) => void;
  notifyStopped: (key: string) => void;
}

const VoicePlaybackContext = createContext<VoicePlaybackContextValue | null>(null);

// Ensures only one voice note plays at a time within the wrapped subtree -
// starting playback on one pauses whatever else was playing, standard chat
// behavior. Each player registers its own stop callback when it starts, so
// the coordinator never needs to know how any individual player works.
export function VoicePlaybackProvider({ children }: { children: ReactNode }) {
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const stopHandlers = useRef<Map<string, () => void>>(new Map());

  const requestPlay = (key: string, onForceStop: () => void) => {
    if (activeKey && activeKey !== key) {
      stopHandlers.current.get(activeKey)?.();
    }
    stopHandlers.current.set(key, onForceStop);
    setActiveKey(key);
  };

  const notifyStopped = (key: string) => {
    stopHandlers.current.delete(key);
    setActiveKey((current) => (current === key ? null : current));
  };

  return (
    <VoicePlaybackContext.Provider value={{ activeKey, requestPlay, notifyStopped }}>
      {children}
    </VoicePlaybackContext.Provider>
  );
}

export function useVoicePlaybackCoordinator(): VoicePlaybackContextValue {
  const ctx = useContext(VoicePlaybackContext);
  if (!ctx) throw new Error("useVoicePlaybackCoordinator must be used within a VoicePlaybackProvider");
  return ctx;
}
