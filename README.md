# pi-at-skills

> opencode 风格 · 一个 `@` 同时管文件和 skill。One `@` for files *and* skills.

Pi 原生只有 `/skill:name` 能调 skill，而且**必须写在消息开头**（`isSlashMenuAllowed()` 限定 `cursorLine === 0`）。本扩展把 skill 调用改成 opencode v2 的形态：

- **`@` 一个列表**：文件（Pi 原生顺序）+ 全部可 mention 的 skill，打字同时收窄
- **`@skill-name` 出现在句子任意位置**都能触发，加载该 skill 全文后再交给 agent
- **`@src/foo.ts`、`@notes.md` 永远只走原生路径补全**，不会误判成 skill
- **不改写你的 prompt**：skill 内容作为独立的 `✦ @skills` 上下文消息注入，`/fuck` 回滚、rewind、重编辑看到的都是你原话

```
$tdd 实现这个功能                              ← 旧写法：只能开头，一次一个
先审查 @code-review 再提交                      ← 新写法：任意位置，可多个
@pdf 把 E:\programs\CUBEC\AGENTS.md 处理一下      ← 文件和 skill 共用 @ 键
```

## 安装

```bash
pi install git:github.com/Ttungx/pi-at-skills
```

然后在 Pi 里 `/reload`。

本地试用（不写入 settings）：

```bash
pi -e E:/software/AAATools/MyRepos/small/pi-at-skills
```

> 需要 Pi ≥ 1.0、Node ≥ 22.19。扩展以 TypeScript 源码加载，Pi 用 jiti 运行时编译，无需构建步骤。

## 用法

| 输入 | 行为 |
|---|---|
| `@` | 弹出列表：文件 + 全部 skill（skill 条目描述形如 `skill · <目录>`） |
| `@pd` | 文件与 skill 同时按 `pd` 过滤，skill 用模糊匹配（`@impv` → `improve-codebase`），前缀命中排前 |
| `@src/comp` | 含 `/` 或 `\` → 纯原生路径补全 |
| `@skill-name` | 提交前注入该 skill 的 `SKILL.md` 全文（去掉 frontmatter） |
| `@@skill-name` | 转义，保持字面量 |
| `$skill-name` | 兼容旧 sigil（补全只在 `@` 上触发） |

被注入的 skill 以 Pi 原生 `<skill name=... location=...>` 块送达，渲染成折叠的一行，`ctrl+o` 展开全文。同一分支上已加载过的 skill 不会重复注入。

## 边界（有意为之）

- 只有**已知**的 skill 名才算 mention。`@PATH`、`@not-installed` 原样留在文本里
- sigil 必须在 token 边界：邮箱 `user@example.com`、`a@b`、路径 `E:/x/@pdf`、装饰器 `@Component` 都不会触发
- 紧跟 `.` 或 `/` 的 token 不算 mention：`@notes.md`、`@src/foo.ts` 交给文件补全
- 模糊匹配意味着：某个已安装 skill 的名字恰好是文件名的前缀时，`@` 菜单里两条都在，选哪条由你决定

## 原理

| 文件 | 职责 |
|---|---|
| `src/index.ts` | 扩展入口：`input` 事件扫描 mention → `before_agent_start` 注入 → 消息渲染器 |
| `src/mention.ts` | `@`/`$` token 扫描，带路径/邮箱安全边界 |
| `src/autocomplete.ts` | 用 `ctx.ui.addAutocompleteProvider` 把 skill 并入 Pi 原生 `@` 文件补全 |
| `src/discover.ts` | skill 发现：复用 Pi 已加载的 skill 集合，首轮回落到 Pi 自己的 `loadSkills` |
| `src/skill-registry.ts` | 读 `SKILL.md`、拼 `<skill>` 块 |

关键点：Pi 的 `setAutocompleteTriggerCharacters` 会过滤掉 `/` 和空白，所以扩展不能把 `/` 加成触发字符；`@` 本来就是默认触发字符，直接包一层 provider 就能合并列表，并在 `applyCompletion` 里按条目类型分流（skill 条目自己替换 token，其余交还原生 provider，它负责补回 `@`）。

## 开发

```bash
npm test        # node --experimental-strip-types --test，无第三方依赖
```

调试开关：`PI_SKILLS_MENTION_DEBUG=1 pi`，会打印每次 `queued` / `injected` 的 skill 名。

## 致谢 / License

本项目是 [pi-skills-mention](https://github.com/WufeiHalf/pi-skills-mention)（MIT, wufei）的 fork：把 sigil 从 `$` 换成 `@`、改造成与文件补全合并的列表、补齐 token 边界规则和 `shouldTriggerFileCompletion` 委托。MIT 许可，版权声明见 [LICENSE](LICENSE)。

English README: [README.en.md](README.en.md)
