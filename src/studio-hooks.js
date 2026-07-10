// Companion entry: the overlay is a plain IIFE and can't `import`, so this
// module exposes Remotion Studio's public seek() on window for click-to-seek.
// The current frame is read by the overlay directly from localStorage
// ("remotion.time-all"), so no import is needed for capture.
import { seek } from "@remotion/studio";

window.__raSeek = (f) => {
  try {
    seek(Number(f));
  } catch (e) {
    console.warn("[Remotion Annotate] seek failed:", e);
  }
};
