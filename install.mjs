#!/usr/bin/env node
// Installs Dajuguan · Big Picture for Claude Code (and optionally Codex).
//
//   node install.mjs                 install for Claude Code: skill + trigger hook + always-on rule
//   node install.mjs --codex         also install the same three for Codex
//   node install.mjs --dry-run       show what would change, change nothing
//   node install.mjs --uninstall     remove everything this script added
//   node install.mjs --check         is everything still in place and runnable? (after an upgrade, for example)
//   node install.mjs --rollback      go back to the version installed before the last update (again: forward)
//
// Options: --no-skill (keep a copy you already have)  --no-hook  --no-rule  --codex
// The skill and the rule are bilingual (English first, then Chinese, same content); the assistant
// follows the user's language, so there is nothing to choose.
//
// Everything it touches (see README "What gets installed"):
//   ~/.claude/skills/dajuguan/SKILL.md     the skill
//   ~/.claude/dajuguan/hooks/              the trigger hook + its word lists
//   ~/.claude/settings.json                three hook entries (merged, never replaced): the trigger
//                                          (UserPromptSubmit), the outgoing guard (PreToolUse on
//                                          tools that message other sessions), a start-up check
//                                          (SessionStart, not on Windows)
//   ~/.claude/CLAUDE.md                    the always-on rule, between dajuguan markers
//   ~/.codex/skills/dajuguan/SKILL.md      the skill, only with --codex
//   ~/.codex/hooks.json                    the same hook entry, only with --codex
//   ~/.codex/AGENTS.md                     the same rule, only with --codex
// Existing files are backed up to ~/.claude/dajuguan/backup/<time>/ before they are changed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.DAJUGUAN_HOME || os.homedir(); // override for testing
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const FLAGS = ["--check", "--codex", "--dry-run", "--lang", "--no-hook", "--no-rule", "--no-skill", "--rollback", "--uninstall"];
const unknown = args.filter((a, i) => !FLAGS.includes(a) && args[i - 1] !== "--lang"); // --lang takes a value (old, ignored)
if (unknown.length) { console.error(`Unknown option ${unknown.join(" ")}; nothing was changed. Options: ${FLAGS.join(" ")}`); process.exit(2); }
if (has("--lang")) console.log("Note: --lang is no longer needed — the skill and rule hold both English and Chinese.");
const DRY = has("--dry-run");

// A second Claude Code profile (CLAUDE_CONFIG_DIR=~/.claude-b, for example) is installed into with
// the same variable it runs with: CLAUDE_CONFIG_DIR=~/.claude-b node install.mjs
const CLAUDE = process.env.CLAUDE_CONFIG_DIR && !process.env.DAJUGUAN_HOME ? path.resolve(process.env.CLAUDE_CONFIG_DIR) : path.join(HOME, ".claude");
const P = {
  skill: path.join(CLAUDE, "skills", "dajuguan"),
  home: path.join(CLAUDE, "dajuguan"),
  hooks: path.join(CLAUDE, "dajuguan", "hooks"),
  settings: path.join(CLAUDE, "settings.json"),
  claudeMd: path.join(CLAUDE, "CLAUDE.md"),
  agentsMd: path.join(HOME, ".codex", "AGENTS.md"),
  codexSkill: path.join(HOME, ".codex", "skills", "dajuguan"),
  codexHooks: path.join(HOME, ".codex", "hooks.json"),
};
const BEGIN = "<!-- dajuguan:begin -->", END = "<!-- dajuguan:end -->";
const VERSION = JSON.parse(fs.readFileSync(path.join(SRC, "package.json"), "utf8")).version;
const HOOK_FILES = ["dajuguan-trigger.mjs", "dajuguan-outgoing.mjs", "triggers.json"];
const HOOK_SCRIPT = path.join(P.hooks, "dajuguan-trigger.mjs");
const OUT_SCRIPT = path.join(P.hooks, "dajuguan-outgoing.mjs");

// Absolute paths: hooks may run where PATH has no `node` (e.g. apps started from the Dock). But not a
// versioned one: Homebrew runs node from .../Cellar/node/<version>/bin/node, which disappears when node
// is upgraded and the hook would silently stop. Prefer a stable link to the same binary.
function stableNode(exec = process.execPath, exists = fs.existsSync, real = (p) => fs.realpathSync(p)) {
  const m = exec.match(/^(.*)\/Cellar\/node[^/]*\/[^/]+\/bin\/node$/);
  if (!m) return exec;
  for (const cand of [`${m[1]}/bin/node`, "/opt/homebrew/bin/node", "/usr/local/bin/node"]) {
    try { if (exists(cand) && real(cand) === real(exec)) return cand; } catch {}
  }
  return exec;
}
const NODE = stableNode();
const HOOK_CMD = `"${NODE}" "${HOOK_SCRIPT}"`;
const OUT_CMD = `"${NODE}" "${OUT_SCRIPT}"`;
// Start-up check, plain shell: it still runs when node itself is gone, which is what it is for.
const RULE_FILE = P.claudeMd;
const CHECK_CMD = `[ -x "${NODE}" ] && [ -f "${HOOK_SCRIPT}" ] && [ -f "${OUT_SCRIPT}" ] && grep -q "dajuguan:begin" "${RULE_FILE}" 2>/dev/null || echo '{"systemMessage":"dajuguan: part of the big-picture setup is missing (node, a hook file or the rule in CLAUDE.md; often after an upgrade). Run node install.mjs --check in your dajuguan folder."}' # dajuguan-check`;
const SEND_TOOLS = "mcp__claude-code-remote__send_message|SendMessage";
// Our entries in settings.json, by event; recognised by the script name in the command.
const ENTRIES = () => [
  { event: "UserPromptSubmit", mark: "dajuguan-trigger.mjs", command: HOOK_CMD },
  { event: "PreToolUse", mark: "dajuguan-outgoing.mjs", command: OUT_CMD, matcher: SEND_TOOLS },
  ...(process.platform === "win32" ? [] : [{ event: "SessionStart", mark: "dajuguan-check", command: CHECK_CMD }]),
];
// Most specific first: the start-up check names the trigger script too.
const MARKS = ["dajuguan-check", "dajuguan-outgoing.mjs", "dajuguan-trigger.mjs"];
const isOurs = (h, mark) => typeof h?.command === "string" && (mark ? h.command.includes(mark) : MARKS.some((m) => h.command.includes(m)));

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const BACKUP = path.join(P.home, "backup", stamp);
const log = [];
const say = (verb, p, note = "") => log.push(`  ${verb.padEnd(9)} ${p.replace(HOME, "~")}${note ? "  " + note : ""}`);

function backup(file) {
  if (!fs.existsSync(file) || DRY) return;
  const to = path.join(BACKUP, path.relative(HOME, file));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(file, to, { recursive: true });
}
function write(file, text) {
  if (DRY) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}
function readJson(file) {
  if (!fs.existsSync(file)) return {};
  const t = fs.readFileSync(file, "utf8").trim();
  if (!t) return {};
  let j;
  try { j = JSON.parse(t); } catch { throw new Error(`${file} is not valid JSON; fix it first, nothing was changed.`); }
  // Hooks files: { hooks: { <Event>: [ … ] } }. Another shape is not ours to rewrite.
  const bad = j && j.hooks != null && (typeof j.hooks !== "object" || Array.isArray(j.hooks) || Object.values(j.hooks).some((v) => !Array.isArray(v)));
  if (bad) throw new Error(`${file}: "hooks" is not in the expected shape ({ Event: [ … ] }); fix it first, nothing was changed.`);
  return j;
}
function rule() {
  const md = fs.readFileSync(path.join(SRC, "always-on.md"), "utf8");
  return md.match(/```\n([\s\S]*?)```/)[1].trim();
}
function copySkill(dir) {
  const src = fs.readFileSync(path.join(SRC, "skills", "dajuguan", "SKILL.md"), "utf8");
  const dst = path.join(dir, "SKILL.md");
  if (fs.existsSync(dst) && fs.readFileSync(dst, "utf8") === src) return say("same", dst);
  const existed = fs.existsSync(dst);
  backup(dir);
  write(dst, src);
  say(existed ? "update" : "add", dst, "(English + 中文)");
}
// Claude Code and Codex use the same hooks format: { hooks: { <Event>: [ { matcher?, hooks: [ {type, command} ] } ] } }
// Put our entries in (update ours in place, never duplicate, leave everyone else's alone). Returns true if changed.
function setEntries(s, entries) {
  s.hooks ??= {};
  let changed = false;
  for (const e of entries) {
    const groups = (s.hooks[e.event] ??= []);
    const mine = groups.flatMap((g) => (g.hooks || []).filter((h) => isOurs(h, e.mark)).map((h) => [g, h]));
    if (!mine.length) {
      groups.push({ ...(e.matcher ? { matcher: e.matcher } : {}), hooks: [{ type: "command", command: e.command, timeout: 5 }] });
      changed = true;
      continue;
    }
    for (const [g, h] of mine) {
      if (h.command !== e.command) { h.command = e.command; changed = true; }
      if (e.matcher && g.matcher !== e.matcher) { g.matcher = e.matcher; changed = true; }
    }
  }
  return changed;
}
// Take our entries out (all of them, or only those whose mark is not in `keep`). Returns true if changed.
function dropEntries(s, keep = []) {
  let changed = false;
  for (const [ev, groups] of Object.entries(s.hooks || {})) {
    if (!Array.isArray(groups)) continue;
    const next = groups.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h) || keep.some((m) => h.command.includes(m))) })).filter((g) => g.hooks.length);
    if (next.length !== groups.length || next.some((g, i) => g.hooks.length !== groups[i].hooks?.length)) changed = true;
    if (next.length) s.hooks[ev] = next; else delete s.hooks[ev];
  }
  return changed;
}
function addHook(file, s, entries) {
  if (!setEntries(s, entries)) return say("same", file, "dajuguan hooks already there");
  backup(file);
  write(file, JSON.stringify(s, null, 2) + "\n");
  say("update", file, `${entries.map((e) => e.event).join(", ")} → dajuguan (other settings untouched)`);
}
function removeHook(file) {
  if (!fs.existsSync(file)) return;
  const s = readJson(file);
  if (!dropEntries(s)) return;
  backup(file);
  write(file, JSON.stringify(s, null, 2) + "\n");
  say("remove", file, "dajuguan hook entries only");
}
// Our entries as they are now in a settings object: [{event, matcher?, command}].
function ourEntries(s) {
  const out = [];
  for (const [event, groups] of Object.entries(s.hooks || {}))
    for (const g of Array.isArray(groups) ? groups : []) for (const h of g.hooks || []) if (isOurs(h))
      out.push({ event, mark: MARKS.find((m) => h.command.includes(m)), command: h.command, ...(g.matcher ? { matcher: g.matcher } : {}) });
  return out;
}
// Put the rule between markers: replace an earlier copy, never duplicate.
function withBlock(text, body) {
  const block = `${BEGIN}\n${body}\n${END}`;
  const re = new RegExp(`${BEGIN}[\\s\\S]*?${END}`);
  return re.test(text) ? text.replace(re, block) : `${text.replace(/\s*$/, "")}${text.trim() ? "\n\n" : ""}${block}\n`;
}
function withoutBlock(text) {
  return text.replace(new RegExp(`\\n*${BEGIN}[\\s\\S]*?${END}\\n?`), "\n").replace(/^\n+/, "");
}

// The installed version, kept so it can be rolled back: hook files, the rule block, our settings entries, the skill.
const PREV = path.join(P.home, "previous");
function currentState() {
  const files = {};
  for (const f of HOOK_FILES) { const p = path.join(P.hooks, f); if (fs.existsSync(p)) files[f] = fs.readFileSync(p, "utf8"); }
  const md = fs.existsSync(P.claudeMd) ? fs.readFileSync(P.claudeMd, "utf8") : "";
  const m = md.match(new RegExp(`${BEGIN}\\n([\\s\\S]*?)\\n${END}`));
  const skillFile = path.join(P.skill, "SKILL.md");
  return {
    // Versions before 1.4.0 wrote no VERSION file.
    version: fs.existsSync(path.join(P.home, "VERSION")) ? fs.readFileSync(path.join(P.home, "VERSION"), "utf8").trim() : Object.keys(files).length ? "before 1.4.0" : "none",
    files, rule: m ? m[1] : null, entries: ourEntries(readJson(P.settings)),
    skill: fs.existsSync(skillFile) ? fs.readFileSync(skillFile, "utf8") : null,
  };
}
const sameState = (a, b) => JSON.stringify({ ...a, version: 0 }) === JSON.stringify({ ...b, version: 0 });
function saveState(dir, st) {
  if (DRY) return;
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "state.json"), JSON.stringify(st, null, 2) + "\n");
}
const loadState = (dir) => {
  const f = path.join(dir, "state.json");
  if (!fs.existsSync(f)) return null;
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { throw new Error(`${f} is damaged (not valid JSON); nothing was changed.`); }
};
function applyState(st) {
  // Hook files: exactly the saved set.
  for (const f of HOOK_FILES) {
    const p = path.join(P.hooks, f);
    if (f in st.files) write(p, st.files[f]); else if (fs.existsSync(p) && !DRY) fs.rmSync(p);
  }
  // Rule block.
  const before = fs.existsSync(P.claudeMd) ? fs.readFileSync(P.claudeMd, "utf8") : "";
  const after = st.rule == null ? withoutBlock(before) : withBlock(before, st.rule);
  if (after !== before) { backup(P.claudeMd); write(P.claudeMd, after); }
  // Settings: our entries only.
  const s = readJson(P.settings);
  dropEntries(s);
  setEntries(s, st.entries);
  backup(P.settings);
  write(P.settings, JSON.stringify(s, null, 2) + "\n");
  // Skill, only if one was saved (with --no-skill it is someone else's copy: left alone).
  if (st.skill != null) { backup(P.skill); write(path.join(P.skill, "SKILL.md"), st.skill); }
  write(path.join(P.home, "VERSION"), st.version + "\n");
}

function rollback() {
  const prev = loadState(PREV);
  if (!prev) { console.log("Nothing to roll back to: no earlier version was saved in " + PREV.replace(HOME, "~")); process.exitCode = 1; return; }
  const now = currentState();
  if (DRY) { console.log(`Dry run — would switch ${now.version} → ${prev.version}`); return; }
  applyState(prev);
  saveState(PREV, now); // so the same command goes forward again
  console.log(`Rolled back: ${now.version} → ${prev.version} (${CLAUDE.replace(HOME, "~")}).\nNew sessions use it; running ones keep what they loaded. Run --rollback again to go forward to ${now.version}.`);
}

function check() {
  const problems = [], ok = [], notes = [];
  let st;
  try { st = currentState(); } catch (e) {
    console.log(`dajuguan check (${CLAUDE.replace(HOME, "~")}):\n  PROBLEM   ${e.message}`);
    process.exitCode = 1;
    return;
  }
  // Another version installed on purpose (a rollback, or this folder is newer): what differs from this
  // folder is expected and only noted; what stops it from running is still a problem.
  const other = st.version !== VERSION;
  const differs = (line) => (other ? notes : problems).push(line);
  ok.push(`version ${st.version}${st.version === VERSION ? "" : ` (this folder has ${VERSION})`}`);
  for (const f of HOOK_FILES) f in st.files ? ok.push(`hook file ${f}`) : differs(`hook file ${f} missing`);
  const entries = st.entries;
  for (const e of ENTRIES()) {
    const got = entries.find((x) => x.mark === e.mark);
    if (!got) { (e.mark === "dajuguan-trigger.mjs" ? problems : { push: differs }).push(`${e.event} entry missing in ${P.settings.replace(HOME, "~")}`); continue; }
    const exe = got.command.match(/^\[ -x "([^"]+)"|^"([^"]+)"/);
    const bin = exe && (exe[1] || exe[2]);
    const script = (got.command.match(/"([^"]+\.mjs)"/) || [])[1];
    if (bin && !fs.existsSync(bin)) problems.push(`${e.event} entry runs ${bin}, which no longer exists`);
    else if (script && !fs.existsSync(script)) problems.push(`${e.event} entry runs ${script}, which is missing`);
    else ok.push(`${e.event} entry`);
  }
  if (st.rule == null) problems.push(`rule block missing in ${P.claudeMd.replace(HOME, "~")}`);
  else if (st.rule.trim() !== rule()) differs("rule block differs from this folder's always-on.md");
  else ok.push("rule block");
  // Run the installed trigger on a sample: it must fire for a user's request and stay quiet for a relayed one.
  const trig = entries.find((x) => x.mark === "dajuguan-trigger.mjs");
  if (trig && process.platform !== "win32") {
    const run = (prompt) => { try { return execFileSync("/bin/sh", ["-c", trig.command], { input: JSON.stringify({ prompt }), encoding: "utf8", timeout: 5000 }); } catch { return "ERROR"; } };
    const fires = run("add export, e.g. PDF and Word").includes("[dajuguan]");
    const quiet = run('<cross-session-message from-session="x">\n[tw:X] DONE a -> b T1\nfixed A, B, etc.\n</cross-session-message>') === "";
    (fires && quiet ? ok : problems).push(`trigger hook runs (fires on a request: ${fires}, quiet on a relayed message: ${quiet})`);
  }
  console.log(`dajuguan check (${CLAUDE.replace(HOME, "~")}):\n${ok.map((l) => "  ok        " + l).join("\n")}${notes.length ? "\n" + notes.map((l) => `  note      ${l} (version ${st.version} installed)`).join("\n") : ""}${problems.length ? "\n" + problems.map((l) => "  PROBLEM   " + l).join("\n") + "\n\nFix: run node install.mjs again from your dajuguan folder." : ""}`);
  if (problems.length) process.exitCode = 1;
}

function install() {
  const codex = has("--codex");
  // Check first, write after: a broken settings file stops the install before anything changes.
  const settings = has("--no-hook") ? null : readJson(P.settings);
  const codexHooks = has("--no-hook") || !codex ? null : readJson(P.codexHooks);
  const before = currentState();
  // 1. Skill
  if (!has("--no-skill")) {
    copySkill(P.skill);
    if (codex) copySkill(P.codexSkill);
  }
  // 2. Hook files + hook entries
  if (!has("--no-hook")) {
    for (const f of HOOK_FILES) {
      const src = fs.readFileSync(path.join(SRC, "hooks", f), "utf8"), dst = path.join(P.hooks, f);
      if (fs.existsSync(dst) && fs.readFileSync(dst, "utf8") === src) { say("same", dst); continue; }
      say(fs.existsSync(dst) ? "update" : "copy", dst);
      write(dst, src);
    }
    addHook(P.settings, settings, ENTRIES());
    // Codex: the trigger only (its tool and start-up hooks differ).
    if (codex) addHook(P.codexHooks, codexHooks, ENTRIES().slice(0, 1));
  }
  // 3. Always-on rule
  if (!has("--no-rule")) {
    for (const file of [P.claudeMd, ...(codex ? [P.agentsMd] : [])]) {
      const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      const after = withBlock(before, rule());
      if (after === before) { say("same", file, "rule already there"); continue; }
      backup(file);
      write(file, after);
      say(before.includes(BEGIN) ? "update" : "add", file, "rule between dajuguan markers");
    }
  }
  // Keep what was there before, so --rollback can bring it back; record the version now installed.
  const hadSomething = Object.keys(before.files).length || before.entries.length || before.rule != null;
  if (!DRY && hadSomething) {
    if (has("--no-skill")) before.skill = null; // someone else's copy: not ours to bring back
    // Only a real version change replaces the saved one: reinstalling the same version (or a fix
    // to it) must not overwrite the version you would roll back to.
    const changed = !sameState(before, { ...currentState(), skill: before.skill });
    if (changed && (before.version !== VERSION || !loadState(PREV))) saveState(PREV, before);
  }
  write(path.join(P.home, "VERSION"), VERSION + "\n");
}

function uninstall() {
  for (const dir of [P.skill, P.codexSkill]) {
    if (fs.existsSync(dir)) { backup(dir); if (!DRY) fs.rmSync(dir, { recursive: true }); say("remove", dir); }
  }
  removeHook(P.settings);
  removeHook(P.codexHooks);
  for (const file of [P.claudeMd, P.agentsMd]) {
    if (!fs.existsSync(file)) continue;
    const t = fs.readFileSync(file, "utf8");
    if (!t.includes(BEGIN)) continue;
    backup(file);
    write(file, withoutBlock(t));
    say("remove", file, "rule block only");
  }
  if (fs.existsSync(P.hooks)) { if (!DRY) fs.rmSync(P.hooks, { recursive: true }); say("remove", P.hooks); }
  // Nothing installed now: no version, and nothing to roll back to.
  for (const p of [path.join(P.home, "VERSION"), PREV]) if (fs.existsSync(p)) { if (!DRY) fs.rmSync(p, { recursive: true }); say("remove", p); }
  log.push(`  kept      ${P.home.replace(HOME, "~")}  (backups, my-triggers.txt and not-mine.txt)`);
}

if (has("--check")) { check(); process.exit(); }
try {
  // Read the files we would change first: a broken one stops everything before anything is touched.
  readJson(P.settings);
  if (fs.existsSync(P.codexHooks)) readJson(P.codexHooks);
  loadState(PREV);
  if (has("--rollback")) { rollback(); process.exit(); }
  has("--uninstall") ? uninstall() : install();
} catch (e) { console.error("dajuguan: " + e.message); process.exit(1); }
console.log(`${DRY ? "Dry run — nothing changed. Would:" : has("--uninstall") ? "Uninstalled:" : "Installed:"}\n${log.join("\n")}`);
if (!DRY && fs.existsSync(BACKUP)) console.log(`\nBackups of changed files: ${BACKUP.replace(HOME, "~")}`);
if (!DRY && !has("--uninstall")) {
  console.log("\nStart a new Claude Code session (or run /hooks to reload). Try: \"add export, e.g. PDF and Word\".");
  if (has("--codex") && !has("--no-hook")) console.log("Codex: open /hooks in Codex once and trust the new dajuguan hook — Codex does not run a new hook until you do.");
}
