import { useEffect, useState } from "react";
import {
  Play,
  Pause,
  Loader2,
  Volume2,
  VolumeX,
  Radio,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  RotateCcw,
} from "lucide-react";
import { useRadio } from "./RadioProvider";
import { Visualizer } from "./Visualizer";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

const LS_MINI = "radio-mini";

export function FloatingRadioPlayer() {
  const {
    station,
    isPlaying,
    isLoading,
    hasError,
    volume,
    muted,
    toggle,
    setVolume,
    toggleMute,
    retry,
    analyser,
  } = useRadio();

  const [mounted, setMounted] = useState(false);
  const [mini, setMini] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const m = localStorage.getItem(LS_MINI);
      if (m === "1") setMini(true);
    } catch {}
  }, []);

  const toggleMini = () => {
    setMini((m) => {
      const next = !m;
      try {
        localStorage.setItem(LS_MINI, next ? "1" : "0");
      } catch {}
      return next;
    });
  };

  if (!mounted) return null;

  return (
    <div
      className={cn(
        "fixed z-50 bottom-4 right-4 left-4 sm:left-auto sm:right-6 sm:bottom-6",
        "transition-all duration-300 ease-out",
      )}
      role="region"
      aria-label="Egyptian Quran Radio player"
    >
      <div
        className={cn(
          "mx-auto sm:mx-0 backdrop-blur-xl bg-card/85 border border-border shadow-2xl rounded-2xl",
          "ring-1 ring-black/5 dark:ring-white/5",
          mini ? "w-auto sm:w-[260px]" : "w-full sm:w-[360px]",
        )}
      >
        <div className="flex items-center gap-3 p-3">
          {/* Play / pause */}
          <button
            onClick={hasError ? retry : toggle}
            aria-label={
              hasError ? "Retry stream" : isPlaying ? "Pause radio" : "Play radio"
            }
            className={cn(
              "relative shrink-0 h-11 w-11 rounded-full flex items-center justify-center",
              "bg-primary text-primary-foreground transition-transform active:scale-95",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold,#d4af37)]",
              isPlaying && "shadow-[0_0_0_4px_rgba(212,175,55,0.18)]",
            )}
          >
            {hasError ? (
              <RotateCcw className="w-5 h-5" />
            ) : isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 translate-x-[1px]" />
            )}
            {isPlaying && (
              <span className="absolute inset-0 rounded-full animate-ping bg-[var(--gold,#d4af37)]/30" />
            )}
          </button>

          {/* Title + status */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <Radio className="w-3 h-3 text-muted-foreground shrink-0" />
              <span
                className={cn(
                  "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider",
                  hasError
                    ? "text-destructive"
                    : isPlaying
                      ? "text-red-500"
                      : "text-muted-foreground",
                )}
              >
                {hasError ? (
                  <>
                    <AlertTriangle className="w-3 h-3" /> Reconnecting
                  </>
                ) : (
                  <>
                    <span
                      className={cn(
                        "h-1.5 w-1.5 rounded-full bg-current",
                        isPlaying && "animate-pulse",
                      )}
                    />
                    Live
                  </>
                )}
              </span>
            </div>
            <div className="text-sm font-semibold text-foreground truncate">
              {station.title}
            </div>
            {!mini && (
              <div className="text-[11px] text-muted-foreground truncate">
                {station.subtitle}
              </div>
            )}
          </div>

          {/* Mini toggle */}
          <button
            onClick={toggleMini}
            aria-label={mini ? "Expand player" : "Collapse player"}
            className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            {mini ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {!mini && (
          <div className="px-3 pb-3 space-y-3">
            {/* Visualizer */}
            <div className="h-10 rounded-lg bg-muted/40 overflow-hidden">
              <Visualizer
                analyser={analyser}
                active={isPlaying || isLoading}
                className="w-full h-full"
              />
            </div>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                aria-label={muted ? "Unmute" : "Mute"}
                className="h-8 w-8 shrink-0"
              >
                {muted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </Button>
              <Slider
                value={[muted ? 0 : Math.round(volume * 100)]}
                max={100}
                step={1}
                onValueChange={(v) => setVolume((v[0] ?? 0) / 100)}
                aria-label="Volume"
                className="flex-1"
              />
              <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">
                {muted ? 0 : Math.round(volume * 100)}
              </span>
            </div>

            {hasError && (
              <p className="text-[11px] text-destructive">
                Stream unavailable. Retrying automatically…
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
