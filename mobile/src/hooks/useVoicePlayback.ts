import { useEffect } from "react";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useVoicePlaybackCoordinator } from "../contexts/VoicePlaybackContext";

export interface VoicePlaybackState {
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  currentTimeMs: number;
  durationMs: number;
  toggle: () => void;
}

// `key` must be stable and unique per voice note within one
// VoicePlaybackProvider subtree (a message id for sent bubbles, a
// "preview:<uri>" string for the composer's pre-send preview).
export function useVoicePlayback(key: string, uri: string | null): VoicePlaybackState {
  const player = useAudioPlayer(uri ?? null);
  const status = useAudioPlayerStatus(player);
  const { activeKey, requestPlay, notifyStopped } = useVoicePlaybackCoordinator();

  useEffect(() => {
    if (activeKey !== key && status.playing) {
      player.pause();
    }
  }, [activeKey, key, status.playing, player]);

  useEffect(() => {
    if (status.didJustFinish) {
      player.pause();
      player.seekTo(0);
      notifyStopped(key);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.didJustFinish]);

  const toggle = () => {
    if (status.playing) {
      player.pause();
      notifyStopped(key);
    } else {
      if (status.error && uri) {
        player.replace(uri);
      }
      requestPlay(key, () => player.pause());
      player.play();
    }
  };

  return {
    isPlaying: status.playing,
    isLoading: !status.isLoaded && !status.error,
    hasError: !!status.error,
    currentTimeMs: Math.round((status.currentTime ?? 0) * 1000),
    durationMs: Math.round((status.duration ?? 0) * 1000),
    toggle,
  };
}
