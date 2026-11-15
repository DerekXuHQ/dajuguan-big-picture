<h1 align="center">Dajuguan · Big Picture</h1>

<p align="center">A skill that makes AI assistants solve what you meant, not just what you typed.<br>
When you say "1, 2, 3, etc.", the "etc." is the part that matters.</p>

<p align="center">English · <a href="#中文">中文</a></p>

---

## What it is

Ask an assistant to "add export, e.g. PDF and Word" and you usually get PDF and Word. Correct one mistake and it fixes that one spot. Give it a number as an illustration and it becomes a hard rule. The assistant follows the letter of the request and misses the intent.

**Dajuguan** (大局观, "seeing the big picture") is a working method in three steps:

```
1 Real need        →  2 Widen the view              →  3 Converge
  original intent       kin: the whole family            recommend the complete set
  + success criterion   impact: what else it touches     sorted into do / propose / drop
                        options: 2–3 routes              make it a mechanism, verify it
                        failure modes                    check back against the intent
```

Example: "add export, e.g. PDF and Word" → the intent is "get my notes out of the app in the formats people use". The widened set is PDF, Word, Markdown, HTML, plus batch export and how images and fonts survive. The reply recommends a set and says what it leaves out and why.

## How it works

A skill alone is not enough. Assistants pick skills by reading their descriptions, and a short request like "…, etc." looks simple, so the skill gets skipped exactly when it matters. This package therefore works in three layers:

| Layer | What it is | When it acts | Cost |
|---|---|---|---|
| 1 Always-on rule | 5 lines in `CLAUDE.md`, `AGENTS.md` or ChatGPT custom instructions ([`always-on.md`](always-on.md)) | Every turn; the model judges intent even without trigger words | ~150 tokens per turn |
| 2 Trigger hook | A Claude Code `UserPromptSubmit` hook ([`hooks/`](hooks/)) that runs before the model sees your message | Deterministic: on a match it adds one instruction to that turn | Nothing when it doesn't match |
| 3 The skill | The full method ([`skills/dajuguan/SKILL.md`](skills/dajuguan/SKILL.md), Chinese: [`zh/skills/dajuguan/SKILL.md`](zh/skills/dajuguan/SKILL.md)) | Loaded when the hook or the model calls for it | Only when used |

**What the hook reacts to** (lists in [`hooks/triggers.json`](hooks/triggers.json)):

| Signal | Examples |
|---|---|
| You ask for it by name | `/dajuguan`, or "big picture" / 大局观 / 用大局观 anywhere in the message — always wins |
| List not finished | etc., and so on, things like that, … · 等等、之类的、什么的、诸如此类 · など |
| Examples given | e.g., such as, for example · 比如、例如、举个例子 · 例えば, z.B., par exemple |
| Judgment handed over | you decide, what else, is there a better way · 你来判断、还有什么、有没有更好的 |
| Unsure which way | not sure which, can't decide · 拿不准、不知道该 |
| Big request | 400+ characters, or 3+ numbered or bulleted items |

**What it ignores**: other slash commands; code blocks and quoted lines you pasted (that's material, not your words); "only this", "just this one", 只改这一处 (you fixed the scope); 等 when it is not "etc." (等一下, 平等, 等级); "like" as an ordinary word.

## What's in this repo

```
skills/dajuguan/SKILL.md      the skill, English
zh/skills/dajuguan/SKILL.md   the skill, Chinese
hooks/dajuguan-trigger.mjs    the trigger hook (Node.js, no dependencies)
hooks/triggers.json           trigger phrases and thresholds
always-on.md                  the 5-line always-on rule, English + Chinese
install.mjs                   installer / uninstaller
test/                         trigger tests (real phrasings) + installer tests (throwaway home folder)
```

## What gets installed

| Where | What | Added by |
|---|---|---|
| `~/.claude/skills/dajuguan/SKILL.md` | The skill (English or Chinese) | always |
| `~/.claude/dajuguan/hooks/` | The hook script and `triggers.json` | default; skip with `--no-hook` |
| `~/.claude/settings.json` | One `UserPromptSubmit` entry pointing at the hook. Merged in: your other settings and hooks stay | default; skip with `--no-hook` |
| `~/.claude/CLAUDE.md` | The always-on rule, between `<!-- dajuguan:begin -->` and `<!-- dajuguan:end -->` | default; skip with `--no-rule` |
| `~/.codex/AGENTS.md` | Same rule, for Codex | only with `--codex` |
| `~/.claude/dajuguan/backup/<time>/` | A copy of every file above as it was before it changed | automatic |
| `~/.claude/dajuguan/my-triggers.txt` | Your own trigger phrases, one per line (optional; you create it) | you |

Requirements: [Claude Code](https://code.claude.com) and Node.js 18 or later. The hook makes no network requests and writes no files; it reads your message and prints at most one line.

## Install

### A. Script (recommended)

```bash
git clone https://github.com/DerekXuHQ/dajuguan-big-picture.git
cd dajuguan-big-picture
node install.mjs --dry-run      # see exactly what will change; changes nothing
node install.mjs                # English skill;  Chinese: node install.mjs --lang zh
```

Options: `--lang zh` · `--no-hook` · `--no-rule` · `--codex`. Running it again updates in place and never duplicates anything. On Windows, run the same commands in PowerShell.

Then start a new Claude Code session and type something like "add export, e.g. PDF and Word". The reply should start with `[Big picture · …]`.

### B. By hand

1. Copy the skill folder: `skills/dajuguan` (or `zh/skills/dajuguan`) → `~/.claude/skills/dajuguan`.
2. Copy `hooks/dajuguan-trigger.mjs` and `hooks/triggers.json` → `~/.claude/dajuguan/hooks/`.
3. Add the hook to `~/.claude/settings.json`. If the file already has a `"hooks"` section, add only the `UserPromptSubmit` part into it:

   ```json
   {
     "hooks": {
       "UserPromptSubmit": [
         { "hooks": [ { "type": "command", "command": "node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs", "timeout": 5 } ] }
       ]
     }
   }
   ```

   If Claude Code can't find `node` (common when it is started from the Dock), use the full path from `which node`.
4. Paste one of the two rules from [`always-on.md`](always-on.md) into `~/.claude/CLAUDE.md`.
5. Start a new session, or run `/hooks` to check that the hook is listed.

### C. Other assistants

| Assistant | What to do |
|---|---|
| Codex CLI | `node install.mjs --codex`, or paste the rule from `always-on.md` into `~/.codex/AGENTS.md` |
| Cursor, Windsurf, other agents | Paste the rule into the agent's rules file; keep `SKILL.md` in the project for it to read |
| ChatGPT, Claude.ai and other web chats | Paste the rule into custom instructions (ChatGPT: Settings → Personalization). For the full method, upload `SKILL.md` to a Project's files |

Only Claude Code runs the trigger hook. Everywhere else, the always-on rule does the job.

## Check that it works

```bash
echo '{"prompt":"add export, e.g. PDF and Word"}' | node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs   # prints one line of JSON
echo '{"prompt":"ok"}' | node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs                               # prints nothing
npm test                                                                                                  # in the repo: trigger + installer tests
```

## Uninstall

```bash
node install.mjs --uninstall
```

It removes the skill, the hook files, the hook entry in `settings.json` and the rule block. Everything else in those files stays. Backups and your `my-triggers.txt` are kept in `~/.claude/dajuguan/`; delete that folder too if you want nothing left.

## Customize

- **Your own phrases**: add them to `~/.claude/dajuguan/my-triggers.txt`, one per line. When the assistant takes your examples literally and you have to say "those were only examples", add the phrase you had used.
- **Thresholds and lists**: edit `~/.claude/dajuguan/hooks/triggers.json` (`complex.minChars`, `complex.minListItems`, the phrase lists).
- **Turn it off for one message**: say "only this" / "just this one" / 只改这一处.

## License

[MIT](LICENSE)

---

## 中文

### 这是什么

让 AI 去「加导出功能，比如 PDF 和 Word」，它通常就只做 PDF 和 Word；纠正它一个错，它只改那一处；你随手举个数字，它当成死规定。它照字面执行，没读懂你要什么。

**大局观**是一套三步工作方法：

```
1 实际需求          →  2 全局展开                 →  3 收敛
  原始意图              同类：例子所属的整族           推荐完整的一组
  + 成功标准            影响面：还牵动什么             分成「直接做 / 先提议 / 不做」
                        方案：两三条路线               做成机制，实测验证
                        失效模式                       回扣原始意图
```

你说「1、2、3 等」，最重要的是那个「等」。

### 原理：为什么光有技能不够

AI 按描述自己挑技能。带「等」的一句短话看上去很简单，技能偏偏在最需要的时候被跳过。所以这里分三层：

| 层 | 是什么 | 何时起作用 | 开销 |
|---|---|---|---|
| 1 常驻规则 | 五行，放进 `CLAUDE.md`、`AGENTS.md` 或 ChatGPT 自定义指令（[`always-on.md`](always-on.md)） | 每一轮；没有触发词也按意图判断 | 每轮约 150 token |
| 2 触发钩子 | Claude Code 的 `UserPromptSubmit` 钩子，在模型看到你的话之前先跑 | 确定性的：命中就在这一轮加一句指令 | 不命中零开销 |
| 3 技能本体 | 完整方法（中文版 [`zh/skills/dajuguan/SKILL.md`](zh/skills/dajuguan/SKILL.md)） | 钩子或模型需要时才加载 | 只在用时 |

**钩子认哪些**：

| 信号 | 例子 |
|---|---|
| 点名要用 | `/dajuguan`，或者话里任何位置带上「大局观」「用大局观」「big picture」——优先级最高，哪怕同时说了「只改这一处」 |
| 列举没说完 | 等等、之类的、什么的、诸如此类、……；etc.、and so on |
| 给了例子 | 比如、例如、举个例子；e.g.、such as |
| 把判断交给 AI | 你来判断、还有什么、有没有更好的；you decide、what else |
| 拿不准选哪个 | 拿不准、不知道该；not sure which |
| 大请求 | 400 字以上，或 3 条以上的编号/列表 |

**不触发**：其他斜杠命令；你粘贴的代码块和引用（那是材料，不是你的话）；「只改这一处」「就这个」（你限定了范围）；不是列举意思的「等」（等一下、平等、等级）；普通用法的「像」「这种」。

### 装了什么、装在哪

| 位置 | 内容 | 什么时候装 |
|---|---|---|
| `~/.claude/skills/dajuguan/SKILL.md` | 技能（中文或英文） | 一定装 |
| `~/.claude/dajuguan/hooks/` | 钩子脚本和 `triggers.json` | 默认装；`--no-hook` 跳过 |
| `~/.claude/settings.json` | 加一条 `UserPromptSubmit` 钩子。是合并进去的，你原有的设置和钩子都不动 | 默认装；`--no-hook` 跳过 |
| `~/.claude/CLAUDE.md` | 常驻规则，夹在 `<!-- dajuguan:begin -->` 和 `<!-- dajuguan:end -->` 之间 | 默认装；`--no-rule` 跳过 |
| `~/.codex/AGENTS.md` | 同一条规则，给 Codex 用 | 只有加 `--codex` 才装 |
| `~/.claude/dajuguan/backup/<时间>/` | 上面每个文件改动前的备份 | 自动 |
| `~/.claude/dajuguan/my-triggers.txt` | 你自己的触发词，一行一个（可选，你自己建） | 你 |

需要：[Claude Code](https://code.claude.com) 和 Node.js 18 以上。钩子不联网、不写文件，只读你这条消息，最多输出一行。

### 安装

**A. 脚本安装（推荐）**

```bash
git clone https://github.com/DerekXuHQ/dajuguan-big-picture.git
cd dajuguan-big-picture
node install.mjs --dry-run      # 先看会改哪些地方，什么都不改
node install.mjs --lang zh      # 中文技能；英文版去掉 --lang zh
```

可选参数：`--lang zh`、`--no-hook`、`--no-rule`、`--codex`。重复运行只会原地更新，不会重复添加。Windows 在 PowerShell 里跑同样的命令。

装好后开一个新的 Claude Code 会话，试一句「加个导出功能，比如 PDF 和 Word」，回复开头应该是【大局观 · …】。

**B. 手动安装**

1. 把 `zh/skills/dajuguan`（英文版是 `skills/dajuguan`）整个文件夹复制到 `~/.claude/skills/dajuguan`。
2. 把 `hooks/dajuguan-trigger.mjs` 和 `hooks/triggers.json` 复制到 `~/.claude/dajuguan/hooks/`。
3. 在 `~/.claude/settings.json` 里加上钩子（JSON 见上面英文部分第 3 步）。文件里已经有 `"hooks"` 的话，只把 `UserPromptSubmit` 那一段加进去。从程序坞启动的 Claude Code 可能找不到 `node`，这时把命令里的 `node` 换成 `which node` 给出的完整路径。
4. 把 [`always-on.md`](always-on.md) 里的中文规则贴进 `~/.claude/CLAUDE.md`。
5. 开新会话，或者输入 `/hooks` 看钩子是否在列表里。

**C. 其他 AI**

| 工具 | 做法 |
|---|---|
| Codex 命令行 | `node install.mjs --codex`，或把规则贴进 `~/.codex/AGENTS.md` |
| Cursor、Windsurf 等 | 把规则贴进它的规则文件；把 `SKILL.md` 放在项目里让它读 |
| ChatGPT、Claude 网页版等 | 把规则贴进自定义指令（ChatGPT：设置 → 个性化）；要完整方法就把 `SKILL.md` 上传到项目文件 |

只有 Claude Code 会跑触发钩子，其他地方靠常驻规则。

### 检查是否生效

```bash
echo '{"prompt":"加导出，比如 PDF"}' | node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs   # 输出一行 JSON
echo '{"prompt":"好的"}' | node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs               # 什么都不输出
```

### 卸载

```bash
node install.mjs --uninstall
```

删掉技能、钩子文件、`settings.json` 里那一条钩子和规则块；这些文件里你自己的内容都留着。备份和 `my-triggers.txt` 留在 `~/.claude/dajuguan/`，想彻底清掉就把这个文件夹也删了。

### 自定义

- **自己的口头禅**：一行一个写进 `~/.claude/dajuguan/my-triggers.txt`。AI 把你的例子当成全部、你不得不说「那只是举例」的时候，把你当时用的说法加进去。
- **阈值和词表**：改 `~/.claude/dajuguan/hooks/triggers.json`。
- **某一句不想用**：说「只改这一处」「就这个」。
