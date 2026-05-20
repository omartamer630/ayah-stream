export interface RadioStation {
  id: string;
  title: string;
  subtitle: string;
  streams: string[];
}

export const EGYPTIAN_QURAN_RADIO: RadioStation = {
  id: "egyptian-quran-radio",
  title: "Egyptian Quran Radio",
  subtitle: "Cairo",
  streams: [
    "https://n0d.radiojar.com/8s5u5tpdtwzuv?rj-ttl=5&rj-tok=AAABlxxxxxxxx",
    // Fallback public streams for Egyptian Quran Radio
    "https://stream.radiojar.com/8s5u5tpdtwzuv",
    "https://qurango.net/radio/tarateel",
  ],
};

export const RETRY_DELAY_MS = 4000;
