import { expect, test } from "vitest";

import { parseRiskFile } from "../src/core";
import { suiteFor } from "../src/cli/suite";

test("the full suite runs for a high head, or one no tier covers, and only where the risk file names it", () => {
	const file = parseRiskFile("## Full suite\n\n```sh\njust gate --all\n```\n");
	const risk = (tier: "low" | "medium" | "high", state: "current" | "diff-identical" | "stale" | "unknown") => ({
		tier,
		reason: "why",
		classified: tier,
		class: null,
		state,
	});
	expect(suiteFor(risk("high", "current"), file)).toBe("just gate --all");
	expect(suiteFor(risk("medium", "current"), file)).toBeNull();
	expect(suiteFor(risk("low", "diff-identical"), file)).toBeNull();
	// A record that does not cover the head says nothing about it, so the gate runs everything.
	expect(suiteFor(risk("low", "stale"), file)).toBe("just gate --all");
	expect(suiteFor(risk("low", "unknown"), file)).toBe("just gate --all");
	expect(suiteFor(null, file)).toBe("just gate --all");
	// Without a full suite there is nothing beyond the scoped checks to add.
	expect(suiteFor(risk("high", "current"), parseRiskFile("# Risk\n"))).toBeNull();
	expect(suiteFor(null, null)).toBeNull();
});
