// node test/plugin.test.mjs — the plugin manifests agree with each other and the hooks they wire run.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const json = (...p) => JSON.parse(fs.readFileSync(path.join(root, ...p), "utf8"));

const cc = json(".claude-plugin", "plugin.json"), ccm = json(".claude-plugin", "marketplace.json");
const cx = json(".codex-plugin", "plugin.json"), cxm = json(".agents", "plugins", "marketplace.json");
// Same plugin and marketplace names everywhere, so the install commands in the README work on both.
for (const n of [cc.name, cx.name, ccm.plugins[0].name, cxm.plugins[0].name]) assert.equal(n, "dajuguan");
assert.equal(ccm.name, "dajuguan-big-picture");
assert.equal(cxm.name, "dajuguan-big-picture");
// Claude Code: no version, so every pushed commit is a new version for auto-update.
assert.equal(cc.version, undefined, "leave version out of .claude-plugin/plugin.json");
assert.equal(ccm.plugins[0].version, undefined);
assert.match(cx.version, /^\d+\.\d+\.\d+$/, "Codex caches by version: bump .codex-plugin version on every release");
assert.ok(fs.existsSync(path.join(root, cx.skills, "dajuguan", "SKILL.md")));

// hooks.json wires both hooks, and each command runs from the plugin root.
const hooks = json("hooks", "hooks.json").hooks;
const cmd = (ev) => hooks[ev][0].hooks[0].command.replace("${CLAUDE_PLUGIN_ROOT}", root);
const runHook = (ev, input) => JSON.parse(execFileSync("/bin/sh", ["-c", cmd(ev)], { input: JSON.stringify(input), encoding: "utf8" }));
const rule = runHook("SessionStart", { hook_event_name: "SessionStart" }).hookSpecificOutput;
assert.equal(rule.hookEventName, "SessionStart");
assert.match(rule.additionalContext, /Big-picture rule[\s\S]*大局观规则/);
const fired = runHook("UserPromptSubmit", { prompt: "加个导出，比如 PDF" }).hookSpecificOutput;
assert.match(fired.additionalContext, /^\[dajuguan\]/);
assert.equal(execFileSync("/bin/sh", ["-c", cmd("UserPromptSubmit")], { input: JSON.stringify({ prompt: "what time is it" }), encoding: "utf8" }), "");

console.log("plugin tests passed: manifests agree (Claude Code + Codex), rule hook and trigger hook run from the plugin root");
