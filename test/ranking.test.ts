import { afterEach, expect, test, vi } from "vitest";

import { MODEL_EFFORTS, REVIEWERS } from "../src/cli/models";
import { SIZES } from "../src/core";
import { authored, pickReviewer, shadowOf } from "../src/cli/review";
import { fakes, quest, setup } from "./review-fakes";

afterEach(() => {
	vi.unstubAllEnvs();
});

const name = ({ harness, model, effort }: { harness: string; model: string; effort: string }) =>
	`${harness} ${model} ${effort}`;

test("Gemini Carbon leads M whoever wrote it, and Sol keeps the other sizes", () => {
	for (const host of [{ CLAUDECODE: "1" }, { CODEX_THREAD_ID: "t" }]) {
		expect(name(pickReviewer("M", {}, authored({}, host)))).toBe("agy gemini-4-carbon high");
	}
	const claude = authored({}, { CLAUDECODE: "1" });
	expect(name(pickReviewer("S", {}, claude))).toBe("codex gpt-6.1-sol medium");
	expect(name(pickReviewer("L", {}, claude))).toBe("codex gpt-6.1-sol xhigh");
	// Its shadow would step past the high its model tops out at, so it runs none; one effort lower, it gets one.
	expect(shadowOf("M", REVIEWERS.M[0]!)).toBeNull();
	expect(shadowOf("M", { ...REVIEWERS.M[0]!, effort: "medium" })).toMatchObject({ effort: "high" });
});

test("every ranked reviewer's shadow runs at an effort its model offers", () => {
	for (const size of SIZES)
		for (const entry of REVIEWERS[size]) {
			const shadow = shadowOf(size, entry);
			if (shadow)
				expect(MODEL_EFFORTS[entry.model] ?? ["low", "medium", "high", "xhigh"]).toContain(shadow.effort);
		}
});

fakes("an M review runs Carbon alone, and passes to Sol while Antigravity cannot run", async () => {
	const s = setup("CLAUDECODE");
	const carbon = await quest("--root", s.repo, "review", "--json");
	expect(carbon.code, carbon.stderr).toBe(0);
	const rounds = JSON.parse(carbon.stdout).rounds as { reviewer: string; model: string; effort: string }[];
	expect(rounds.map((round) => name({ harness: round.reviewer, ...round }))).toEqual(["agy gemini-4-carbon high"]);

	vi.stubEnv("FAKE_FAILS", "agy");
	vi.stubEnv("FAKE_LOGGED_OUT", "1");
	const sol = await quest("--root", s.repo, "review", "--new");
	expect(sol.code, sol.stderr).toBe(0);
	expect(sol.stdout).toMatch(/^skipped agy gemini-4-carbon high /m);
	expect(sol.stdout).toMatch(/^reviewer codex gpt-6\.1-sol high$/m);
});
