# pi-at-skills

> opencode-style: one `@` for files *and* skills.

Pi's native `/skill:name` only works at the very start of a message — the editor gates it with `isSlashMenuAllowed()` (`cursorLine === 0`). This extension moves skill invocation to the opencode v2 shape:

- **One `@` list**: files (Pi's native order) plus every mentionable skill, narrowing together as you type
- **`@skill-name` anywhere in the prompt** loads that skill before the agent runs
- **`@src/foo.ts` and `@notes.md` always stay native path completion**, never a skill
- **Your prompt is never rewritten**: skill bodies are injected as a separate `✦ @skills` context message, so `/fuck`-style recovery, rewind and re-editing see exactly what you typed

```
$tdd implement this feature                          ← old: start of message only, one at a time
review with @code-review first, then commit          ← new: anywhere, several at once
@pdf process E:\programs\CUBEC\AGENTS.md             ← files and skills share one key
```

## Install

```bash
pi install git:github.com/Ttungx/pi-at-skills
```

Then `/reload` inside Pi.

Try it for one run without touching settings:

```bash
pi -e /path/to/pi-at-skills
```

> Requires Pi ≥ 1.0 and Node ≥ 22.19. The extension ships as TypeScript source and is compiled on load by Pi's jiti runtime — there is no build step.

## Usage

| Input | Behaviour |
|---|---|
| `@` | Opens the list: files + all skills (skill rows are described as `skill · <dir>`) |
| `@pd` | Files and skills filter together; skills use fuzzy matching (`@impv` → `improve-codebase`), prefix hits first |
| `@src/comp` | Contains `/` or `\` → native path completion only |
| `@skill-name` | Injects that skill's `SKILL.md` (frontmatter stripped) before the agent runs |
| `@@skill-name` | Escape hatch: stays literal |
| `$skill-name` | Legacy sigil still works (autocomplete only triggers on `@`) |

Injected skills arrive as Pi's native `<skill name=... location=...>` blocks, rendered as one collapsible line; `ctrl+o` expands the full text. Skills already loaded on the same session branch are not injected again.

## Boundaries (deliberate)

- Only **known** skill names count as mentions. `@PATH` and `@not-installed` stay literal text
- The sigil must sit on a token boundary: emails (`user@example.com`, `a@b`), paths (`E:/x/@pdf`) and decorators (`@Component`) never trigger
- A token glued to `.` or `/` is not a mention: `@notes.md` and `@src/foo.ts` go to file completion
- Fuzzy matching means that when an installed skill name is a prefix of a filename, both rows appear in the `@` menu — you pick

## How it works

| File | Role |
|---|---|
| `src/index.ts` | Entry: `input` scan → `before_agent_start` injection → message renderer |
| `src/mention.ts` | `@`/`$` token scanning with path/email-safe boundaries |
| `src/autocomplete.ts` | Merges skills into Pi's native `@` file completion via `ctx.ui.addAutocompleteProvider` |
| `src/discover.ts` | Skill discovery: reuses the skill set Pi already loaded, falling back to Pi's own `loadSkills` on the first turn |
| `src/skill-registry.ts` | Reads `SKILL.md`, builds `<skill>` blocks |

The catch that shapes the design: Pi's `setAutocompleteTriggerCharacters` filters out `/` and whitespace, so an extension cannot make `/` a trigger character. `@` is already a default trigger, so the extension wraps the provider instead and routes `applyCompletion` per item — skill rows replace their own token, everything else goes back to the native provider, which re-adds the leading `@`.

## Development

```bash
npm test        # node --experimental-strip-types --test, zero dependencies
```

Debug: `PI_SKILLS_MENTION_DEBUG=1 pi` prints the skills queued and injected per turn.

## Credits / License

A fork of [pi-skills-mention](https://github.com/WufeiHalf/pi-skills-mention) (MIT, wufei): sigil moved from `$` to `@`, the menu merged with file completion, token-boundary rules and a `shouldTriggerFileCompletion` delegate added. MIT licensed — see [LICENSE](LICENSE).
