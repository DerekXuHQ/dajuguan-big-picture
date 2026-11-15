// node test/install.test.mjs — install / reinstall / uninstall in a throwaway HOME.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "install.mjs");
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "dajuguan-home-"));
const run = (...a) => execFileSync(process.execPath, [script, ...a], { env: { ...process.env, DAJUGUAN_HOME: HOME }, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const f = (...p) => path.join(HOME, ...p);
const read = (...p) => fs.readFileSync(f(...p), "utf8");
const ours = (s) => (s.hooks?.UserPromptSubmit || []).flatMap((g) => g.hooks).filter((h) => h.command.includes("dajuguan-trigger.mjs"));

// The user already has settings, other hooks and a CLAUDE.md.
fs.mkdirSync(f(".claude"), { recursive: true });
const mine = { model: "sonnet", hooks: { UserPromptSubmit: [{ hooks: [{ type: "command", command: "echo mine" }] }], Stop: [{ hooks: [{ type: "command", command: "echo stop" }] }] } };
fs.writeFileSync(f(".claude", "settings.json"), JSON.stringify(mine, null, 2));
fs.writeFileSync(f(".claude", "CLAUDE.md"), "# My rules\n\nBe brief.\n");
// ...and Codex, with an (empty) hooks.json of its own.
fs.mkdirSync(f(".codex"), { recursive: true });
const codexMine = { description: "my codex hooks", hooks: {} };
fs.writeFileSync(f(".codex", "hooks.json"), JSON.stringify(codexMine, null, 2));
const snapshot = () => JSON.stringify([read(".claude", "settings.json"), read(".claude", "CLAUDE.md")]);

// Dry run changes nothing.
const before = snapshot();
run("--dry-run");
assert.equal(snapshot(), before);
assert.ok(!fs.existsSync(f(".claude", "skills")));

// Install for Claude Code and Codex. (--lang is obsolete but still accepted.)
assert.match(run("--lang", "zh", "--codex"), /--lang is no longer needed/);
let s = JSON.parse(read(".claude", "settings.json"));
assert.equal(s.model, "sonnet");
assert.equal(s.hooks.Stop[0].hooks[0].command, "echo stop");
assert.equal(s.hooks.UserPromptSubmit.length, 2);
assert.equal(ours(s).length, 1);
// One bilingual skill: English first, then Chinese — the same file for Claude Code and Codex.
const skill = read(".claude", "skills", "dajuguan", "SKILL.md");
assert.ok(skill.indexOf("# Big picture: need") < skill.indexOf("# 大局观：需求"), "English half, then Chinese half");
assert.equal(read(".codex", "skills", "dajuguan", "SKILL.md"), skill);
// One bilingual rule, in CLAUDE.md and AGENTS.md.
assert.match(read(".claude", "CLAUDE.md"), /^# My rules[\s\S]*dajuguan:begin[\s\S]*Big-picture rule[\s\S]*大局观规则[\s\S]*dajuguan:end/);
assert.match(read(".codex", "AGENTS.md"), /Big-picture rule[\s\S]*大局观规则/);
// The same hook entry in Codex's hooks.json; its own fields kept.
const cx = JSON.parse(read(".codex", "hooks.json"));
assert.equal(cx.description, "my codex hooks");
assert.equal(ours(cx).length, 1);
assert.ok(fs.existsSync(f(".claude", "dajuguan", "hooks", "triggers.json")));

// The installed hook runs and fires.
const cmd = ours(s)[0].command;
const out = execFileSync("/bin/sh", ["-c", cmd], { input: JSON.stringify({ prompt: "加导出，比如 PDF" }), encoding: "utf8" });
assert.match(JSON.parse(out).hookSpecificOutput.additionalContext, /dajuguan/);

// Reinstall does not duplicate anything.
run("--codex");
assert.equal(ours(JSON.parse(read(".codex", "hooks.json"))).length, 1);
s = JSON.parse(read(".claude", "settings.json"));
assert.equal(ours(s).length, 1);
assert.equal(read(".claude", "CLAUDE.md").split("dajuguan:begin").length, 2);
assert.equal(read(".codex", "AGENTS.md").split("dajuguan:begin").length, 2);
assert.ok(fs.readdirSync(f(".claude", "dajuguan", "backup")).length >= 1);

// Personal triggers survive uninstall; everything else we added goes away; the user's own things stay.
fs.writeFileSync(f(".claude", "dajuguan", "my-triggers.txt"), "你看呢\n");
run("--uninstall");
s = JSON.parse(read(".claude", "settings.json"));
assert.deepEqual(s, mine);
assert.equal(read(".claude", "CLAUDE.md").trim(), "# My rules\n\nBe brief.");
assert.ok(!read(".codex", "AGENTS.md").includes("dajuguan"));
assert.deepEqual(JSON.parse(read(".codex", "hooks.json")), codexMine);
assert.ok(!fs.existsSync(f(".codex", "skills", "dajuguan")));
assert.ok(!fs.existsSync(f(".claude", "skills", "dajuguan")));
assert.ok(!fs.existsSync(f(".claude", "dajuguan", "hooks")));
assert.ok(fs.existsSync(f(".claude", "dajuguan", "my-triggers.txt")));

// --no-skill installs hook + rule only.
run("--no-skill");
assert.ok(!fs.existsSync(f(".claude", "skills", "dajuguan")));
assert.equal(ours(JSON.parse(read(".claude", "settings.json"))).length, 1);
run("--uninstall");

// Broken settings.json: refuse, change nothing.
fs.writeFileSync(f(".claude", "settings.json"), "{ not json");
assert.throws(() => run(), /not valid JSON/);
assert.equal(read(".claude", "settings.json"), "{ not json");
assert.ok(!fs.existsSync(f(".claude", "skills", "dajuguan")), "nothing installed when settings are broken");

fs.rmSync(HOME, { recursive: true, force: true });
console.log("install tests passed: dry run, bilingual install for Claude Code + Codex, hook fires, reinstall, uninstall, bad settings");
