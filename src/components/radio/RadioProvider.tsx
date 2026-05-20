import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { EGYPTIAN_QURAN_RADIO, RETRY_DELAY_MS, type RadioStation } from "@/lib/radio-config";

type Status = "idle" | "loading" | "playing" | "paused" | "error";

interface RadioContextValue {
  station: RadioStation;
  status: Status;
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  volume: number;
  muted: boolean;
  streamIndex: number;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  retry: () => void;
  analyser: AnalyserNode | null;
}

const RadioContext = createContext<RadioContextValue | null>(null);

const LS_VOLUME = "radio-volume";
const LS_PLAYING = "radio-was-playing";
const LS_MUTED = "radio-muted";

export function RadioProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [volume, setVolumeState] = useState(0.8);
  const [muted, setMuted] = useState(false);
  const [streamIndex, setStreamIndex] = useState(0);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  const station = EGYPTIAN_QURAN_RADIO;

  // Init audio element once (client-only)
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "none";
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    // Hydrate from localStorage
    try {
      const v = localStorage.getItem(LS_VOLUME);
      const m = localStorage.getItem(LS_MUTED);
      const wasPlaying = localStorage.getItem(LS_PLAYING);
      if (v !== null) {
        const n = Math.min(1, Math.max(0, Number(v)));
        if (!Number.isNaN(n)) {
          setVolumeState(n);
          audio.volume = n;
        }
      } else {
        audio.volume = 0.8;
      }
      if (m === "1") {
        setMuted(true);
        audio.muted = true;
      }
      if (wasPlaying === "1") {
        // Defer until handlers attached
        setTimeout(() => tryPlay(), 0);
      }
    } catch {}

    const onPlaying = () => setStatus("playing");
    const onWaiting = () => setStatus("loading");
    const onPause = () => setStatus((s) => (s === "error" ? s : "paused"));
    const onError = () => {
      setStatus("error");
      scheduleRetry();
    };
    const onStalled = () => setStatus("loading");
    const onCanPlay = () => {
      if (!audio.paused) setStatus("playing");
    };

    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("waiting", onWaiting);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("error", onError);
    audio.addEventListener("stalled", onStalled);
    audio.addEventListener("canplay", onCanPlay);

    return () => {
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("waiting", onWaiting);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("stalled", onStalled);
      audio.removeEventListener("canplay", onCanPlay);
      audio.pause();
      audio.src = "";
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ensureAnalyser = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const src = ctx.createMediaElementSource(audio);
      const an = ctx.createAnalyser();
      an.fftSize = 64;
      src.connect(an);
      an.connect(ctx.destination);
      audioCtxRef.current = ctx;
      sourceRef.current = src;
      analyserRef.current = an;
      setAnalyser(an);
    } catch {
      // Analyser is optional; ignore failures (e.g. CORS).
    }
  }, []);

  const scheduleRetry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    retryTimerRef.current = setTimeout(() => {
      const next = (streamIndex + 1) % station.streams.length;
      setStreamIndex(next);
      tryPlayWith(next);
    }, RETRY_DELAY_MS);
  }, [streamIndex, station.streams.length]);

  const tryPlayWith = useCallback(
    (idx: number) => {
      const audio = audioRef.current;
      if (!audio) return;
      const url = station.streams[idx];
      // Bust cache to force fresh connection
      const sep = url.includes("?") ? "&" : "?";
      audio.src = `${url}${sep}_=${Date.now()}`;
      setStatus("loading");
      ensureAnalyser();
      audioCtxRef.current?.resume?.().catch(() => {});
      audio.play().catch(() => {
        setStatus("error");
        scheduleRetry();
      });
    },
    [station.streams, ensureAnalyser, scheduleRetry],
  );

  const tryPlay = useCallback(() => {
    tryPlayWith(streamIndex);
  }, [tryPlayWith, streamIndex]);

  const play = useCallback(() => {
    try {
      localStorage.setItem(LS_PLAYING, "1");
    } catch {}
    tryPlay();
  }, [tryPlay]);

  const pause = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    audio.pause();
    try {
      localStorage.setItem(LS_PLAYING, "0");
    } catch {}
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) play();
    else pause();
  }, [play, pause]);

  const setVolume = useCallback((v: number) => {
    const n = Math.min(1, Math.max(0, v));
    setVolumeState(n);
    if (audioRef.current) audioRef.current.volume = n;
    try {
      localStorage.setItem(LS_VOLUME, String(n));
    } catch {}
    if (n > 0 && audioRef.current?.muted) {
      audioRef.current.muted = false;
      setMuted(false);
      try {
        localStorage.setItem(LS_MUTED, "0");
      } catch {}
    }
  }, []);

  const toggleMute = useCallback(() => {
    if (!audioRef.current) return;
    const next = !audioRef.current.muted;
    audioRef.current.muted = next;
    setMuted(next);
    try {
      localStorage.setItem(LS_MUTED, next ? "1" : "0");
    } catch {}
  }, []);

  const retry = useCallback(() => {
    if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    tryPlay();
  }, [tryPlay]);

  const value = useMemo<RadioContextValue>(
    () => ({
      station,
      status,
      isPlaying: status === "playing",
      isLoading: status === "loading",
      hasError: status === "error",
      volume,
      muted,
      streamIndex,
      play,
      pause,
      toggle,
      setVolume,
      toggleMute,
      retry,
      analyser,
    }),
    [station, status, volume, muted, streamIndex, play, pause, toggle, setVolume, toggleMute, retry, analyser],
  );

  return <RadioContext.Provider value={value}>{children}</RadioContext.Provider>;
}

export function useRadio() {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used within RadioProvider");
  return ctx;
}
