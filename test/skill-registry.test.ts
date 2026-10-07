/**
 * Skill block builder: what actually reaches the model context.
 */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildInlineSkillsContent, indexSkills } from "../src/skill-registry.ts";
import type { MentionSkill } from "../src/skill-registry.ts";

const dirs: string[] = [];

function skill(name: string, body: string): MentionSkill {
	const baseDir = mkdtempSync(join(tmpdir(), "pi-at-skills-"));
	dirs.push(baseDir);
	const filePath = join(baseDir, "SKILL.md");
	writeFileSync(filePath, `---\nname: ${name}\ndescription: test\n---\n${body}`, "utf8");
	return { name, filePath, baseDir, description: `use ${name}`, tag: "[u]" };
}

after(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe("buildInlineSkillsContent", () => {
	it("builds one native <skill> block per skill", () => {
		const tdd = skill("tdd", "# tdd\n先写测试。");
		const review = skill("code-review", "# code-review\n先审查。");
		const { content, blocks } = buildInlineSkillsContent([tdd, review]);

		assert.match(content, /^<inline_skills>/);
		assert.equal((content.match(/<skill name="/g) ?? []).length, 2);
		assert.ok(content.includes(`<skill name="tdd" location="${tdd.filePath}">`));
		assert.ok(content.includes(`References are relative to ${tdd.baseDir}.`));
		assert.ok(content.includes("先写测试。"));
		assert.ok(content.trimEnd().endsWith("</inline_skills>"));

		assert.equal(blocks.length, 2);
		assert.deepEqual(
			blocks.map((b) => b.name),
			["tdd", "code-review"],
		);
		assert.equal(blocks[0].location, tdd.filePath);
		assert.ok(blocks[1].content.includes("先审查。"));
	});

	it("strips SKILL.md frontmatter from the injected body", () => {
		const { content } = buildInlineSkillsContent([skill("fm", "正文内容")]);
		assert.ok(!content.includes("description: test"));
		assert.ok(content.includes("正文内容"));
	});
});

describe("indexSkills", () => {
	function piSkill(overrides: Record<string, unknown>) {
		return {
			name: "code-review",
			description: "Review a diff before merging.",
			filePath: "/skills/code-review/SKILL.md",
			baseDir: "/skills/code-review",
			disableModelInvocation: false,
			...overrides,
		};
	}

	function sourceInfo(overrides: Record<string, unknown>) {
		return { path: "", source: "auto", scope: "user", origin: "top-level", ...overrides };
	}

	it("keeps the frontmatter description for the @ completion list", () => {
		const map = indexSkills([piSkill({})]);
		assert.equal(map.get("code-review")?.description, "Review a diff before merging.");
	});

	it("tags the scope like pi's own command palette", () => {
		assert.equal(indexSkills([piSkill({ sourceInfo: sourceInfo({}) })]).get("code-review")?.tag, "[u]");
		assert.equal(
			indexSkills([piSkill({ sourceInfo: sourceInfo({ scope: "project" }) })]).get("code-review")?.tag,
			"[p]",
		);
		assert.equal(
			indexSkills([piSkill({ sourceInfo: sourceInfo({ scope: "temporary" }) })]).get("code-review")?.tag,
			"[t]",
		);
	});

	it("includes the npm package name in the tag", () => {
		const map = indexSkills([
			piSkill({ sourceInfo: sourceInfo({ source: "npm:pi-subagents", origin: "package" }) }),
		]);
		assert.equal(map.get("code-review")?.tag, "[u:npm:pi-subagents]");
	});

	it("skips skills without a name", () => {
		assert.equal(indexSkills([piSkill({ name: "" })]).size, 0);
		assert.equal(indexSkills(undefined).size, 0);
	});
});
