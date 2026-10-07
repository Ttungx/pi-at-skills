# pi-at-skills

Invoke pi skills with `@` anywhere in the prompt while keeping `@` for file attachments. Written for pi users who prefer the opencode v2 input model. See [Install](#install) for setup and [When a mention triggers](#when-a-mention-triggers) for the limits.

pi natively expands `/skill:name` only at the start of the first line: the editor gates it in `isSlashMenuAllowed()` with `cursorLine === 0`. This extension leaves pi's slash commands untouched and merges skills into the `@` completion list instead:

- One `@` list holds files (pi's native order) and every available skill. Typing narrows both at once.
- `@skill-name` works anywhere in a sentence, and one message can invoke several skills.
- `@src/foo.ts` and `@notes.md` fall through to pi's native path completion and are never read as skills.
- The prompt is never rewritten. Skill bodies are injected as a separate `✦ @skills` context message, so `/fuck`-style recovery, rewind and re-editing all show the original text.

```text
# pi native: start of message only, one skill per message
$tdd implement this feature

# this extension: anywhere in the prompt, several at once
review with @code-review, then polish the summary with @humanizer-zh

# files and skills share one key
@pdf process E:\programs\CUBEC\AGENTS.md per its rules
```

![@ completion list: skill rows carry a scope tag and the skill description](media/preview.png)

中文文档见 [README.md](README.md)。

## Requirements

| Item | Value |
| --- | --- |
| pi | 1.0 or newer |
| Node.js | 22.19 or newer |
| Credentials | none |

The extension ships as TypeScript source. Pi compiles it on load through its jiti runtime, so there is no build step.

## Install

From the Git repository:

```bash
pi install git:github.com/Ttungx/pi-at-skills
```

Run `/reload` inside pi to apply the change.

Try it for a single run without writing settings:

```bash
pi -e /path/to/pi-at-skills
```

After the package is published to npm, the install command becomes `pi install npm:pi-at-skills`.

## Usage

| Input | Behaviour |
| --- | --- |
| `@` | Opens the list: files first, then every skill, matching pi's native behaviour. |
| `@pd` | Once characters are typed, matching skills lead the list so that Enter cannot pick a same-prefix file. Skills filter fuzzily: `@impv` matches `improve-codebase`, prefix matches rank first. |
| `@src/comp` | A query containing `/` or `\` uses native path completion only. |
| `@skill-name` | Injects that skill's `SKILL.md` body (frontmatter stripped) before the agent runs. One message may inject several. |
| `@@skill-name` | Escape hatch: stays a literal `@skill-name`. |

Skill rows read like pi's native `/skill:` rows, with a scope tag and the skill description, for example `[u] Create new skills, ...`. Accepting a row appends a space, matching pi's own slash-command and file completions.
| `$skill-name` | The legacy spelling from pi-skills-mention still works. Autocomplete only triggers on `@`. |

Injected skills reach the model as pi's native `<skill name=... location=...>` blocks. The transcript renders them as one collapsed summary line; `ctrl+o` expands the full text. Skills already injected on the same session branch are not injected again.

## When a mention triggers

This extension calls an `@skill-name` written inside a prompt a *mention*, and its leading `@` or `$` the sigil.

- Only skills that pi has loaded count as mentions. Unknown tokens such as `@PATH` and `@not-installed` stay literal text.
- The sigil must sit on a token boundary. Emails (`user@example.com`, `a@b`), paths (`E:/x/@pdf`) and decorators (`@Component`) never trigger.
- A token glued to `.` or `/` is not a mention: `@notes.md` and `@src/foo.ts` go to file completion.
- Skill matching is fuzzy. When a skill name is a prefix of a filename, skill rows lead once characters are typed; for a bare `@` the file rows lead, and reaching the skill row needs the arrow keys.

## Implementation notes

| File | Role |
| --- | --- |
| `src/index.ts` | Entry point. Scans mentions on the `input` event, injects skill bodies on `before_agent_start`, and registers the message renderer. |
| `src/mention.ts` | `@` and `$` token scanning with path, email and boundary rules. |
| `src/autocomplete.ts` | Merges skills into pi's native `@` file completion through `ctx.ui.addAutocompleteProvider`. |
| `src/discover.ts` | Skill discovery. Reuses the skill set pi already loaded and falls back to pi's own `loadSkills` on the first turn. |
| `src/skill-registry.ts` | Reads `SKILL.md` and builds `<skill>` blocks; also carries the frontmatter description and scope tag into the `@` list. |

One constraint shapes the design: pi's `setAutocompleteTriggerCharacters` filters out `/` and whitespace, so an extension cannot register `/` as a trigger character. `@` is already a default trigger, so the extension wraps the native provider instead and routes `applyCompletion` per item type — skill rows replace their own token, everything else goes back to the native provider, which re-adds the `@`.

## Troubleshooting

When the `@` list shows no skill rows, check in this order:

1. Run `/reload` and confirm the extension loaded.
2. Confirm pi loaded the skill. A `SKILL.md` without a `description`, or with malformed frontmatter, is not loaded and does not appear in the list.
3. Start pi with `PI_SKILLS_MENTION_DEBUG=1` and submit a message containing `@skill-name`. The terminal prints the skills `queued` and `injected` for that turn. No output means the mention was not recognised.

If no `✦ @skills` summary appears after submitting, check whether the skill was already injected on the current session branch. A branch never receives the same skill twice.

## Development and tests

```bash
npm test
```

The tests use node's built-in test runner and type stripping. They install no dependencies and never import the pi runtime. CI runs the same suite on ubuntu and windows with Node.js 22.19 and 24.

## Versioning

The package version tracks the pi version: 1.0.4 corresponds to pi 1.0.4. A new version ships after pi is upgraded.

## Credits and license

A fork of [pi-skills-mention](https://github.com/WufeiHalf/pi-skills-mention) (MIT, wufei). Changes relative to upstream: the sigil moved from `$` to `@`, the completion list merged with file completion, token-boundary rules added, and a `shouldTriggerFileCompletion` delegate implemented. MIT licensed; see [LICENSE](LICENSE).