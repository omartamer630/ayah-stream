import { createServerFn } from "@tanstack/react-start";
import { setResponseHeaders } from "@tanstack/react-start/server";
import JSZip from "jszip";
import { z } from "zod";
import { ayahAudioUrl, getSurah, pad3, RECITERS } from "./quran";

const reciterIds = RECITERS.map((r) => r.id) as [string, ...string[]];

const Input = z.object({
  surah: z.number().int().min(1).max(114),
  start: z.number().int().min(1).max(286),
  end: z.number().int().min(1).max(286),
  reciter: z.enum(reciterIds),
});

export const buildAyahZip = createServerFn({ method: "POST", response: "raw" })
  .inputValidator((input: unknown) => Input.parse(input))
  .handler(async ({ data }) => {
    const surah = getSurah(data.surah);
    if (!surah) throw new Error("Invalid surah");
    const start = Math.max(1, Math.min(data.start, surah.c));
    const end = Math.max(start, Math.min(data.end, surah.c));
    if (end - start + 1 > 50) throw new Error("Maximum 50 ayahs per ZIP");

    const zip = new JSZip();
    const folder = zip.folder(`surah-${pad3(data.surah)}-${surah.a}`)!;

    const fetches = [];
    for (let a = start; a <= end; a++) {
      fetches.push(
        (async () => {
          const url = ayahAudioUrl(data.reciter, data.surah, a);
          const res = await fetch(url);
          if (!res.ok) throw new Error(`Failed ayah ${a}: ${res.status}`);
          const buf = new Uint8Array(await res.arrayBuffer());
          folder.file(`${pad3(data.surah)}-${pad3(a)}.mp3`, buf);
        })(),
      );
    }
    await Promise.all(fetches);

    const blob = await zip.generateAsync({ type: "uint8array" });
    setResponseHeaders(
      new Headers({
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="surah-${pad3(data.surah)}-${start}-${end}.zip"`,
        "Cache-Control": "public, max-age=3600",
      }),
    );
    return new Response(blob);
  });
