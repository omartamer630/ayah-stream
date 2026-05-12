import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, Loader2, Package, BookOpen } from "lucide-react";
import { SURAHS, RECITERS, ayahAudioUrl, type ReciterId } from "@/lib/quran";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Quran Audio — Surah & Ayah Range Player" },
      {
        name: "description",
        content:
          "Play and download Quran recitations by Surah and Ayah range. Multiple reciters, individual MP3s, ZIP downloads.",
      },
    ],
  }),
  component: Index,
});

interface AyahItem {
  ayah: number;
  audioUrl: string;
}

function Index() {
  const [surahNum, setSurahNum] = useState<number>(1);
  const [start, setStart] = useState<number>(1);
  const [end, setEnd] = useState<number>(7);
  const [reciter, setReciter] = useState<ReciterId>("Alafasy_128kbps");
  const [ayahs, setAyahs] = useState<AyahItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [playMode, setPlayMode] = useState<"off" | "next" | "one" | "all">("next");
  const [playingIdx, setPlayingIdx] = useState<number | null>(null);
  const audioRefs = useRef<Array<HTMLAudioElement | null>>([]);

  const surah = useMemo(() => SURAHS.find((s) => s.n === surahNum)!, [surahNum]);

  useEffect(() => {
    if (start > surah.c) setStart(1);
    if (end > surah.c) setEnd(surah.c);
  }, [surahNum, surah.c, start, end]);

  const fetchAyahs = async () => {
    if (start < 1 || end < start || end > surah.c) {
      toast.error(`Invalid range. ${surah.a} has ${surah.c} ayahs.`);
      return;
    }
    setLoading(true);
    setPlayingIdx(null);
    try {
      const res = await fetch(
        `/api/surah/${surahNum}?start=${start}&end=${end}&reciter=${reciter}`,
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAyahs(data.ayahs);
    } catch (e) {
      toast.error(`Failed to load: ${(e as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  // Load default on first mount
  useEffect(() => {
    setAyahs(
      Array.from({ length: 7 }, (_, i) => ({
        ayah: i + 1,
        audioUrl: ayahAudioUrl("Alafasy_128kbps", 1, i + 1),
      })),
    );
  }, []);

  const playIdx = (idx: number) => {
    audioRefs.current.forEach((a, i) => {
      if (a && i !== idx) a.pause();
    });
    const merged = audioRefs.current[-1];
    if (merged && idx !== -1) merged.pause();
    const el = audioRefs.current[idx];
    if (!el) return;
    el.play();
    setPlayingIdx(idx);
  };

  const togglePlay = (idx: number) => {
    const el = audioRefs.current[idx];
    if (!el) return;
    if (playingIdx === idx && !el.paused) {
      el.pause();
      setPlayingIdx(null);
    } else {
      playIdx(idx);
    }
  };

  const handleEnded = (idx: number) => {
    if (playMode === "one") {
      const el = audioRefs.current[idx];
      if (el) {
        el.currentTime = 0;
        el.play();
      }
      return;
    }
    if (idx + 1 < ayahs.length && (playMode === "next" || playMode === "all")) {
      playIdx(idx + 1);
      return;
    }
    if (playMode === "all" && ayahs.length > 0) {
      playIdx(0);
      return;
    }
    setPlayingIdx(null);
  };

  const downloadZip = async () => {
    if (end - start + 1 > 50) {
      toast.error("ZIP supports up to 50 ayahs at a time.");
      return;
    }
    setZipping(true);
    try {
      const url = `/api/zip?surah=${surahNum}&start=${start}&end=${end}&reciter=${reciter}`;
      window.location.href = url;
      setTimeout(() => setZipping(false), 1500);
    } catch (e) {
      toast.error((e as Error).message);
      setZipping(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--gradient-surface)]">
      <header className="border-b border-border/60 backdrop-blur-sm bg-background/70 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--gradient-hero)] flex items-center justify-center shadow-[var(--shadow-glow)]">
            <BookOpen className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              Quran Audio
            </h1>
            <p className="text-xs text-muted-foreground">Surah & Ayah range player</p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <section className="mb-8">
          <h2
            className="text-4xl md:text-5xl font-semibold tracking-tight text-foreground mb-3"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Listen and download
            <span className="block text-transparent bg-clip-text bg-[var(--gradient-hero)]">
              any range of ayahs
            </span>
          </h2>
          <p className="text-muted-foreground max-w-2xl">
            Choose a Surah, pick a range, and play or download individual MP3s — or grab the full
            range as a ZIP.
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] p-6 md:p-8 mb-8">
          <div className="grid gap-5 md:grid-cols-12">
            <div className="md:col-span-5">
              <Label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Surah
              </Label>
              <Select
                value={String(surahNum)}
                onValueChange={(v) => setSurahNum(Number(v))}
              >
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {SURAHS.map((s) => (
                    <SelectItem key={s.n} value={String(s.n)}>
                      <span className="tabular-nums text-muted-foreground mr-2">
                        {String(s.n).padStart(3, "0")}
                      </span>
                      {s.a}
                      <span className="text-muted-foreground ml-2">· {s.c} ayahs</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                From
              </Label>
              <Input
                type="number"
                min={1}
                max={surah.c}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                className="h-12 tabular-nums"
              />
            </div>
            <div className="md:col-span-2">
              <Label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                To
              </Label>
              <Input
                type="number"
                min={start}
                max={surah.c}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                className="h-12 tabular-nums"
              />
            </div>

            <div className="md:col-span-3">
              <Label className="mb-2 block text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Reciter
              </Label>
              <Select value={reciter} onValueChange={(v) => setReciter(v as ReciterId)}>
                <SelectTrigger className="h-12">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECITERS.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3 justify-between">
            <div className="text-sm text-muted-foreground">
              <span className="text-2xl ml-1" dir="rtl" style={{ fontFamily: "Amiri, serif" }}>
                {surah.ar}
              </span>
              <span className="ml-3">
                {end - start + 1} ayah{end - start + 1 !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={fetchAyahs}
                disabled={loading}
                size="lg"
                className="bg-[var(--gradient-hero)] hover:opacity-90 text-primary-foreground shadow-[var(--shadow-soft)]"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Load ayahs"}
              </Button>
              <Button
                onClick={downloadZip}
                disabled={zipping || ayahs.length === 0}
                size="lg"
                variant="outline"
              >
                {zipping ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Package className="w-4 h-4" />
                )}
                Download ZIP
              </Button>
            </div>
          </div>
        </section>

        {ayahs.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
                {surah.a} · {ayahs[0].ayah}–{ayahs[ayahs.length - 1].ayah}
              </h3>
              <div className="flex items-center gap-1 rounded-lg border border-border bg-card p-1 text-xs">
                {(
                  [
                    { v: "off", label: "Off" },
                    { v: "next", label: "Next" },
                    { v: "one", label: "Repeat 1" },
                    { v: "all", label: "Repeat all" },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setPlayMode(opt.v)}
                    className={`px-2.5 py-1 rounded-md transition-colors ${
                      playMode === opt.v
                        ? "bg-[var(--gradient-hero)] text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <ul className="space-y-2">
              {ayahs.length > 1 && (() => {
                const rangeStart = ayahs[0].ayah;
                const rangeEnd = ayahs[ayahs.length - 1].ayah;
                const mergedSrc = `/api/merged?surah=${surahNum}&start=${rangeStart}&end=${rangeEnd}&reciter=${reciter}`;
                const mergedIdx = -1;
                const isPlaying = playingIdx === mergedIdx;
                return (
                  <li
                    className={`group flex items-center gap-4 rounded-xl border-2 px-4 py-3 transition-all hover:shadow-[var(--shadow-soft)] bg-[var(--gradient-surface)] ${
                      isPlaying ? "border-primary/50 shadow-[var(--shadow-soft)]" : "border-[var(--gold)]/40"
                    }`}
                  >
                    <button
                      onClick={() => {
                        const el = audioRefs.current[mergedIdx];
                        if (!el) return;
                        if (isPlaying && !el.paused) {
                          el.pause();
                          setPlayingIdx(null);
                        } else {
                          audioRefs.current.forEach((a, i) => {
                            if (a && i !== mergedIdx) a.pause();
                          });
                          el.play();
                          setPlayingIdx(mergedIdx);
                        }
                      }}
                      className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${
                        isPlaying
                          ? "bg-[var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-glow)]"
                          : "bg-[var(--gold)] text-[var(--gold-foreground)] hover:opacity-90"
                      }`}
                      aria-label={isPlaying ? "Pause merged" : "Play merged"}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5" fill="currentColor" />
                      ) : (
                        <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3">
                        <span className="text-xs uppercase tracking-wider text-[var(--gold-foreground)]/70 font-semibold">
                          Full range
                        </span>
                        <span className="text-lg font-semibold tabular-nums">
                          {rangeStart}–{rangeEnd}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          ({rangeEnd - rangeStart + 1} ayahs merged)
                        </span>
                      </div>
                      <audio
                        ref={(el) => {
                          audioRefs.current[mergedIdx] = el;
                        }}
                        src={mergedSrc}
                        onEnded={() => setPlayingIdx(null)}
                        controls
                        preload="none"
                        className="w-full mt-1 h-8"
                      />
                    </div>

                    <a
                      href={`${mergedSrc}&download=1`}
                      className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label="Download merged audio"
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </li>
                );
              })()}
              {ayahs.map((a, idx) => {
                const isPlaying = playingIdx === idx;
                return (
                  <li
                    key={a.ayah}
                    className={`group flex items-center gap-4 rounded-xl border border-border bg-card px-4 py-3 transition-all hover:shadow-[var(--shadow-soft)] ${
                      isPlaying ? "border-primary/40 shadow-[var(--shadow-soft)]" : ""
                    }`}
                  >
                    <button
                      onClick={() => togglePlay(idx)}
                      className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${
                        isPlaying
                          ? "bg-[var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-glow)]"
                          : "bg-secondary text-foreground hover:bg-accent"
                      }`}
                      aria-label={isPlaying ? "Pause" : "Play"}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5" fill="currentColor" />
                      ) : (
                        <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline gap-3">
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">
                          Ayah
                        </span>
                        <span className="text-lg font-semibold tabular-nums">{a.ayah}</span>
                      </div>
                      <audio
                        ref={(el) => {
                          audioRefs.current[idx] = el;
                        }}
                        src={a.audioUrl}
                        onEnded={() => handleEnded(idx)}
                        onPause={() => {
                          if (playingIdx === idx && audioRefs.current[idx]?.paused) {
                            // user paused via native controls
                          }
                        }}
                        controls
                        preload="none"
                        className="w-full mt-1 h-8"
                      />
                    </div>

                    <a
                      href={a.audioUrl}
                      download={`${String(surahNum).padStart(3, "0")}-${String(a.ayah).padStart(3, "0")}.mp3`}
                      className="shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                      aria-label={`Download ayah ${a.ayah}`}
                    >
                      <Download className="w-4 h-4" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <footer className="mt-16 pt-8 border-t border-border/60 text-xs text-muted-foreground text-center">
          Audio courtesy of{" "}
          <a href="https://everyayah.com" className="underline hover:text-foreground">
            everyayah.com
          </a>
          {" · "}Cached at the edge for fast playback.
        </footer>
      </main>
    </div>
  );
}
