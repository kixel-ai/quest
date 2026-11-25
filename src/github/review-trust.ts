// Whose `## Review` record `quest status` counts: only one a `quest review` commit status attests, set on the reviewed
// head by a user with write access to the base repository, since anyone can write a SHA into their own PR's body.
import { type PullRequest, type Repository, type Tier, recordedRisk, reviewSection } from "../core";
import { GitHubDeadline, type GitHubReader, object, string } from "./client";

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

/** A PR body as `quest status` reads it, and whether the status attests a local reviewer's round. */
export interface Trusted {
	body: string;
	localReview: boolean;
}

/**
 * `body` as `quest status` reads its `## Review` record: as written when a `quest review` status attests the head the
 * section names last, or when it names no full SHA, else without the record, with a warning saying why.
 */
export async function trustedReview(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	body: string,
	warn: (message: string) => void,
): Promise<Trusted> {
	const section = reviewSection(body);
	const reviewed =
		section &&
		body
			.slice(section.start, section.end)
			.match(/\b[0-9a-f]{40}\b/g)
			?.at(-1);
	// A record naming no full SHA, as one with a finding open, counts for no head anyway.
	if (!reviewed) return { body, localReview: false };
	const attested = await attestedOutcome(github, pr, body, reviewed);
	if (typeof attested !== "string") return { body, localReview: attested.localReview };
	warn(`${pr.owner}/${pr.repo}#${pr.number}'s ## Review record does not count: ${attested}`);
	return { body: "", localReview: false };
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
	if (String(targetUrl).toLowerCase() !== reviewTarget(pr, from, sha))
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
