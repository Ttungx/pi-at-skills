/**
 * Skill block builder: what actually reaches the model context.
 */

import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildInlineSkillsContent } from "../src/skill-registry.ts";
import type { MentionSkill } from "../src/skill-registry.ts";

const dirs: string[] = [];

function skill(name: string, body: string): MentionSkill {
	const baseDir = mkdtempSync(join(tmpdir(), "pi-at-skills-"));
	dirs.push(baseDir);
	const filePath = join(baseDir, "SKILL.md");
	writeFileSync(filePath, `---\nname: ${name}\ndescription: test\n---\n${body}`, "utf8");
	return { name, filePath, baseDir };
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
