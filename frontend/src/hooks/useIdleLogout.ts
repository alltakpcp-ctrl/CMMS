import { useCallback, useEffect, useRef, useState } from "react";

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const WARNING_MS = 30 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
const BROADCAST_CHANNEL_NAME = "cmms.idle";
const ACTIVITY_THROTTLE_MS = 1000;
const LAST_ACTIVITY_STORAGE_KEY = "cmms.lastActivity";
const LAST_LOGOUT_STORAGE_KEY = "cmms.lastLogout";

interface BroadcastMessage {
  type: "activity" | "logout";
  ts: number;
}

export function useIdleLogout(onLogout: () => void) {
  const [warningVisible, setWarningVisible] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARNING_MS / 1000);

  const warningTimerRef = useRef<number>();
  const logoutTimerRef = useRef<number>();
  const countdownIntervalRef = useRef<number>();
  const lastActivityRef = useRef(0);
  const warningVisibleRef = useRef(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const onLogoutRef = useRef(onLogout);

  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  const clearTimers = useCallback(() => {
    window.clearTimeout(warningTimerRef.current);
    window.clearTimeout(logoutTimerRef.current);
    window.clearInterval(countdownIntervalRef.current);
  }, []);

  const broadcastActivity = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: "activity", ts: Date.now() } satisfies BroadcastMessage);
    } else {
      localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(Date.now()));
    }
  }, []);

  const broadcastLogout = useCallback(() => {
    if (channelRef.current) {
      channelRef.current.postMessage({ type: "logout", ts: Date.now() } satisfies BroadcastMessage);
    } else {
      localStorage.setItem(LAST_LOGOUT_STORAGE_KEY, String(Date.now()));
    }
  }, []);

  // Reinicia os dois timers (warning + logout) e esconde o aviso. Chamada tanto por
  // atividade local quanto por atividade recebida de outra aba.
  const startTimers = useCallback(() => {
    clearTimers();
    setWarningVisible(false);
    warningVisibleRef.current = false;
    setSecondsLeft(WARNING_MS / 1000);

    warningTimerRef.current = window.setTimeout(() => {
      setWarningVisible(true);
      warningVisibleRef.current = true;
      setSecondsLeft(WARNING_MS / 1000);

      countdownIntervalRef.current = window.setInterval(() => {
        setSecondsLeft((current) => Math.max(current - 1, 0));
      }, 1000);
    }, IDLE_TIMEOUT_MS - WARNING_MS);

    logoutTimerRef.current = window.setTimeout(() => {
      clearTimers();
      broadcastLogout();
      onLogoutRef.current();
    }, IDLE_TIMEOUT_MS);
  }, [clearTimers, broadcastLogout]);

  const registerLocalActivity = useCallback(() => {
    if (warningVisibleRef.current) return;

    const now = Date.now();
    if (now - lastActivityRef.current < ACTIVITY_THROTTLE_MS) return;
    lastActivityRef.current = now;

    startTimers();
    broadcastActivity();
  }, [startTimers, broadcastActivity]);

  const applyRemoteActivity = useCallback(() => {
    startTimers();
  }, [startTimers]);

  const stayConnected = useCallback(() => {
    lastActivityRef.current = Date.now();
    startTimers();
    broadcastActivity();
  }, [startTimers, broadcastActivity]);

  useEffect(() => {
    startTimers();

    const handleActivity = () => registerLocalActivity();
    ACTIVITY_EVENTS.forEach((evt) => window.addEventListener(evt, handleActivity, { passive: true }));

    let channel: BroadcastChannel | null = null;
    let handleStorage: ((e: StorageEvent) => void) | null = null;

    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent) => {
        const data = event.data as BroadcastMessage;
        if (data?.type === "activity") {
          applyRemoteActivity();
        } else if (data?.type === "logout") {
          onLogoutRef.current();
        }
      };
      channelRef.current = channel;
    } else {
      handleStorage = (e: StorageEvent) => {
        if (e.key === LAST_ACTIVITY_STORAGE_KEY) {
          applyRemoteActivity();
        } else if (e.key === LAST_LOGOUT_STORAGE_KEY) {
          onLogoutRef.current();
        }
      };
      window.addEventListener("storage", handleStorage);
    }

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      if (channel) {
        channel.close();
        channelRef.current = null;
      }
      if (handleStorage) {
        window.removeEventListener("storage", handleStorage);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { warningVisible, secondsLeft, stayConnected };
}
