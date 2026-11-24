#!/usr/bin/env node
// dajuguan outgoing guard: a PreToolUse hook on the tools that send a message to another session
// or agent. The big-picture marker ([Big picture · …] / 【大局观 · …】) is for the user; a message
// to another session that opens with it is stopped, with the reason, so the sender drops the
// marker and sends again. Everything else passes untouched.
//
// No dependencies, no network, no files written. Prints nothing when the message is fine.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The opening may carry a fixed thread header first ("[tw:X] DONE a -> b T1"), then the body.
const HEADER = /^\s*\[[a-z]+:[^\]\n]+\]/i;
// The marker: a bracket, the name, then a separator or the closing bracket
// (【大局观 · …】, 【大局观】, 【大局观：…】, [Big picture - …]); "【大局观】标记…" names the marker.
const MARK = "[【\\[]\\s*(?:大局观|全局观|big[- ]picture)\\s*(?:[·・•:：|\\-–—]|[】\\]](?!\\s*(?:标记|规则|这个|开头|的|marker|rule|tag)))";
// Where it counts as the opening: the start of one of the first lines, after decoration
// (emphasis, headings, table bars, backticks, invisible characters). A quote ("> ") or a list
// item ("- ") that starts with it is talking about the marker, not wearing it.
const AT_START = new RegExp("^[\\s*_#|`\\u200b-\\u200d\\ufeff]*" + MARK, "i");
const ANYWHERE = new RegExp(MARK, "i");
const FIRST_LINES = 3;

export function opensWithMarker(text) {
  const lines = String(text || "").split("\n").filter((l) => l.trim());
  // The header line itself: the marker anywhere after the header ("[tw:X] ACK a -> b T1 【大局观 · …】").
  if (lines.length && HEADER.test(lines[0])) {
    if (ANYWHERE.test(lines[0].replace(HEADER, ""))) return true;
    lines.shift();
  }
  return lines.slice(0, FIRST_LINES).some((l) => AT_START.test(l));
}

// The message text of the tools we watch: send_message (Remote Control), SendMessage (agents).
export function messageOf(input) {
  if (!input || typeof input !== "object") return "";
  return [input.message, input.content, input.text].find((v) => typeof v === "string") || "";
}

export function decide(event) {
  const text = messageOf(event?.tool_input);
  if (!opensWithMarker(text)) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        "dajuguan: this message to another session opens with the big-picture marker ([Big picture · …] / 【大局观 · …】). " +
        "The marker is for the user only. Remove it and send again.",
    },
  };
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let event;
  try { event = JSON.parse(raw) || {}; } catch { return; }
  const out = decide(event);
  if (out) process.stdout.write(JSON.stringify(out));
}

const real = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
if (process.argv[1] && real(fileURLToPath(import.meta.url)) === real(path.resolve(process.argv[1]))) main();
