/**
 * Skill discovery for pi-skills-mention.
 *
 * pi's own discovery covers many roots: `~/.pi/agent/skills`, `<cwd>/.pi/skills`,
 * `~/.agents/skills`, ancestor `.agents/skills`, plus package-provided skills and
 * Claude/Codex legacy dirs. Rather than reimplement all of that, we cache the
 * skills pi itself loaded into the current session (from `before_agent_start`
 * -> `systemPromptOptions.skills`), and fall back to `loadSkills` (the exported
 * discovery helper) seeded with the standard `.agents/skills` roots for the
 * very first turn when the cache is still empty.
 */

import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { getAgentDir, loadSkills, type Skill } from "@earendil-works/pi-coding-agent";
import { indexSkills, type MentionSkill } from "./skill-registry.js";

/** Mutable module-level cache updated by the extension on each agent start. */
const sessionSkills: {
  map: Map<string, MentionSkill>;
  populated: boolean;
} = { map: new Map(), populated: false };

/** Called from `before_agent_start` to capture pi's authoritative skill set. */
export function captureSessionSkills(skills: readonly Skill[] | undefined): void {
  const indexed = indexSkills(skills);
  if (indexed.size > 0) {
    sessionSkills.map = indexed;
    sessionSkills.populated = true;
  }
}

/**
 * Resolve the current mention-addressable skills. Prefers the cached session
 * set; on the first turn falls back to fresh discovery.
 */
export function getMentionSkills(cwd: string): Map<string, MentionSkill> {
  if (sessionSkills.populated && sessionSkills.map.size > 0) {
    return sessionSkills.map;
  }
  return discoverMentionSkills(cwd);
}

/** Discover skills via pi's own loader, adding standard `.agents/skills` roots. */
export function discoverMentionSkills(cwd: string): Map<string, MentionSkill> {
  const home = homedir();
  const skillPaths: string[] = [];

  // Standard `.agents/skills` roots pi also scans.
  pushIfExits(skillPaths, join(home, ".agents", "skills"));
  pushAncestorAgentsSkills(skillPaths, cwd);

  try {
    const result = loadSkills({ cwd, agentDir: getAgentDir(), skillPaths, includeDefaults: true });
    const map = indexSkills(result.skills);
    if (map.size > 0) {
      sessionSkills.map = map;
      sessionSkills.populated = true;
    }
    return map;
  } catch {
    return new Map();
  }
}

function pushAncestorAgentsSkills(paths: string[], cwd: string): void {
  let dir = cwd;
  for (let depth = 0; dir && dir.length > 1 && depth < 12; depth++) {
    pushIfExits(paths, join(dir, ".agents", "skills"));
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
}

function pushIfExits(paths: string[], p: string): void {
  try {
    if (existsSync(p) && statSync(p).isDirectory()) paths.push(p);
  } catch {
    /* not present — skip */
  }
}
