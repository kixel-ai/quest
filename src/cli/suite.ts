// `quest suite`: the command a PR's head needs beyond the checks its diff reaches, so a repository's gate runs the
// whole test suite only for a high-risk change.
import { RISK_FILE, type RiskFile, type Status, parseRiskFile } from "../core";
import { git } from "./git";
import { fetchBase, parseBase } from "./review";

/**
 * The risk file's full-suite command when `risk` calls for it: a high tier, or no tier that covers the head, since a
 * record that is missing, malformed, stale, or cannot be compared says nothing about it. Null otherwise, or when the file names
 * no full suite.
 */
export function suiteFor(risk: Status["risk"], file: RiskFile | null): string | null {
	const suite = file?.suite ?? null;
	if (suite === null) return null;
	const covered = risk !== null && (risk.state === "current" || risk.state === "diff-identical");
	return !covered || risk.tier === "high" ? suite : null;
}

/** The base's risk file, fetched from `base` (by default origin's default branch), or null when it has none. */
export async function baseRiskFile(root: string, base?: string): Promise<RiskFile | null> {
	const ref = await fetchBase(root, base);
	const { remote, branch } = parseBase(root, ref);
	const tip = `refs/remotes/${remote}/${branch}`;
	if (git(root, ["ls-tree", "--name-only", tip, "--", RISK_FILE]) === "") return null;
	const file = parseRiskFile(git(root, ["show", `${tip}:${RISK_FILE}`]));
	if (file.problems.length > 0)
		throw new Error(`the base's ${RISK_FILE} cannot be read: ${file.problems.join("; ")}`);
	return file;
}
