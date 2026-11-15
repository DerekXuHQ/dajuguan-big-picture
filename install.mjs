#!/usr/bin/env node
// Installs Dajuguan · Big Picture for Claude Code (and optionally Codex).
//
//   node install.mjs                 install: skill + trigger hook + always-on rule (English skill)
//   node install.mjs --lang zh       same, Chinese skill
//   node install.mjs --dry-run       show what would change, change nothing
//   node install.mjs --uninstall     remove everything this script added
//
// Options: --no-hook  --no-rule  --codex (also add the rule to ~/.codex/AGENTS.md)
//
// Everything it touches (see README "What gets installed"):
//   ~/.claude/skills/dajuguan/SKILL.md     the skill
//   ~/.claude/dajuguan/hooks/              the trigger hook + its word lists
//   ~/.claude/settings.json                one UserPromptSubmit hook entry (merged, never replaced)
//   ~/.claude/CLAUDE.md                    the always-on rule, between dajuguan markers
//   ~/.codex/AGENTS.md                     same rule, only with --codex
// Existing files are backed up to ~/.claude/dajuguan/backup/<time>/ before they are changed.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.DAJUGUAN_HOME || os.homedir(); // override for testing
const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const lang = args.includes("--lang") ? args[args.indexOf("--lang") + 1] : "en";
if (!["en", "zh"].includes(lang)) throw new Error('--lang must be "en" or "zh"');
const DRY = has("--dry-run");

const CLAUDE = path.join(HOME, ".claude");
const P = {
  skill: path.join(CLAUDE, "skills", "dajuguan"),
  home: path.join(CLAUDE, "dajuguan"),
  hooks: path.join(CLAUDE, "dajuguan", "hooks"),
  settings: path.join(CLAUDE, "settings.json"),
  claudeMd: path.join(CLAUDE, "CLAUDE.md"),
  agentsMd: path.join(HOME, ".codex", "AGENTS.md"),
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
function rule(lng) {
  const md = fs.readFileSync(path.join(SRC, "always-on.md"), "utf8");
  const blocks = [...md.matchAll(/```\n([\s\S]*?)```/g)].map((m) => m[1].trim());
  return lng === "zh" ? blocks[1] : blocks[0];
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
  // Check first, write after: a broken settings.json stops the install before anything changes.
  const settings = has("--no-hook") ? null : readJson(P.settings);
  // 1. Skill
  const skillSrc = path.join(SRC, ...(lang === "zh" ? ["zh", "skills", "dajuguan"] : ["skills", "dajuguan"]), "SKILL.md");
  const skillDst = path.join(P.skill, "SKILL.md");
  const same = fs.existsSync(skillDst) && fs.readFileSync(skillDst, "utf8") === fs.readFileSync(skillSrc, "utf8");
  if (same) say("same", skillDst);
  else {
    const existed = fs.existsSync(skillDst);
    backup(P.skill);
    write(skillDst, fs.readFileSync(skillSrc, "utf8"));
    say(existed ? "update" : "add", skillDst, `(${lang})`);
  }

  // 2. Hook files + settings entry
  if (!has("--no-hook")) {
    for (const f of ["dajuguan-trigger.mjs", "triggers.json"]) {
      write(path.join(P.hooks, f), fs.readFileSync(path.join(SRC, "hooks", f), "utf8"));
      say("copy", path.join(P.hooks, f));
    }
    const s = settings;
    s.hooks ??= {};
    s.hooks.UserPromptSubmit ??= [];
    const groups = s.hooks.UserPromptSubmit;
    const found = groups.some((g) => (g.hooks || []).some(isOurs));
    for (const g of groups) for (const h of g.hooks || []) if (isOurs(h)) h.command = HOOK_CMD;
    if (!found) groups.push({ hooks: [{ type: "command", command: HOOK_CMD, timeout: 5 }] });
    backup(P.settings);
    write(P.settings, JSON.stringify(s, null, 2) + "\n");
    say(found ? "update" : "add", P.settings, "UserPromptSubmit → dajuguan-trigger.mjs (other settings untouched)");
  }

  // 3. Always-on rule
  if (!has("--no-rule")) {
    const targets = [P.claudeMd, ...(has("--codex") ? [P.agentsMd] : [])];
    for (const file of targets) {
      const before = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
      backup(file);
      write(file, withBlock(before, rule(lang)));
      say(before.includes(BEGIN) ? "update" : "add", file, "rule between dajuguan markers");
    }
  }
}

function uninstall() {
  if (fs.existsSync(P.skill)) { backup(P.skill); if (!DRY) fs.rmSync(P.skill, { recursive: true }); say("remove", P.skill); }
  if (fs.existsSync(P.settings)) {
    const s = readJson(P.settings);
    const groups = s.hooks?.UserPromptSubmit;
    if (groups?.some((g) => (g.hooks || []).some(isOurs))) {
      s.hooks.UserPromptSubmit = groups.map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isOurs(h)) })).filter((g) => g.hooks.length);
      if (!s.hooks.UserPromptSubmit.length) delete s.hooks.UserPromptSubmit;
      if (!Object.keys(s.hooks).length) delete s.hooks;
      backup(P.settings);
      write(P.settings, JSON.stringify(s, null, 2) + "\n");
      say("remove", P.settings, "dajuguan hook entry only");
    }
  }
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
if (!DRY && !has("--uninstall")) console.log("\nStart a new Claude Code session (or run /hooks to reload). Try: \"add export, e.g. PDF and Word\".");
