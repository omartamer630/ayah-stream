import surahsData from "./surahs.json";
import recitersData from "./reciters.json";

export interface Surah {
  n: number;
  a: string;
  t: string;
  c: number;
  r: string;
  ar: string;
}

export interface Reciter {
  id: string;
  name: string;
  bitrate: string;
}

export const SURAHS: Surah[] = surahsData as Surah[];
export const RECITERS: Reciter[] = recitersData as Reciter[];

export const RECITER_IDS = new Set(RECITERS.map((r) => r.id));

export const DEFAULT_RECITER = "Alafasy_128kbps";

export type ReciterId = string;

export const pad3 = (n: number) => n.toString().padStart(3, "0");

export function ayahAudioUrl(reciter: string, surah: number, ayah: number) {
  return `https://everyayah.com/data/${reciter}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

export function getSurah(n: number): Surah | undefined {
  return SURAHS.find((s) => s.n === n);
}

export function isValidReciter(id: string): boolean {
  return RECITER_IDS.has(id);
}
