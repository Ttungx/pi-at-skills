/**
 * skills-mention-at — opencode-style `@skill-name` mentions for pi.
 *
 * Local fork of `pi-skills-mention` (MIT, WufeiHalf) with the sigil moved from
 * `$` to `@`, so one keystroke covers both pi's file attachments and skill
 * invocation. Legacy `$name` still works.
 *
 * Adds two things to pi:
 *
 *  1. **Runtime skill loading.** Any `@skill-name` written anywhere in a
 *     prompt (not just at the start) loads that skill's full instructions
 *     before the agent runs. You can mention many skills in one message, mix
 *     them with ordinary text and file attachments, and re-mention later:
 *
 *         @code-review 与 @humanize 帮我审查今天下午改的 auth 模块。
 *
 *     The prompt itself is **never rewritten**: pi stores and displays exactly
 *     what you typed, so `/fuck`-style recovery, rewind and re-editing always
 *     work on your original text. The skill contents are injected as a separate
 *     custom message right before the agent starts, and the TUI renders a
 *     compact "loaded skills" line (`ctrl+o` expands the full contents).
 *
 *  2. **TUI autocompletion.** `@` opens pi's native file/path completion with
 *     the mentionable skills merged into the same list; typing narrows both.
 *
 * Escape hatch: `@@name` (or `$$name`) stays a literal `@name`, and anything
 * path-shaped (`@src/foo.ts`, `@notes.md`) or an email (`a@b.com`) is never a
 * mention.
 */

import type { ExtensionAPI, ExtensionContext, ParsedSkillBlock } from "@earendil-works/pi-coding-agent";
import { SkillInvocationMessageComponent } from "@earendil-works/pi-coding-agent";
import { Box, Container, Text } from "@earendil-works/pi-tui";
import { captureSessionSkills, getMentionSkills } from "./discover.js";
import { scanMentions } from "./mention.js";
import { buildInlineSkillsContent, type MentionSkill } from "./skill-registry.js";
import { createMentionAutocompleteProvider } from "./autocomplete.js";

/** customType of the injected skill-content message (also stored in the session). */
const INLINE_SKILLS_MESSAGE_TYPE = "skills-mention";

interface InlineSkillsDetails {
  names: string[];
  skills: ParsedSkillBlock[];
}

export default function (pi: ExtensionAPI) {
  let cwd = process.cwd();

  // Skills mentioned in the most recent input, still waiting to be injected.
  let pendingSkills: MentionSkill[] = [];
  // Skills already injected on this session branch (rebuilt from the session).
  let loadedSkillNames = new Set<string>();

  const debug = (...args: unknown[]) => {
    if (process.env.PI_SKILLS_MENTION_DEBUG) console.error(`[skills-mention-at]`, ...args);
  };

  /** Rebuild the injected-skill set from the session branch (survives rewind/fork). */
  function restoreLoadedSkills(ctx: ExtensionContext): Set<string> {
    const loaded = new Set<string>();
    for (const entry of ctx.sessionManager.getBranch()) {
      if (entry.type === "custom_message" && entry.customType === INLINE_SKILLS_MESSAGE_TYPE) {
        const details = entry.details as InlineSkillsDetails | undefined;
        for (const skill of details?.skills ?? []) {
          if (skill.name.trim()) loaded.add(skill.name);
        }
      }
    }
    return loaded;
  }

  // Compact TUI rendering for the injected message: one line when collapsed,
  // full `<skill>` blocks when expanded with ctrl+o.
  pi.registerMessageRenderer<InlineSkillsDetails>(
    INLINE_SKILLS_MESSAGE_TYPE,
    (message, { expanded }, theme) => {
      const details = message.details;
      const names = details?.names?.length ? details.names.join(" + ") : "skills";
      const label = theme.fg("customMessageLabel", "✦ @skills");

      if (details?.skills?.length) {
        const container = new Container();
        for (const skill of details.skills) {
          const component = new SkillInvocationMessageComponent(skill);
          component.setExpanded(expanded);
          container.addChild(component);
        }
        return container;
      }

      const box = new Box(1, 1, (text) => theme.bg("customMessageBg", text));
      box.addChild(
        new Text(
          `${label} ${theme.fg("customMessageText", names)}${theme.fg("dim", " (ctrl+o to expand)")}`,
          0,
          0,
        ),
      );
      return box;
    },
  );

  // Capture pi's authoritative skill set every turn so expansion + autocomplete
  // stay in sync with what pi already injected into the system prompt.
  pi.on("before_agent_start", async (event, ctx) => {
    cwd = ctx.cwd || cwd;
    captureSessionSkills(event.systemPromptOptions?.skills);

    if (pendingSkills.length === 0) return;
    const mentioned = pendingSkills;
    pendingSkills = [];

    const fresh = mentioned.filter((skill) => !loadedSkillNames.has(skill.name));
    if (fresh.length === 0) return;

    let built;
    try {
      built = buildInlineSkillsContent(fresh);
    } catch {
      return; // unreadable skills — the mentions stay literal
    }
    for (const skill of fresh) loadedSkillNames.add(skill.name);
    debug("injected", fresh.map((s) => s.name).join(", "));

    return {
      message: {
        customType: INLINE_SKILLS_MESSAGE_TYPE,
        content: built.content,
        display: true,
        details: { names: fresh.map((s) => s.name), skills: built.blocks } satisfies InlineSkillsDetails,
      },
    };
  });

  // Scan `@skill` mentions in user input. The text itself is never rewritten —
  // pi stores and restores exactly what the user typed.
  pi.on("input", async (event, ctx) => {
    cwd = ctx.cwd || cwd;
    loadedSkillNames = restoreLoadedSkills(ctx);

    const skills = getMentionSkills(cwd);
    if (skills.size === 0) return;

    const mentioned = scanMentions(event.text, skills);
    if (mentioned.length === 0) return;

    pendingSkills = mentioned;
    debug("queued", mentioned.map((s) => s.name).join(", "));
    return { action: "transform", text: event.text };
  });

  // Register the `@`-triggered skill autocomplete once the session is up.
  let autocompleteInstalled = false;
  pi.on("session_start", async (_event, ctx) => {
    if (autocompleteInstalled) return;
    if (ctx.mode !== "tui" && ctx.mode !== "rpc") return;
    autocompleteInstalled = true;
    try {
      ctx.ui.addAutocompleteProvider((current) =>
        createMentionAutocompleteProvider(current, {
          getSkills: () => getMentionSkills(ctx.cwd),
        }),
      );
    } catch {
      // Editor host not available in this mode — expansion still works.
    }
  });
}
