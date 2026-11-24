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
// --check exits 1 when something is wrong; read its report either way.
const checkOut = () => { try { return run("--check"); } catch (e) { return e.stdout; } };
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

// The other two entries: the outgoing guard (only on the message tools) and the start-up check.
const byMark = (sx, ev, mark) => (sx.hooks?.[ev] || []).filter((g) => (g.hooks || []).some((h) => h.command.includes(mark)));
assert.equal(byMark(s, "PreToolUse", "dajuguan-outgoing.mjs").length, 1);
assert.match(byMark(s, "PreToolUse", "dajuguan-outgoing.mjs")[0].matcher, /send_message/);
const guardCmd = byMark(s, "PreToolUse", "dajuguan-outgoing.mjs")[0].hooks[0].command;
assert.match(execFileSync("/bin/sh", ["-c", guardCmd], { input: JSON.stringify({ tool_name: "SendMessage", tool_input: { message: "【大局观 · x】" } }), encoding: "utf8" }), /deny/);
const checkCmd = byMark(s, "SessionStart", "dajuguan-check")[0].hooks[0].command;
assert.equal(execFileSync("/bin/sh", ["-c", checkCmd], { encoding: "utf8" }), "", "start-up check quiet when all is in place");
// Codex gets the trigger only.
assert.equal(Object.keys(JSON.parse(read(".codex", "hooks.json")).hooks).join(), "UserPromptSubmit");
// --check passes on a fresh install and names the version.
assert.match(run("--check"), /ok\s+version \d+\.\d+\.\d+[\s\S]*trigger hook runs \(fires on a request: true, quiet on a relayed message: true\)/);

// Reinstall does not duplicate anything.
const again = run("--codex");
assert.equal(ours(JSON.parse(read(".codex", "hooks.json"))).length, 1);
// Nothing changed since the first install: every line says "same".
assert.ok(!/^\s+(add|update|copy)\s/m.test(again), again);
s = JSON.parse(read(".claude", "settings.json"));
assert.equal(ours(s).length, 1);
assert.equal(read(".claude", "CLAUDE.md").split("dajuguan:begin").length, 2);
assert.equal(read(".codex", "AGENTS.md").split("dajuguan:begin").length, 2);
assert.ok(fs.readdirSync(f(".claude", "dajuguan", "backup")).length >= 1);

// Rollback: an update is kept, and --rollback brings the version before it back (again: forward).
const trig = f(".claude", "dajuguan", "hooks", "triggers.json");
const v2 = read(".claude", "dajuguan", "hooks", "triggers.json");
fs.writeFileSync(f(".claude", "dajuguan", "VERSION"), "0.9.0\n");                 // pretend an older version was installed
fs.writeFileSync(trig, v2.replace('"大局观"', '"大局观", "OLD-MARK"'));               // …with older files
const oldMd = read(".claude", "CLAUDE.md").replace("Big-picture rule", "Big-picture rule OLD");
fs.writeFileSync(f(".claude", "CLAUDE.md"), oldMd);
assert.match(checkOut(), /note\s+rule block differs[^\n]*\(version 0\.9\.0 installed\)/); // another version: expected, noted
run("--codex");                                                                      // update to this folder's version
assert.equal(read(".claude", "dajuguan", "hooks", "triggers.json"), v2);
// A fix reinstalled under the same version keeps 0.9.0 as the one to roll back to.
fs.writeFileSync(trig, v2.replace('"大局观"', '"大局观", "SAME-VERSION-FIX"'));
run("--codex");
assert.match(run("--rollback"), /Rolled back: \d+\.\d+\.\d+ → 0\.9\.0/);
assert.match(read(".claude", "dajuguan", "hooks", "triggers.json"), /OLD-MARK/);
assert.match(read(".claude", "CLAUDE.md"), /Big-picture rule OLD/);
assert.equal(read(".claude", "CLAUDE.md").split("dajuguan:begin").length, 2);
assert.equal(ours(JSON.parse(read(".claude", "settings.json"))).length, 1);
assert.match(run("--rollback"), /Rolled back: 0\.9\.0 → \d+\.\d+\.\d+/);         // and forward again
assert.equal(read(".claude", "dajuguan", "hooks", "triggers.json"), v2);
assert.doesNotMatch(read(".claude", "CLAUDE.md"), /OLD/);
assert.match(run("--check"), /trigger hook runs \(fires on a request: true/);
// Same version but the rule was edited by hand: a problem.
const goodMd = read(".claude", "CLAUDE.md");
fs.writeFileSync(f(".claude", "CLAUDE.md"), goodMd.replace("Big-picture rule", "Big-picture rule EDITED"));
assert.match(checkOut(), /PROBLEM\s+rule block differs/);
fs.writeFileSync(f(".claude", "CLAUDE.md"), goodMd);
// The start-up check also speaks up when the rule block is gone.
const keepMd = read(".claude", "CLAUDE.md");
fs.writeFileSync(f(".claude", "CLAUDE.md"), "# My rules\n");
assert.match(JSON.parse(execFileSync("/bin/sh", ["-c", checkCmd], { encoding: "utf8" })).systemMessage, /setup is missing/);
fs.writeFileSync(f(".claude", "CLAUDE.md"), keepMd);
// A broken node path (an upgrade removed it) is reported, and the start-up check speaks up.
const sx = JSON.parse(read(".claude", "settings.json"));
for (const ev of ["UserPromptSubmit", "SessionStart"]) for (const g of sx.hooks[ev]) for (const h of g.hooks) h.command = h.command.replaceAll(process.execPath, "/no/such/node").replace(/"[^"]*\/bin\/node"/, '"/no/such/node"');
fs.writeFileSync(f(".claude", "settings.json"), JSON.stringify(sx, null, 2));
assert.throws(() => run("--check"), (e) => /PROBLEM\s+UserPromptSubmit entry runs \/no\/such\/node/.test(e.stdout));
const broken = byMark(sx, "SessionStart", "dajuguan-check")[0].hooks[0].command;
assert.match(JSON.parse(execFileSync("/bin/sh", ["-c", broken], { encoding: "utf8" })).systemMessage, /setup is missing/);
run("--codex");                                                                      // reinstall repairs it
assert.match(run("--check"), /trigger hook runs \(fires on a request: true/);

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

// Uninstall, install again, roll back: nothing to roll back to (no empty "previous"), nothing taken apart.
run("--uninstall");
assert.ok(!fs.existsSync(f(".claude", "dajuguan", "VERSION")));
run();
assert.throws(() => run("--rollback"), (e) => /Nothing to roll back to/.test(e.stdout));
assert.match(run("--check"), /trigger hook runs \(fires on a request: true/);
run("--uninstall");

// Broken settings.json: refuse, change nothing.
fs.writeFileSync(f(".claude", "settings.json"), "{ not json");
assert.throws(() => run(), /not valid JSON/);
assert.equal(read(".claude", "settings.json"), "{ not json");
assert.ok(!fs.existsSync(f(".claude", "skills", "dajuguan")), "nothing installed when settings are broken");
assert.match(checkOut(), /PROBLEM\s+.*not valid JSON/);

// settings.json in another shape (an event that is not a list): refuse before touching anything.
fs.writeFileSync(f(".claude", "settings.json"), JSON.stringify({ hooks: { UserPromptSubmit: { hooks: [] } } }));
assert.throws(() => run(), /not in the expected shape/);
assert.ok(!fs.existsSync(f(".claude", "skills", "dajuguan")), "nothing installed when the hooks shape is unexpected");
assert.throws(() => run("--uninstall"), /not in the expected shape/);
// A mistyped option changes nothing.
fs.writeFileSync(f(".claude", "settings.json"), JSON.stringify(mine, null, 2));
assert.throws(() => run("--rolback"), /Unknown option --rolback/);
assert.ok(!fs.existsSync(f(".claude", "skills", "dajuguan")), "a mistyped option installs nothing");
// A damaged rollback point: a clear message, not a stack trace.
fs.mkdirSync(f(".claude", "dajuguan", "previous"), { recursive: true });
fs.writeFileSync(f(".claude", "dajuguan", "previous", "state.json"), "{ broken");
assert.throws(() => run("--rollback"), /is damaged/);
fs.rmSync(f(".claude", "dajuguan", "previous"), { recursive: true });

// A second profile (CLAUDE_CONFIG_DIR) gets its own copy; the default profile is untouched.
fs.writeFileSync(f(".claude", "settings.json"), JSON.stringify(mine, null, 2));
const B = f(".claude-b");
execFileSync(process.execPath, [script, "--no-skill"], { env: { ...process.env, DAJUGUAN_HOME: "", HOME, CLAUDE_CONFIG_DIR: B }, encoding: "utf8" });
assert.equal(ours(JSON.parse(fs.readFileSync(path.join(B, "settings.json"), "utf8"))).length, 1);
assert.match(fs.readFileSync(path.join(B, "CLAUDE.md"), "utf8"), /大局观规则/);
assert.ok(fs.existsSync(path.join(B, "dajuguan", "hooks", "dajuguan-trigger.mjs")));
assert.equal(ours(JSON.parse(read(".claude", "settings.json"))).length, 0, "default profile untouched");

fs.rmSync(HOME, { recursive: true, force: true });
console.log("install tests passed: dry run, bilingual install for Claude Code + Codex, three hooks, --check, --rollback both ways, broken node path, reinstall, uninstall, bad settings, unexpected hooks shape, mistyped option, damaged rollback point");
