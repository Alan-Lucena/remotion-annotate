import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ---------------------------------------------------------------------------
// remotion-annotate demo, Agentation-style: stylized browser window running
// Remotion Studio with the annotate overlay, then a Claude Code window that
// receives the annotations. Rendered with Remotion itself (dogfooding).
// ---------------------------------------------------------------------------

const BLUE = "#3b82f6";
const AMBER = "#f59e0b";
const ORANGE = "#f97316";
const INK = "#1c1c1e";

// piecewise cursor keyframes
const kf = (frame: number, keys: { f: number; x: number; y: number }[]) => {
  const fs = keys.map((k) => k.f);
  const x = interpolate(frame, fs, keys.map((k) => k.x), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  const y = interpolate(frame, fs, keys.map((k) => k.y), {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });
  return { x, y };
};

const fadeIn = (frame: number, at: number, dur = 8) =>
  interpolate(frame, [at, at + dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const typed = (frame: number, from: number, to: number, text: string) => {
  const n = Math.round(interpolate(frame, [from, to], [0, text.length], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }));
  return text.slice(0, n);
};

// ---------------------------------------------------------------------------

const Cursor: React.FC<{ x: number; y: number; clickAt: number[]; frame: number }> = ({ x, y, clickAt, frame }) => {
  const nearest = clickAt.reduce((best, f) => (frame >= f && frame - f < 12 ? f : best), -100);
  const t = frame - nearest;
  const dip = t >= 0 && t < 6 ? 0.82 : 1;
  const ripple = t >= 0 && t < 12 ? t / 12 : null;
  return (
    <div style={{ position: "absolute", left: x, top: y, zIndex: 90 }}>
      {ripple !== null && (
        <div style={{
          position: "absolute", left: -14, top: -14, width: 28, height: 28, borderRadius: 99,
          border: `3px solid ${BLUE}`, opacity: 1 - ripple, transform: `scale(${0.4 + ripple * 1.6})`,
        }} />
      )}
      <svg width={26} height={26} viewBox="0 0 24 24" style={{ transform: `scale(${dip})`, filter: "drop-shadow(0 2px 4px rgba(0,0,0,.4))" }}>
        <path d="M5 3l14 8.5-6.2 1.2 3.4 6.3-2.8 1.5-3.4-6.3L5 18z" fill="#fff" stroke="#000" strokeWidth={1.4} />
      </svg>
    </div>
  );
};

// Annotations sidebar card (matches the real overlay's top-right card)
const SideCard: React.FC<{ frame: number; fps: number; item2At: number; clearAt: number }> = ({ frame, fps, item2At, clearAt }) => {
  if (frame < 170) return null;
  const enter = spring({ frame: frame - 170, fps, config: { damping: 14 } });
  const out = interpolate(frame, [clearAt, clearAt + 12], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const item2 = interpolate(frame, [item2At, item2At + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <div style={{
      position: "absolute", right: 18, top: 74, width: 252, borderRadius: 13, background: INK,
      boxShadow: "0 16px 40px rgba(0,0,0,.45)", zIndex: 70, overflow: "hidden",
      opacity: Math.min(enter, out), transform: `translateX(${8 * (1 - enter)}px)`,
      color: "#e5e7eb",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 13px", borderBottom: "1px solid #2c2c2e", fontSize: 12.5, fontWeight: 700 }}>
        Annotations <span style={{ color: "#9ca3af", fontWeight: 400 }}>Clear</span>
      </div>
      <div style={{ padding: "9px 13px", borderBottom: "1px solid #232325" }}>
        <div style={{ fontSize: 10.5, fontFamily: "ui-monospace, monospace", color: "#9ca3af" }}>
          <span style={{ color: BLUE }}>◷ 96</span> · Scene.tsx:12:4
        </div>
        <div style={{ fontSize: 11.5, marginTop: 3 }}>Make this orange and bigger</div>
      </div>
      {item2 > 0 && (
        <div style={{ padding: "9px 13px", opacity: item2 }}>
          <div style={{ fontSize: 10.5, fontFamily: "ui-monospace, monospace", color: "#9ca3af" }}>
            <span style={{ color: AMBER }}>◷ 96→210</span> · timeline
          </div>
          <div style={{ fontSize: 11.5, marginTop: 3 }}>Add a ROADMAP scene in this range</div>
        </div>
      )}
    </div>
  );
};

const ToolIcon: React.FC<{ d: string; active?: boolean }> = ({ d, active }) => (
  <div style={{
    width: 34, height: 34, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center",
    background: active ? "#2c2c2e" : "transparent",
  }}>
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke={active ? "#fff" : "#a1a1a6"} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  </div>
);

// ---------------------------------------------------------------------------

export const Demo: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // ---- layout constants (inside the 1280x800 canvas) ----
  const W = { x: 70, y: 44, w: 1140, h: 690 }; // browser window
  const studio = { x: W.x + 14, y: W.y + 78, w: W.w - 28, h: W.h - 92 };
  const side = 148; // studio sidebar width
  const tl = 118; // timeline height
  const canvas = { x: studio.x + side, y: studio.y + 30, w: studio.w - side, h: studio.h - 30 - tl };
  const scene = { w: 620, h: 340 };
  const sceneX = canvas.x + (canvas.w - scene.w) / 2;
  const sceneY = canvas.y + (canvas.h - scene.h) / 2 - 4;

  // title inside the fake video
  const titleY = sceneY + 96;
  const titleCx = sceneX + scene.w / 2;

  // toolbar
  const barY = W.y + W.h - 58;
  const barX = W.x + W.w / 2 - 150;

  // ---- beats ----
  const winIn = spring({ frame, fps, config: { damping: 14 } });
  const fabIn = spring({ frame: frame - 16, fps, config: { damping: 11 } });
  const fabPos = { x: W.x + W.w - 74, y: W.y + W.h - 78 };

  const toolbarIn = spring({ frame: frame - 58, fps, config: { damping: 13 } });
  const showToolbar = frame >= 58;

  const hoverOn = frame >= 84 && frame < 170;
  const popup1 = frame >= 112 && frame < 168;
  const msg1 = "Make this orange and bigger";

  const rangeArmed = frame >= 187 && frame < 222;
  const playheadPct = interpolate(frame, [188, 214], [0.32, 0.66], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.quad) });
  const rangeEnd = Math.round(interpolate(frame, [188, 214], [96, 210], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  const popup2 = frame >= 224 && frame < 272;
  const msg2 = "Add a ROADMAP scene in this range";

  // copy button (5th icon in the toolbar pill): the real handoff to the agent
  const copyX = barX + 9 + 17 + 4 * 36;
  const copyClickAt = 288;
  const copyActive = frame >= copyClickAt && frame < 306;
  const copyToast = frame >= copyClickAt + 2 && frame < 324;

  const claudeIn = spring({ frame: frame - 304, fps, config: { damping: 15 } });
  const showClaude = frame >= 304 && frame < 400;
  const claudeOut = frame >= 386 ? interpolate(frame, [386, 400], [1, 0], { extrapolateRight: "clamp" }) : 1;

  const applied = frame >= 380;
  const titleScale = applied ? 1 + 0.25 * spring({ frame: frame - 380, fps, config: { damping: 12 } }) : 1;
  const titleColor = applied ? ORANGE : "#ffffff";

  const endBadge = fadeIn(frame, 400, 12);

  // ---- cursor path ----
  const cur = kf(frame, [
    { f: 0, x: 900, y: 560 },
    { f: 30, x: 900, y: 560 },
    { f: 52, x: fabPos.x + 26, y: fabPos.y + 26 },       // to FAB
    { f: 72, x: fabPos.x + 26, y: fabPos.y + 26 },
    { f: 92, x: titleCx + 40, y: titleY + 24 },           // hover title
    { f: 104, x: titleCx - 46, y: titleY + 60 },          // to "+" button
    { f: 116, x: titleCx - 46, y: titleY + 60 },
    { f: 150, x: titleCx + 254, y: titleY + 201 },        // to Add btn popup1
    { f: 164, x: titleCx + 254, y: titleY + 201 },
    { f: 182, x: barX + 60, y: barY + 18 },               // to ◆ range button
    { f: 216, x: barX + 60, y: barY + 18 },               // wait during scrub
    { f: 222, x: barX + 60, y: barY + 18 },               // click again
    { f: 252, x: titleCx + 254, y: sceneY + 325 },        // to Add btn popup2
    { f: 266, x: titleCx + 254, y: sceneY + 325 },
    { f: 284, x: copyX, y: barY + 18 },                   // to COPY button
    { f: 296, x: copyX, y: barY + 18 },
    { f: 330, x: W.x + W.w - 260, y: W.y + W.h - 160 },   // rest
  ]);
  const clicks = [54, 110, 162, 186, 220, 264, copyClickAt];

  return (
    <AbsoluteFill style={{ background: "#f3f1ec", fontFamily: "Inter, system-ui, sans-serif" }}>
      {/* ------------------------------------------------ browser window */}
      <div style={{
        position: "absolute", left: W.x, top: W.y, width: W.w, height: W.h, borderRadius: 18,
        background: "#fbfaf8", boxShadow: "0 30px 80px rgba(40,35,25,.18), 0 0 0 1px rgba(0,0,0,.05)",
        transform: `scale(${0.96 + winIn * 0.04})`, opacity: winIn,
      }}>
        {/* chrome */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "16px 18px" }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <div key={c} style={{ width: 13, height: 13, borderRadius: 99, background: c }} />
          ))}
          <div style={{
            margin: "0 auto", width: 520, height: 34, borderRadius: 9, background: "#efedе8".replace("е", "e"),
            border: "1px solid #e6e3dc", display: "flex", alignItems: "center", justifyContent: "center",
            color: "#8a857c", fontSize: 15,
          }}>
            localhost:3000
          </div>
          <div style={{ width: 60 }} />
        </div>

        {/* ------------------------------------------------ studio mock */}
        <div style={{
          position: "absolute", left: 14, top: 62, width: W.w - 28, height: W.h - 76,
          borderRadius: 12, background: "#0f1115", overflow: "hidden", border: "1px solid #e6e3dc",
        }}>
          {/* top bar */}
          <div style={{ height: 30, display: "flex", alignItems: "center", gap: 14, padding: "0 14px", borderBottom: "1px solid #1d2027" }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: "#3b82f6" }} />
            {[46, 34, 40].map((w, i) => (
              <div key={i} style={{ width: w, height: 9, borderRadius: 4, background: "#262a33" }} />
            ))}
          </div>
          {/* sidebar */}
          <div style={{ position: "absolute", left: 0, top: 30, bottom: tl, width: side, borderRight: "1px solid #1d2027", padding: 12 }}>
            <div style={{ width: 86, height: 9, borderRadius: 4, background: "#262a33", marginBottom: 14 }} />
            {[0, 1, 2, 3].map((i) => (
              <div key={i} style={{
                height: 26, borderRadius: 6, marginBottom: 7, display: "flex", alignItems: "center", gap: 8, padding: "0 8px",
                background: i === 1 ? "#1b2436" : "#161a21",
              }}>
                <div style={{ width: 11, height: 11, borderRadius: 3, background: i === 1 ? BLUE : "#2c313c" }} />
                <div style={{ width: 62 - i * 6, height: 7, borderRadius: 4, background: i === 1 ? "#3d4least".replace("least", "b56") : "#2c313c" }} />
              </div>
            ))}
          </div>

          {/* canvas + fake video scene */}
          <div style={{
            position: "absolute", left: sceneX - studio.x + 14 - 14, top: sceneY - studio.y + 62 - 62,
          }} />
          <div style={{
            position: "absolute", left: sceneX - W.x - 14, top: sceneY - W.y - 62, width: scene.w, height: scene.h,
            borderRadius: 10, overflow: "hidden", background: "radial-gradient(circle at 30% 20%, #1a2340 0%, #0b0d12 62%)",
            boxShadow: "0 10px 40px rgba(0,0,0,.5)",
          }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: 74, textAlign: "center" }}>
              <div style={{ fontSize: 15, letterSpacing: 5, color: "#5eead4", fontWeight: 600, marginBottom: 12 }}>MY LAUNCH VIDEO</div>
              <div style={{
                fontSize: 52, fontWeight: 800, color: titleColor, transform: `scale(${titleScale})`,
                transformOrigin: "center", lineHeight: 1.05,
              }}>
                Ship faster.
              </div>
              <div style={{ fontSize: 19, color: "#94a3b8", marginTop: 14 }}>Videos in React.</div>
              <div style={{
                margin: "22px auto 0", width: 132, height: 38, borderRadius: 10, background: BLUE,
                color: "#fff", fontSize: 15, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                Get started
              </div>
            </div>
          </div>

          {/* timeline */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: tl, borderTop: "1px solid #1d2027", background: "#0c0e12" }}>
            <div style={{ display: "flex", gap: 46, padding: "8px 0 0 160", opacity: 0.7 }}>
              {["00:02", "00:04", "00:06", "00:08", "00:10", "00:12"].map((t) => (
                <div key={t} style={{ fontSize: 9, color: "#4b5563", fontFamily: "ui-monospace, monospace" }}>{t}</div>
              ))}
            </div>
            <div style={{ position: "absolute", left: 150, right: 16, top: 30, height: 26, borderRadius: 5, background: "#123322", overflow: "hidden" }}>
              {Array.from({ length: 60 }).map((_, i) => (
                <div key={i} style={{
                  position: "absolute", left: i * 16 + 3, bottom: 3, width: 7,
                  height: 4 + ((i * 37) % 17), background: "#22c55e55", borderRadius: 2,
                }} />
              ))}
            </div>
            <div style={{ position: "absolute", left: 150, top: 64, width: 210, height: 24, borderRadius: 5, background: "#1d4ed8" }} />
            <div style={{ position: "absolute", left: 380, top: 64, width: 300, height: 24, borderRadius: 5, background: "#1e40af" }} />
            <div style={{ position: "absolute", left: 700, top: 64, width: 260, height: 24, borderRadius: 5, background: "#1d4ed8" }} />
            {/* playhead */}
            <div style={{
              position: "absolute", top: 6, bottom: 6, width: 2, background: "#ef4444",
              left: 150 + playheadPct * (W.w - 28 - 150 - 16),
            }}>
              <div style={{ position: "absolute", top: -1, left: -5, width: 12, height: 10, background: "#ef4444", borderRadius: "3px 3px 6px 6px" }} />
            </div>
            {/* range band while armed */}
            {frame >= 188 && frame < 272 && (
              <div style={{
                position: "absolute", top: 6, bottom: 6, background: `${AMBER}26`, border: `1.5px dashed ${AMBER}`,
                left: 150 + 0.32 * (W.w - 28 - 150 - 16),
                width: (playheadPct - 0.32) * (W.w - 28 - 150 - 16),
              }} />
            )}
          </div>
        </div>

        {/* ------------------------------------------------ annotate overlay bits */}
        {/* FAB */}
        {frame < 62 && (
          <div style={{
            position: "absolute", left: fabPos.x - W.x, top: fabPos.y - W.y, width: 52, height: 52, borderRadius: 99,
            background: "#111", display: "flex", alignItems: "center", justifyContent: "center",
            transform: `scale(${Math.max(0, fabIn)})`, boxShadow: "0 10px 30px rgba(0,0,0,.35)",
          }}>
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h13" /><path d="M3 12h8" /><path d="M3 18h11" /><path d="M19 13l1 2.5L22.5 17 20 18l-1 2.5L18 18l-2.5-1L18 15.5Z" />
            </svg>
          </div>
        )}

        {/* toolbar */}
        {showToolbar && (
          <div style={{
            position: "absolute", left: barX - W.x, top: barY - W.y, display: "flex", alignItems: "center", gap: 2,
            background: INK, borderRadius: 15, padding: "6px 9px",
            boxShadow: `0 0 0 1px rgba(255,255,255,.07), 0 16px 40px rgba(0,0,0,.45), 0 0 0 4px ${BLUE}44`,
            transform: `translateY(${(1 - toolbarIn) * 26}px)`, opacity: toolbarIn, zIndex: 40,
          }}>
            <ToolIcon d="M3 3h18v18H3zM9 3v18" />
            <ToolIcon d="M12 3l7 9-7 9-7-9z" active={rangeArmed} />
            <ToolIcon d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7ZM12 9a3 3 0 100 6 3 3 0 000-6" />
            <ToolIcon d="M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10H9" />
            <ToolIcon d="M9 9h12v12H9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" active={copyActive} />
            <div style={{ width: 8, height: 8, borderRadius: 99, background: "#22c55e", margin: "0 6px", boxShadow: "0 0 6px #22c55e" }} />
            <ToolIcon d="M18 6 6 18M6 6l12 12" />
          </div>
        )}

        {/* hover highlight + tooltip + action buttons on the title */}
        {hoverOn && !popup1 && (
          <>
            <div style={{
              position: "absolute", left: titleCx - 172 - W.x, top: titleY - 12 - W.y, width: 344, height: 74,
              border: `1.5px solid ${BLUE}`, borderRadius: 8, background: `${BLUE}1c`, opacity: fadeIn(frame, 84),
            }} />
            <div style={{
              position: "absolute", left: titleCx - 172 - W.x, top: titleY - 48 - W.y, background: INK, color: "#fff",
              fontSize: 13, fontWeight: 500, padding: "6px 11px", borderRadius: 8, opacity: fadeIn(frame, 86),
              boxShadow: "0 8px 24px rgba(0,0,0,.4)",
            }}>
              <span style={{ color: "#9ca3af", fontWeight: 600 }}>heading:</span> "Ship faster."
            </div>
            {frame >= 96 && (
              <div style={{ position: "absolute", left: titleCx - 56 - W.x, top: titleY + 48 - W.y, display: "flex", gap: 6, opacity: fadeIn(frame, 96) }}>
                {[{ bg: BLUE, t: "+" }, { bg: "#111", t: "✎" }].map((b, i) => (
                  <div key={i} style={{
                    width: 30, height: 30, borderRadius: 99, background: b.bg, color: "#fff", border: "2px solid #fff",
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: i === 0 ? 18 : 13, fontWeight: 600,
                    boxShadow: "0 4px 14px rgba(0,0,0,.35)",
                  }}>
                    {b.t}
                  </div>
                ))}
                <div style={{
                  width: 30, height: 30, borderRadius: 99, background: "#7c3aed", border: "2px solid #fff",
                  display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 14px rgba(0,0,0,.35)",
                }}>
                  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2}>
                    <line x1="4" y1="21" x2="4" y2="14" /><line x1="4" y1="10" x2="4" y2="3" /><line x1="12" y1="21" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12" y2="3" /><line x1="20" y1="21" x2="20" y2="16" /><line x1="20" y1="12" x2="20" y2="3" />
                  </svg>
                </div>
              </div>
            )}
          </>
        )}

        {/* popup 1 (feedback on title) */}
        {popup1 && (
          <Popup
            x={titleCx - 30 - W.x} y={titleY + 92 - W.y}
            crumb={<><b style={{ color: "#d1d5db" }}>heading</b> · Scene.tsx:12:4 · <span style={{ color: BLUE }}>◷ 96</span></>}
            text={typed(frame, 118, 152, msg1)}
            caret={frame < 154}
            opacity={fadeIn(frame, 112, 6)}
          />
        )}

        {/* range chip */}
        {frame >= 187 && frame < 224 && (
          <div style={{
            position: "absolute", left: W.w / 2 - 74, top: barY - W.y - 46, background: "#111", color: AMBER,
            fontFamily: "ui-monospace, monospace", fontSize: 15, fontWeight: 700, padding: "8px 16px", borderRadius: 11,
            border: `1px solid ${AMBER}55`, boxShadow: "0 10px 30px rgba(0,0,0,.4)", opacity: fadeIn(frame, 187, 5),
          }}>
            ◆ 96 → {rangeEnd}
          </div>
        )}

        {/* popup 2 (time range) */}
        {popup2 && (
          <Popup
            x={titleCx - 30 - W.x} y={sceneY + 216 - W.y}
            crumb={<><b style={{ color: AMBER }}>Range:</b> frames 96 → 210</>}
            text={typed(frame, 230, 258, msg2)}
            caret={frame < 260}
            opacity={fadeIn(frame, 224, 6)}
          />
        )}

        {/* markers */}
        <SideCard frame={frame} fps={fps} item2At={270} clearAt={384} />

        {/* copy-to-clipboard toast (the real agent handoff) */}
        {copyToast && (
          <div style={{
            position: "absolute", left: W.w / 2 - 152, top: barY - W.y - 46, background: "#111", color: "#fff",
            fontSize: 13.5, fontWeight: 600, padding: "9px 16px", borderRadius: 11, border: "1px solid #2c2c2e",
            opacity: fadeIn(frame, copyClickAt + 2, 5), zIndex: 75,
          }}>
            Markdown copied (2) — paste to your agent
          </div>
        )}

        {/* toast after apply */}
        {applied && frame < 412 && (
          <div style={{
            position: "absolute", left: W.w / 2 - 96, top: barY - W.y - 46, background: "#111", color: "#fff",
            fontSize: 13.5, fontWeight: 600, padding: "9px 16px", borderRadius: 11, border: "1px solid #2c2c2e",
            opacity: fadeIn(frame, 380, 6),
          }}>
            2 annotations applied ✓
          </div>
        )}
      </div>

      {/* ------------------------------------------------ Claude Code window */}
      {showClaude && (
        <div style={{
          position: "absolute", left: 420, top: 120, width: 640, height: 470, borderRadius: 16,
          background: "#fdfcfa", boxShadow: "0 40px 100px rgba(40,35,25,.35), 0 0 0 1px rgba(0,0,0,.06)",
          transform: `translateY(${(1 - claudeIn) * 60}px) scale(${0.97 + claudeIn * 0.03})`,
          opacity: Math.min(claudeIn, claudeOut), zIndex: 80, overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #eeebe4" }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <div key={c} style={{ width: 12, height: 12, borderRadius: 99, background: c, marginRight: 8 }} />
            ))}
            <div style={{ margin: "0 auto", fontWeight: 700, color: "#3a362e", fontSize: 16, paddingRight: 56 }}>my-video</div>
          </div>
          <div style={{ padding: "20px 26px", fontFamily: "ui-monospace, SFMono-Regular, monospace", color: "#4a463d" }}>
            <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>
              <div style={{ border: "1.5px solid #d97757", borderRadius: 10, padding: "14px 22px", textAlign: "center" }}>
                <div style={{ fontSize: 13.5, marginBottom: 8 }}>Welcome back!</div>
                <Crab />
                <div style={{ fontSize: 11, color: "#9c968a", marginTop: 8 }}>~/code/my-video</div>
              </div>
              <div style={{ paddingTop: 6 }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: "#3a362e", fontFamily: "Inter, sans-serif" }}>Claude Code</div>
              </div>
            </div>
            <div style={{ marginTop: 20, fontSize: 13.5, lineHeight: 1.9 }}>
              {frame >= 316 && <div style={{ color: "#9c968a" }}>&gt; pasted from clipboard</div>}
              {frame >= 322 && <div style={{ marginTop: 6 }}>## Annotations (2)</div>}
              {frame >= 332 && <div style={{ marginTop: 8 }}>### 1. heading "Ship faster." · Scene.tsx:12:4</div>}
              {frame >= 338 && <div style={{ color: "#7a756a" }}>Make this orange and bigger</div>}
              {frame >= 348 && <div style={{ marginTop: 8 }}>### 2. frames 96–210</div>}
              {frame >= 354 && <div style={{ color: "#7a756a" }}>Add a ROADMAP scene in this range</div>}
              {frame >= 372 && <div style={{ marginTop: 10, color: "#16a34a" }}>✓ Applied 2 changes to Scene.tsx</div>}
              {frame >= 316 && frame < 372 && <span style={{ background: "#b9b3a6", color: "transparent" }}>▮</span>}
            </div>
          </div>
        </div>
      )}

      {/* end badge */}
      <div style={{ position: "absolute", left: 0, right: 0, bottom: 12, textAlign: "center", opacity: endBadge }}>
        <span style={{ fontWeight: 800, fontSize: 17, color: "#3a362e" }}>remotion-annotate</span>
        <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, color: "#8a857c", marginLeft: 14 }}>
          npm i -D remotion-annotate
        </span>
      </div>

      <Cursor x={cur.x} y={cur.y} clickAt={clicks} frame={frame} />
    </AbsoluteFill>
  );
};

// tiny pixel critter (Claude Code style)
const Crab: React.FC = () => {
  const P = "#d97757";
  const rows = [
    [0, 1, 1, 1, 1, 1, 0],
    [1, 1, 2, 1, 2, 1, 1],
    [0, 1, 1, 1, 1, 1, 0],
    [0, 1, 0, 1, 0, 1, 0],
  ];
  return (
    <div style={{ display: "inline-block" }}>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "flex" }}>
          {r.map((c, j) => (
            <div key={j} style={{ width: 9, height: 9, background: c === 1 ? P : c === 2 ? "#2b2620" : "transparent" }} />
          ))}
        </div>
      ))}
    </div>
  );
};

const Popup: React.FC<{ x: number; y: number; crumb: React.ReactNode; text: string; caret: boolean; opacity: number }> = ({ x, y, crumb, text, caret, opacity }) => (
  <div style={{
    position: "absolute", left: x, top: y, width: 330, background: INK, borderRadius: 15, padding: 14,
    boxShadow: "0 24px 60px rgba(0,0,0,.5)", opacity, zIndex: 50,
  }}>
    <div style={{ fontSize: 12.5, color: "#9ca3af", marginBottom: 10, fontFamily: "ui-monospace, monospace" }}>{crumb}</div>
    <div style={{
      minHeight: 48, borderRadius: 10, border: "1.5px solid #3a3a3c", background: "#111", color: "#fff",
      padding: "10px 12px", fontSize: 14.5,
    }}>
      {text}
      {caret && <span style={{ borderRight: "2px solid #fff", marginLeft: 1 }}>&#8203;</span>}
    </div>
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 10, alignItems: "center" }}>
      <span style={{ color: "#9ca3af", fontSize: 13.5 }}>Cancel</span>
      <span style={{ background: BLUE, color: "#fff", fontSize: 13.5, fontWeight: 600, padding: "7px 16px", borderRadius: 9 }}>Add</span>
    </div>
  </div>
);
