import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

// ---------------------------------------------------------------------------
// Before/after comparison of the overlay's motion work (Emil Kowalski audit).
// Left stage: today's overlay (instant display toggles). Right stage: the
// proposed motion (strong ease-out curves, sub-300ms durations, press
// feedback). Plays once at 1x, then repeats at 0.5x for a slow-motion
// feel-check.
// ---------------------------------------------------------------------------

const EASE = Easing.bezier(0.23, 1, 0.32, 1); // --ease-out from the audit
const INK = "#1c1c1e";
const BLUE = "#3b82f6";

// scenario timestamps (ms)
const T = {
  fab: 300,
  fabPress: 900,
  bar: 1000,
  panel: 1900,
  toast: 2900,
  toastOut: 4100,
  press: 5000,
  end: 5600,
};

// eased progress of a segment starting at `start` lasting `dur` ms
const seg = (t: number, start: number, dur: number) => {
  if (t < start) return 0;
  if (t >= start + dur) return 1;
  return EASE((t - start) / dur);
};
const on = (t: number, start: number) => (t >= start ? 1 : 0);

type StageProps = { t: number; animated: boolean };

const Stage: React.FC<StageProps> = ({ t, animated }) => {
  // --- enter progress per element -----------------------------------------
  const fab = animated ? seg(t, T.fab, 200) : on(t, T.fab);
  const bar = animated ? seg(t, T.bar, 200) : on(t, T.bar);
  const panel = animated ? seg(t, T.panel, 180) : on(t, T.panel);
  const toastIn = animated ? seg(t, T.toast, 160) : on(t, T.toast);
  const toastOut = animated ? 1 - seg(t, T.toastOut, 120) : 1 - on(t, T.toastOut);
  const toast = Math.min(toastIn, toastOut);

  // press feedback (animated side only): quick dip and release
  const dip = (start: number) => {
    if (!animated) return 1;
    if (t < start || t > start + 260) return 1;
    const down = seg(t, start, 100);
    const up = seg(t, start + 120, 140);
    return 1 - 0.05 * (down - up);
  };
  const fabScale = dip(T.fabPress);
  const addScale = dip(T.press);

  return (
    <div style={{
      position: "relative", width: 540, height: 540, borderRadius: 16,
      background: "#101216", border: "1px solid #1d2027", overflow: "hidden",
    }}>
      {/* fake video block */}
      <div style={{
        position: "absolute", left: 110, top: 46, width: 320, height: 130, borderRadius: 10,
        background: "radial-gradient(circle at 30% 20%, #1a2340 0%, #0b0d12 62%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontSize: 24, fontWeight: 800,
      }}>
        Ship faster.
      </div>

      {/* FAB (bottom-right) */}
      {fab > 0 && (
        <div style={{
          position: "absolute", right: 26, bottom: 26, width: 46, height: 46, borderRadius: 99,
          background: "#111", boxShadow: "0 10px 30px rgba(0,0,0,.4)",
          display: "flex", alignItems: "center", justifyContent: "center",
          opacity: fab,
          transform: `scale(${(0.9 + 0.1 * fab) * fabScale})`,
        }}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round">
            <path d="M3 6h13" /><path d="M3 12h8" /><path d="M3 18h11" /><path d="M19 13l1 2.5L22.5 17 20 18l-1 2.5L18 18l-2.5-1L18 15.5Z" />
          </svg>
        </div>
      )}

      {/* toolbar pill (bottom-center) */}
      {bar > 0 && (
        <div style={{
          position: "absolute", left: 270 - 108, bottom: 26, width: 216, height: 44, borderRadius: 14,
          background: INK, boxShadow: `0 0 0 1px rgba(255,255,255,.07), 0 16px 40px rgba(0,0,0,.45), 0 0 0 4px ${BLUE}33`,
          display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
          opacity: bar,
          transform: `translateY(${12 * (1 - bar)}px) scale(${0.97 + 0.03 * bar})`,
        }}>
          {["M3 3h18v18H3zM9 3v18", "M12 3l7 9-7 9-7-9z", "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z", "M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10H9", "M18 6 6 18M6 6l12 12"].map((d, i) => (
            <svg key={i} width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#a1a1a6" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d={d} />
            </svg>
          ))}
          <div style={{ width: 7, height: 7, borderRadius: 99, background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
        </div>
      )}

      {/* annotation panel (center, origin top) */}
      {panel > 0 && (
        <div style={{
          position: "absolute", left: 270 - 140, top: 218, width: 280, borderRadius: 14,
          background: INK, padding: 13, boxShadow: "0 24px 60px rgba(0,0,0,.5)",
          opacity: panel, transformOrigin: "top",
          transform: `translateY(${4 * (1 - panel)}px) scale(${0.96 + 0.04 * panel})`,
        }}>
          <div style={{ fontSize: 11.5, color: "#9ca3af", fontFamily: "ui-monospace, monospace", marginBottom: 9 }}>
            <b style={{ color: "#d1d5db" }}>heading</b> · Scene.tsx:12:4 · <span style={{ color: BLUE }}>◷ 96</span>
          </div>
          <div style={{ minHeight: 40, borderRadius: 9, border: "1.5px solid #3a3a3c", background: "#111", color: "#fff", padding: "9px 11px", fontSize: 13 }}>
            Make this orange and bigger
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 9, alignItems: "center" }}>
            <span style={{ color: "#9ca3af", fontSize: 12.5 }}>Cancel</span>
            <span style={{
              display: "inline-block", background: BLUE, color: "#fff", fontSize: 12.5, fontWeight: 600,
              padding: "6px 15px", borderRadius: 8, transform: `scale(${addScale})`,
            }}>
              Add
            </span>
          </div>
        </div>
      )}

      {/* toast */}
      {toast > 0 && (
        <div style={{
          position: "absolute", left: 270 - 78, bottom: 84, background: "#111", color: "#fff",
          fontSize: 12.5, fontWeight: 600, padding: "8px 14px", borderRadius: 10, border: "1px solid #2c2c2e",
          opacity: toast,
          transform: `translateY(${6 * (1 - toastIn)}px)`,
        }}>
          Prop updated ✓ · ⌘Z
        </div>
      )}
    </div>
  );
};

// caption for what's happening right now
const captionFor = (t: number) => {
  if (t < T.fab) return "…";
  if (t < T.bar) return "FAB enters";
  if (t < T.panel) return "toolbar opens";
  if (t < T.toast) return "annotation panel opens";
  if (t < T.toastOut) return "toast appears";
  if (t < T.press) return "toast leaves";
  if (t < T.end) return "button press feedback";
  return "done";
};

export const MotionCompare: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const msPerFrame = 1000 / fps;

  // pass 1 (1x): frames 15..183 · pass 2 (0.5x): frames 205..541
  const P1_START = 15;
  const P1_FRAMES = Math.ceil(T.end / msPerFrame); // ~168
  const P2_START = P1_START + P1_FRAMES + 20;
  const slow = frame >= P2_START;
  const t = slow
    ? (frame - P2_START) * msPerFrame * 0.5
    : Math.max(0, frame - P1_START) * msPerFrame;

  const fadeSwap = interpolate(frame, [P1_START + P1_FRAMES, P2_START], [1, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

  return (
    <AbsoluteFill style={{ background: "#0a0c10", fontFamily: "Inter, system-ui, sans-serif", alignItems: "center" }}>
      <div style={{ marginTop: 34, color: "#e5e7eb", fontSize: 22, fontWeight: 800 }}>
        Overlay motion — before vs after
      </div>
      <div style={{ marginTop: 6, color: "#6b7280", fontSize: 14 }}>
        {captionFor(t)}
      </div>

      {slow && (
        <div style={{
          position: "absolute", top: 36, right: 46, background: "#f59e0b", color: "#1a1205",
          fontSize: 13, fontWeight: 800, padding: "6px 12px", borderRadius: 18,
        }}>
          0.5× slow motion
        </div>
      )}

      <div style={{ display: "flex", gap: 40, marginTop: 26, opacity: fadeSwap }}>
        <div>
          <div style={{ textAlign: "center", color: "#9ca3af", fontSize: 14.5, fontWeight: 600, marginBottom: 12 }}>
            Before — instant
          </div>
          <Stage t={t} animated={false} />
        </div>
        <div>
          <div style={{ textAlign: "center", color: "#5eead4", fontSize: 14.5, fontWeight: 600, marginBottom: 12 }}>
            After — cubic-bezier(0.23, 1, 0.32, 1)
          </div>
          <Stage t={t} animated />
        </div>
      </div>
    </AbsoluteFill>
  );
};
