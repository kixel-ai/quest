// Which `quest review` commit statuses count: only one set on a commit of the PR by a user with write access to the base
// repository, bound to that commit's diff from its merge base. The land gate and `quest status` read the review from
// them alone, through one walk, so they cannot disagree.
import {
	type PullRequest,
	type RecordedRisk,
	RISK_FILE,
	type Repository,
	type ReviewRecord,
	type Tier,
	heldHigh,
	highHits,
	parseRiskFile,
	riskFileId,
} from "../core";
import { GitHubDeadline, type GitHubReader, type ObjectValue, array, object, repositoryPath, string } from "./client";

/** The commit status context `quest review` sets on each head it records. */
export const REVIEW_CONTEXT = "quest review";

/** A run's outcome as its status names it, including whether a local reviewer ran, which a standing pick needs. */
export type Outcome = "passed" | "passed with no local reviewer" | "findings accepted" | "findings open";

/**
 * The status description `quest review` sets: the head's risk, class, and the base's risk file they were set against,
 * and its outcome.
 */
export function attestation(risk: Pick<RecordedRisk, "tier" | "class" | "riskFile">, outcome: Outcome): string {
	const kind = risk.class === null ? "" : `, class ${risk.class}`;
	return `Risk ${risk.tier}${kind}, risk file ${risk.riskFile}: ${outcome}`;
}

/**
 * The status's target: the reviewed diff, from the merge base `from` to the head, which binds it to the base the
 * review read. The repository's name is lowercased, as GitHub matches it.
 */
export function reviewTarget(repository: Repository, from: string, sha: string): string {
	return `https://github.com/${repository.owner}/${repository.repo}/compare/${from}...${sha}`.toLowerCase();
}

const ATTESTED =
	/^Risk (low|medium|high)(?:, class ([a-z0-9-]+))?(?:, risk file ([0-9a-f]{12}|none))?: (passed|passed with no local reviewer|findings accepted|findings open)$/;

/** Repository permissions that can push. */
const WRITE = ["admin", "maintain", "write"];

/** The most files GitHub's compare API lists. */
const FILE_LIMIT = 300;

/** The `quest review` statuses on a PR's commits, a page at a time from the newest page. */
const TIERS_QUERY = `query ReviewTiers($owner: String!, $repo: String!, $number: Int!, $before: String) {
	repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
		commits(last: 100, before: $before) {
			pageInfo { hasPreviousPage startCursor }
			nodes { commit { oid status { context(name: "${REVIEW_CONTEXT}") {
				state description targetUrl createdAt creator { __typename login }
			} } } }
		}
	} }
}`;

/** A commit's latest `quest review` status, as GitHub returns it. */
export interface ReviewStatus {
	oid: string;
	status: ObjectValue;
}

/**
 * Why `sha`, the head of `pr` about to land, must wait for a new `quest review` round, or null when it may land.
 * The newest `quest review` status a writer set on a commit of the PR whose diff is the head's decides it: the head
 * lands whatever its tier when that status passed, classified against the base's current risk file, so a round that
 * failed outweighs an earlier pass of the same diff, and any push after the last review that changes the diff, whoever
 * made it, and any change to the base's risk file since, waits for a new one. Otherwise it waits when it is high: when
 * a `quest review` status on any of the PR's commits rates it high, or when its diff from its merge base with the base
 * touches a path the base's risk file holds high.
 */
export async function unreviewedHigh(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	sha: string,
): Promise<string | null> {
	const head = sha.toLowerCase();
	const risk = await baseRisk(github, pr);
	const statuses = await reviewStatuses(github, pr);
	const { counted } = await countedReview(github, pr, head, statuses, { report: false, open: true });
	if (counted?.passed && counted.attested.riskFile === riskFileId(risk?.blob ?? null)) return null;
	const high = statusHigh(statuses) ?? (await pathHigh(github, pr, head, risk?.text ?? null));
	return high === null ? null : `${sha} is high, since ${high}, and no quest review status covers it`;
}

/** The review that counts for a head: a writer's `quest review` status, and how its diff relates to the head's. */
export interface Counted {
	/** The commit the status is on. */
	oid: string;
	/** `current` on the head, `diff-identical` on another commit with the head's diff, `stale` on one with another diff, `unknown` when GitHub cannot compare them. */
	state: ReviewRecord["state"];
	/** Whether the status is a success: a failed round on the head's diff outweighs an earlier pass of it. */
	passed: boolean;
	attested: Attested;
}

/** How {@link countedReview} reads: for the land gate, which fails closed, or for `quest status`, which reports. */
export interface Reading {
	/**
	 * A read that reports, not gates: a head no status covers falls back to the newest passing writer's status on another
	 * diff, `stale`, or `unknown` where a diff cannot be compared, which is also what a refused compare gives.
	 */
	report: boolean;
	/** Whether the PR is open; a merged one's merge base is no longer the one a status was bound to. */
	open: boolean;
}

/**
 * The review that counts for `head` from `statuses`, the PR's `quest review` statuses newest first: the newest writer's
 * status bound to a diff equal to the head's, so a round that failed outweighs an earlier pass of the same diff.
 * `skipped` says why each status that counts for none does not.
 */
export async function countedReview(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	head: string,
	statuses: ReviewStatus[],
	{ report, open }: Reading,
): Promise<{ counted: Counted | null; skipped: string[] }> {
	const skipped: string[] = [];
	const rest: { each: ReviewStatus; known: boolean }[] = [];
	const diffOf = async (sha: string): Promise<string | null> => {
		try {
			return await baseDiff(github, pr, sha);
		} catch (error) {
			// A deadline is the caller's to handle; a refused compare leaves one status unread, not the PR.
			if (!report || error instanceof GitHubDeadline || !(error instanceof Error)) throw error;
			skipped.push(`GitHub cannot compare ${sha} with ${pr.base}: ${error.message}`);
			return null;
		}
	};
	let diff: Promise<string | null> | undefined;
	for (const each of statuses) {
		if (each.oid !== head) {
			diff ??= diffOf(head);
			const own = await diff;
			const theirs = own === null ? null : await diffOf(each.oid);
			if (own === null || theirs !== own) {
				rest.push({ each, known: own !== null && theirs !== null });
				continue;
			}
		}
		// Only a writer's status, bound to the diff it reviewed, says anything about the head.
		const bound = await boundStatus(github, pr, each.oid, each.status, open);
		if (typeof bound === "string") {
			skipped.push(bound);
			continue;
		}
		const state = each.oid === head ? "current" : "diff-identical";
		return { counted: { oid: each.oid, state, passed: each.status.state === "SUCCESS", attested: bound }, skipped };
	}
	if (report)
		for (const { each, known } of rest) {
			if (each.status.state !== "SUCCESS") continue;
			const bound = await boundStatus(github, pr, each.oid, each.status, open);
			if (typeof bound === "string") skipped.push(bound);
			else
				return {
					counted: { oid: each.oid, state: known ? "stale" : "unknown", passed: true, attested: bound },
					skipped,
				};
		}
	return { counted: null, skipped };
}

/**
 * The `quest review` statuses on `pr`'s commits, the most recently set first, since a checkout may review an older
 * commit after a newer one; GitHub lists at most 250 commits, so three pages.
 */
export async function reviewStatuses(github: GitHubReader, pr: PullRequest): Promise<ReviewStatus[]> {
	const found: ReviewStatus[] = [];
	for (let before: string | null = null, more = true; more;) {
		const data = await github.graphql(TIERS_QUERY, { owner: pr.owner, repo: pr.repo, number: pr.number, before });
		const commits = object(object(object(data.repository).pullRequest).commits);
		for (const node of array(commits.nodes).reverse()) {
			const commit = object(node.commit);
			const status = commit.status == null ? null : object(commit.status).context;
			if (status != null) found.push({ oid: string(commit.oid).toLowerCase(), status: object(status) });
		}
		const page = object(commits.pageInfo);
		more = page.hasPreviousPage === true;
		before = more ? string(page.startCursor) : null;
	}
	const set = (each: ReviewStatus) => Date.parse(string(each.status.createdAt));
	return found.sort((a, b) => set(b) - set(a));
}

const BASE_RISK_QUERY = `query BaseRisk($owner: String!, $repo: String!, $expression: String!) {
	repository(owner: $owner, name: $repo) {
		object(expression: $expression) { oid ... on Blob { text isBinary isTruncated } }
	}
}`;

/**
 * The base branch's risk file and its blob SHA, read together, as `quest review` reads them from Git: a symlink's own
 * blob, BOM and all. Null where it has none.
 */
async function baseRisk(
	github: GitHubReader,
	pr: PullRequest & { base: string },
): Promise<{ text: string; blob: string } | null> {
	const data = await github.graphql(BASE_RISK_QUERY, {
		owner: pr.owner,
		repo: pr.repo,
		// Fully qualified, so a tag of the same name is never read instead.
		expression: `refs/heads/${pr.base}:${RISK_FILE}`,
	});
	const found = object(data.repository).object;
	if (found == null) return null;
	const blob = object(found);
	if (blob.isBinary !== false || blob.isTruncated !== false || typeof blob.text !== "string")
		throw new Error(`${pr.owner}/${pr.repo}'s ${RISK_FILE} on ${pr.base} is not a text file GitHub returns whole`);
	return { text: blob.text, blob: string(blob.oid) };
}

/** `sha`'s diff from its merge base with the base, or null for one GitHub cannot diff. */
async function baseDiff(github: GitHubReader, pr: PullRequest & { base: string }, sha: string): Promise<string | null> {
	const response = await github.request(`${repositoryPath(pr)}/compare/${encodeURIComponent(pr.base)}...${sha}`, {
		accept: "application/vnd.github.diff",
		allow: [404, 406, 422],
	});
	return response.ok ? await response.text() : null;
}

/**
 * Why a `quest review` status on one of the PR's commits makes it high, or null. Only someone who can push sets one, and
 * a high rating only holds a head back.
 */
function statusHigh(statuses: ReviewStatus[]): string | null {
	const high = statuses.find(({ status }) => {
		const description = status.description;
		return typeof description === "string" && ATTESTED.exec(description)?.[1] === "high";
	});
	return high === undefined ? null : `the ${REVIEW_CONTEXT} status on ${high.oid} rates it high`;
}

/**
 * Why `sha`'s diff from its merge base with the base makes it high, or null: it touches a path `risk`, the base's risk file,
 * holds high, on either side of a rename, as `quest review` classifies a head.
 */
async function pathHigh(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	sha: string,
	risk: string | null,
): Promise<string | null> {
	const path = repositoryPath(pr);
	const file = risk === null ? null : parseRiskFile(risk);
	if (file !== null && file.problems.length > 0)
		return `the base's ${RISK_FILE} cannot be read: ${file.problems.join("; ")}`;
	// The compare of `sha` itself, since GitHub recomputes a PR's file list only some time after a push.
	const compared = object(
		await (await github.request(`${path}/compare/${encodeURIComponent(pr.base)}...${sha}`)).json(),
	);
	const files = array(compared.files);
	if (files.length >= FILE_LIMIT) return `it changes at least ${FILE_LIMIT} files, more than GitHub lists`;
	const hit = highHits(
		heldHigh(file),
		files.flatMap((row) => [
			string(row.filename),
			...(typeof row.previous_filename === "string" ? [row.previous_filename] : []),
		]),
	)[0];
	return hit === undefined ? null : `it changes ${hit.path}, which is always high: ${hit.rule.reason}`;
}

/** What a `quest review` status attests: the head's risk, and the run's outcome. */
export interface Attested {
	tier: Tier;
	class: string | null;
	riskFile: string;
	outcome: Outcome;
}

/**
 * What a writer's `quest review` status on `sha`, in any state, attests for its diff from the merge base with the PR's
 * base, or why it attests nothing.
 */
async function boundStatus(
	github: GitHubReader,
	pr: PullRequest & { base: string },
	sha: string,
	status: ObjectValue,
	bind: boolean,
): Promise<Attested | string> {
	const { description, targetUrl, creator } = status;
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
	// A retargeted PR, or a base reset under it, has another diff than the one reviewed, from another merge base. A
	// merged PR has none to compare: its merge base moved with the landing, so only its writer binds a status.
	if (bind) {
		let compared: Response;
		try {
			compared = await github.request(
				`/repos/${pr.owner}/${pr.repo}/compare/${encodeURIComponent(pr.base)}...${sha}?per_page=1`,
				{ allow: [404, 422] },
			);
		} catch (error) {
			// A deadline is the caller's to handle; any other failure leaves the status unverified, not the PR unread.
			if (error instanceof GitHubDeadline || !(error instanceof Error)) throw error;
			return `GitHub cannot compare ${sha} with ${pr.base}: ${error.message}`;
		}
		if (!compared.ok) return `GitHub cannot compare ${sha} with ${pr.base} (HTTP ${compared.status})`;
		const from = string(object(object(await compared.json()).merge_base_commit).sha);
		// The status lives in this repository, so its target's diff binds it, whatever name the reader's remote gives it.
		if (!String(targetUrl).toLowerCase().endsWith(`/compare/${from}...${sha}`))
			return `the ${REVIEW_CONTEXT} status on ${sha} attests another diff than ${pr.base}'s, from ${from}: ${String(targetUrl)}`;
	}
	// The tier, class, and risk file gate a standing pick. A status that names no risk file came before it was
	// attested, and names none, as a record without the line does.
	const attested = ATTESTED.exec(typeof description === "string" ? description : "");
	if (attested === null) return `the ${REVIEW_CONTEXT} status on ${sha} names no risk: ${String(description)}`;
	return {
		tier: attested[1] as Tier,
		class: attested[2] ?? null,
		riskFile: attested[3] ?? riskFileId(null),
		outcome: attested[4] as Outcome,
	};
}
