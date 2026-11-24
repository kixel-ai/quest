// Whose `## Review` record `quest status` counts: only one users with write access to the base repository wrote,
// since anyone can write a SHA into their own PR's body.
import { FIX_LINE, type PullRequest, recordBody, recordedRisk, reviewText } from "../core";
import { type GitHubReader, WRITE, array, object, permission, string } from "./client";

/** Edits read per page, each carrying a whole body of up to 65,536 characters; the record's writer is usually among the newest few. */
const PAGE = 10;
/** The newest edits read for the ones that wrote the section; past them, its writer is unknown. */
const EDITS = 100;

const EDITS_QUERY = `query BodyEdits($owner: String!, $repo: String!, $number: Int!, $after: String) {
	repository(owner: $owner, name: $repo) { pullRequest(number: $number) {
		body author { __typename login }
		userContentEdits(first: ${PAGE}, after: $after) {
			pageInfo { hasNextPage endCursor }
			nodes { editedAt deletedAt editor { __typename login } diff }
		}
	} }
}`;

/**
 * `body` reduced to the `## Review` record `quest status` counts, as {@link recordBody} gives it, when writers alone
 * wrote the section's text, else nothing, with a warning saying why. A section naming no full SHA and no risk is
 * returned unchecked, since it records nothing.
 */
export async function trustedReview(
	github: GitHubReader,
	pr: PullRequest,
	body: string,
	warn: (message: string) => void,
): Promise<string> {
	const text = reviewText(body);
	if (text === null) return "";
	const record = recordBody(text);
	if (!/\b[0-9a-f]{40}\b/.test(record) && recordedRisk(record) === null) return record;
	const why = await untrusted(github, pr, body, text);
	if (why === null) return record;
	warn(`${pr.owner}/${pr.repo}#${pr.number}'s ## Review record does not count: ${why}`);
	return "";
}

/** What a walk reads with: the repository's client and PR, and each account's permission once asked. */
interface Reading {
	github: GitHubReader;
	pr: PullRequest;
	permissions: Map<string, Promise<string | 403 | 404>>;
}

/** One version of the body: who saved it, and its section's text, null without one, or why it cannot be read. */
interface Version {
	editor: unknown;
	text: string | null | { unreadable: string };
}

/**
 * Why the section is untrusted, or null when writers wrote it. Walking the body's versions newest first, each edit
 * that changes the section's text must be a writer's. A writer's edit that only adds lines vouches for those alone, so
 * the walk goes on to whoever wrote the rest; any other edit by a writer, or the section's creation, ends it.
 */
async function untrusted(github: GitHubReader, pr: PullRequest, body: string, text: string): Promise<string | null> {
	let newer: Version | undefined;
	let after: string | null = null;
	let read = 0;
	let time = Infinity;
	const reading: Reading = { github, pr, permissions: new Map() };
	for (;;) {
		const data = await github.graphql(EDITS_QUERY, { owner: pr.owner, repo: pr.repo, number: pr.number, after });
		const pull = object(object(data.repository).pullRequest);
		if (pull.body !== body)
			throw new Error("the PR body changed while reading its edit history; rerun quest status");
		const edits = object(pull.userContentEdits);
		for (const edit of array(edits.nodes)) {
			const at = Date.parse(string(edit.editedAt));
			if (!(at <= time)) throw new Error("invalid GitHub response: the PR body's edits are not newest first");
			time = at;
			if (read++ === 0 && edit.diff !== body)
				return "its edit history does not show the current body yet; rerun quest status";
			const version: Version = {
				editor: edit.editor,
				text:
					typeof edit.diff === "string"
						? reviewText(edit.diff)
						: { unreadable: edit.deletedAt == null ? "is unreadable" : "was deleted" },
			};
			if (newer !== undefined) {
				const verdict = await change(reading, newer, version);
				if (verdict !== undefined) return verdict;
			}
			newer = version;
		}
		const info = object(edits.pageInfo);
		if (info.hasNextPage !== true)
			// The oldest edit is the PR's creation, by its author; a body never edited has none. Creating the section
			// settles the walk, so it never reads on from here.
			return (
				(await change(reading, newer ?? { editor: pull.author, text }, { editor: null, text: null })) ?? null
			);
		if (read >= EDITS) return `its newest ${EDITS} edits leave unknown who wrote all of its section`;
		after = string(info.endCursor);
	}
}

/**
 * What the edit from `older` to `newer`, a version already read, says: why the section is untrusted, null once
 * writers wrote all of it, or undefined to read on. A bot's edit that only adds or drops land fixer lines changes
 * nothing, since `quest land` writes them as a bot.
 */
async function change(reading: Reading, newer: Version, older: Version): Promise<string | null | undefined> {
	const text = newer.text as string | null;
	if (typeof older.text === "object" && older.text !== null)
		return `a revision in its edit history ${older.text.unreadable}`;
	if (text === older.text) return undefined;
	const fixes = (section: string | null) => section?.replace(FIX_LINE, "").trim() ?? null;
	if (kind(newer.editor) === "Bot" && fixes(text) === fixes(older.text)) return undefined;
	const why = await writer(reading, newer.editor);
	if (why !== null) return why;
	return older.text !== null && text !== null && adds(older.text, text) ? undefined : null;
}

/** Whether `newer` holds every line of `older` in order, with lines added around them. */
function adds(older: string, newer: string): boolean {
	const lines = newer.split("\n");
	let at = 0;
	for (const line of older.split("\n")) {
		while (at < lines.length && lines[at] !== line) at++;
		if (at++ >= lines.length) return false;
	}
	return true;
}

const kind = (actor: unknown) => (actor === null ? null : object(actor).__typename);

/** Why `actor`, who changed the section, is not a user with write access to `pr`'s repository, or null when it is. */
async function writer({ github, pr, permissions }: Reading, actor: unknown): Promise<string | null> {
	if (actor === null) return "the account that changed its section is gone";
	const name = string(object(actor).login);
	if (kind(actor) !== "User") return `${name}, who changed its section, is a ${String(kind(actor))}, not a user`;
	// A walk past a writer's additions asks about the same account again.
	if (!permissions.has(name)) permissions.set(name, permission(github, pr, name));
	const found = await permissions.get(name)!;
	if (typeof found === "number")
		return `cannot read the permission of ${name}, who changed its section (HTTP ${found})`;
	if (!WRITE.includes(found))
		return `${name}, who changed its section, has ${found} access to ${pr.owner}/${pr.repo}, not write`;
	return null;
}
