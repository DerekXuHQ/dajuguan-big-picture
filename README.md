<h1 align="center">Dajuguan · Big Picture</h1>

<p align="center">A skill that makes AI assistants solve what you meant, not just what you typed.<br>
When you say "1, 2, 3, etc.", the "etc." is the part that matters.</p>

<p align="center">English · <a href="#中文">中文</a></p>

---

## The problem

Ask an assistant to "add export to PDF, Word, etc." and you usually get PDF and Word. Correct one mistake and it fixes that one spot. Give it a number as an illustration and it becomes a hard rule. The assistant follows the letter of the request and misses the intent.

**Dajuguan** (大局观, "seeing the big picture") is a three-step working method that fixes this:

```
1 Real need      →  2 Widen the view           →  3 Converge: complete plan
  what to solve       kin · impact · options ·       recommend the full set,
                      failure modes                  make it a mechanism, verify
```

## Why it needs a hook

Skills are picked by the model, from their description. In practice a skill like this is skipped exactly when it matters: a short request with "etc." in it looks simple. So this repo ships three layers:

| Layer | What it is | When it acts | Cost |
|---|---|---|---|
| 1 Always-on rule | 5 lines in `CLAUDE.md` / `AGENTS.md` / ChatGPT custom instructions ([`always-on.md`](always-on.md)) | Every turn; catches intent without trigger words | ~150 tokens per turn |
| 2 Trigger hook | A Claude Code `UserPromptSubmit` hook ([`hooks/`](hooks/)) that detects trigger phrases (English, Chinese, more) and long or multi-part requests | Deterministic: when a trigger matches, the instruction is injected for that turn | 0 tokens when nothing matches |
| 3 The skill | The full method ([`skills/dajuguan/SKILL.md`](skills/dajuguan/SKILL.md)) | Loaded on demand when the hook or the model calls for it | Only when used |

The hook skips: slash commands, code blocks and quoted text you pasted (that's material, not your words), and requests where you fix the scope ("only this", "只改这一处"). In Chinese, 等 counts only when it means "etc." (A、B、C 等), not 等一下, 平等 or 等级.

## Install

### Claude Code

```bash
git clone https://github.com/DerekXuHQ/dajuguan-big-picture.git
mkdir -p ~/.claude/skills ~/.claude/dajuguan
cp -R dajuguan-big-picture/skills/dajuguan ~/.claude/skills/        # Chinese: zh/skills/dajuguan
cp -R dajuguan-big-picture/hooks ~/.claude/dajuguan/
```

Then add the hook to `~/.claude/settings.json` (merge with any `hooks` you already have):

```json
{
  "hooks": {
    "UserPromptSubmit": [
      { "hooks": [ { "type": "command", "command": "node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs", "timeout": 5 } ] }
    ]
  }
}
```

Optionally paste the rule from [`always-on.md`](always-on.md) into `~/.claude/CLAUDE.md`.

Needs Node.js 18+. The hook reads the prompt, prints at most one line of context, and does nothing else: no network, no files written.

**Your own phrases**: list extra triggers one per line in `~/.claude/dajuguan/my-triggers.txt`. When the assistant takes your examples literally and you have to say "those were only examples", add the phrase you used.

### Codex, Cursor and other agents

Paste the rule from [`always-on.md`](always-on.md) into `AGENTS.md` (or the agent's rules file), and keep `skills/dajuguan/SKILL.md` in the project for it to read.

### ChatGPT and other web chats

Paste the rule from [`always-on.md`](always-on.md) into **Settings → Personalization → Custom instructions**. To use the full method, upload `SKILL.md` to a Project's files.

## Test

```bash
node test/trigger.test.mjs
```

The test cases are real phrasings, including false-positive traps (等一下, "I like this", pasted error logs). Edit `hooks/triggers.json` to tune the lists; the thresholds for "long" (400 characters) and "multi-part" (3 list items) are there too.

## License

[MIT](LICENSE)

---

## 中文

**大局观**是一套三步工作方法：分析实际需求 → 全局视角拓展思路和范围 → 给出完整解决原始意图的方案。你说「1、2、3 等」，最重要的是那个「等」。

**为什么要挂钩子**：技能是模型按描述自己挑的，偏偏在最需要的时候被跳过——一句带「等」的短请求看上去很简单。所以这里分三层：

| 层 | 是什么 | 何时起作用 |
|---|---|---|
| 1 常驻规则 | 五行，放进 `CLAUDE.md` / `AGENTS.md` / ChatGPT 自定义指令（见 [`always-on.md`](always-on.md)） | 每一轮；没有触发词时也能按意图判断 |
| 2 触发钩子 | Claude Code 的 `UserPromptSubmit` 钩子，识别中英文等触发词和长请求、多部分请求 | 确定性的：一命中就在这一轮注入指令；不命中零开销 |
| 3 技能本体 | 完整方法，中文版在 [`zh/skills/dajuguan/SKILL.md`](zh/skills/dajuguan/SKILL.md) | 需要时才加载 |

钩子不会被这些触发：斜杠命令、你粘贴的代码块和引用（那是材料，不是你的话）、你限定了范围的请求（「只改这一处」）。中文的「等」只在表示列举时算（A、B、C 等），等一下、平等、等级都不算。

安装步骤同上（技能目录换成 `zh/skills/dajuguan`）。自己的口头禅可以一行一个写进 `~/.claude/dajuguan/my-triggers.txt`。
