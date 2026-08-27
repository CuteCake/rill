import { useState, useEffect } from "react";
import { colors, fonts } from "../utils/theme.js";
import { buildAiKit } from "../utils/ai-kit.js";

const C = colors;
const M = fonts.mono;

/** Copy with a fallback for non-secure contexts (file:// single-file build). */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand("copy");
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    return ok;
  }
}

const stepStyle = { display: "flex", gap: 10, lineHeight: 1.55 };
const numStyle = {
  flexShrink: 0, width: 18, height: 18, borderRadius: 9,
  background: C.accent + "22", color: C.accent,
  fontSize: 10, fontWeight: 700,
  display: "flex", alignItems: "center", justifyContent: "center",
  marginTop: 1,
};

/**
 * Pop-up guide for authoring profiles, with a one-click "AI kit" copy:
 * system prompt + both spec docs + the currently loaded source.
 */
export default function ProfileGuide({ open, onClose, src, fileName, nodes }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (open) setCopied(false);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const onCopy = async () => {
    const ok = await copyText(buildAiKit(src, fileName, nodes));
    setCopied(ok ? "yes" : "fail");
  };

  const chip = (text) => (
    <span
      style={{
        padding: "1px 6px", borderRadius: 3, background: C.surface,
        border: `1px solid ${C.border}`, color: C.bright, fontFamily: M,
        fontSize: 10, whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100,
        background: "#05070bcc", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 560, maxWidth: "92vw", maxHeight: "86vh", overflowY: "auto",
          background: C.panel, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: "18px 22px", fontSize: 11, color: C.text,
          boxShadow: "0 18px 60px #000a",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.bright }}>
            Bring your own dialect or format
          </div>
          <span
            onClick={onClose}
            style={{ cursor: "pointer", color: C.dim, fontSize: 13, padding: "0 2px" }}
          >
            ✕
          </span>
        </div>

        <div style={{ color: C.dim, lineHeight: 1.55, marginBottom: 14 }}>
          Rill learns new MLIR dialects and Caffe-style prototxt variants from a
          <b style={{ color: C.text }}> profile</b> — one declarative JSON file, no
          code. The fastest way to write one is to let an AI assistant do it:
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          <div style={stepStyle}>
            <span style={numStyle}>1</span>
            <span>
              Load a representative file first ({chip("📂 Open")}) — the copy below
              samples it for the assistant. Currently loaded: {chip(fileName)}.
            </span>
          </div>
          <div style={stepStyle}>
            <span style={numStyle}>2</span>
            <span>
              Click <b style={{ color: C.bright }}>Copy AI kit</b> and paste it into
              your assistant (Claude, ChatGPT, …). The kit contains the system
              prompt, both spec documents, and an auto-generated sample of your
              file: a <b style={{ color: C.bright }}>complete op inventory</b> plus
              representative excerpts — every op is visible to the assistant even
              when the file is huge.
            </span>
          </div>
          <div style={stepStyle}>
            <span style={numStyle}>3</span>
            <span>
              Save the reply as a <span style={{ fontFamily: M }}>.json</span> file and
              load it via {chip("⚙ Profile")}. Rejected? The red banner names exact
              paths with "did you mean" hints — paste it back verbatim.
            </span>
          </div>
          <div style={stepStyle}>
            <span style={numStyle}>4</span>
            <span>
              Iterate with <b style={{ color: C.bright }}>Profile debug</b> (sidebar,
              Profiles section): it shows which rule matched every op — paste any
              misclassifications back to the assistant.
            </span>
          </div>
        </div>

        <button
          onClick={onCopy}
          style={{
            width: "100%", padding: "9px 12px", borderRadius: 5,
            border: `1px solid ${copied === "yes" ? C.green + "66" : C.accent + "55"}`,
            background: copied === "yes" ? C.green + "14" : C.accent + "16",
            color: copied === "yes" ? C.green : C.accent,
            fontSize: 11, fontWeight: 700, cursor: "pointer",
          }}
        >
          {copied === "yes"
            ? "✓ Copied — paste it into your AI assistant"
            : copied === "fail"
              ? "Copy failed — see docs/PROFILE_SPEC.md + docs/IMPORT_SPEC.md"
              : "📋 Copy AI kit  (prompt + specs + " + fileName + ")"}
        </button>

        <div style={{ color: C.dim, fontSize: 10, marginTop: 10, lineHeight: 1.5 }}>
          Prefer to write it by hand? The same documents live in the repo:
          <span style={{ fontFamily: M }}> docs/PROFILE_SPEC.md</span> (dialect rules),
          <span style={{ fontFamily: M }}> docs/IMPORT_SPEC.md</span> (prototxt import
          mapping), and <span style={{ fontFamily: M }}>docs/schema/profile.schema.json</span>{" "}
          for editor autocomplete via <span style={{ fontFamily: M }}>"$schema"</span>.
        </div>
      </div>
    </div>
  );
}
