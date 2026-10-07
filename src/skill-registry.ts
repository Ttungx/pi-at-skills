/**
 * Shared skill resolution helpers for pi-skills-mention.
 */

import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ParsedSkillBlock, Skill } from "@earendil-works/pi-coding-agent";

/** A skill that is mention-addressable by name. */
export interface MentionSkill {
  name: string;
  filePath: string;
  baseDir: string;
}

/**
 * Read a skill's SKILL.md, stripped of frontmatter, trimmed.
 * Throws if the file cannot be read.
 */
export function readSkillBody(skill: MentionSkill): string {
  const content = readFileSync(skill.filePath, "utf-8");
  return stripFrontmatterSafe(content).trim();
}

/**
 * Build the `<skill ...>` block pi injects for a `$name` mention — mirrors the
 * format `AgentSession._expandSkillCommand` uses, so downstream parsing of
 * skill blocks (collapsible rendering, etc.) keeps working.
 *
 * Throws if the SKILL.md cannot be read.
 */
export function buildSkillBlock(skill: MentionSkill): string {
  const body = readSkillBody(skill);
  return `<skill name="${skill.name}" location="${skill.filePath}">\nReferences are relative to ${skill.baseDir}.\n\n${body}\n</skill>`;
}

function stripFrontmatterSafe(content: string): string {
  // Strip a leading `---\n ... \n---\n` frontmatter block if present.
  const match = /^\uFEFF?---\r?\n[\s\S]*?\r?\n---\r?\n?/.exec(content);
  if (match) {
    return content.slice(match[0].length);
  }
  return content;
}

/**
 * Build the body of a `<skill ...>` block for one skill (everything between
 * the opening tag and `</skill>`), mirroring pi's `_expandSkillCommand` format.
 */
function buildSkillBody(skill: MentionSkill): string {
  return `References are relative to ${skill.baseDir}.\n\n${readSkillBody(skill)}`;
}

export interface InlineSkillsContent {
  /** Full text injected into the model context. */
  content: string;
  /** Parsed blocks, used for the TUI renderer and session dedupe. */
  blocks: ParsedSkillBlock[];
}

/**
 * Build the `<inline_skills>` context message for a set of skills: one
 * `<skill ...>` block per skill, wrapped in an explicit "already loaded"
 * marker so the model does not re-read the skill files.
 */
export function buildInlineSkillsContent(skills: MentionSkill[]): InlineSkillsContent {
  const blocks: ParsedSkillBlock[] = [];
  const texts: string[] = [];
  for (const skill of skills) {
    const body = buildSkillBody(skill);
    blocks.push({ name: skill.name, location: skill.filePath, content: body, userMessage: undefined });
    texts.push(`<skill name="${skill.name}" location="${skill.filePath}">\n${body}\n</skill>`);
  }
  return {
    content: `<inline_skills>\nThe following inline skill contents are already loaded. Do not load them again unless the user asks to inspect the source file.\n\n${texts.join("\n\n")}\n</inline_skills>`,
    blocks,
  };
}

/**
 * Index a set of loaded skills keyed by their `name`. Skills without a name
 * are skipped. `baseDir` falls back to the parent of `filePath`.
 */
export function indexSkills(skills: readonly Skill[] | undefined): Map<string, MentionSkill> {
  const map = new Map<string, MentionSkill>();
  for (const s of skills ?? []) {
    if (!s.name) continue;
    const baseDir = s.baseDir || dirname(s.filePath);
    map.set(s.name, { name: s.name, filePath: s.filePath, baseDir });
  }
  return map;
}
