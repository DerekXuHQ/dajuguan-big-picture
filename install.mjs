#!/usr/bin/env node
// Installs Dajuguan · Big Picture for Claude Code (and optionally Codex).
//
//   node install.mjs                 install for Claude Code: skill + trigger hook + always-on rule
//   node install.mjs --codex         also install the same three for Codex
//   node install.mjs --dry-run       show what would change, change nothing
//   node install.mjs --uninstall     remove everything this script added
//
// Options: --no-skill (keep a copy you already have)  --no-hook  --no-rule  --codex
// The skill and the rule are bilingual (English first, then Chinese, same content); the assistant
// follows the user's language, so there is nothing to choose.
//
// Everything it touches (see README "What gets installed"):
//   ~/.claude/skills/dajuguan/SKILL.md     the skill
//   ~/.claude/dajuguan/hooks/              the trigger hook + its word lists
//   ~/.claude/settings.json                one UserPromptSubmit hook entry (merged, never replaced)
//   ~/.claude/CLAUDE.md                    the always-on rule, between dajuguan markers
//   ~/.codex/skills/dajuguan/SKILL.md      the skill, only with --codex
//   ~/.codex/hooks.json                    the same hook entry, only with --codex
//   ~/.codex/AGENTS.md                     the same rule, only with --codex
// Existing files are backed up to ~/.claude/dajuguan/backup/<time>/ before they are changed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.DAJUGUAN_HOME || os.homedir(); // override for testing
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
if (has("--lang")) console.log("Note: --lang is no longer needed — the skill and rule hold both English and Chinese.");
const DRY = has("--dry-run");

const CLAUDE = path.join(HOME, ".claude");
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
const HOOK_SCRIPT = path.join(P.hooks, "dajuguan-trigger.mjs");
// Absolute paths: hooks may run where PATH has no `node` (e.g. apps started from the Dock).
const HOOK_CMD = `"${process.execPath}" "${HOOK_SCRIPT}"`;
const isOurs = (h) => typeof h?.command === "string" && h.command.includes("dajuguan-trigger.mjs");

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
  try { return JSON.parse(t); } catch { throw new Error(`${file} is not valid JSON; fix it first, nothing was changed.`); }
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
// Claude Code and Codex use the same hooks format: { hooks: { UserPromptSubmit: [ { hooks: [ {type, command} ] } ] } }
function addHook(file, s) {
  s.hooks ??= {};
  s.hooks.UserPromptSubmit ??= [];
  const groups = s.hooks.UserPromptSubmit;
  const found = groups.some((g) => (g.hooks || []).some(isOurs));
  for (const g of groups) for (const h of g.hooks || []) if (isOurs(h)) h.command = HOOK_CMD;
  if (!found) groups.push({ hooks: [{ type: "command", command: HOOK_CMD, timeout: 5 }] });
  backup(file);
  write(file, JSON.stringify(s, null, 2) + "\n");
  say(found ? "update" : "add", file, "UserPromptSubmit → dajuguan-trigger.mjs (other settings untouched)");
}
function removeHook(file) {
  if (!fs.existsSync(file)) return;
  const s = readJson(file);
  const groups = s.hooks?.UserPromptSubmit;
  if (!groups?.some((g) => (g.hooks || []).some(isOurs))) return;
  s.hooks.UserPromptSubmit = groups.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) })).filter((g) => g.hooks.length);
  if (!s.hooks.UserPromptSubmit.length) delete s.hooks.UserPromptSubmit;
  backup(file);
  write(file, JSON.stringify(s, null, 2) + "\n");
  say("remove", file, "dajuguan hook entry only");
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

function install() {
  const codex = has("--codex");
  // Check first, write after: a broken settings file stops the install before anything changes.
  const settings = has("--no-hook") ? null : readJson(P.settings);
  const codexHooks = has("--no-hook") || !codex ? null : readJson(P.codexHooks);
  // 1. Skill
  if (!has("--no-skill")) {
    copySkill(P.skill);
    if (codex) copySkill(P.codexSkill);
  }
  // 2. Hook files + hook entries
  if (!has("--no-hook")) {
    for (const f of ["dajuguan-trigger.mjs", "triggers.json"]) {
      write(path.join(P.hooks, f), fs.readFileSync(path.join(SRC, "hooks", f), "utf8"));
      say("copy", path.join(P.hooks, f));
    }
    addHook(P.settings, settings);
    if (codex) addHook(P.codexHooks, codexHooks);
  }
  // 3. Always-on rule
  if (!has("--no-rule")) {
    for (const file of [P.claudeMd, ...(codex ? [P.agentsMd] : [])]) {
      const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      backup(file);
      write(file, withBlock(before, rule()));
      say(before.includes(BEGIN) ? "update" : "add", file, "rule between dajuguan markers");
    }
  }
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
  log.push(`  kept      ${P.home.replace(HOME, "~")}  (backups and your my-triggers.txt)`);
}

has("--uninstall") ? uninstall() : install();
console.log(`${DRY ? "Dry run — nothing changed. Would:" : has("--uninstall") ? "Uninstalled:" : "Installed:"}\n${log.join("\n")}`);
if (!DRY && fs.existsSync(BACKUP)) console.log(`\nBackups of changed files: ${BACKUP.replace(HOME, "~")}`);
if (!DRY && !has("--uninstall")) {
  console.log("\nStart a new Claude Code session (or run /hooks to reload). Try: \"add export, e.g. PDF and Word\".");
  if (has("--codex") && !has("--no-hook")) console.log("Codex: open /hooks in Codex once and trust the new dajuguan hook — Codex does not run a new hook until you do.");
}
