/**
 * Mention scanner: `@skill-name` (and legacy `$skill-name`) detection.
 *
 * Run with `npm test` (node --experimental-strip-types --test). No pi runtime
 * needed: the modules under test import pi types only, which are erased.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanMentions } from "../src/mention.ts";
import type { MentionSkill } from "../src/skill-registry.ts";

function skill(name: string): MentionSkill {
  return { name, filePath: `/tmp/${name}/SKILL.md`, baseDir: `/tmp/${name}` };
}

function index(...names: string[]): Map<string, MentionSkill> {
  return new Map(names.map((name) => [name, skill(name)]));
}

describe("scanMentions", () => {
	it("finds a mention at the start of the prompt", () => {
		assert.deepEqual(namesOf("@tdd 帮我做这个", ["tdd"]), ["tdd"]);
	});

	it("finds mentions mid-sentence, which pi's /skill: cannot", () => {
		const text = "从 agent 架构上多说一点 @code-review，再 @humanizer-zh 润色";
		assert.deepEqual(namesOf(text, ["code-review", "humanizer-zh"]), ["code-review", "humanizer-zh"]);
	});

	it("keeps first-mention order and dedupes repeats", () => {
		assert.deepEqual(namesOf("@tdd 然后 @code-review，最后再 @tdd", ["tdd", "code-review"]), [
			"tdd",
			"code-review",
		]);
	});

	it("ignores unknown names", () => {
		assert.deepEqual(namesOf("@not-installed 和 @tddx", ["tdd"]), []);
	});

	it("returns nothing when no skills are known", () => {
		assert.deepEqual(scanMentions("@tdd 帮我做这个", new Map()), []);
	});

	it("accepts the legacy $ sigil", () => {
		assert.deepEqual(namesOf("$tdd 帮我做这个", ["tdd"]), ["tdd"]);
	});

	it("treats @@name and $$name as literal escapes", () => {
		assert.deepEqual(namesOf("@@tdd 字面量 $$code-review", ["tdd", "code-review"]), []);
	});

	it("resolves the longest known skill for dashed names", () => {
		assert.deepEqual(namesOf("@code-review-module", ["code-review", "code-review-module"]), [
			"code-review-module",
		]);
	});

	describe("never mistakes attachments, paths or emails for mentions", () => {
		it("ignores file paths", () => {
			assert.deepEqual(namesOf("@src/foo.ts 和 @notes.md 以及 @/abs/path.ts", ["tdd"]), []);
		});

		it("ignores emails and user handles", () => {
			assert.deepEqual(namesOf("联系 user@example.com 或 a@tdd", ["tdd"]), []);
		});

		it("ignores upper-case identifiers (decorators, mentions)", () => {
			assert.deepEqual(namesOf("see @Component 和 @tdd", ["tdd"]), ["tdd"]);
		});

		it("ignores a skill-shaped word glued to a path or extension", () => {
			assert.deepEqual(namesOf("@tdd.md @tdd.ts", ["tdd"]), []);
		});

		it("still matches when followed by sentence punctuation", () => {
			assert.deepEqual(namesOf("用 @tdd！然后 @code-review。", ["tdd", "code-review"]), [
				"tdd",
				"code-review",
			]);
		});
	});

	it("never rewrites the input text", () => {
		const input = "@tdd 帮我实现";
		scanMentions(input, index("tdd"));
		assert.equal(input, "@tdd 帮我实现");
	});
});

function namesOf(text: string, known: string[]): string[] {
	return scanMentions(text, index(...known)).map((s) => s.name);
}
