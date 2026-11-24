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

// The opening line may carry a fixed thread header first ("[tw:X] DONE a -> b T1"), then the body.
const HEADER = /^\s*\[[a-z]+:[^\]\n]+\][^\n]*\n/i;
const MARKER = /^[\s>*_#-]*(?:【\s*大局观|\[\s*big[- ]picture\b)/i;

export function opensWithMarker(text) {
  const body = String(text || "").replace(HEADER, "");
  return MARKER.test(body) || MARKER.test(String(text || ""));
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
