<p align="center"><img src="docs/images/hero.jpg" width="100%" alt="Ink-wash landscape: a small figure in a red robe on a cliff looks over a wide valley of mountains, rivers and villages"></p>

<h1 align="center">Dajuguan · Big Picture</h1>

<p align="center">A skill that makes AI assistants solve what you meant, not just what you typed.<br>
When you say "1, 2, 3, etc.", the "etc." is the part that matters.</p>

<p align="center">English · <a href="#中文">中文</a></p>

---

## What it is

Ask an assistant to "add export, e.g. PDF and Word" and you usually get PDF and Word. Correct one mistake and it fixes that one spot. Give it a number as an illustration and it becomes a hard rule. The assistant follows the letter of the request and misses the intent.

**Dajuguan** (大局观, "seeing the big picture") is a working method in three steps:

<p align="center"><img src="docs/images/method.jpg" width="80%" alt="Ink-wash: a stone held in a hand, ripples revealing many similar stones, then the stones laid in a complete circle"></p>

```
1 Real need        →  2 Widen the view              →  3 Converge
  original intent       kin: the whole family            recommend the complete set
  + success criterion   impact: what else it touches     sorted into do / propose / drop
                        options: 2–3 routes              make it a mechanism, verify it
                        failure modes                    check back against the intent
```

Example: "add export, e.g. PDF and Word" → the intent is "get my notes out of the app in the formats people use". The widened set is PDF, Word, Markdown, HTML, plus batch export and how images and fonts survive. The reply recommends a set and says what it leaves out and why.

## How it works

<p align="center"><img src="docs/images/layers.jpg" width="80%" alt="Three floating paper layers over misty mountains: quiet mist, a red bell, an open scroll"></p>

A skill alone is not enough. Assistants pick skills by reading their descriptions, and a short request like "…, etc." looks simple, so the skill gets skipped exactly when it matters. This package therefore works in three layers:

| Layer | What it is | When it acts | Cost |
|---|---|---|---|
| 1 Always-on rule | 5 lines in `CLAUDE.md`, `AGENTS.md` or ChatGPT custom instructions ([`always-on.md`](always-on.md)) | Every turn; the model judges intent even without trigger words | ~150 tokens per turn |
| 2 Trigger hook | A `UserPromptSubmit` hook ([`hooks/`](hooks/)) for Claude Code and Codex, which run it before the model sees your message | Deterministic: on a match it adds one instruction to that turn | Nothing when it doesn't match |
| 3 The skill | The full method, one file: [`skills/dajuguan/SKILL.md`](skills/dajuguan/SKILL.md) | Loaded when the hook or the model calls for it | Only when used |

**Languages.** The skill and the rule are each one file holding the same text twice: English first, then Chinese. A short note at the top tells the assistant to read the half in your language and reply in that language, so English and Chinese users install the same thing and nothing has to be chosen.

**Which assistant gets which layer**

| Assistant | Rule | Hook | Skill |
|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | yes | `~/.claude/skills/` |
| Codex CLI | `~/.codex/AGENTS.md` | yes (trust it once in Codex's `/hooks`) | `~/.codex/skills/` |
| Cursor, Windsurf, other agents | their rules file | no | keep `SKILL.md` in the project |
| ChatGPT, Claude.ai and other web chats | custom instructions | no | upload `SKILL.md` (Claude.ai: as a skill; ChatGPT: Project files) |

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
skills/dajuguan/SKILL.md      the skill: English first, then Chinese, same content
hooks/dajuguan-trigger.mjs    the trigger hook (Node.js, no dependencies)
hooks/triggers.json           trigger phrases and thresholds
hooks/dajuguan-rule.mjs       plugin installs: adds the always-on rule at session start
hooks/hooks.json              plugin installs: wires both hooks (Claude Code and Codex)
.claude-plugin/               Claude Code plugin + marketplace manifests
.codex-plugin/, .agents/      Codex plugin + marketplace manifests
always-on.md                  the always-on rule: English first, then Chinese
install.mjs                   installer / uninstaller
test/                         trigger tests (real phrasings) + installer tests (throwaway home folder)
```

## What gets installed

| Where | What | Added by |
|---|---|---|
| `~/.claude/skills/dajuguan/SKILL.md` | The skill (English + Chinese in one file) | default; skip with `--no-skill` |
| `~/.claude/dajuguan/hooks/` | The hook script and `triggers.json` | default; skip with `--no-hook` |
| `~/.claude/settings.json` | One `UserPromptSubmit` entry pointing at the hook. Merged in: your other settings and hooks stay | default; skip with `--no-hook` |
| `~/.claude/CLAUDE.md` | The always-on rule, between `<!-- dajuguan:begin -->` and `<!-- dajuguan:end -->` | default; skip with `--no-rule` |
| `~/.codex/skills/dajuguan/SKILL.md` | The same skill, for Codex | only with `--codex` (and not with `--no-skill`) |
| `~/.codex/hooks.json` | The same hook entry, for Codex. Merged in like `settings.json` | only with `--codex` (and not with `--no-hook`) |
| `~/.codex/AGENTS.md` | The same rule, for Codex | only with `--codex` (and not with `--no-rule`) |
| `~/.claude/dajuguan/backup/<time>/` | A copy of every file above as it was before it changed | automatic |
| `~/.claude/dajuguan/my-triggers.txt` | Your own trigger phrases, one per line (optional; you create it) | you |

Requirements: [Claude Code](https://code.claude.com) and/or Codex CLI, and Node.js 18 or later. Codex uses the hook files under `~/.claude/dajuguan/hooks/` too. The hook makes no network requests and writes no files; it reads your message and prints at most one line.

## Install

### A. As a plugin (recommended: you get updates)

The repository is a plugin marketplace for both Claude Code and Codex. A plugin install brings all three layers — the skill, the trigger hook, and the always-on rule (added at the start of each session by a hook, so it updates too) — and touches none of your own files.

**Claude Code**

```bash
claude plugin marketplace add DerekXuHQ/dajuguan-big-picture
claude plugin install dajuguan@dajuguan-big-picture
```

Or inside a session: `/plugin marketplace add DerekXuHQ/dajuguan-big-picture`, then `/plugin install dajuguan@dajuguan-big-picture`. The skill appears as `/dajuguan:dajuguan`.

**Codex**

```bash
codex plugin marketplace add DerekXuHQ/dajuguan-big-picture
codex plugin add dajuguan@dajuguan-big-picture
```

Then open `/hooks` in Codex once and trust the two dajuguan hooks.

Use the plugin **or** the script below, not both: both at once would run the hook twice. To switch from the script to the plugin, run `node install.mjs --uninstall` first.

### B. Script

```bash
git clone https://github.com/DerekXuHQ/dajuguan-big-picture.git
cd dajuguan-big-picture
node install.mjs --dry-run      # see exactly what will change; changes nothing
node install.mjs                # Claude Code
node install.mjs --codex        # Claude Code and Codex
```

Options: `--no-skill` (you already have the skill from elsewhere) · `--no-hook` · `--no-rule` · `--codex`. Running it again updates in place and never duplicates anything. On Windows, run the same commands in PowerShell.

Then start a new Claude Code session and type something like "add export, e.g. PDF and Word". The reply should start with `[Big picture · …]`. In Codex, open `/hooks` once and trust the dajuguan hook: Codex does not run a new hook until you do.

### C. By hand

1. Copy the skill folder: `skills/dajuguan` → `~/.claude/skills/dajuguan` (Codex: `~/.codex/skills/dajuguan`).
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

   If Claude Code can't find `node` (common when it is started from the Dock), use the full path from `which node`. Codex: the same JSON goes in `~/.codex/hooks.json`; then trust it in Codex's `/hooks`.
4. Paste the rule block from [`always-on.md`](always-on.md) into `~/.claude/CLAUDE.md` (Codex: `~/.codex/AGENTS.md`).
5. Start a new session, or run `/hooks` to check that the hook is listed.

### D. Other assistants

| Assistant | What to do |
|---|---|
| Codex CLI | `node install.mjs --codex` installs all three layers (see the table above) |
| Cursor, Windsurf, other agents | Paste the rule into the agent's rules file; keep `SKILL.md` in the project for it to read |
| Claude.ai | Upload the `skills/dajuguan` folder as a skill (zip it first), and paste the rule into your profile preferences |
| ChatGPT and other web chats | Paste the rule into custom instructions (ChatGPT: Settings → Personalization). For the full method, upload `SKILL.md` to a Project's files |

Only Claude Code and Codex run the trigger hook. Everywhere else, the always-on rule does the job.

## Updates

| How you installed | How updates reach you |
|---|---|
| Claude Code plugin | Turn on auto-update once: `/plugin` → **Marketplaces** → `dajuguan-big-picture` → **Enable auto-update** (third-party marketplaces start with it off). Claude Code then checks in the background during a session, installs the new version and shows "Plugin updated · Run /reload-plugins to apply". Without auto-update: `claude plugin marketplace update dajuguan-big-picture` then `claude plugin update dajuguan@dajuguan-big-picture`. |
| Codex plugin | `codex plugin marketplace upgrade dajuguan-big-picture` (Codex has no auto-update for added marketplaces). |
| Script | `git pull` in your clone, then `node install.mjs` again. Lines marked `same` were already current. |
| Claude.ai, ChatGPT, other web chats | Re-upload `SKILL.md` and re-paste the rule. Nothing updates these by itself. |

To be told when there is a new version: on GitHub, **Watch → Custom → Releases** on this repository. Every update is published as a release with notes.

## Check that it works

```bash
echo '{"prompt":"add export, e.g. PDF and Word"}' | node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs   # prints one line of JSON
echo '{"prompt":"ok"}' | node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs                               # prints nothing
npm test                                                                                                  # in the repo: trigger + installer tests
```

## Uninstall

Plugin: `claude plugin uninstall dajuguan@dajuguan-big-picture` (Claude Code) or `codex plugin remove dajuguan@dajuguan-big-picture` (Codex). Nothing else to clean up.

Script:

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

<p align="center"><img src="docs/images/method.jpg" width="80%" alt="水墨：手里一块石头，涟漪里显出一片同类的石头，最后在岸边摆成完整的一圈"></p>

```
1 实际需求          →  2 全局展开                 →  3 收敛
  原始意图              同类：例子所属的整族           推荐完整的一组
  + 成功标准            影响面：还牵动什么             分成「直接做 / 先提议 / 不做」
                        方案：两三条路线               做成机制，实测验证
                        失效模式                       回扣原始意图
```

你说「1、2、3 等」，最重要的是那个「等」。

### 原理：为什么光有技能不够

<p align="center"><img src="docs/images/layers.jpg" width="80%" alt="水墨：云山之上浮着三层纸：一层薄雾、一只红铃、一卷展开的卷轴"></p>

AI 按描述自己挑技能。带「等」的一句短话看上去很简单，技能偏偏在最需要的时候被跳过。所以这里分三层：

| 层 | 是什么 | 何时起作用 | 开销 |
|---|---|---|---|
| 1 常驻规则 | 五行，放进 `CLAUDE.md`、`AGENTS.md` 或 ChatGPT 自定义指令（[`always-on.md`](always-on.md)） | 每一轮；没有触发词也按意图判断 | 每轮约 150 token |
| 2 触发钩子 | `UserPromptSubmit` 钩子，Claude Code 和 Codex 都会在模型看到你的话之前先跑它 | 确定性的：命中就在这一轮加一句指令 | 不命中零开销 |
| 3 技能本体 | 完整方法，一个文件：[`skills/dajuguan/SKILL.md`](skills/dajuguan/SKILL.md) | 钩子或模型需要时才加载 | 只在用时 |

**语言**：技能和规则各是一个文件，同一份内容写两遍，上半英文、下半中文。文件开头有一句说明，让 AI 读和你同语言的那一半、用你的语言回复。所以中英文用户装的是同一个东西，不用选。

**哪个 AI 用得上哪一层**

| AI | 常驻规则 | 钩子 | 技能 |
|---|---|---|---|
| Claude Code | `~/.claude/CLAUDE.md` | 有 | `~/.claude/skills/` |
| Codex 命令行 | `~/.codex/AGENTS.md` | 有（第一次要在 Codex 的 `/hooks` 里点信任） | `~/.codex/skills/` |
| Cursor、Windsurf 等 | 它的规则文件 | 没有 | 把 `SKILL.md` 放在项目里 |
| ChatGPT、Claude 网页版等 | 自定义指令 | 没有 | 上传 `SKILL.md`（Claude 网页版作为技能上传；ChatGPT 放项目文件） |

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
| `~/.claude/skills/dajuguan/SKILL.md` | 技能（中英文在同一个文件里） | 默认装；`--no-skill` 跳过 |
| `~/.claude/dajuguan/hooks/` | 钩子脚本和 `triggers.json` | 默认装；`--no-hook` 跳过 |
| `~/.claude/settings.json` | 加一条 `UserPromptSubmit` 钩子。是合并进去的，你原有的设置和钩子都不动 | 默认装；`--no-hook` 跳过 |
| `~/.claude/CLAUDE.md` | 常驻规则，夹在 `<!-- dajuguan:begin -->` 和 `<!-- dajuguan:end -->` 之间 | 默认装；`--no-rule` 跳过 |
| `~/.codex/skills/dajuguan/SKILL.md` | 同一个技能，给 Codex 用 | 只有加 `--codex` 才装 |
| `~/.codex/hooks.json` | 同一条钩子，给 Codex 用，和 `settings.json` 一样是合并进去的 | 只有加 `--codex` 才装 |
| `~/.codex/AGENTS.md` | 同一条规则，给 Codex 用 | 只有加 `--codex` 才装 |
| `~/.claude/dajuguan/backup/<时间>/` | 上面每个文件改动前的备份 | 自动 |
| `~/.claude/dajuguan/my-triggers.txt` | 你自己的触发词，一行一个（可选，你自己建） | 你 |

需要：[Claude Code](https://code.claude.com) 或 Codex 命令行（或两个都有），以及 Node.js 18 以上。Codex 也用 `~/.claude/dajuguan/hooks/` 下的钩子文件。钩子不联网、不写文件，只读你这条消息，最多输出一行。

### 安装

**A. 作为插件安装（推荐：能收到更新）**

这个仓库本身就是 Claude Code 和 Codex 的插件市场。插件装上就是三层齐全：技能、触发钩子、常驻规则（会话开始时由钩子加进去，所以也会跟着更新），而且不改你自己的任何文件。

Claude Code：

```bash
claude plugin marketplace add DerekXuHQ/dajuguan-big-picture
claude plugin install dajuguan@dajuguan-big-picture
```

也可以在会话里输入 `/plugin marketplace add DerekXuHQ/dajuguan-big-picture`，再 `/plugin install dajuguan@dajuguan-big-picture`。技能的名字是 `/dajuguan:dajuguan`。

Codex：

```bash
codex plugin marketplace add DerekXuHQ/dajuguan-big-picture
codex plugin add dajuguan@dajuguan-big-picture
```

然后在 Codex 里打开一次 `/hooks`，信任大局观的两个钩子。

插件和下面的脚本**二选一**，两个都装钩子会跑两遍。从脚本换成插件，先运行 `node install.mjs --uninstall`。

**B. 脚本安装**

```bash
git clone https://github.com/DerekXuHQ/dajuguan-big-picture.git
cd dajuguan-big-picture
node install.mjs --dry-run      # 先看会改哪些地方，什么都不改
node install.mjs                # 装给 Claude Code
node install.mjs --codex        # Claude Code 和 Codex 都装
```

可选参数：`--no-skill`（技能已经从别处装过）、`--no-hook`、`--no-rule`、`--codex`。重复运行只会原地更新，不会重复添加。Windows 在 PowerShell 里跑同样的命令。

装好后开一个新的 Claude Code 会话，试一句「加个导出功能，比如 PDF 和 Word」，回复开头应该是【大局观 · …】。Codex 要先在 `/hooks` 里信任一次大局观钩子，否则它不会跑新钩子。

**C. 手动安装**

1. 把 `skills/dajuguan` 整个文件夹复制到 `~/.claude/skills/dajuguan`（Codex：`~/.codex/skills/dajuguan`）。
2. 把 `hooks/dajuguan-trigger.mjs` 和 `hooks/triggers.json` 复制到 `~/.claude/dajuguan/hooks/`。
3. 在 `~/.claude/settings.json` 里加上钩子（JSON 见上面英文部分第 3 步）。文件里已经有 `"hooks"` 的话，只把 `UserPromptSubmit` 那一段加进去。从程序坞启动的 Claude Code 可能找不到 `node`，这时把命令里的 `node` 换成 `which node` 给出的完整路径。Codex：同样的 JSON 放进 `~/.codex/hooks.json`，再在 Codex 的 `/hooks` 里信任。
4. 把 [`always-on.md`](always-on.md) 里的规则整段贴进 `~/.claude/CLAUDE.md`（Codex：`~/.codex/AGENTS.md`）。
5. 开新会话，或者输入 `/hooks` 看钩子是否在列表里。

**D. 其他 AI**

| 工具 | 做法 |
|---|---|
| Codex 命令行 | `node install.mjs --codex`，三层都装（见上面的表） |
| Cursor、Windsurf 等 | 把规则贴进它的规则文件；把 `SKILL.md` 放在项目里让它读 |
| Claude 网页版 | 把 `skills/dajuguan` 文件夹压缩后作为技能上传；规则贴进个人偏好 |
| ChatGPT 等网页版 | 把规则贴进自定义指令（ChatGPT：设置 → 个性化）；要完整方法就把 `SKILL.md` 上传到项目文件 |

只有 Claude Code 和 Codex 会跑触发钩子，其他地方靠常驻规则。

### 更新

| 怎么装的 | 怎么拿到更新 |
|---|---|
| Claude Code 插件 | 打开一次自动更新：`/plugin` → **Marketplaces** → `dajuguan-big-picture` → **Enable auto-update**（第三方市场默认是关的）。之后 Claude Code 会在会话进行中后台检查，装好新版并提示「Plugin updated · Run /reload-plugins to apply」。不开自动更新的话，手动运行 `claude plugin marketplace update dajuguan-big-picture`，再 `claude plugin update dajuguan@dajuguan-big-picture`。 |
| Codex 插件 | `codex plugin marketplace upgrade dajuguan-big-picture`（Codex 对自己添加的市场没有自动更新）。 |
| 脚本 | 在克隆的目录里 `git pull`，再运行一次 `node install.mjs`。显示 `same` 的项表示已经是最新。 |
| Claude 网页版、ChatGPT 等 | 重新上传 `SKILL.md`、重新粘贴规则，这些地方不会自己更新。 |

想在出新版时收到通知：在 GitHub 上对这个仓库点 **Watch → Custom → Releases**。每次更新都会发一个带说明的 Release。

### 检查是否生效

```bash
echo '{"prompt":"加导出，比如 PDF"}' | node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs   # 输出一行 JSON
echo '{"prompt":"好的"}' | node ~/.claude/dajuguan/hooks/dajuguan-trigger.mjs               # 什么都不输出
```

### 卸载

插件：`claude plugin uninstall dajuguan@dajuguan-big-picture`（Claude Code）或 `codex plugin remove dajuguan@dajuguan-big-picture`（Codex），不用再清理别的。

脚本：

```bash
node install.mjs --uninstall
```

删掉技能、钩子文件、`settings.json` 里那一条钩子和规则块；这些文件里你自己的内容都留着。备份和 `my-triggers.txt` 留在 `~/.claude/dajuguan/`，想彻底清掉就把这个文件夹也删了。

### 自定义

- **自己的口头禅**：一行一个写进 `~/.claude/dajuguan/my-triggers.txt`。AI 把你的例子当成全部、你不得不说「那只是举例」的时候，把你当时用的说法加进去。
- **阈值和词表**：改 `~/.claude/dajuguan/hooks/triggers.json`。
- **某一句不想用**：说「只改这一处」「就这个」。
