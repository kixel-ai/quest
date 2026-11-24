// Whose `## Review` record `quest status` counts: only one a `quest review` commit status attests, set on the reviewed
// head by a user with write access to the base repository, since anyone can write a SHA into their own PR's body.
import { type PullRequest, type Tier, recordedRisk, reviewSection } from "../core";
import { type GitHubReader, WRITE, object, permission } from "./client";

/** The commit status context `quest review` sets on each head it records. */
export const REVIEW_CONTEXT = "quest review";

/** The status description `quest review` sets: the head's risk and class, which the body's record must match, and its outcome. */
export function attestation(tier: Tier, kind: string | null, passed: boolean): string {
	return `Risk ${tier}${kind === null ? "" : `, class ${kind}`}: ${passed ? "passed" : "findings open"}`;
}

const ATTESTED = /^Risk (low|medium|high)(?:, class ([a-z0-9-]+))?: /;

const STATUS_QUERY = `query ReviewStatus($owner: String!, $repo: String!, $sha: GitObjectID!) {
	repository(owner: $owner, name: $repo) {
		object(oid: $sha) { ... on Commit { status { context(name: "${REVIEW_CONTEXT}") {
			state description creator { __typename login }
		} } } }
	}
}`;

/**
 * `body` as `quest status` reads its `## Review` record: as written when a `quest review` status attests the head the
 * section names last, else without the record, with a warning saying why. A section naming no full SHA is returned
 * unchecked, since no record counts there.
 */
export async function trustedReview(
	github: GitHubReader,
	pr: PullRequest,
	body: string,
	warn: (message: string) => void,
): Promise<string> {
	const section = reviewSection(body);
	const reviewed =
		section &&
		body
			.slice(section.start, section.end)
			.match(/\b[0-9a-f]{40}\b/g)
			?.at(-1);
	if (!reviewed) return body;
	const why = await unattested(github, pr, body, reviewed);
	if (why === null) return body;
	warn(`${pr.owner}/${pr.repo}#${pr.number}'s ## Review record does not count: ${why}`);
	return "";
}

/** Why no writer's passing `quest review` status on `sha` attests `body`'s record, or null when one does. */
async function unattested(github: GitHubReader, pr: PullRequest, body: string, sha: string): Promise<string | null> {
	const data = await github.graphql(STATUS_QUERY, { owner: pr.owner, repo: pr.repo, sha });
	const commit = object(data.repository).object;
	if (commit === null) return `${pr.owner}/${pr.repo} has no commit ${sha}`;
	const rollup = object(commit).status;
	const status = rollup == null ? null : object(rollup).context;
	if (status == null) return `${sha} has no ${REVIEW_CONTEXT} status`;
	const { state, description, creator } = object(status);
	if (state !== "SUCCESS")
		return `the ${REVIEW_CONTEXT} status on ${sha} is ${String(state).toLowerCase()}, not success`;
	if (creator == null) return `the account that set the ${REVIEW_CONTEXT} status on ${sha} is gone`;
	const { __typename: kind, login } = object(creator);
	const name = String(login);
	if (kind !== "User")
		return `${name}, who set the ${REVIEW_CONTEXT} status on ${sha}, is a ${String(kind)}, not a user`;
	const found = await permission(github, pr, name);
	if (typeof found === "number")
		return `cannot read the permission of ${name}, who set the ${REVIEW_CONTEXT} status on ${sha} (HTTP ${found})`;
	if (!WRITE.includes(found))
		return `${name}, who set the ${REVIEW_CONTEXT} status on ${sha}, has ${found} access to ${pr.owner}/${pr.repo}, not write`;
	// The tier and class gate a standing pick, so the body's must be the ones the status attests.
	const attested = ATTESTED.exec(typeof description === "string" ? description : "");
	if (attested === null) return `the ${REVIEW_CONTEXT} status on ${sha} names no risk`;
	const risk = recordedRisk(body);
	// A malformed risk is left for `quest status` to print and `quest merge` to refuse.
	if (risk !== null && !("malformed" in risk) && (risk.tier !== attested[1] || risk.class !== (attested[2] ?? null)))
		return `its risk differs from the ${REVIEW_CONTEXT} status on ${sha}: ${String(description)}`;
	return null;
}
