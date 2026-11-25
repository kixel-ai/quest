// Whose `## Review` record `quest status` counts: only one a `quest review` commit status attests, set on the reviewed
// head by a user with write access to the base repository, since anyone can write a SHA into their own PR's body.
import {
	type PullRequest,
	REVIEW_MARK,
	RISK_FILE,
	type Repository,
	type Tier,
	heldHigh,
	matches,
	parseRiskFile,
	recordedRisk,
	reviewSection,
} from "../core";
import { GitHubDeadline, type GitHubReader, object, repositoryPath, string } from "./client";

/** The commit status context `quest review` sets on each head it records. */
export const REVIEW_CONTEXT = "quest review";

/** A run's outcome as its status names it, including whether a local reviewer ran, which a standing pick needs. */
export type Outcome = "passed" | "passed with no local reviewer" | "findings accepted" | "findings open";

/** The status description `quest review` sets: the head's risk and class, which the body's record must match, and its outcome. */
export function attestation(tier: Tier, kind: string | null, outcome: Outcome): string {
	return `Risk ${tier}${kind === null ? "" : `, class ${kind}`}: ${outcome}`;
}

/**
 * The status's target: the reviewed diff, from the merge base `from` to the head, which binds it to the base the
 * review read. The repository's name is lowercased, as GitHub matches it.
 */
export function reviewTarget(repository: Repository, from: string, sha: string): string {
	return `https://github.com/${repository.owner}/${repository.repo}/compare/${from}...${sha}`.toLowerCase();
}

const ATTESTED =
	/^Risk (low|medium|high)(?:, class ([a-z0-9-]+))?: (passed|passed with no local reviewer|findings accepted|findings open)$/;

/** Repository permissions that can push. */
const WRITE = ["admin", "maintain", "write"];

const STATUS_QUERY = `query ReviewStatus($owner: String!, $repo: String!, $sha: GitObjectID!) {
	repository(owner: $owner, name: $repo) {
		object(oid: $sha) { ... on Commit { status { context(name: "${REVIEW_CONTEXT}") {
			state description targetUrl creator { __typename login }
		} } } }
	}
}`;

/** A PR body as `quest status` reads it, the head its status attests, and whether it attests a local reviewer's round. */
export interface Trusted {
	body: string;
	head: string | null;
	localReview: boolean;
}

/**
 * `body` as `quest status` reads its `## Review` record: as written when a `quest review` status attests the head the
 * section names last, else without the record, with a warning saying why unless it names no full SHA.
 */
export async function trustedReview(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	body: string,
	warn: (message: string) => void,
): Promise<Trusted> {
	const section = reviewSection(body);
	const text = section === null ? "" : body.slice(section.start, section.end);
	// As `reviewRecord` reads it: only a section holding `quest review`'s record names a head, by its last full SHA.
	const reviewed = text.includes(REVIEW_MARK) && text.match(/\b[0-9a-f]{40}\b/g)?.at(-1);
	// A section naming no head, as a record with a finding open, counts for none, so its risk and class print as none.
	if (!reviewed) return { body: section === null ? body : "", head: null, localReview: false };
	const attested = await attestedOutcome(github, pr, body, reviewed);
	if (typeof attested !== "string") return { body, head: reviewed, localReview: attested.localReview };
	warn(`${pr.owner}/${pr.repo}#${pr.number}'s ## Review record does not count: ${attested}`);
	return { body: "", head: null, localReview: false };
}

/** The most files GitHub's REST API lists for a PR. */
const FILE_LIMIT = 3000;

/**
 * Why `sha`, the head of `pr` about to land, must wait for a new `quest review` round, or null when it may land.
 * A head `RISK.md` rates high lands only with a trusted record of `sha` itself, so any push after the last review,
 * whoever made it, waits for a new one. A head is high when `body`'s record rates it high, is malformed, or does not
 * count, or when its diff from its merge base with the base touches a path the base's risk file holds high.
 */
export async function unreviewedHigh(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	sha: string,
	body: string,
): Promise<string | null> {
	let distrust: string | undefined;
	const trusted = await trustedReview(github, pr, body, (message) => {
		distrust = message;
	});
	if (trusted.head === sha.toLowerCase()) return null;
	const high = distrust ?? recordHigh(body) ?? (await pathHigh(github, pr));
	return high === null ? null : `${sha} is high, since ${high}, and no quest review status covers it`;
}

/** Why `body`'s risk record makes its PR high, or null. A malformed one does, since the PR's author writes the body. */
function recordHigh(body: string): string | null {
	const risk = recordedRisk(body);
	if (risk === null) return null;
	if ("malformed" in risk) return risk.malformed;
	return risk.tier === "high" ? "its review record rates it high" : null;
}

/**
 * Why `pr`'s diff from its merge base with the base makes it high, or null: it touches a path the base's risk file
 * holds high, on either side of a rename, as `quest review` classifies a head.
 */
async function pathHigh(github: GitHubReader, pr: PullRequest & { base: string }): Promise<string | null> {
	const path = repositoryPath(pr);
	const risk = await github.request(`${path}/contents/${RISK_FILE}?ref=${encodeURIComponent(pr.base)}`, {
		accept: "application/vnd.github.raw+json",
		allow: [404],
	});
	const file = risk.status === 404 ? null : parseRiskFile(await risk.text());
	if (file !== null && file.problems.length > 0)
		return `the base's ${RISK_FILE} cannot be read: ${file.problems.join("; ")}`;
	const held = heldHigh(file);
	const rows = await github.all(`${path}/pulls/${pr.number}/files?per_page=100`);
	if (rows.length >= FILE_LIMIT) return `it changes at least ${FILE_LIMIT} files, more than GitHub lists`;
	const changed = rows.flatMap((row) => [
		string(row.filename),
		...(typeof row.previous_filename === "string" ? [row.previous_filename] : []),
	]);
	for (const each of changed) {
		const rule = held.find(({ pattern }) => matches(pattern, each));
		if (rule !== undefined) return `it changes ${each}, which is always high: ${rule.reason}`;
	}
	return null;
}

/** Whether a writer's passing `quest review` status on `sha` attests `body`'s record, with a local reviewer or not, or why not. */
async function attestedOutcome(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	body: string,
	sha: string,
): Promise<{ localReview: boolean } | string> {
	const data = await github.graphql(STATUS_QUERY, { owner: pr.owner, repo: pr.repo, sha });
	const commit = object(data.repository).object;
	if (commit === null) return `${pr.owner}/${pr.repo} has no commit ${sha}`;
	const rollup = object(commit).status;
	const status = rollup == null ? null : object(rollup).context;
	if (status == null) return `${sha} has no ${REVIEW_CONTEXT} status`;
	const { state, description, targetUrl, creator } = object(status);
	if (state !== "SUCCESS")
		return `the ${REVIEW_CONTEXT} status on ${sha} is ${String(state).toLowerCase()}, not success`;
	if (creator == null) return `the account that set the ${REVIEW_CONTEXT} status on ${sha} is gone`;
	const { __typename: kind, login } = object(creator);
	const name = String(login);
	if (kind !== "User")
		return `${name}, who set the ${REVIEW_CONTEXT} status on ${sha}, is a ${String(kind)}, not a user`;
	const permission = await github.request(
		`/repos/${pr.owner}/${pr.repo}/collaborators/${encodeURIComponent(name)}/permission`,
		{ allow: [403, 404] },
	);
	if (permission.status === 403)
		return `cannot read the permission of ${name}, who set the ${REVIEW_CONTEXT} status on ${sha}: ${String(object(await permission.json()).message)}`;
	const found = permission.status === 404 ? "no" : string(object(await permission.json()).permission);
	if (!WRITE.includes(found))
		return `${name}, who set the ${REVIEW_CONTEXT} status on ${sha}, has ${found} access to ${pr.owner}/${pr.repo}, not write`;
	// A retargeted PR, or a base reset under it, has another diff than the one reviewed, from another merge base.
	let compared: Response;
	try {
		compared = await github.request(
			`/repos/${pr.owner}/${pr.repo}/compare/${encodeURIComponent(pr.base)}...${sha}?per_page=1`,
			{ allow: [404, 422] },
		);
	} catch (error) {
		// A deadline is the caller's to handle; any other failure leaves the record unverified, not the PR unread.
		if (error instanceof GitHubDeadline || !(error instanceof Error)) throw error;
		return `GitHub cannot compare ${sha} with ${pr.base}: ${error.message}`;
	}
	if (!compared.ok) return `GitHub cannot compare ${sha} with ${pr.base} (HTTP ${compared.status})`;
	const from = string(object(object(await compared.json()).merge_base_commit).sha);
	// The status lives in this repository, so its target's diff binds it, whatever name the reader's remote gives it.
	if (!String(targetUrl).toLowerCase().endsWith(`/compare/${from}...${sha}`))
		return `the ${REVIEW_CONTEXT} status on ${sha} attests another diff than ${pr.base}'s, from ${from}: ${String(targetUrl)}`;
	// The tier and class gate a standing pick, so the body's must be the ones attested.
	const attested = ATTESTED.exec(typeof description === "string" ? description : "");
	if (attested === null) return `the ${REVIEW_CONTEXT} status on ${sha} names no risk: ${String(description)}`;
	const risk = recordedRisk(body);
	if (risk === null) return `it names no risk, which the ${REVIEW_CONTEXT} status on ${sha} attests`;
	// A malformed risk is left for `quest status` to print and `quest merge` to refuse.
	if (!("malformed" in risk) && (risk.tier !== attested[1] || risk.class !== (attested[2] ?? null)))
		return `its risk differs from the ${REVIEW_CONTEXT} status on ${sha}: ${String(description)}`;
	return { localReview: attested[3] !== "passed with no local reviewer" };
}
