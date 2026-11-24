#!/usr/bin/env node
// dajuguan auto-trigger: a UserPromptSubmit hook for Claude Code and Codex (same format in both).
//
// Reads the hook event (JSON) on stdin. If the prompt contains a trigger phrase, or looks big
// enough to need the whole view, it prints a short instruction that the assistant adds to the
// context for this turn, so the dajuguan skill is used every time — not only when the model
// happens to pick it. Prints nothing (no extra context, no cost) otherwise.
//
// Text the user did not type (messages from other sessions or sub-agents, background and
// scheduled runs) never triggers: see "notUser" in triggers.json.
//
// No dependencies, no network, no files written. Personal extra phrases may be listed one per
// line in ~/.claude/dajuguan/my-triggers.txt, or <CLAUDE_CONFIG_DIR>/dajuguan/ for another profile;
// the fixed opening words of your own scheduled prompts go in not-mine.txt there (both optional; read only).
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

function personal(name) {
  try {
    return fs.readFileSync(path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "dajuguan", name), "utf8")
      .split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  } catch { return []; }
}

const TRIGGERS = compile([...Object.values(T.triggers).flat(), ...personal("my-triggers.txt")]);
const NU = T.notUser || {};
const TAGS = (NU.tags || []).map(esc).join("|");
// A tag name ends at a space, ">" or "/": <wake-lock> is not <wake>.
const OPEN = TAGS && new RegExp(`<(${TAGS})(?=[\\s>/])[^>]*>`, "i");
const PAIR = TAGS && new RegExp(`<(${TAGS})(?=[\\s>/])[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
const PREAMBLE = /^\s*Another Claude session sent a message:\s*/i;
const NOT_USER_START = [...(NU.starts || []), ...personal("not-mine.txt").map(esc)]
  .map((re) => new RegExp(`^[\\s*_]*(?:${re})`, "i"));

// Drop wrapped messages that open the prompt. Each runs to its matching close (nesting counted, so a
// forwarded message inside one stays inside); one left open (cut off) runs to the end.
function dropLeadingWrappers(text) {
  for (;;) {
    text = text.replace(PREAMBLE, "");
    const m = OPEN && text.match(OPEN);
    if (!m || text.slice(0, m.index).trim()) return text;
    const tag = new RegExp(`<(\\/?)${esc(m[1])}(?=[\\s>/])[^>]*>`, "gi");
    tag.lastIndex = m.index + m[0].length;
    let depth = 1, end = -1, t;
    while (depth && (t = tag.exec(text))) if ((depth += t[1] ? -1 : 1) === 0) end = t.index + t[0].length;
    // Unclosed: a real (cut-off) wrapper puts its body on the next line; "<wake> 是什么" is a mention.
    if (end < 0) { if (!/^[ \t]*(\n|$)/.test(text.slice(m.index + m[0].length))) return text; end = text.length; }
    text = text.slice(end);
  }
}

const PATTERNS = Object.entries(T.patterns || {}).filter(([k]) => !k.startsWith("_")).map(([p, re]) => ({ p, re: new RegExp(re, "iu") }));
const SCOPE_FIXED = compile(T.scopeFixed);
const EXPLICIT = compile(T.explicit);
// 等 alone means "etc." only in a list ("A、B、C 等"), not in 等待 / 等一下 / 平等 / 等级 …
const DENG = new RegExp(`(?<![${T.deng.notAfter}])等(?![${T.deng.notBefore}]|${(T.deng.notBeforeWords || []).map(esc).join("|") || "$^"})`);
// Voice-typing filler sounds (嗯、呃、) are not a list.
const FILLERS = T.fillers ? new RegExp(T.fillers, "g") : null;
const TRAILERS = (NU.trailers || []).map((re) => new RegExp(re, "i"));
const ASKED = NU.asked ? { task: new RegExp(NU.asked.task, "i"), ask: new RegExp(NU.asked.ask, "i") } : null;
// A relayed message asks for the method only when its own first header is a new task (TASK / FOLLOWUP)
// and the words after that header ask for it. A sub-agent's report never does: it may quote tasks.
function relayedAsk(raw) {
  if (!ASKED || /<agent-message\b|\[Subagent hand-?back\]/i.test(raw)) return false;
  const m = raw.match(/^[ \t]*\[tw:[^\]\n]+\][^\n]*$/m);
  if (!m || !ASKED.task.test(m[0])) return false;
  const body = raw.slice(m.index + m[0].length).split(/<\/cross-session-message/i)[0];
  return ASKED.ask.test(body);
}

// Text the user pasted is material, not their own words: drop code blocks and quoted lines.
function ownWords(prompt) {
  // System text and other sessions' messages arrive through the same hook: not the user's words
  // either. Dropped first, so a stray ``` inside one cannot pair with the user's own code fence.
  let text = dropLeadingWrappers(prompt);
  if (PAIR) text = text.replace(PAIR, " ");
  return text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<pasted_content[\s\S]*?<\/pasted_content[^>]*>/g, " ")
    .split("\n").filter((l) => !/^\s*>/.test(l)).join("\n");
}

export function classify(prompt, event = {}) {
  // The host may say outright where the prompt came from (only "human" is the user typing).
  const origin = String(event.origin?.kind || "").toLowerCase();
  const src = String(event.promptSource || "").toLowerCase();
  if ((origin && origin !== "human") || src === "system" || event.isMeta === true || event.isMeta === "true")
    return { mode: "off", why: `not typed by the user (${origin || src || "meta"})` };
  const raw = String(prompt || "");
  let text = ownWords(raw);
  for (const re of TRAILERS) text = text.replace(re, "");
  // Nothing left once wrapped messages are dropped, or what is left opens with a relayed message
  // (thread header, system notice, sub-agent hand-back): the prompt is not the user's.
  if ((!text.trim() && raw.trim()) || NOT_USER_START.some((re) => re.test(text))) {
    // …unless it is a new task that explicitly asks for the method (a coordinator's "use the big picture").
    if (relayedAsk(raw)) return { mode: "full", why: "a relayed task asks for it" };
    return { mode: "off", why: "not the user's words" };
  }
  if (/^\s*\/dajuguan\b/i.test(text)) return { mode: "full", why: "asked for it: /dajuguan" };
  if (!text.trim() || /^\s*\//.test(text)) return { mode: "off", why: "empty or slash command" };
  // A shell command typed in bash mode ("!git status", or wrapped in <bash-input>) is not a request.
  if (/^\s*!/.test(text) || /<bash-(input|stdout|stderr)>/.test(text)) return { mode: "off", why: "shell command" };
  // Naming the method anywhere ("…用大局观", "big picture please") is an explicit request: beats a fixed scope.
  if (FILLERS) text = text.replace(FILLERS, "");
  const named = EXPLICIT.find((t) => t.re.test(text));
  if (named) return { mode: "full", why: `asked for it: "${named.p}"` };
  const fixed = SCOPE_FIXED.find((t) => t.re.test(text));
  if (fixed) return { mode: "off", why: `scope fixed: "${fixed.p}"` };
  const hit = TRIGGERS.find((t) => t.re.test(text)) || PATTERNS.find((t) => t.re.test(text));
  if (hit) return { mode: "full", why: `trigger phrase "${hit.p}"` };
  if (DENG.test(text)) return { mode: "full", why: "trigger phrase \"等\"" };
  const items = text.split("\n").filter((l) => /^\s*(\d+[.)、]|[-*•]|[一二三四五六七八九十]+、)/.test(l)).length;
  const size = [...text].length;
  if (size >= T.complex.minChars || items >= T.complex.minListItems)
    return { mode: "full", why: size >= T.complex.minChars ? `long request (${size} chars)` : `multi-part request (${items} items)` };
  return { mode: "light", why: "simple request" };
}

// The words live in triggers.json "message", so they can be checked against always-on.md and the skill.
export const MESSAGE = { full: (why) => T.message.join("\n").replace("{why}", why) };

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let event;
  try { event = JSON.parse(raw) || {}; } catch { return; }
  const r = classify(event.prompt || "", event);
  if (r.mode !== "full") return;
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: "UserPromptSubmit", additionalContext: MESSAGE.full(r.why) },
  }));
}

// Run when executed directly (not when imported by the tests). Compare real paths: the install
// location may sit behind a symlink.
const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(path.resolve(process.argv[1]))) main();
