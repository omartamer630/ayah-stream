import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Download, Pause, Play, Loader2, Package, Star, BookOpenText, Moon, Sun, Languages, SkipBack, SkipForward, Bookmark, BookmarkCheck, RotateCcw, X, GraduationCap, Repeat, Keyboard } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  text?: string;
}

interface ResumeState {
  surah: number;
  ayah: number;
  reciter: ReciterId;
  start: number;
  end: number;
  at: number;
}

interface BookmarkItem {
  id: string; // `${surah}-${ayah}-${reciter}`
  surah: number;
  ayah: number;
  reciter: ReciterId;
  savedAt: number;
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
  const [favSurahs, setFavSurahs] = useState<number[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const audioRefs = useRef<Array<HTMLAudioElement | null>>([]);
  const [openText, setOpenText] = useState<Record<number, boolean>>({});
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [nowTime, setNowTime] = useState(0);
  const [nowDur, setNowDur] = useState(0);
  const [resume, setResume] = useState<ResumeState | null>(null);
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [pendingPlayAyah, setPendingPlayAyah] = useState<number | null>(null);
  // Memorization / Hifz mode
  const [memMode, setMemMode] = useState(false);
  const [memFrom, setMemFrom] = useState(1);
  const [memTo, setMemTo] = useState(1);
  const [memRepeats, setMemRepeats] = useState(3);
  const [memCurrentRep, setMemCurrentRep] = useState(1);
  const [helpOpen, setHelpOpen] = useState(false);


  // Theme: hydrate + persist
  useEffect(() => {
    const stored = localStorage.getItem("quran-theme");
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches;
    const initial: "light" | "dark" =
      stored === "dark" || stored === "light" ? stored : prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);
  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    localStorage.setItem("quran-theme", next);
  };

  // Language (en | ar) — controls UI strings + RTL direction
  const [lang, setLang] = useState<"en" | "ar">("en");
  useEffect(() => {
    const stored = localStorage.getItem("quran-lang");
    const initial: "en" | "ar" = stored === "ar" ? "ar" : "en";
    setLang(initial);
    document.documentElement.setAttribute("lang", initial);
    document.documentElement.setAttribute("dir", initial === "ar" ? "rtl" : "ltr");
  }, []);
  const toggleLang = () => {
    const next = lang === "ar" ? "en" : "ar";
    setLang(next);
    document.documentElement.setAttribute("lang", next);
    document.documentElement.setAttribute("dir", next === "ar" ? "rtl" : "ltr");
    localStorage.setItem("quran-lang", next);
  };
  const isAr = lang === "ar";
  const t = (en: string, ar: string) => (isAr ? ar : en);
  const arabicDigits = (n: number | string) =>
    String(n).replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[Number(d)]);
  const num = (n: number | string) => (isAr ? arabicDigits(n) : String(n));

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem("quran-fav-reciters");
      if (raw) setFavorites(JSON.parse(raw));
      const rawSurahs = localStorage.getItem("quran-fav-surahs");
      if (rawSurahs) setFavSurahs(JSON.parse(rawSurahs));
      const lastReciter = localStorage.getItem("quran-last-reciter");
      const lastSurah = localStorage.getItem("quran-last-surah");
      const lastStart = localStorage.getItem("quran-last-start");
      const lastEnd = localStorage.getItem("quran-last-end");

      let s = 1;
      let st = 1;
      let en = 7;
      let rec: ReciterId = "Alafasy_128kbps";
      if (lastSurah) {
        const n = Number(lastSurah);
        const found = SURAHS.find((x) => x.n === n);
        if (found) {
          s = found.n;
          en = Math.min(found.c, 7);
        }
      }
      if (lastStart) st = Math.max(1, Number(lastStart));
      if (lastEnd) en = Number(lastEnd);
      if (lastReciter && RECITERS.some((r) => r.id === lastReciter)) {
        rec = lastReciter as ReciterId;
      }
      const surahDef = SURAHS.find((x) => x.n === s)!;
      st = Math.min(Math.max(1, st), surahDef.c);
      en = Math.min(Math.max(st, en), surahDef.c);

      setSurahNum(s);
      setStart(st);
      setEnd(en);
      setReciter(rec);
      setAyahs(
        Array.from({ length: en - st + 1 }, (_, i) => ({
          ayah: st + i,
          audioUrl: ayahAudioUrl(rec, s, st + i),
        })),
      );
    } catch {}
    try {
      const rawResume = localStorage.getItem("quran-resume");
      if (rawResume) setResume(JSON.parse(rawResume));
      const rawBm = localStorage.getItem("quran-bookmarks");
      if (rawBm) setBookmarks(JSON.parse(rawBm));
    } catch {}
    setHydrated(true);
  }, []);

  const saveResume = (surahN: number, ayahN: number, rec: ReciterId, st: number, en: number) => {
    const r: ResumeState = { surah: surahN, ayah: ayahN, reciter: rec, start: st, end: en, at: Date.now() };
    setResume(r);
    try { localStorage.setItem("quran-resume", JSON.stringify(r)); } catch {}
  };

  const clearResume = () => {
    setResume(null);
    try { localStorage.removeItem("quran-resume"); } catch {}
  };

  const bookmarkId = (s: number, a: number, r: ReciterId) => `${s}-${a}-${r}`;
  const isBookmarked = (s: number, a: number, r: ReciterId) =>
    bookmarks.some((b) => b.id === bookmarkId(s, a, r));

  const toggleBookmark = (s: number, a: number, r: ReciterId) => {
    const id = bookmarkId(s, a, r);
    setBookmarks((prev) => {
      const exists = prev.some((b) => b.id === id);
      const next = exists
        ? prev.filter((b) => b.id !== id)
        : [{ id, surah: s, ayah: a, reciter: r, savedAt: Date.now() }, ...prev];
      try { localStorage.setItem("quran-bookmarks", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  // Persist selections
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem("quran-last-reciter", reciter);
      localStorage.setItem("quran-last-surah", String(surahNum));
      localStorage.setItem("quran-last-start", String(start));
      localStorage.setItem("quran-last-end", String(end));
    } catch {}
  }, [reciter, surahNum, start, end, hydrated]);

  const toggleFavorite = (id: string) => {
    setFavorites((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      try {
        localStorage.setItem("quran-fav-reciters", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const toggleFavSurah = (n: number) => {
    setFavSurahs((prev) => {
      const next = prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n];
      try {
        localStorage.setItem("quran-fav-surahs", JSON.stringify(next));
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

  const sortedSurahs = useMemo(() => {
    const favSet = new Set(favSurahs);
    const favs = SURAHS.filter((s) => favSet.has(s.n));
    const rest = SURAHS.filter((s) => !favSet.has(s.n));
    return { favs, rest };
  }, [favSurahs]);

  const surah = useMemo(() => SURAHS.find((s) => s.n === surahNum)!, [surahNum]);

  useEffect(() => {
    if (start > surah.c) setStart(1);
    if (end > surah.c) setEnd(surah.c);
  }, [surahNum, surah.c, start, end]);

  const fetchAyahsWith = async (
    s: number,
    st: number,
    en: number,
    rec: ReciterId,
  ): Promise<AyahItem[] | null> => {
    const surahDef = SURAHS.find((x) => x.n === s);
    if (!surahDef || st < 1 || en < st || en > surahDef.c) {
      toast.error(`Invalid range.`);
      return null;
    }
    setLoading(true);
    setPlayingIdx(null);
    try {
      const res = await fetch(`/api/surah/${s}?start=${st}&end=${en}&reciter=${rec}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setAyahs(data.ayahs);
      return data.ayahs as AyahItem[];
    } catch (e) {
      toast.error(`Failed to load: ${(e as Error).message}`);
      return null;
    } finally {
      setLoading(false);
    }
  };

  const fetchAyahs = () => fetchAyahsWith(surahNum, start, end, reciter);

  const playIdx = (idx: number) => {
    audioRefs.current.forEach((a, i) => {
      if (a && i !== idx) a.pause();
    });
    const merged = audioRefs.current[-1];
    if (merged && idx !== -1) merged.pause();
    const el = audioRefs.current[idx];
    if (!el) return;
    setNowTime(0);
    setNowDur(Number.isFinite(el.duration) ? el.duration : 0);
    el.play();
    setPlayingIdx(idx);
    const a = ayahs[idx];
    if (a) saveResume(surahNum, a.ayah, reciter, start, end);
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

  const playPrev = () => {
    if (playingIdx == null || playingIdx <= 0) return;
    playIdx(playingIdx - 1);
  };
  const playNext = () => {
    if (playingIdx == null || playingIdx + 1 >= ayahs.length) return;
    playIdx(playingIdx + 1);
  };
  const playFromStart = () => {
    if (ayahs.length === 0) return;
    setPlayMode("next");
    playIdx(0);
  };

  // Jump to a specific surah/ayah/reciter (used by Resume + Bookmarks)
  const jumpTo = async (
    s: number,
    ayahN: number,
    rec: ReciterId,
    range?: { start: number; end: number },
    autoplay = true,
  ) => {
    const surahDef = SURAHS.find((x) => x.n === s);
    if (!surahDef) return;
    const st = Math.max(1, Math.min(range?.start ?? ayahN, surahDef.c));
    const en = Math.max(st, Math.min(range?.end ?? Math.min(ayahN + 6, surahDef.c), surahDef.c));
    const safeAyah = Math.min(Math.max(ayahN, st), en);
    setSurahNum(s);
    setStart(st);
    setEnd(en);
    setReciter(rec);
    const data = await fetchAyahsWith(s, st, en, rec);
    if (data && autoplay) setPendingPlayAyah(safeAyah);
  };

  // When ayahs load & a pending ayah is queued, play it once audio refs mount
  useEffect(() => {
    if (pendingPlayAyah == null || ayahs.length === 0) return;
    const i = ayahs.findIndex((a) => a.ayah === pendingPlayAyah);
    if (i < 0) {
      setPendingPlayAyah(null);
      return;
    }
    const timer = setTimeout(() => {
      playIdx(i);
      setPendingPlayAyah(null);
    }, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlayAyah, ayahs]);


  // Auto-scroll currently playing ayah into view
  useEffect(() => {
    if (playingIdx == null || playingIdx < 0) return;
    const a = ayahs[playingIdx];
    if (!a) return;
    const el = document.getElementById(`ayah-${a.ayah}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [playingIdx, ayahs]);

  // Reset memorization range whenever loaded ayahs change
  useEffect(() => {
    if (ayahs.length === 0) return;
    setMemFrom(ayahs[0].ayah);
    setMemTo(Math.min(ayahs[0].ayah, ayahs[ayahs.length - 1].ayah));
    setMemCurrentRep(1);
  }, [ayahs]);

  // Keyboard shortcuts for playback modes and navigation
  useEffect(() => {
    const isTyping = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false;
      return (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      );
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTyping(e.target)) return;

      switch (e.key.toLowerCase()) {
        case "s":
          e.preventDefault();
          setPlayMode("off");
          toast.info(t("Repeat mode: Stop", "وضع التكرار: إيقاف"));
          break;
        case "n":
          e.preventDefault();
          setPlayMode("next");
          toast.info(t("Repeat mode: Next", "وضع التكرار: التالي"));
          break;
        case "r":
          e.preventDefault();
          setPlayMode("one");
          toast.info(t("Repeat mode: Repeat", "وضع التكرار: إعادة"));
          break;
        case "l":
          e.preventDefault();
          setPlayMode("all");
          toast.info(t("Repeat mode: Loop", "وضع التكرار: كرر"));
          break;
      }

      // Arrow keys: navigate ayahs (no toast, just act)
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        playPrev();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        playNext();
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setHelpOpen((v) => !v);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [t]);


  const handleEnded = (idx: number) => {
    // Memorization mode takes precedence
    if (memMode && ayahs.length > 0) {
      const cur = ayahs[idx];
      if (cur) {
        // If we are still inside the current range, advance ayah-by-ayah
        if (cur.ayah < memTo) {
          const nextIdx = ayahs.findIndex((a) => a.ayah === cur.ayah + 1);
          if (nextIdx >= 0) {
            playIdx(nextIdx);
            return;
          }
        }
        // End of range reached — repeat or advance
        if (memCurrentRep < memRepeats) {
          setMemCurrentRep((n) => n + 1);
          const startIdx = ayahs.findIndex((a) => a.ayah === memFrom);
          if (startIdx >= 0) {
            playIdx(startIdx);
            return;
          }
        }
        // Advance to next range of the same size
        const size = memTo - memFrom + 1;
        const nextFrom = memTo + 1;
        const nextTo = Math.min(nextFrom + size - 1, ayahs[ayahs.length - 1].ayah);
        const nextIdx = ayahs.findIndex((a) => a.ayah === nextFrom);
        if (nextIdx >= 0 && nextFrom <= ayahs[ayahs.length - 1].ayah) {
          setMemFrom(nextFrom);
          setMemTo(nextTo);
          setMemCurrentRep(1);
          playIdx(nextIdx);
          return;
        }
        // Nothing left
        toast.success(t("Memorization session complete", "اكتملت جلسة الحفظ"));
        setPlayingIdx(null);
        setMemCurrentRep(1);
        return;
      }
    }

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
              style={{ fontFamily: isAr ? "var(--font-arabic)" : "var(--font-display)" }}
            >
              {t("Quran Audio", "صوتيات القرآن")}
            </h1>
            <p
              className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground mt-1"
              style={isAr ? { fontFamily: "var(--font-arabic)", letterSpacing: 0 } : undefined}
            >
              {t("Surah & Ayah range player", "مشغّل السور والآيات")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={toggleLang}
            aria-label="Toggle language"
            title={isAr ? "English" : "العربية"}
            className="rounded-full border-border/60 gap-1 w-auto px-3"
          >
            <Languages className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-wider">
              {isAr ? "EN" : "ع"}
            </span>
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="rounded-full border-border/60"
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 text-[var(--gold)]" />
            ) : (
              <Moon className="w-4 h-4" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setHelpOpen(true)}
            aria-label={t("Keyboard shortcuts", "اختصارات لوحة المفاتيح")}
            title={t("Keyboard shortcuts (press ?)", "اختصارات لوحة المفاتيح (اضغط ?)")}
            className="rounded-full border-border/60"
          >
            <Keyboard className="w-4 h-4" />
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-24">
        {/* Hero */}
        <section className="mb-14">
          <h2
            className="text-5xl md:text-6xl mb-6 leading-[1.05] text-foreground"
            style={{ fontFamily: isAr ? "var(--font-arabic)" : "var(--font-display)" }}
          >
            {isAr ? (
              <>
                استمع
                <br />
                <span className="font-normal text-foreground/90">وحمّل</span>
              </>
            ) : (
              <>
                Listen and
                <br />
                <span className="italic font-normal text-foreground/90">download</span>
              </>
            )}
          </h2>
          <p
            className="max-w-xl text-muted-foreground leading-relaxed"
            style={isAr ? { fontFamily: "var(--font-arabic)", fontSize: "1.125rem" } : undefined}
          >
            {t(
              "Choose a Surah, pick a range, and play or download individual MP3s — or grab the full range as a ZIP.",
              "اختر سورة وحدّد نطاق الآيات، ثم استمع أو حمّل كل آية على حدة، أو احصل على النطاق كاملًا في ملف مضغوط.",
            )}
          </p>
        </section>

        {/* Resume banner */}
        {hydrated && resume && (() => {
          const rSurah = SURAHS.find((s) => s.n === resume.surah);
          const rRec = RECITERS.find((r) => r.id === resume.reciter);
          if (!rSurah) return null;
          return (
            <section className="mb-6">
              <div className="relative bg-card border border-[var(--gold)]/40 rounded-2xl p-4 md:p-5 shadow-[var(--shadow-soft)] flex flex-col md:flex-row items-start md:items-center gap-4">
                <button
                  onClick={() =>
                    jumpTo(resume.surah, resume.ayah, resume.reciter, {
                      start: resume.start,
                      end: resume.end,
                    })
                  }
                  className="w-12 h-12 rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] flex items-center justify-center hover:scale-105 transition-transform shrink-0 shadow-[var(--shadow-glow)]"
                  aria-label={t("Resume last position", "استئناف من آخر موضع")}
                >
                  <Play className="w-5 h-5 ml-0.5" fill="currentColor" />
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--gold)] mb-1 flex items-center gap-1.5">
                    <RotateCcw className="w-3 h-3" />
                    {t("Resume where you left off", "استئناف من حيث توقفت")}
                  </div>
                  <div className="text-sm text-foreground truncate">
                    <span className="font-semibold" style={{ fontFamily: isAr ? "var(--font-arabic)" : undefined }}>
                      {isAr ? rSurah.ar : rSurah.a}
                    </span>
                    <span className="text-muted-foreground mx-2">·</span>
                    <span className="tabular-nums">
                      <bdi>{t("Ayah", "آية")} {num(resume.ayah)}</bdi>
                    </span>
                    {rRec && (
                      <>
                        <span className="text-muted-foreground mx-2">·</span>
                        <span className="text-muted-foreground text-xs">{rRec.name}</span>
                      </>
                    )}
                  </div>
                </div>
                <button
                  onClick={clearResume}
                  aria-label={t("Dismiss", "إغلاق")}
                  className="absolute top-3 right-3 md:static w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </section>
          );
        })()}

        {/* Control panel */}
        <section className="relative bg-secondary border border-border rounded-3xl p-6 md:p-8 shadow-[var(--shadow-soft)] mb-10">

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 mb-8">
            <div className="md:col-span-7 space-y-2.5">
              <div className="flex justify-between items-end">
                <Label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                  {t("Surah", "السورة")}
                </Label>
                <button
                  type="button"
                  onClick={() => toggleFavSurah(surahNum)}
                  aria-label={favSurahs.includes(surahNum) ? "Remove favorite surah" : "Add favorite surah"}
                  className="text-[var(--gold)] hover:text-[var(--gold)]/80 transition-colors"
                >
                  <Star
                    className={`w-4 h-4 ${favSurahs.includes(surahNum) ? "fill-[var(--gold)]" : ""}`}
                  />
                </button>
              </div>
              <Select value={String(surahNum)} onValueChange={(v) => setSurahNum(Number(v))}>
                <SelectTrigger className="h-12 bg-card border-border rounded-xl focus:ring-2 focus:ring-[var(--gold)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  {sortedSurahs.favs.length > 0 && (
                    <>
                      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1.5">
                        <Star className="w-3 h-3 fill-[var(--gold)] text-[var(--gold)]" />
                        {t("Favorites", "المفضّلة")}
                      </div>
                      {sortedSurahs.favs.map((s) => (
                        <SelectItem key={`fav-${s.n}`} value={String(s.n)}>
                          <span className="tabular-nums text-muted-foreground mr-2">
                            {num(String(s.n).padStart(3, "0"))}
                          </span>
                          {isAr ? (
                            <span style={{ fontFamily: "var(--font-arabic)" }}>{s.ar}</span>
                          ) : (
                            s.a
                          )}
                          <span className="text-muted-foreground mx-2">
                            · <bdi>{num(s.c)}</bdi> {t("ayahs", "آية")}
                          </span>
                        </SelectItem>
                      ))}
                      <div className="my-1 border-t border-border" />
                      <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                        {t("All surahs", "جميع السور")}
                      </div>
                    </>
                  )}
                  {sortedSurahs.rest.map((s) => (
                    <SelectItem key={s.n} value={String(s.n)}>
                      <span className="tabular-nums text-muted-foreground mr-2">
                        {num(String(s.n).padStart(3, "0"))}
                      </span>
                      {isAr ? (
                        <span style={{ fontFamily: "var(--font-arabic)" }}>{s.ar}</span>
                      ) : (
                        s.a
                      )}
                      <span className="text-muted-foreground mx-2">
                        · <bdi>{num(s.c)}</bdi> {t("ayahs", "آية")}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2 space-y-2.5">
              <Label className="block text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                {t("From", "من")}
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
                {t("To", "إلى")}
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
                  {t("Reciter", "القارئ")}
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
                        {t("Favorites", "المفضّلة")}
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
                        {t("All reciters", "جميع القرّاء")}
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
                {isAr
                  ? <><bdi>{num(end - start + 1)}</bdi> {"آية محمّلة"}</>
                  : <><bdi>{end - start + 1}</bdi> {`ayah${end - start + 1 !== 1 ? "s" : ""} loaded`}</>}
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
                    {t("Loading…", "جارٍ التحميل…")}
                  </>
                ) : (
                  t("Load Ayahs", "تحميل الآيات")
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
                {isAr ? <>تنزيل <bdi>ZIP</bdi></> : "Download ZIP"}
              </Button>
            </div>
          </div>
        </section>

        {/* Bookmarks strip */}
        {hydrated && bookmarks.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5">
                <BookmarkCheck className="w-3.5 h-3.5 text-[var(--gold)]" />
                {t("Bookmarks", "الإشارات المرجعية")}
              </h3>
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground tabular-nums">
                <bdi>{num(bookmarks.length)}</bdi>
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
              {bookmarks.map((b) => {
                const bSurah = SURAHS.find((s) => s.n === b.surah);
                if (!bSurah) return null;
                return (
                  <div
                    key={b.id}
                    className="group shrink-0 bg-card border border-border rounded-xl p-3 min-w-[180px] max-w-[220px] hover:border-[var(--gold)]/40 transition-colors flex items-center gap-3"
                  >
                    <button
                      onClick={() => jumpTo(b.surah, b.ayah, b.reciter)}
                      className="w-9 h-9 rounded-full bg-secondary hover:bg-[var(--gold)] hover:text-[var(--gold-foreground)] flex items-center justify-center transition-colors shrink-0"
                      aria-label={t("Play bookmark", "تشغيل الإشارة")}
                    >
                      <Play className="w-4 h-4 ml-0.5" fill="currentColor" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-sm font-semibold text-foreground truncate"
                        style={{ fontFamily: isAr ? "var(--font-arabic)" : undefined }}
                      >
                        {isAr ? bSurah.ar : bSurah.a}
                      </div>
                      <div className="text-[10px] text-muted-foreground tabular-nums">
                        <bdi>{t("Ayah", "آية")} {num(b.ayah)}</bdi>
                      </div>
                    </div>
                    <button
                      onClick={() => toggleBookmark(b.surah, b.ayah, b.reciter)}
                      aria-label={t("Remove bookmark", "إزالة الإشارة")}
                      className="w-7 h-7 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors opacity-0 group-hover:opacity-100 shrink-0"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </section>
        )}



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
                        <div className="flex text-[var(--gold)] text-[10px] uppercase font-bold tracking-[0.2em]">
                          <span>
                            {t("Full range", "النطاق الكامل")} · <bdi>{num(rangeStart)}–{num(rangeEnd)}</bdi>
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
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] font-bold uppercase tracking-[0.15em] text-white/50">
                            {t("Repeat mode", "وضع التكرار")}
                            <span className="ml-1.5 opacity-70 normal-case tracking-normal">
                              S · N · R · L
                            </span>
                          </span>
                          <div className="flex bg-white/5 p-1 rounded-xl">
                            {(
                              [
                                { v: "off", label: t("Stop", "قف") },
                                { v: "next", label: t("Next", "التالي") },
                                { v: "one", label: t("Repeat", "أعد") },
                                { v: "all", label: t("Loop", "كرر") },
                              ] as const
                            ).map((opt) => (
                              <button
                                key={opt.v}
                                onClick={() => setPlayMode(opt.v)}
                                title={
                                  opt.v === "off"
                                    ? t("Stop after this ayah", "قف بعد هذه الآية")
                                    : opt.v === "next"
                                      ? t("Play the next ayah", "شغّل الآية التالية")
                                      : opt.v === "one"
                                        ? t("Repeat this ayah", "كرّر هذه الآية")
                                        : t("Loop the whole range", "كرّر النطاق كله")
                                }
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
                  style={{ fontFamily: isAr ? "var(--font-arabic)" : "var(--font-display)" }}
                >
                  {isAr ? surah.ar : surah.a} · <bdi>{num(ayahs[0].ayah)}–{num(ayahs[ayahs.length - 1].ayah)}</bdi>
                </h3>
                <div className="flex-1 h-px bg-border" />
                <button
                  onClick={playFromStart}
                  className="h-9 px-4 rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] text-[10px] font-bold uppercase tracking-[0.15em] flex items-center gap-2 hover:scale-[1.02] transition-transform shrink-0"
                  aria-label={t("Play full surah continuously", "تشغيل السورة بالكامل")}
                >
                  <Play className="w-3.5 h-3.5" fill="currentColor" />
                  {t("Play full", "تشغيل الكل")}
                </button>
              </div>

              {/* Memorization / Hifz mode panel */}
              {(() => {
                const firstAyah = ayahs[0].ayah;
                const lastAyah = ayahs[ayahs.length - 1].ayah;
                return (
                  <div
                    className={`mb-5 rounded-2xl border p-4 transition-colors ${
                      memMode
                        ? "bg-card border-[var(--gold)]/40 shadow-[var(--shadow-soft)]"
                        : "bg-secondary/50 border-border"
                    }`}
                  >
                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        onClick={() => {
                          setMemMode((v) => !v);
                          setMemCurrentRep(1);
                        }}
                        aria-pressed={memMode}
                        className={`h-9 px-3 rounded-lg flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.15em] transition-colors shrink-0 ${
                          memMode
                            ? "bg-[var(--gold)] text-[var(--gold-foreground)]"
                            : "bg-card border border-border text-foreground hover:bg-background"
                        }`}
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        {t("Hifz mode", "وضع الحفظ")}
                      </button>

                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                          {t("From", "من")}
                        </Label>
                        <Input
                          type="number"
                          min={firstAyah}
                          max={lastAyah}
                          value={memFrom}
                          disabled={!memMode}
                          onChange={(e) => {
                            const v = Math.max(firstAyah, Math.min(Number(e.target.value) || firstAyah, lastAyah));
                            setMemFrom(v);
                            if (memTo < v) setMemTo(v);
                            setMemCurrentRep(1);
                          }}
                          className="h-9 w-20 bg-card border-border rounded-lg tabular-nums text-sm"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                          {t("To", "إلى")}
                        </Label>
                        <Input
                          type="number"
                          min={memFrom}
                          max={lastAyah}
                          value={memTo}
                          disabled={!memMode}
                          onChange={(e) => {
                            const v = Math.max(memFrom, Math.min(Number(e.target.value) || memFrom, lastAyah));
                            setMemTo(v);
                            setMemCurrentRep(1);
                          }}
                          className="h-9 w-20 bg-card border-border rounded-lg tabular-nums text-sm"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <Label className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground flex items-center gap-1">
                          <Repeat className="w-3 h-3" />
                          {t("Repeats", "التكرار")}
                        </Label>
                        <Input
                          type="number"
                          min={1}
                          max={99}
                          value={memRepeats}
                          disabled={!memMode}
                          onChange={(e) => {
                            const v = Math.max(1, Math.min(Number(e.target.value) || 1, 99));
                            setMemRepeats(v);
                          }}
                          className="h-9 w-20 bg-card border-border rounded-lg tabular-nums text-sm"
                        />
                      </div>

                      <button
                        disabled={!memMode}
                        onClick={() => {
                          const startIdx = ayahs.findIndex((a) => a.ayah === memFrom);
                          if (startIdx < 0) return;
                          setMemCurrentRep(1);
                          playIdx(startIdx);
                        }}
                        className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-[10px] font-bold uppercase tracking-[0.15em] flex items-center gap-2 disabled:opacity-40 hover:bg-primary/90 transition-colors shrink-0 ml-auto"
                      >
                        <Play className="w-3.5 h-3.5" fill="currentColor" />
                        {t("Start", "ابدأ")}
                      </button>
                    </div>

                    {memMode && (
                      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between gap-3 text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
                        <span>
                          <bdi>
                            {t("Range", "النطاق")} {num(memFrom)}–{num(memTo)}
                          </bdi>
                        </span>
                        <span className="text-[var(--gold)]">
                          <bdi>
                            {t("Rep", "تكرار")} {num(memCurrentRep)} / {num(memRepeats)}
                          </bdi>
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}


              {/* Sticky continuous now-playing bar */}
              {playingIdx != null && playingIdx >= 0 && ayahs[playingIdx] && (
                <div
                  className="sticky top-2 z-30 mb-4 bg-card/90 backdrop-blur-xl border border-[var(--gold)]/40 rounded-2xl shadow-[var(--shadow-deep)] p-3 flex items-center gap-3"
                  role="region"
                  aria-label={t("Now playing", "قيد التشغيل")}
                >
                  <button
                    onClick={playPrev}
                    disabled={playingIdx <= 0}
                    aria-label={t("Previous ayah", "الآية السابقة")}
                    className="h-9 w-9 rounded-full flex items-center justify-center text-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors shrink-0"
                  >
                    <SkipBack className="w-4 h-4" fill="currentColor" />
                  </button>
                  <button
                    onClick={() => togglePlay(playingIdx)}
                    aria-label={t("Pause", "إيقاف")}
                    className="h-10 w-10 rounded-full bg-[var(--gold)] text-[var(--gold-foreground)] flex items-center justify-center shrink-0 shadow-[var(--shadow-glow)]"
                  >
                    <Pause className="w-4 h-4" fill="currentColor" />
                  </button>
                  <button
                    onClick={playNext}
                    disabled={playingIdx + 1 >= ayahs.length}
                    aria-label={t("Next ayah", "الآية التالية")}
                    className="h-9 w-9 rounded-full flex items-center justify-center text-foreground hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent transition-colors shrink-0"
                  >
                    <SkipForward className="w-4 h-4" fill="currentColor" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground truncate">
                        {isAr ? surah.ar : surah.a} ·{" "}
                        <bdi>
                          {t("Ayah", "آية")} {num(ayahs[playingIdx].ayah)}
                        </bdi>
                      </span>
                      <span className="text-[10px] tabular-nums text-muted-foreground shrink-0">
                        <bdi>
                          {num(playingIdx + 1)} / {num(ayahs.length)}
                        </bdi>
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                      <div
                        className="h-full bg-[var(--gold)] transition-[width] duration-150"
                        style={{
                          width: `${nowDur > 0 ? Math.min(100, (nowTime / nowDur) * 100) : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )}


              <ul className="space-y-4">
                {ayahs.map((a, idx) => {
                  const isPlaying = playingIdx === idx;
                  return (
                    <li
                      key={a.ayah}
                      id={`ayah-${a.ayah}`}
                      className={`bg-card border border-border rounded-2xl overflow-hidden transition-all duration-300 ${
                        isPlaying ? "shadow-[var(--shadow-deep)] border-[var(--gold)]/40" : "hover:shadow-[var(--shadow-soft)]"
                      }`}
                    >

                      <div className="flex items-stretch">
                        <div
                          className="w-14 md:w-16 bg-secondary border-r border-border flex items-center justify-center text-muted-foreground text-lg shrink-0"
                          style={{ fontFamily: isAr ? "var(--font-arabic)" : "var(--font-display)" }}
                        >
                          {num(a.ayah)}
                        </div>
                        <div className="flex-1 p-5 md:p-7 min-w-0">
                          {openText[a.ayah] && a.text && (
                            <div
                              className="text-right text-2xl md:text-3xl text-foreground/90 mb-5 leading-[2.2]"
                              dir="rtl"
                              style={{ fontFamily: "var(--font-arabic)" }}
                            >
                              <span>{a.text} </span>
                              <span className="text-[var(--gold)]">﴿{arabicDigits(a.ayah)}﴾</span>
                            </div>
                          )}
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
                              onPlay={() => setPlayingIdx(idx)}
                              onPause={() => {
                                if (playingIdx === idx) {
                                  const el = audioRefs.current[idx];
                                  if (el && el.ended === false && el.currentTime > 0 && el.paused) {
                                    setPlayingIdx(null);
                                  }
                                }
                              }}
                              onLoadedMetadata={(e) => {
                                if (playingIdx === idx) {
                                  setNowDur((e.currentTarget.duration as number) || 0);
                                }
                              }}
                              onTimeUpdate={(e) => {
                                if (playingIdx === idx) {
                                  setNowTime(e.currentTarget.currentTime || 0);
                                }
                              }}
                              controls
                              preload="none"
                              className="flex-1 h-9"
                            />

                            <button
                              type="button"
                              onClick={() =>
                                setOpenText((s) => ({ ...s, [a.ayah]: !s[a.ayah] }))
                              }
                              disabled={!a.text}
                              aria-pressed={!!openText[a.ayah]}
                              className="h-10 px-3 rounded-lg flex items-center justify-center text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors shrink-0 disabled:opacity-40"
                            >
                              {openText[a.ayah]
                                ? t("Hide text", "إخفاء")
                                : t("Show text", "إظهار")}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleBookmark(surahNum, a.ayah, reciter)}
                              aria-pressed={isBookmarked(surahNum, a.ayah, reciter)}
                              aria-label={
                                isBookmarked(surahNum, a.ayah, reciter)
                                  ? t("Remove bookmark", "إزالة الإشارة")
                                  : t("Add bookmark", "إضافة إشارة مرجعية")
                              }
                              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                                isBookmarked(surahNum, a.ayah, reciter)
                                  ? "text-[var(--gold)] hover:bg-secondary"
                                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                              }`}
                            >
                              {isBookmarked(surahNum, a.ayah, reciter) ? (
                                <BookmarkCheck className="w-4 h-4" fill="currentColor" />
                              ) : (
                                <Bookmark className="w-4 h-4" />
                              )}
                            </button>
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

        <footer className="mt-20 pt-10 border-t border-border text-center space-y-3">
          <p className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {t("Audio courtesy of", "الصوت بإذن من")}{" "}
            <bdi>
              <a href="https://everyayah.com" className="text-[var(--gold)] hover:underline">
                everyayah.com
              </a>
            </bdi>{" "}
            · {t("Cached at the edge", "مخزّن على الحافة")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("Made by", "صُنع بواسطة")}{" "}
            <span className="font-semibold text-foreground">Omar Tamer Abdelaal</span>
            {" · "}
            <a
              href="https://www.linkedin.com/in/omar-tamer03/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--gold)] hover:underline"
            >
              LinkedIn
            </a>
            {" · "}
            <a
              href="https://github.com/omartamer630"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--gold)] hover:underline"
            >
              GitHub
            </a>
          </p>
        </footer>

      </main>
    </div>
  );
}
