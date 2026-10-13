import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";

// Native driver where it exists; animations stick to transform/opacity so either driver is cheap.
// Looping animations pass isInteraction: false: an endless "interaction" would hold
// InteractionManager forever, and lists (VirtualizedList) wait on it before
// rendering rows beyond the first batch.
export const useNativeDriver = Platform.OS !== "web";

// True when the OS / browser asks for reduced motion (prefers-reduced-motion on web).
export function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduce).catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => sub.remove();
  }, []);
  return reduce;
}

// 0 -> 1 forever, after an initial delay; static at `restAt` when not enabled.
export function useLoop(duration: number, delay: number, enabled: boolean, restAt = 0.5) {
  const value = useRef(new Animated.Value(enabled ? 0 : restAt)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(restAt);
      return;
    }
    value.setValue(0);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(value, { toValue: 1, duration, easing: Easing.linear, useNativeDriver, isInteraction: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [value, duration, delay, enabled, restAt]);
  return value;
}

// 0 -> 1 -> 0 forever with eased ends, for slow back-and-forth drifts; rests at 0.5.
export function usePingPong(halfDuration: number, enabled: boolean) {
  const value = useRef(new Animated.Value(0.5)).current;
  useEffect(() => {
    if (!enabled) {
      value.setValue(0.5);
      return;
    }
    value.setValue(0);
    const ease = Easing.inOut(Easing.sin);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(value, { toValue: 1, duration: halfDuration, easing: ease, useNativeDriver, isInteraction: false }),
        Animated.timing(value, { toValue: 0, duration: halfDuration, easing: ease, useNativeDriver, isInteraction: false }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [value, halfDuration, enabled]);
  return value;
}

// 0 -> 1 once on mount (after `delay`); starts at 1 when motion is reduced.
export function useEntrance(delay: number, reduceMotion: boolean, duration = 650) {
  const value = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  const started = useRef(false);
  useEffect(() => {
    if (reduceMotion) {
      value.setValue(1);
      return;
    }
    if (started.current) return;
    started.current = true;
    Animated.timing(value, {
      toValue: 1,
      duration,
      delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    }).start();
  }, [value, delay, duration, reduceMotion]);
  return value;
}
