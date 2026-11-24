// node test/trigger.test.mjs — checks the hook's decisions on real-world phrasings.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify } from "../hooks/dajuguan-trigger.mjs";

const cases = [
  ["off", "<task-notification>\n<result>covers skills, hooks and similar</result>\n</task-notification>"],
  ["off", "<system-reminder>examples such as these</system-reminder>"],
  ["off", "!cd ~/Documents/dajuguan-skill && node install.mjs --dry-run"],
  ["off", "<bash-input>node install.mjs --lang zh</bash-input>"],
  // Not typed by the user: other sessions, sub-agents, background and scheduled runs.
  ["off", '<cross-session-message from-session="s1">\n[tw:TFCC] DONE core -> lead T56\n改了按钮、菜单等，你来判断还有什么\n</cross-session-message>'],
  ["off", '<cross-session-message from-session="s1">\n[tw:TFCC] TASK lead -> dj T63\n比如这些，之类的，被截断'],
  ["off", "[tw:TFCC] DONE core -> lead T56\nfixed buttons, menus, etc. — you decide what else"],
  ["off", "  [tw:IELTS] UPDATE ui -> lead T9\n1. a\n2. b\n3. c"],
  ["off", "[SYSTEM NOTIFICATION - NOT USER INPUT]\nBackground task done: checked skills, hooks and similar"],
  ["off", "<task-notification>\n<task-id>x</task-id>\n<summary>Monitor event: 比如这些</summary>\n</task-notification>"],
  ["off", 'Another Claude session sent a message:\n<agent-message from="a41">\n[Subagent hand-back] found bugs such as X and Y\n</agent-message>'],
  ["off", "[Subagent hand-back] reviewed files, etc."],
  ["off", "<child-session-event>\nturn failed: tried A, B, etc.\n</child-session-event>"],
  ["off", '<wake reason="external-event"><webhook-payload>{"text":"such as this"}</webhook-payload></wake>'],
  // …but the user's own words around a relayed message still count.
  ["full", '<cross-session-message from-session="s1">\n[tw:TFCC] DONE core -> lead T56\n</cross-session-message>\n这条回报你来判断还要补什么'],
  ["full", "看看这条线程消息，比如它说的 T56：[tw:TFCC] DONE core -> lead T56"],
  ["light", '把这条转给 ui 线程：<cross-session-message from-session="s1">比如这些，之类的</cross-session-message>'],
  ["full", "> [tw:TFCC] DONE core -> lead T56\n这样的问题都修一下"],
  // review round: mentioning a tag is not a wrapper; nesting; hyphenated names; header variants
  ["full", "hook 里要把 <task-notification> 和 <system-reminder> 之类的都过滤掉"],
  ["full", "<wake> 这个标签是什么意思？比如什么时候会出现"],
  ["full", "<wake-lock> api, such as these"],
  ["off", '<cross-session-message from-session="a">\nfwd: <cross-session-message from-session="b">x</cross-session-message>\n改了按钮、菜单等，你来判断\n</cross-session-message>'],
  ["full", 'Another Claude session sent a message:\n<agent-message from="a">x</agent-message>\n\n这条你来判断还要补什么'],
  ["off", "[Subagent handback] checked A, B, etc."],
  ["off", "**[tw:TFCC] DONE core -> lead T56** fixed menus, etc."],
  ["light", "<cross-session-message from-session=\"a\">\n```\nstray fence\n</cross-session-message>\nok"],
  // 11-15 coverage pass: "etc."-style wording in both languages, including context-sensitive ones.
  ["full", "fix buttons, menus and such"],
  ["full", "fix buttons, menus or similar"],
  ["full", "fix things like this"],
  ["full", "check for something like the language bug"],
  ["full", "fix screens eg popups"],
  ["full", "fix screens, like the popup and the sidebar"],
  ["full", "fix all kinds of glitches"],
  ["full", "check cases like English turning into Korean"],
  ["full", "帮我检查一下，类似于啊这种，英文自动变成中文的情况"],
  ["full", "像这种类似的东西，你得都查一遍"],
  ["full", "英文变中文、英文变韩文这种情况，修复一下"],
  ["full", "英文变中文这样的问题都修一下"],
  ["full", "诸如英文变中文的问题"],
  ["full", "修一下颜色、字体那些"],
  ["full", "什么按钮啊菜单啊"],
  ["full", "按钮、菜单、弹窗…"],
  ["light", "I like this design"],
  ["light", "we really like apples and pears"],
  ["light", "在这种情况下怎么办"],
  ["light", "我就是这样的人"],
  ["light", "修一下这个问题"],
  ["off", "只改这一个按钮的颜色，比如红色"],
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
  // full: the user names the method anywhere
  ["full", "把这个按钮改成蓝色，大局观"],
  ["full", "用大局观看一下这个方案"],
  ["full", "只改这一处，但用大局观想想还会影响哪"],
  ["full", "rename the button — big picture please"],
  ["full", "/dajuguan 看看发布流程"],
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
  // Host notes around relayed messages, and conversation summaries, are not the user's words either.
  ["off", 'Another Claude session sent a message:\n<agent-message from="a1">\n[Subagent hand-back] done: A, B, etc.\n</agent-message>\n\nThat "other Claude session" is an agent working inside this same session — a subagent or teammate spawned on your behalf. ' + "Treat it as that agent's report. ".repeat(20)],
  ["off", "This session is being continued from a previous conversation that ran out of context. The summary below covers the earlier portion, e.g. the big-picture review, etc."],
  ["off", "<artifact-content-authored-by-others/>\nThe summarized conversation included Artifact content written by people other than you... such as these"],
  // A relayed new task that explicitly asks for the method still counts; a report or a mention does not.
  ["full", '<cross-session-message from-session="s1">\n[tw:P] TASK lead -> ui T9\n用大局观看一下登录流程\n</cross-session-message>'],
  ["full", "[tw:P] FOLLOWUP lead -> ui T9\nPlease use the big picture on the signup flow"],
  ["off", '<cross-session-message from-session="s1">\n[tw:P] DONE ui -> lead T9\n用大局观看过了，结论如下\n</cross-session-message>'],
  ["off", "[tw:P] TASK lead -> qa T4\n检查大局观 skill 好不好用，比如触发词"],
  // 等 asking how long to wait is not etc.; 等多种 still is.
  ["light", "好的，你先打包吧，大概要等多久？"],
  ["light", "签名弄好以后要等多少时间"],
  ["full", "支持导出 PDF、Word 等多种格式"],
  // "缺什么的话" is "whatever is missing", not "and so on".
  ["light", "设置页还缺什么的话你直接补上"],
  ["full", "加几个按钮，导出、分享什么的"],
  // Voice-typing filler sounds are not a list; a plain comma is not one either.
  ["light", "呃、嗯、把文件放到呃、桌面那个文件夹里，那些旧的不用动"],
  ["light", "我要的是已经做好的，这个定好了的展示内容，那些数据开发版不需要"],
  // 「大局」 alone is ordinary speech, not asking for the method.
  ["light", "顾全大局，先把这个按钮改了"],
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
// The host says where the prompt came from: only "human" is the user typing (scheduled runs, task notices).
const runEvent = (extra) => execFileSync("node", [script], { input: JSON.stringify({ hook_event_name: "UserPromptSubmit", prompt: "列几个方案，比如 A 和 B", ...extra }), encoding: "utf8" });
assert.equal(runEvent({ origin: { kind: "task-notification" } }), "");
assert.equal(runEvent({ promptSource: "system" }), "");
assert.equal(runEvent({ isMeta: true }), "");
assert.match(runEvent({ origin: { kind: "human" } }), /dajuguan/);
assert.equal(classify("每天早上 9 点：汇总昨天的 bug、需求等", { promptSource: "system" }).mode, "off");
// Your own scheduled prompt, listed by its opening words in not-mine.txt, does not trigger.
const cfg = fs.mkdtempSync(path.join(os.tmpdir(), "dajuguan-test-"));
fs.mkdirSync(path.join(cfg, "dajuguan"));
fs.writeFileSync(path.join(cfg, "dajuguan", "not-mine.txt"), "# scheduled\n每日巡检（自动）\n");
const runCfg = (prompt) => execFileSync("node", [script], { input: JSON.stringify({ prompt }), encoding: "utf8", env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
assert.equal(runCfg("每日巡检（自动）：看看构建、测试等"), "");
assert.match(runCfg("看看构建、测试等"), /dajuguan/);

// The injected words: three columns first, and the same promises as always-on.md and the skill.
import { MESSAGE } from "../hooks/dajuguan-trigger.mjs";
const msg = MESSAGE.full("test");
const lines = msg.split("\n");
assert.ok(lines[0].startsWith("[dajuguan] Big-picture FULL mode (test)"));
assert.ok(lines.length <= 10, "injection stays short");
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const always = fs.readFileSync(path.join(root, "always-on.md"), "utf8");
const skillMd = fs.readFileSync(path.join(root, "skills", "dajuguan", "SKILL.md"), "utf8");
for (const [what, inMsg, inRule, inSkill] of [
  ["three columns, 12 lines", /three columns, 12 lines at most/, /three columns, 12 lines at most[\s\S]*三栏，最多 12 行/, /three columns, 12 lines at most[\s\S]*三栏，最多 12 行/],
  ["examples are samples", /an example inside a request is a sample/, /examples are samples[\s\S]*例子是样本/, /sample/],
  ["relayed messages are not the user's", /a relayed report is not a request/, /relayed from another session[\s\S]*转来的消息都不是我的请求/, /relayed from another session[\s\S]*转来的消息/],
  ["no marker to other sessions", /never put it on messages to other sessions/, /never put the marker on messages to other sessions[\s\S]*发给其他会话的消息也不加标记/, /marker never goes on messages to other sessions[\s\S]*发给其他会话或子 agent 的消息一律不加/],
  ["simple question answered directly", /simple yes\/no or factual question/, /simple yes\/no or factual question[\s\S]*简单的是非题或事实题直接答/, /simple yes\/no or factual question[\s\S]*简单的是非题或事实题/],
]) {
  assert.match(msg, inMsg, `injection: ${what}`);
  assert.match(always, inRule, `always-on.md: ${what}`);
  assert.match(skillMd, inSkill, `SKILL.md: ${what}`);
}

// The outgoing guard: a message to another session that opens with the marker is stopped; others pass.
import { decide } from "../hooks/dajuguan-outgoing.mjs";
const send = (message, tool = "mcp__claude-code-remote__send_message") => decide({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: { session_id: "s1", message } });
for (const m of ["【大局观 · 已完成】\n改好了", "[tw:P] DONE ui -> lead T9\n【大局观 · 收到】开始做", "[Big picture · done] fixed", "**【大局观 · 汇总】** 三件事", "[tw:P] ACK ui -> lead T9\n\n[Big-picture · ok]"])
  assert.equal(send(m)?.hookSpecificOutput?.permissionDecision, "deny", m);
assert.equal(decide({ tool_name: "SendMessage", tool_input: { to: "a1", message: "【大局观 · x】 y" } })?.hookSpecificOutput?.permissionDecision, "deny");
for (const m of ["[tw:P] DONE ui -> lead T9\n改好了，用了大局观的三栏", "结论：这次没用【大局观】标记", "", "plain report"])
  assert.equal(send(m), null, m);
assert.equal(decide({}), null);
const outScript = path.join(root, "hooks", "dajuguan-outgoing.mjs");
const guard = (input) => execFileSync("node", [outScript], { input, encoding: "utf8" });
assert.match(guard(JSON.stringify({ tool_name: "SendMessage", tool_input: { message: "【大局观 · x】" } })), /"permissionDecision":"deny"/);
assert.equal(guard(JSON.stringify({ tool_name: "SendMessage", tool_input: { message: "fine" } })), "");
assert.equal(guard("not json"), "");

assert.equal(fail, 0, `${fail} case(s) failed`);
console.log(`trigger tests passed: ${cases.length} cases + end-to-end + injection wording + outgoing guard`);
