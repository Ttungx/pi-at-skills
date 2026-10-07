/**
 * `@skill-name` (opencode-style) and legacy `$skill-name` mention scanning.
 *
 * This extension never rewrites the user's prompt: the text pi stores and
 * displays is exactly what the user typed, so `/fuck`-style recovery, rewind
 * and re-editing keep working on the original mentions. We only *scan* the
 * input for known mentions and inject the skill contents as a separate custom
 * message when the agent starts.
 *
 * Matching rules (kept predictable and safe around `@` file attachments):
 *   - A mention is `@` (or legacy `$`) followed by `[a-z0-9][a-z0-9-]*`.
 *   - The sigil must sit at a token boundary: not preceded by a word char, `.`,
 *     `/`, `-`, `$`, `@` or another sigil (kills `user@example.com`,
 *     `a@b`, `@/abs/path`, `@@escape`).
 *   - The token must not be followed by `.`, `/` or a word char, so
 *     `@notes.md`, `@src/foo.ts` and `@Component` stay literal.
 *   - Resolve greedily to the *longest* known skill name that is a prefix
 *     (`@code-review-module` prefers `code-review-module`).
 *   - Unknown tokens (`@pdf` with no `pdf` skill, `@PATH`) are ignored.
 *   - `@@name` / `$$name` is the escape hatch — a literal sigil, not a mention.
 */

import type { MentionSkill } from "./skill-registry.js";

/** Sigils that introduce a mention. `@` is primary, `$` is a legacy alias. */
export const SIGILS = ["@", "$"] as const;

/** Any run of sigils, then a lowercase skill-name-ish token, on a clean boundary. */
const MENTION_TOKEN = /(?<![A-Za-z0-9_@$.\-/])([@$]+)([a-z0-9][a-z0-9-]*)(?![A-Za-z0-9_.\/-])/g;

/**
 * Scan `input` for known skill mentions. Returns the mentioned skills in
 * first-mention order, deduplicated. The input text itself is never modified.
 */
export function scanMentions(input: string, skills: Map<string, MentionSkill>): MentionSkill[] {
  if (skills.size === 0 || (!input.includes("@") && !input.includes("$"))) return [];

  const found: MentionSkill[] = [];
  const seen = new Set<string>();

  input.replace(MENTION_TOKEN, (_whole, signs: string, token: string) => {
    // Even sigil count = escape hatch (`@@name` → literal `@name`), not a mention.
    if (signs.length % 2 === 0) return _whole;
    const skill = resolveLongestMatch(token, skills);
    if (skill && !seen.has(skill.name)) {
      seen.add(skill.name);
      found.push(skill);
    }
    return _whole;
  });

  return found;
}

/** Find the longest known skill whose name is a prefix of `token`. */
function resolveLongestMatch(token: string, skills: Map<string, MentionSkill>): MentionSkill | null {
  let candidate = token;
  while (candidate.length > 0) {
    const skill = skills.get(candidate);
    if (skill) return skill;
    const idx = candidate.lastIndexOf("-");
    if (idx <= 0) break;
    candidate = candidate.slice(0, idx);
  }
  return null;
}
