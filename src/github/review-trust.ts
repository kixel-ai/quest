// Whose `## Review` record `quest status` counts: only one a `quest review` commit status attests, set on the reviewed
// head by a user with write access to the base repository, since anyone can write a SHA into their own PR's body.
import { type PullRequest, type Repository, type Tier, recordedRisk, reviewSection } from "../core";
import { type GitHubReader, object, string } from "./client";

/** The commit status context `quest review` sets on each head it records. */
export const REVIEW_CONTEXT = "quest review";

/** A run's outcome as its status names it: whether a local reviewer ran is attested too, since a standing pick needs one. */
export type Outcome = "passed" | "passed with no local reviewer" | "findings open";

/** The status description `quest review` sets: the head's risk and class, which the body's record must match, and its outcome. */
export function attestation(tier: Tier, kind: string | null, outcome: Outcome): string {
	return `Risk ${tier}${kind === null ? "" : `, class ${kind}`}: ${outcome}`;
}

/**
 * The status's target: the reviewed diff, from the PR's base branch to the head, which binds it to that base. The
 * repository's name is lowercased, as GitHub matches it.
 */
export function reviewTarget(repository: Repository, base: string, sha: string): string {
	const name = `${repository.owner}/${repository.repo}`.toLowerCase();
	return `https://github.com/${name}/compare/${encodeURIComponent(base)}...${sha}`;
}

/** The record's own line for a run no local reviewer ran in. */
export const NO_REVIEWER = /^- Local review: none\b/m;

const ATTESTED =
	/^Risk (low|medium|high)(?:, class ([a-z0-9-]+))?: (passed|passed with no local reviewer|findings open)$/;

/** Repository permissions that can push. */
const WRITE = ["admin", "maintain", "write"];

const STATUS_QUERY = `query ReviewStatus($owner: String!, $repo: String!, $sha: GitObjectID!) {
	repository(owner: $owner, name: $repo) {
		object(oid: $sha) { ... on Commit { status { context(name: "${REVIEW_CONTEXT}") {
			state description targetUrl creator { __typename login }
		} } } }
	}
}`;

/**
 * `body` as `quest status` reads its `## Review` record: as written when a `quest review` status attests the head the
 * section names last, or when it names no full SHA, else without the record, with a warning saying why.
 */
export async function trustedReview(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	body: string,
	warn: (message: string) => void,
): Promise<string> {
	const section = reviewSection(body);
	const text = section === null ? "" : body.slice(section.start, section.end);
	const reviewed = text.match(/\b[0-9a-f]{40}\b/g)?.at(-1);
	// A record naming no full SHA, as one with a finding open, counts for no head anyway.
	if (reviewed === undefined) return body;
	const why = await unattested(github, pr, body, text, reviewed);
	if (why === null) return body;
	warn(`${pr.owner}/${pr.repo}#${pr.number}'s ## Review record does not count: ${why}`);
	return "";
}

/** Why no writer's passing `quest review` status on `sha` attests `body`'s record, or null when one does. */
async function unattested(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	body: string,
	section: string,
	sha: string,
): Promise<string | null> {
	const data = await github.graphql(STATUS_QUERY, { owner: pr.owner, repo: pr.repo, sha });
	const commit = object(data.repository).object;
	if (commit === null) return `${pr.owner}/${pr.repo} has no commit ${sha}`;
	const rollup = object(commit).status;
	const status = rollup == null ? null : object(rollup).context;
	if (status == null) return `${sha} has no ${REVIEW_CONTEXT} status`;
	const { state, description, targetUrl, creator } = object(status);
	if (state !== "SUCCESS")
		return `the ${REVIEW_CONTEXT} status on ${sha} is ${String(state).toLowerCase()}, not success`;
	// The same head into another base is another diff, which this review did not see.
	if (targetUrl !== reviewTarget(pr, pr.base, sha))
		return `the ${REVIEW_CONTEXT} status on ${sha} attests another diff than into ${pr.base}: ${String(targetUrl)}`;
	if (creator == null) return `the account that set the ${REVIEW_CONTEXT} status on ${sha} is gone`;
	const { __typename: kind, login } = object(creator);
	const name = String(login);
	if (kind !== "User")
		return `${name}, who set the ${REVIEW_CONTEXT} status on ${sha}, is a ${String(kind)}, not a user`;
	const response = await github.request(
		`/repos/${pr.owner}/${pr.repo}/collaborators/${encodeURIComponent(name)}/permission`,
		{ allow: [403, 404] },
	);
	if (response.status === 403)
		return `cannot read the permission of ${name}, who set the ${REVIEW_CONTEXT} status on ${sha}: ${String(object(await response.json()).message)}`;
	const found = response.status === 404 ? "no" : string(object(await response.json()).permission);
	if (!WRITE.includes(found))
		return `${name}, who set the ${REVIEW_CONTEXT} status on ${sha}, has ${found} access to ${pr.owner}/${pr.repo}, not write`;
	// The tier, class, and whether a reviewer ran gate a standing pick, so the body's must be the ones attested.
	const attested = ATTESTED.exec(typeof description === "string" ? description : "");
	if (attested === null) return `the ${REVIEW_CONTEXT} status on ${sha} names no risk: ${String(description)}`;
	const risk = recordedRisk(body);
	if (risk === null) return `it names no risk, which the ${REVIEW_CONTEXT} status on ${sha} attests`;
	// A malformed risk is left for `quest status` to print and `quest merge` to refuse.
	if (
		!("malformed" in risk) &&
		(risk.tier !== attested[1] ||
			risk.class !== (attested[2] ?? null) ||
			NO_REVIEWER.test(section) !== (attested[3] === "passed with no local reviewer"))
	)
		return `it differs from the ${REVIEW_CONTEXT} status on ${sha}: ${String(description)}`;
	return null;
}
