import surahsData from "./surahs.json";

export interface Surah {
  n: number;
  a: string;
  t: string;
  c: number;
  r: string;
  ar: string;
}

export const SURAHS: Surah[] = surahsData as Surah[];

export const RECITERS = [
  { id: "Alafasy_128kbps", name: "Mishary Alafasy", bitrate: "128kbps" },
  { id: "Husary_128kbps", name: "Mahmoud Khalil Al-Husary", bitrate: "128kbps" },
  { id: "Abdul_Basit_Murattal_192kbps", name: "Abdul Basit Murattal", bitrate: "192kbps" },
  { id: "Minshawy_Murattal_128kbps", name: "Minshawy Murattal", bitrate: "128kbps" },
  { id: "Sudais_192kbps", name: "Abdurrahmaan As-Sudais", bitrate: "192kbps" },
  { id: "Ghamadi_40kbps", name: "Saad Al-Ghamdi", bitrate: "40kbps" },
] as const;

export type ReciterId = (typeof RECITERS)[number]["id"];

export const pad3 = (n: number) => n.toString().padStart(3, "0");

export function ayahAudioUrl(reciter: string, surah: number, ayah: number) {
  return `https://everyayah.com/data/${reciter}/${pad3(surah)}${pad3(ayah)}.mp3`;
}

export function getSurah(n: number): Surah | undefined {
  return SURAHS.find((s) => s.n === n);
}
