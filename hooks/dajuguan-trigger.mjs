#!/usr/bin/env node
// dajuguan auto-trigger: a Claude Code UserPromptSubmit hook.
//
// Reads the hook event (JSON) on stdin. If the prompt contains a trigger phrase, or looks big
// enough to need the whole view, it prints a short instruction that Claude Code adds to the
// context for this turn, so the dajuguan skill is used every time — not only when the model
// happens to pick it. Prints nothing (no extra context, no cost) otherwise.
//
// No dependencies, no network, no files written. Personal extra phrases may be listed one per
// line in ~/.claude/dajuguan/my-triggers.txt (optional; read only).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const T = JSON.parse(fs.readFileSync(path.join(here, "triggers.json"), "utf8"));

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const latin = (s) => /^[\x00-\x7f]+$/.test(s);
// Latin phrases match as whole words, case-insensitively; CJK phrases match as substrings.
const compile = (list) => list.map((p) => ({
  p,
  // (word boundaries only on sides that are letters: "sidebar..." still matches "...")
  re: latin(p)
    ? new RegExp(`${/^[a-z]/i.test(p) ? "(^|[^a-z])" : ""}${esc(p.toLowerCase())}${/[a-z]$/i.test(p) ? "(?=$|[^a-z])" : ""}`, "i")
    : new RegExp(esc(p)),
}));

function personal() {
  try {
    return fs.readFileSync(path.join(os.homedir(), ".claude", "dajuguan", "my-triggers.txt"), "utf8")
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } catch { return []; }
}

const TRIGGERS = compile([...Object.values(T.triggers).flat(), ...personal()]);
const SCOPE_FIXED = compile(T.scopeFixed);
// 等 alone means "etc." only in a list ("A、B、C 等"), not in 等待 / 等一下 / 平等 / 等级 …
const DENG = new RegExp(`(?<![${T.deng.notAfter}])等(?![${T.deng.notBefore}])`);

// Text the user pasted is material, not their own words: drop code blocks and quoted lines.
function ownWords(prompt) {
  return prompt
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, " ")
    .split("\n").filter((l) => !/^\s*>/.test(l)).join("\n");
}

export function classify(prompt) {
  const text = ownWords(String(prompt || ""));
  if (!text.trim() || /^\s*\//.test(text)) return { mode: "off", why: "empty or slash command" };
  const fixed = SCOPE_FIXED.find((t) => t.re.test(text));
  if (fixed) return { mode: "off", why: `scope fixed: "${fixed.p}"` };
  const hit = TRIGGERS.find((t) => t.re.test(text));
  if (hit) return { mode: "full", why: `trigger phrase "${hit.p}"` };
  if (DENG.test(text)) return { mode: "full", why: "trigger phrase \"等\"" };
  const items = text.split("\n").filter((l) => /^\s*(\d+[.)、]|[-*•]|[一二三四五六七八九十]+、)/.test(l)).length;
  const size = [...text].length;
  if (size >= T.complex.minChars || items >= T.complex.minListItems)
    return { mode: "full", why: size >= T.complex.minChars ? `long request (${size} chars)` : `multi-part request (${items} items)` };
  return { mode: "light", why: "simple request" };
}

const MESSAGE = {
  full: (why) =>
    `[dajuguan] Big-picture FULL mode for this request (${why}). Use the dajuguan skill: ` +
    `1) write the original intent + success criterion; 2) widen on kin, impact, options, failure modes — ` +
    `examples are samples, not the scope; 3) converge on a recommended complete set, sorted into do / propose / drop. ` +
    `Start the reply with a marker line [Big picture · …] (Chinese replies: 【大局观 · …】).`,
};

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let prompt = "";
  try { prompt = JSON.parse(raw).prompt || ""; } catch { return; }
  const r = classify(prompt);
  if (r.mode !== "full") return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: MESSAGE.full(r.why) },
  }));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
