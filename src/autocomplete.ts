/**
 * `@`-triggered skill autocompletion for pi's TUI input editor.
 *
 * Wraps the existing autocomplete provider so that an `@<partial>` token offers
 * skill mentions *in addition to* pi's native `@` file/path completions — one
 * unified list, opencode v2 style:
 *
 *   `@`            → files (native order) followed by every mentionable skill
 *   `@pd`          → skills matching `pd` first, then files matching `pd`
 *   `@src/comp`    → pure native path completion (skills never apply)
 *
 * Every non-`@` context (slash commands, `!bash`, plain text) is delegated to
 * the wrapped provider unchanged.
 */

import type {
  AutocompleteItem,
  AutocompleteProvider,
  AutocompleteSuggestions,
} from "@earendil-works/pi-tui";
import { fuzzyFilter } from "@earendil-works/pi-tui";
import type { MentionSkill } from "./skill-registry.js";

/** Max skill entries shown in a merged list, mirroring pi-multi-skills. */
const MAX_SKILL_ITEMS = 20;

/**
 * The mention token being typed at the cursor. The sigil must start a token
 * (line start, whitespace, or an opening bracket/quote) so `user@example.com`
 * and `a@b` are not mistaken for mentions. The body may contain path
 * characters so we can detect — and bail out of — path completion.
 */
const MENTION_AT_CURSOR = /(?:^|[\s([{,;:'"“‘（【、，。；：！？])@([A-Za-z0-9._/-]*)$/;

/** Marks the items we own so `applyCompletion` can route them correctly. */
const SKILL_ITEM = Symbol("pi-at-skills.item");

interface SkillEntry {
  skill: MentionSkill;
  /** Exactly the token the user typed for this completion, sigil included. */
  typed: string;
}

type SkillItem = AutocompleteItem & { [SKILL_ITEM]?: SkillEntry };

export interface MentionAutocompleteOptions {
  /** Live skill index; re-resolved each call so new skills appear without reload. */
  getSkills(): Map<string, MentionSkill>;
}

export function createMentionAutocompleteProvider(
  inner: AutocompleteProvider,
  opts: MentionAutocompleteOptions,
): AutocompleteProvider {
  return {
    // `@` already triggers pi's native completion; declaring it keeps this
    // wrapper correct if the default trigger set ever changes.
    triggerCharacters: ["@"],

    async getSuggestions(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      options: { signal: AbortSignal; force?: boolean },
    ): Promise<AutocompleteSuggestions | null> {
      const beforeCursor = (lines[cursorLine] ?? "").slice(0, cursorCol);
      const match = MENTION_AT_CURSOR.exec(beforeCursor);
      if (!match) return inner.getSuggestions(lines, cursorLine, cursorCol, options);

      const query = match[1];

      // Anything path-shaped is a file reference, never a skill.
      if (query.includes("/") || query.includes("\\")) {
        return inner.getSuggestions(lines, cursorLine, cursorCol, options);
      }

      const skillItems = rankSkills(query, opts.getSkills());
      const native = await inner.getSuggestions(lines, cursorLine, cursorCol, options);
      if (options.signal.aborted) return null;

      const nativeItems = (native?.items ?? []).filter((item) => !(item as SkillItem)[SKILL_ITEM]);
      // Once the user typed something, matching skills lead the list. Otherwise
      // Enter would accept a same-named file, which the native provider inserts
      // with a trailing space — no mention, no skill.
      const items =
        query !== "" && skillItems.length > 0 ? [...skillItems, ...nativeItems] : [...nativeItems, ...skillItems];
      if (items.length === 0) return null;

      return { items, prefix: native?.prefix ?? `@${query}` };
    },

    // Without this the editor's forced (Tab) completion path bails out before
    // ever asking us; native may still veto file completion, so delegate.
    shouldTriggerFileCompletion(lines: string[], cursorLine: number, cursorCol: number): boolean {
      return inner.shouldTriggerFileCompletion?.(lines, cursorLine, cursorCol) ?? true;
    },

    applyCompletion(
      lines: string[],
      cursorLine: number,
      cursorCol: number,
      item: AutocompleteItem,
      prefix: string,
    ) {
      const entry = (item as SkillItem)[SKILL_ITEM];
      // Everything that is not one of our items — slash commands, `@`/file
      // paths — is handed back to the wrapped provider, which re-adds the
      // leading `/` / `@` that its suggestion `item.value` deliberately omits.
      if (!entry) return inner.applyCompletion(lines, cursorLine, cursorCol, item, prefix);

      // Replace exactly the typed token (`@partial`) rather than trusting the
      // shared `prefix`, which belongs to the native file completion when the
      // list is merged.
      const currentLine = lines[cursorLine] ?? "";
      const beforePrefix = currentLine.slice(0, cursorCol - entry.typed.length);
      const afterCursor = currentLine.slice(cursorCol);
      const newLines = [...lines];
      newLines[cursorLine] = `${beforePrefix}@${entry.skill.name}${afterCursor}`;
      return {
        lines: newLines,
        cursorLine,
        cursorCol: beforePrefix.length + entry.skill.name.length + 1,
      };
    },
  };
}

/**
 * Rank skills for a partial query. Empty query = full list; otherwise fuzzy
 * match (every query char in order, so `@impv` finds `improve-codebase`) with
 * prefix matches ranked first.
 */
function rankSkills(query: string, skills: Map<string, MentionSkill>): SkillItem[] {
  const all = [...skills.values()];
  if (all.length === 0) return [];
  const typed = `@${query}`;
  if (query === "") return all.slice(0, MAX_SKILL_ITEMS).map((s) => toItem(s, typed));

  const lower = query.toLowerCase();
  const ranked = fuzzyFilter(all, lower, (s) => s.name.toLowerCase());
  const prefixHits: SkillItem[] = [];
  const fuzzyHits: SkillItem[] = [];
  for (const skill of ranked) {
    const item = toItem(skill, typed);
    if (skill.name.toLowerCase().startsWith(lower)) prefixHits.push(item);
    else fuzzyHits.push(item);
  }
  return [...prefixHits, ...fuzzyHits].slice(0, MAX_SKILL_ITEMS);
}

function toItem(skill: MentionSkill, typed: string): SkillItem {
  return {
    value: `@${skill.name}`,
    label: `@${skill.name}`,
    description: describeSkill(skill),
    [SKILL_ITEM]: { skill, typed },
  };
}

function describeSkill(skill: MentionSkill): string {
  // Same shape as pi's native /skill: rows: `[u] Create new skills, ...`.
  return [skill.tag, skill.description].filter(Boolean).join(" ");
}
