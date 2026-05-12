import { createFileRoute } from "@tanstack/react-router";
import JSZip from "jszip";
import { z } from "zod";
import { ayahAudioUrl, getSurah, pad3, RECITERS } from "@/lib/quran";

const reciterIds = RECITERS.map((r) => r.id) as [string, ...string[]];

const Query = z.object({
  surah: z.coerce.number().int().min(1).max(114),
  start: z.coerce.number().int().min(1).max(286),
  end: z.coerce.number().int().min(1).max(286),
  reciter: z.enum(reciterIds),
});

export const Route = createFileRoute("/api/zip")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = Query.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return new Response(JSON.stringify({ error: parsed.error.flatten() }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        const { surah: s, start: rawStart, end: rawEnd, reciter } = parsed.data;
        const surah = getSurah(s);
        if (!surah) return new Response("Invalid surah", { status: 404 });

        const start = Math.max(1, Math.min(rawStart, surah.c));
        const end = Math.max(start, Math.min(rawEnd, surah.c));
        if (end - start + 1 > 50) {
          return new Response("Maximum 50 ayahs per ZIP", { status: 400 });
        }

        const zip = new JSZip();
        const folder = zip.folder(`surah-${pad3(s)}-${surah.a}`)!;

        try {
          await Promise.all(
            Array.from({ length: end - start + 1 }, (_, i) => start + i).map(async (a) => {
              const audioUrl = ayahAudioUrl(reciter, s, a);
              const res = await fetch(audioUrl);
              if (!res.ok) throw new Error(`ayah ${a}: ${res.status}`);
              const buf = new Uint8Array(await res.arrayBuffer());
              folder.file(`${pad3(s)}-${pad3(a)}.mp3`, buf);
            }),
          );
        } catch (e) {
          return new Response(`Failed to fetch audio: ${(e as Error).message}`, { status: 502 });
        }

        const blob = await zip.generateAsync({ type: "uint8array" });
        const ab = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength) as ArrayBuffer;

        return new Response(ab, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition": `attachment; filename="surah-${pad3(s)}-${start}-${end}.zip"`,
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
