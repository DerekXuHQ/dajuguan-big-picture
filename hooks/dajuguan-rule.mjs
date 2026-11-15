#!/usr/bin/env node
// dajuguan always-on rule, for plugin installs: a SessionStart hook that adds the rule from
// always-on.md to the session's context, so it updates with the plugin instead of living in a
// hand-edited CLAUDE.md / AGENTS.md. No dependencies, no network, no files written.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const md = fs.readFileSync(path.join(root, "always-on.md"), "utf8");
const rule = md.match(/```\n([\s\S]*?)```/)[1].trim();
process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: rule },
}));
