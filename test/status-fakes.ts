// A fake GitHub for `quest status`: recorded GraphQL answers and the REST reads around them.
import { expect } from "vitest";

import { recordedRisk } from "../src/core";
import { type GitHubReadDependencies } from "../src/github/client";
import { attestation } from "../src/github/review-trust";

export const A = "a".repeat(40);
export const B = "b".repeat(40);
export const pr = { owner: "example", repo: "project", number: 1 };
export const URL_ = "https://github.com/example/project/pull/1";

export type Node = Record<string, unknown>;
export const page = (nodes: Node[], next?: string) => ({
	pageInfo: { hasNextPage: next !== undefined, endCursor: next ?? null },
	nodes,
});

/** A recorded GraphQL response; omitted connections stand for ones the query skipped. */
export const CI = ".github/workflows/ci.yml";

export function pull(
	fields: {
		head?: string;
		checks?: ReturnType<typeof page> | null;
		reviews?: ReturnType<typeof page>;
		threads?: ReturnType<typeof page>;
		reactions?: Node[];
	} & Node = {},
) {
	const { head = A, checks, reviews, threads, reactions = [], ...rest } = fields;
	return {
		data: {
			repository: {
				pullRequest: {
					id: "PR_1",
					url: URL_,
					body: "Summary.",
					updatedAt: "2026-10-07T12:00:00Z",
					baseRefName: "main",
					baseRefOid: "b".repeat(40),
					headRefName: "quest/m0/example",
					isMergeQueueEnabled: false,
					labels: { nodes: [] },
					state: "OPEN",
					isDraft: false,
					headRefOid: head,
					mergeable: "MERGEABLE",
					mergeStateStatus: "BLOCKED",
					reviewDecision: "REVIEW_REQUIRED",
					autoMergeRequest: null,
					mergeQueueEntry: null,
					timelineItems: { nodes: [] },
					reactions: { nodes: reactions },
					commits: {
						nodes: [
							{
								commit: {
									oid: head,
									statusCheckRollup:
										checks === null
											? null
											: { state: "FAILURE", ...(checks ? { contexts: checks } : {}) },
								},
							},
						],
					},
					...(reviews ? { reviews } : {}),
					...(threads ? { reviewThreads: threads } : {}),
					...rest,
				},
			},
		},
	};
}

export function run(name: string, status: string, conclusion: string | null, isRequired: boolean) {
	return {
		__typename: "CheckRun",
		name,
		status,
		conclusion,
		detailsUrl: `https://github.com/example/project/actions/runs/1/job/${name}`,
		isRequired,
	};
}

export function review(login: string, state: string, commit: string | null, id: number, reactions: Node[] = []) {
	return {
		author: { login },
		state,
		submittedAt: `2026-10-07T12:0${id}:00Z`,
		url: `${URL_}#pullrequestreview-${id}`,
		commit: commit === null ? null : { oid: commit },
		reactions: { nodes: reactions },
	};
}

export function thread(id: string, isResolved: boolean, line: number | null = 3, author = "reviewer") {
	return {
		id,
		isResolved,
		isOutdated: line === null,
		path: "src/a.ts",
		line,
		originalLine: 2,
		comments: { nodes: [{ author: { login: author }, url: `${URL_}#discussion_r${id}` }] },
	};
}

export function setup(
	bodies: unknown[],
	options: {
		now?: number;
		holdFields?: Node;
		eventPages?: { rows: Node[]; next?: string }[];
		/** Pages of the head repository's activity, newest first. */
		activity?: { rows: Node[]; next?: string; status?: number }[];
		warnings?: string[];
		/** The base-to-head diff per compared head, or the status GitHub refuses it with. */
		diffs?: Record<string, string | number>;
		/** The PR's reviews, threads, and comments as the signal reader reads them; none by default. */
		signals?: Node;
		/** The base's active ruleset rules. */
		rules?: Node[];
		/** The base branch is gone, so reading it fails. */
		noBase?: boolean;
		/** The head's workflow runs, as `GET /actions/runs` lists them. */
		runs?: Node[];
		/** The open PRs as the duplicate read lists them, and each `<head>:<path>` blob's text. */
		open?: { pulls: Node[]; blobs?: Record<string, string>; files?: Record<number, Node[]> };
		/**
		 * The latest `quest review` status on each commit, or null for a commit GitHub does not have; by default, the
		 * maintainer's passing status attesting the body's risk on every commit.
		 */
		statuses?: Record<string, Node | null>;
		/** Each login's permission on the repository, or the status GitHub refuses it with; by default `maintainer` is an admin. */
		permissions?: Record<string, string | number>;
	} = {},
) {
	const queries: Record<string, unknown>[] = [];
	const texts: string[] = [];
	const holdQueries: Record<string, unknown>[] = [];
	const eventRequests: string[] = [];
	let last: ReturnType<typeof pull> | undefined;
	const eventPages = [...(options.eventPages ?? [])];
	const activityPages = [...(options.activity ?? [])];
	const activityRequests: string[] = [];
	const statusQueries: string[] = [];
	const permissionRequests: string[] = [];
	const deps: GitHubReadDependencies = {
		readToken: "test-token",
		quota: "wait",
		now: () => options.now ?? 0,
		sleep: async () => {},
		warn: (message) => options.warnings?.push(message),
		fetch: async (url, init) => {
			const path = new URL(String(url));
			if (path.pathname === "/repos/fork/project/activity") {
				activityRequests.push(`${path.pathname}${path.search}`);
				const page = activityPages.shift();
				if (!page) return Response.json({ message: "Not Found" }, { status: 404 });
				if (page.status === 403)
					return Response.json({ message: "Resource not accessible by integration" }, { status: 403 });
				return Response.json(page.rows, { headers: page.next ? { Link: `<${page.next}>; rel="next"` } : {} });
			}
			// Ruleset workflows name their repository by ID: 1 is this one, 2 another.
			if (path.pathname === "/repositories/1") return Response.json({ full_name: "example/project" });
			if (path.pathname === "/repositories/2") return Response.json({ full_name: "example/policies" });
			if (path.pathname === "/repos/example/project/branches/main")
				return options.noBase
					? Response.json({ message: "Branch not found" }, { status: 404 })
					: Response.json({ protection: { enabled: false } });
			if (path.pathname === "/repos/example/project/rules/branches/main")
				return Response.json(options.rules ?? []);
			const permission = /^\/repos\/example\/project\/collaborators\/([^/]+)\/permission$/.exec(path.pathname);
			if (permission) {
				const login = decodeURIComponent(permission[1]!);
				permissionRequests.push(login);
				const value = (options.permissions ?? { maintainer: "admin" })[login];
				if (value === undefined) return Response.json({ message: "Not Found" }, { status: 404 });
				return typeof value === "number"
					? Response.json({ message: "Must have push access" }, { status: value })
					: Response.json({ permission: value, user: { login } });
			}
			const changed = /^\/repos\/example\/project\/pulls\/(\d+)\/files$/.exec(path.pathname);
			if (changed) return Response.json(options.open?.files?.[Number(changed[1])] ?? []);
			if (path.pathname === "/repos/example/project/actions/runs") {
				if (!options.runs) throw new Error("unexpected workflow run request");
				return Response.json({ total_count: options.runs.length, workflow_runs: options.runs });
			}
			const compare = /^\/repos\/example\/project\/compare\/main\.\.\.([0-9a-f]{40})$/.exec(path.pathname);
			if (compare) {
				expect(new Headers(init?.headers).get("Accept")).toBe("application/vnd.github.diff");
				const diff = options.diffs?.[compare[1]!];
				if (diff === undefined) throw new Error("unexpected compare request");
				return typeof diff === "number"
					? Response.json({ message: "No diff" }, { status: diff })
					: new Response(diff);
			}
			if (path.pathname !== "/graphql") {
				expect(path.pathname).toBe("/repos/example/project/issues/1/events");
				eventRequests.push(String(url));
				const page = eventPages.shift();
				if (!page) throw new Error("unexpected event request");
				return Response.json(page.rows, { headers: page.next ? { Link: `<${page.next}>; rel="next"` } : {} });
			}
			const request = JSON.parse(String(init?.body));
			if (request.query.includes("query OpenFiles(")) {
				const nodes = options.open?.pulls ?? [];
				return Response.json({
					data: {
						repository: { pullRequests: { pageInfo: { hasNextPage: false, endCursor: null }, nodes } },
					},
				});
			}
			if (request.query.includes("object(expression:")) {
				const repository: Node = {};
				for (const [key, value] of Object.entries(request.variables as Record<string, string>))
					if (key.startsWith("e")) {
						const text = options.open?.blobs?.[value];
						repository[`f${key.slice(1)}`] = text === undefined ? null : { text };
					}
				return Response.json({ data: { repository } });
			}
			if (request.query.includes("p1: pullRequest(number: 1)")) {
				if (!last) throw new Error("signals read before PR state");
				const head = last.data.repository.pullRequest.headRefOid;
				const empty = { pageInfo: { hasNextPage: false, endCursor: null }, nodes: [] };
				return Response.json({
					data: {
						repository: {
							p1: {
								headRefOid: head,
								commits: { nodes: [{ commit: { oid: head, committedDate: "2026-10-16T00:00:00Z" } }] },
								reviews: empty,
								reviewThreads: empty,
								comments: empty,
								...options.signals,
							},
						},
					},
				});
			}
			if (request.query.includes("query ReviewStatus(")) {
				const sha = String(request.variables.sha);
				statusQueries.push(sha);
				// By default the maintainer's passing status attests whatever the body's record says.
				const recorded = recordedRisk(String(last?.data.repository.pullRequest.body ?? ""));
				const status =
					options.statuses === undefined
						? reviewStatus(
								"SUCCESS",
								recorded === null || "malformed" in recorded
									? "Risk low: passed"
									: attestation(recorded.tier, recorded.class, true),
							)
						: options.statuses[sha];
				const object = status === null ? null : { status: status === undefined ? null : { context: status } };
				return Response.json({ data: { repository: { object } } });
			}
			if (request.query.includes("query HoldOwnership(")) {
				holdQueries.push(request.variables);
				if (!last) throw new Error("ownership read before PR state");
				const row = last.data.repository.pullRequest;
				const events = (row.timelineItems as { nodes: Node[] }).nodes.filter((event) =>
					["LabeledEvent", "AutoMergeEnabledEvent", "AddedToMergeQueueEvent"].includes(
						String(event.__typename),
					),
				);
				return Response.json({
					data: {
						repository: {
							pullRequest: { ...row, timelineItems: { nodes: events }, ...options.holdFields },
						},
					},
				});
			}
			queries.push(request.variables);
			texts.push(request.query);
			const body = bodies.shift();
			if (body === undefined) throw new Error("unexpected request");
			last = body as ReturnType<typeof pull>;
			return Response.json(body);
		},
	};
	return { deps, queries, texts, holdQueries, eventRequests, activityRequests, statusQueries, permissionRequests };
}

/** A `quest review` status as GitHub's GraphQL `StatusContext` gives it, set by `login` of GraphQL type `kind`. */
export function reviewStatus(state: string, description: string, login = "maintainer", kind = "User") {
	return { state, description, creator: { __typename: kind, login } };
}
