// node test/trigger.test.mjs — checks the hook's decisions on real-world phrasings.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../hooks/dajuguan-trigger.mjs";

const cases = [
  // full: trigger phrases
  ["full", "Add a settings page with theme, font size, etc."],
  ["full", "Support formats such as CSV and JSON"],
  ["full", "Pick a name for the app, you decide"],
  ["full", "Anything else? What am I missing here"],
  ["full", "包括它的 documentations 和任何的标记标识等等，不要使用中文"],
  ["full", "Bundle ID 写个 com.AI lottery 点 session lottery 之类的"],
  ["full", "做几个版本，比如 Mac 和 Windows"],
  ["full", "支持导出 PDF、Word 等格式"],
  ["full", "这个你来判断"],
  ["full", "我也拿不准用哪个"],
  ["full", "不知道该用 Electron 还是 Tauri"],
  ["full", "I'm not sure which license fits"],
  ["full", "有没有办法做一个换 session 的工具"],
  ["full", "Fix the header, the footer, the sidebar..."],
  ["full", "こういう機能など"],
  // full: big or multi-part, no trigger words
  ["full", "1. rename the repo\n2. build four versions\n3. publish the skill"],
  ["full", "x".repeat(450)],
  // off: scope fixed wins over triggers
  ["off", "只改这一处，比如这个按钮的颜色"],
  ["off", "Only this: fix the typo in the title, e.g. 'Teh'"],
  ["off", "/compact"],
  // light: 等 as a verb or noun, "like" as an ordinary word, small asks
  ["light", "等一下再发"],
  ["light", "我等你回来"],
  ["light", "人人平等"],
  ["light", "这个等级不对"],
  ["light", "I like this color"],
  ["light", "ok"],
  // troubleshooting "I don't know where it is" is not handing over a judgment
  ["light", "我上传了之后，我也不知道在哪儿，它就卡住了呀"],
  ["light", "这个我不确定是哪一个，你帮我搜一下"],
  ["light", "把标题改成 Reroll"],
  // pasted material does not count as the user's own words
  ["light", "看看这段报错\n```\nfailed to load modules, plugins, etc.\n```"],
  ["light", "> such as this quoted line\n帮我翻译上面这句"],
];

let fail = 0;
for (const [want, prompt] of cases) {
  const got = classify(prompt);
  if (got.mode !== want) { fail++; console.log(`✗ want ${want}, got ${got.mode} (${got.why}): ${prompt.slice(0, 60)}`); }
}

// End to end: the script itself, fed a hook event on stdin.
const script = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "hooks", "dajuguan-trigger.mjs");
const run = (prompt) => execFileSync("node", [script], { input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt }), encoding: "utf8" });
const out = JSON.parse(run("列几个方案，比如 A 和 B"));
assert.equal(out.hookSpecificOutput.hookEventName, "UserPromptSubmit");
assert.match(out.hookSpecificOutput.additionalContext, /dajuguan/);
assert.equal(run("ok"), "");
assert.equal(execFileSync("node", [script], { input: "not json", encoding: "utf8" }), "");

assert.equal(fail, 0, `${fail} case(s) failed`);
console.log(`trigger tests passed: ${cases.length} cases + end-to-end`);
