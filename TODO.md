# Feature Roadmap

Tracking suggested improvements. Implement top-to-bottom.

## Done
- [x] **Continuous Surah Player** — sticky now-playing bar with prev/next, in-ayah progress, "Play full" button, auto-scroll to current ayah.

## High-impact UX
- [ ] **Translation + transliteration toggle** — show English/Urdu translation and Latin transliteration under each ayah (Quran.com API).
- [ ] **Word-by-word highlighting** synced with audio (Quran.com timing data).
- [ ] **Bookmarks & Resume** — remember last played surah/ayah; one-tap resume on the homepage.

## Discovery & navigation
- [ ] **Search** across surahs/ayahs (Arabic + translation) with instant results.
- [ ] **Juz / Hizb / Page navigation** alongside the surah picker.
- [ ] **Reciter previews** — 5-second sample on hover.

## Listening features
- [ ] **Repeat range / memorization mode** — loop ayah N times, then move to next (hifz mode).
- [ ] **Playback speed** (0.75×–1.5×).
- [ ] **A–B loop** for a single verse.
- [ ] **Sleep timer** for the Egyptian Quran Radio.
- [ ] **Media Session API** — lock-screen controls + track metadata on mobile.

## Downloads
- [ ] **Merged MP3 download button** for any range (API already exists at `/api/merged`).
- [ ] **Whole-surah ZIP** preset (1-click).
- [ ] **PWA / offline** — install to home screen, cache fetched ayahs for offline listening.

## Spiritual utilities
- [ ] **Prayer times + Qibla** by geolocation.
- [ ] **Hijri date** in the header.
- [ ] **Daily ayah** card on the homepage.
- [ ] **Tafsir** drawer (Ibn Kathir / Saadi) per ayah.

## Polish
- [ ] **Keyboard shortcuts on main player** (←/→ ayah, Space play/pause).
- [ ] **Share ayah** — generates an image card with ayah text + reference.
- [ ] **SEO** — per-surah routes (`/surah/al-fatiha`) with proper meta + JSON-LD.
- [ ] **Privacy-friendly analytics** (Plausible) to see popular reciters/surahs.
