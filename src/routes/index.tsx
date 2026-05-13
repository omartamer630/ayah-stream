import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, Loader2, Package, Star, BookOpenText } from "lucide-react";
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
  const [favorites, setFavorites] = useState<string[]>([]);
  const audioRefs = useRef<Array<HTMLAudioElement | null>>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("quran-fav-reciters");
      if (raw) setFavorites(JSON.parse(raw));
      const lastReciter = localStorage.getItem("quran-last-reciter");
      if (lastReciter && RECITERS.some((r) => r.id === lastReciter)) {
        setReciter(lastReciter as ReciterId);
      }
    } catch {}
  }, []);

  // Persist reciter selection
  useEffect(() => {
    try {
      localStorage.setItem("quran-last-reciter", reciter);
    } catch {}
  }, [reciter]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("quran-fav-reciters", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const sortedReciters = useMemo(() => {
    const favSet = new Set(favorites);
    const favs = RECITERS.filter((r) => favSet.has(r.id));
    const rest = RECITERS.filter((r) => !favSet.has(r.id));
    return { favs, rest };
  }, [favorites]);

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
    <div className="min-h-screen bg-background text-foreground selection:bg-[var(--gold)]/30">
      {/* Header */}
      <header className="max-w-5xl mx-auto px-6 py-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center shadow-[var(--shadow-deep)]">
            <BookOpenText className="w-6 h-6 text-[var(--gold)]" strokeWidth={1.5} />
          </div>
          <div>
            <h1
              className="font-semibold text-base tracking-[0.25em] uppercase"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Quran Audio
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1">
              Surah &amp; Ayah range player
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-24">
        {/* Hero */}
        <section className="mb-14">
          <h2
            className="text-5xl md:text-6xl mb-6 leading-[1.05] text-foreground"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Listen and
            <br />
            <span className="italic font-normal text-foreground/90">download</span>
          </h2>
          <p className="max-w-xl text-muted-foreground leading-relaxed">
            Choose a Surah, pick a range, and play or download individual MP3s — or grab the full
            range as a ZIP.
          </p>
        </section>

        {/* Control panel */}
        <section className="relative bg-secondary border border-border rounded-3xl p-6 md:p-8 shadow-[var(--shadow-soft)] mb-10">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
            <div className="md:col-span-5 space-y-2.5">
              <Label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                Surah
              </Label>
              <Select value={String(surahNum)} onValueChange={(v) => setSurahNum(Number(v))}>
                <SelectTrigger className="h-12 bg-card border-border rounded-xl focus:ring-2 focus:ring-[var(--gold)]">
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

            <div className="md:col-span-2 space-y-2.5">
              <Label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                From
              </Label>
              <Input
                type="number"
                min={1}
                max={surah.c}
                value={start}
                onChange={(e) => setStart(Number(e.target.value))}
                className="h-12 bg-card border-border rounded-xl tabular-nums focus-visible:ring-[var(--gold)]"
              />
            </div>

            <div className="md:col-span-2 space-y-2.5">
              <Label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                To
              </Label>
              <Input
                type="number"
                min={start}
                max={surah.c}
                value={end}
                onChange={(e) => setEnd(Number(e.target.value))}
                className="h-12 bg-card border-border rounded-xl tabular-nums focus-visible:ring-[var(--gold)]"
              />
            </div>

            <div className="md:col-span-3 space-y-2.5">
              <div className="flex justify-between items-end">
                <Label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  Reciter
                </Label>
                <button
                  type="button"
                  onClick={() => toggleFavorite(reciter)}
                  aria-label={favorites.includes(reciter) ? "Remove favorite" : "Add favorite"}
                  className="text-[var(--gold)] hover:text-[var(--gold)]/80 transition-colors"
                >
                  <Star
                    className={`w-4 h-4 ${
                      favorites.includes(reciter) ? "fill-[var(--gold)]" : ""
                    }`}
                  />
                </button>
              </div>
              <Select value={reciter} onValueChange={(v) => setReciter(v as ReciterId)}>
                <SelectTrigger className="h-12 bg-card border-border rounded-xl focus:ring-2 focus:ring-[var(--gold)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {sortedReciters.favs.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
                        <Star className="w-3 h-3 fill-[var(--gold)] text-[var(--gold)]" />
                        Favorites
                      </div>
                      {sortedReciters.favs.map((r) => (
                        <SelectItem key={`fav-${r.id}`} value={r.id} className="pr-10">
                          <span className="truncate">{r.name}</span>
                          {r.bitrate && (
                            <span className="text-muted-foreground ml-2 text-xs">· {r.bitrate}</span>
                          )}
                        </SelectItem>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                        All reciters
                      </div>
                    </>
                  )}
                  {sortedReciters.rest.map((r) => (
                    <SelectItem key={r.id} value={r.id} className="pr-10">
                      <span className="truncate">{r.name}</span>
                      {r.bitrate && (
                        <span className="text-muted-foreground ml-2 text-xs">· {r.bitrate}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5 pt-6 border-t border-border">
            <div className="flex items-center gap-5 flex-wrap">
              <div
                className="text-3xl text-foreground font-bold tracking-tight"
                dir="rtl"
                style={{ fontFamily: "var(--font-arabic)" }}
              >
                {surah.ar}
              </div>
              <div className="hidden md:block h-4 w-px bg-border" />
              <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
                {end - start + 1} ayah{end - start + 1 !== 1 ? "s" : ""} loaded
              </div>
            </div>
            <div className="flex gap-3 flex-wrap w-full md:w-auto">
              <Button
                onClick={fetchAyahs}
                disabled={loading}
                size="lg"
                className="px-8 h-12 bg-primary text-primary-foreground rounded-xl font-semibold tracking-wide hover:bg-primary/90 transition-all shadow-[var(--shadow-deep)] active:scale-[0.98]"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading…
                  </>
                ) : (
                  "Load Ayahs"
                )}
              </Button>
              <Button
                onClick={downloadZip}
                disabled={zipping || ayahs.length === 0}
                size="lg"
                variant="outline"
                className="px-6 h-12 bg-card border-border rounded-xl font-semibold hover:bg-background transition-all active:scale-[0.98]"
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
          <>
            {/* Range player banner */}
            {ayahs.length > 1 && (() => {
              const rangeStart = ayahs[0].ayah;
              const rangeEnd = ayahs[ayahs.length - 1].ayah;
              const mergedSrc = `/api/merged?surah=${surahNum}&start=${rangeStart}&end=${rangeEnd}&reciter=${reciter}`;
              const mergedIdx = -1;
              const isPlaying = playingIdx === mergedIdx;
              return (
                <section className="mb-10">
                  <div className="bg-primary text-primary-foreground rounded-3xl p-6 md:p-8 shadow-[var(--shadow-deep)]">
                    <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
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
                        className="w-16 h-16 rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] flex items-center justify-center hover:scale-105 transition-transform shrink-0 shadow-lg"
                        aria-label={isPlaying ? "Pause range" : "Play range"}
                      >
                        {isPlaying ? (
                          <Pause className="w-7 h-7" fill="currentColor" />
                        ) : (
                          <Play className="w-7 h-7 ml-1" fill="currentColor" />
                        )}
                      </button>

                      <div className="flex-1 w-full space-y-3 min-w-0">
                        <div className="flex justify-between text-[var(--gold)] text-[10px] uppercase font-bold tracking-[0.2em]">
                          <span>
                            Full range · {rangeStart}–{rangeEnd}
                          </span>
                          <span className="hidden sm:inline">
                            {rangeEnd - rangeStart + 1} ayahs merged
                          </span>
                        </div>
                        <audio
                          ref={(el) => {
                            audioRefs.current[mergedIdx] = el;
                          }}
                          src={mergedSrc}
                          onEnded={() => {
                            if (playMode === "one" || playMode === "all") {
                              const el = audioRefs.current[mergedIdx];
                              if (el) {
                                el.currentTime = 0;
                                el.play();
                                return;
                              }
                            }
                            setPlayingIdx(null);
                          }}
                          controls
                          preload="none"
                          className="w-full h-8"
                        />
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="flex bg-white/5 p-1 rounded-xl">
                          {(
                            [
                              { v: "off", label: "Off" },
                              { v: "next", label: "Next" },
                              { v: "one", label: "One" },
                              { v: "all", label: "All" },
                            ] as const
                          ).map((opt) => (
                            <button
                              key={opt.v}
                              onClick={() => setPlayMode(opt.v)}
                              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-tighter transition-colors ${
                                playMode === opt.v
                                  ? "bg-white/15 text-white"
                                  : "text-white/50 hover:text-white"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                        <a
                          href={`${mergedSrc}&download=1`}
                          className="w-10 h-10 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors"
                          aria-label="Download merged audio"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Ayah list */}
            <section>
              <div className="mb-5 flex items-center gap-3">
                <h3
                  className="text-xs font-bold uppercase tracking-[0.25em] text-muted-foreground"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {surah.a} · {ayahs[0].ayah}–{ayahs[ayahs.length - 1].ayah}
                </h3>
                <div className="flex-1 h-px bg-border" />
              </div>

              <ul className="space-y-4">
                {ayahs.map((a, idx) => {
                  const isPlaying = playingIdx === idx;
                  return (
                    <li
                      key={a.ayah}
                      className={`bg-card border border-border rounded-2xl overflow-hidden transition-all duration-300 ${
                        isPlaying ? "shadow-[var(--shadow-deep)] border-[var(--gold)]/40" : "hover:shadow-[var(--shadow-soft)]"
                      }`}
                    >
                      <div className="flex items-stretch">
                        <div
                          className="w-14 md:w-16 bg-secondary border-r border-border flex items-center justify-center text-muted-foreground text-lg shrink-0"
                          style={{ fontFamily: "var(--font-display)" }}
                        >
                          {a.ayah}
                        </div>
                        <div className="flex-1 p-5 md:p-7 min-w-0">
                          <div
                            className="text-right text-2xl md:text-3xl text-muted-foreground/80 mb-5"
                            dir="rtl"
                            style={{ fontFamily: "var(--font-arabic)" }}
                          >
                            <span className="text-[var(--gold)]">﴿{a.ayah}﴾</span>
                          </div>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => togglePlay(idx)}
                              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all shrink-0 ${
                                isPlaying
                                  ? "bg-[var(--gold)] text-[var(--gold-foreground)] shadow-[var(--shadow-glow)]"
                                  : "border border-border text-foreground hover:bg-[var(--gold)] hover:text-[var(--gold-foreground)] hover:border-[var(--gold)]"
                              }`}
                              aria-label={isPlaying ? "Pause" : "Play"}
                            >
                              {isPlaying ? (
                                <Pause className="w-5 h-5" fill="currentColor" />
                              ) : (
                                <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                              )}
                            </button>
                            <audio
                              ref={(el) => {
                                audioRefs.current[idx] = el;
                              }}
                              src={a.audioUrl}
                              onEnded={() => handleEnded(idx)}
                              controls
                              preload="none"
                              className="flex-1 h-9"
                            />
                            <a
                              href={a.audioUrl}
                              download={`${String(surahNum).padStart(3, "0")}-${String(a.ayah).padStart(3, "0")}.mp3`}
                              className="w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                              aria-label={`Download ayah ${a.ayah}`}
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          </div>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </>
        )}

        <footer className="mt-20 pt-10 border-t border-border text-center">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Audio courtesy of{" "}
            <a href="https://everyayah.com" className="text-[var(--gold)] hover:underline">
              everyayah.com
            </a>{" "}
            · Cached at the edge
          </p>
        </footer>
      </main>
    </div>
  );
}
