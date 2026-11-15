// The forge reads answer the same through GitHub and through Kixel Quest. The fake Kixel Quest serves each read by
// running the GitHub backend on a fake GitHub, as its index's fallthrough does, so an answer that differs is the
// wire's doing: a field lost, reordered, or retyped between the two.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import {
	type Forge,
	type ForgeCall,
	InputError,
	FORGE_CALLS,
	type Holdings,
	type PullRequest,
	forgeJson,
	parseForgeAnswer,
	parseForgeInfo,
	parseForgeRequest,
} from "../src/core";
import { type ForgeDependencies, forgeFor, KixelQuest, KixelQuestForge } from "../src/cli/forge";
import { waitForActivity, WaitTimeout } from "../src/cli/wait";
import { type GitHubDependencies } from "../src/github/client";
import { GitHubForge } from "../src/github/forge";
import * as status from "./status-fakes";
import * as wait from "./wait-fakes";

const URL_ = "https://kixel.quest";
const TOKEN = "kq-token";
const repository = { owner: "example", repo: "project" };

/** A fake Kixel Quest serving `github`'s answers to the person `login`, at `asOf`. */
function kixelQuest(
	github: () => GitHubDependencies,
	options: { login?: string; repositories?: string[]; asOf?: string | null; fail?: number; answer?: unknown } = {},
) {
	const requests: { method: string; path: string; body: unknown }[] = [];
	const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = new URL(String(input));
		const method = init?.method ?? "GET";
		const body = init?.body === undefined ? undefined : JSON.parse(String(init.body));
		requests.push({ method, path: url.pathname, body });
		if (new Headers(init?.headers).get("authorization") !== `Bearer ${TOKEN}`)
			return Response.json({ error: "This token was never issued here, or it was revoked." }, { status: 401 });
		if (options.fail) return Response.json({ error: "index unavailable" }, { status: options.fail });
		if (method === "GET" && url.pathname === "/forge")
			return Response.json({
				login: options.login ?? "waiter",
				repositories: options.repositories ?? ["example/project"],
			});
		const call = /^\/forge\/(\w+)$/.exec(url.pathname)?.[1] as ForgeCall | undefined;
		if (method !== "POST" || call === undefined || !FORGE_CALLS.includes(call))
			return Response.json({ error: "no such read" }, { status: 404 });
		if (options.answer !== undefined) return Response.json(options.answer);
		const forge = new GitHubForge(github(), options.login ?? "waiter");
		let value: unknown;
		try {
			value = await serve(forge, call, parseForgeRequest(call, body));
		} catch (error) {
			if (error instanceof InputError) return Response.json({ error: error.message }, { status: 400 });
			throw error;
		}
		return new Response(forgeJson({ value, asOf: options.asOf ?? null }), {
			headers: { "content-type": "application/json" },
		});
	};
	return { fetch, requests };
}

/** One read, as Kixel Quest's fallthrough answers it. */
async function serve(forge: Forge, call: ForgeCall, request: any): Promise<unknown> {
	switch (call) {
		case "status":
			return (await forge.status(request.pull)).value;
		case "pulls":
			return (await forge.pulls(request.repository)).value;
		case "held":
			return (await forge.held(request.sources, request.branches)).value;
		case "watch":
			return (await forge.watch(request.pull, { since: request.from ?? undefined, deadline: Infinity }).poll())
				.value;
	}
}

let config: string | undefined;
afterEach(() => {
	if (config) rmSync(config, { recursive: true, force: true });
	config = undefined;
});

/** Forge dependencies whose token file pairs `TOKEN` with Kixel Quest, unless `token` is false. */
function dependencies(
	fetch: ForgeDependencies["fetch"],
	github: () => GitHubDependencies,
	env: NodeJS.ProcessEnv = {},
	token = true,
): ForgeDependencies {
	config = mkdtempSync(join(tmpdir(), "quest-forge-"));
	if (token) {
		mkdirSync(join(config, "quest"));
		writeFileSync(join(config, "quest", "records.json"), JSON.stringify({ [URL_]: TOKEN }));
	}
	return { env: { XDG_CONFIG_HOME: config, ...env }, fetch, now: () => 0, github };
}

/** Kixel Quest's backend over a fake serving `github`. */
async function throughKixelQuest(github: () => GitHubDependencies, options?: Parameters<typeof kixelQuest>[1]) {
	const server = kixelQuest(github, options);
	// Kixel Quest's reads keep the fake GitHub's clock, which a wait's deadline is set by.
	const forge = await forgeFor(repository, { ...dependencies(server.fetch, github), now: () => github().now() });
	expect(forge).toBeInstanceOf(KixelQuestForge);
	return { forge, server };
}

describe("status", () => {
	const scenarios: [string, () => ReturnType<typeof status.setup>][] = [
		[
			"checks, reviews, reactions, and threads",
			() =>
				status.setup(
					[
						status.pull({
							checks: status.page([
								status.run("lint", "COMPLETED", "FAILURE", true),
								status.run("test", "IN_PROGRESS", null, true),
								status.run("build", "COMPLETED", "SUCCESS", true),
								{ __typename: "StatusContext", context: "ci/legacy", state: "ERROR", targetUrl: null },
							]),
							reviews: status.page([
								status.review("alice", "APPROVED", status.B, 1),
								status.review("alice", "COMMENTED", status.A, 3, [
									{
										content: "THUMBS_UP",
										createdAt: "2026-10-07T12:04:00Z",
										user: { login: "codex[bot]" },
									},
								]),
								status.review("gone", "COMMENTED", null, 5),
							]),
							threads: status.page([
								status.thread("T1", true),
								status.thread("T2", false, null, "author"),
							]),
							reactions: [{ content: "EYES", createdAt: "2026-10-07T12:00:00Z", user: null }],
						}),
					],
					{ runs: [] },
				),
		],
		[
			"a queued draft with auto-merge",
			() =>
				status.setup([
					status.pull({
						isDraft: true,
						reviewDecision: null,
						autoMergeRequest: {
							enabledAt: "2026-10-07T12:00:00Z",
							mergeMethod: "SQUASH",
							enabledBy: { login: "kixelated" },
						},
						mergeQueueEntry: { state: "AWAITING_CHECKS", position: 2, enqueuedAt: "2026-10-07T12:01:00Z" },
						checks: null,
						reviews: status.page([]),
						threads: status.page([]),
					}),
				]),
		],
		[
			"a maintainer decision and a hold",
			() =>
				status.setup(
					[
						status.pull({
							checks: null,
							reviews: status.page([]),
							threads: status.page([]),
							labels: { nodes: [{ name: "quest:active" }] },
						}),
					],
					{
						now: Date.parse("2026-10-07T12:00:00Z"),
						holdFields: {
							timelineItems: {
								nodes: [
									{
										__typename: "LabeledEvent",
										id: "token",
										createdAt: "2026-10-07T11:00:00Z",
										label: { name: "quest:active" },
									},
								],
							},
						},
						eventPages: [
							{
								rows: [
									{
										node_id: "token",
										event: "labeled",
										label: { name: "quest:active" },
										url: "event-url",
									},
								],
							},
						],
						signals: {
							comments: status.page([
								{
									author: { __typename: "User", login: "kixelated" },
									authorAssociation: "OWNER",
									body: "Maintainer decision: raise the timeout.",
									createdAt: "2026-10-16T01:00:00Z",
									url: `${status.URL_}#issuecomment-9`,
								},
							]),
						},
					},
				),
		],
	];

	test.each(scenarios)("%s reads the same through Kixel Quest as from GitHub", async (_, scenario) => {
		const direct = await new GitHubForge(scenario().deps).status(status.pr);
		const fixture = scenario();
		const { forge } = await throughKixelQuest(() => fixture.deps, { asOf: "2026-10-07T12:10:00Z" });
		const served = await forge.status(status.pr);
		expect(served.value).toEqual(direct.value);
		// `quest status --json` prints the same bytes either way.
		expect(JSON.stringify(served.value)).toBe(JSON.stringify(direct.value));
		expect([direct.asOf, served.asOf]).toEqual([null, "2026-10-07T12:10:00Z"]);
	});
});

/** A fake GitHub holding open PRs and a merged one, as the claim reads list them. */
function claimsGitHub(): GitHubDependencies {
	const pull = (number: number, ref: string, extra: Record<string, unknown> = {}) => ({
		number,
		html_url: `https://github.com/example/project/pull/${number}`,
		head: { ref, sha: "c".repeat(40), repo: { full_name: "example/project" } },
		draft: true,
		created_at: `2026-10-0${number}T00:00:00Z`,
		updated_at: `2026-10-0${number}T01:00:00Z`,
		body: number === 2 ? "## Waiting\n\n- Maintainer: pick" : "",
		...extra,
	});
	const open = [pull(1, "quest/m0/one"), pull(2, "quest/m0/two"), pull(3, "feature", { draft: false, body: null })];
	const merged = [pull(4, "quest/m0/done", { head: { ref: "quest/m0/done", sha: "d".repeat(40) }, merged_at: "x" })];
	return {
		token: "test-token",
		quota: "fail",
		now: () => 0,
		sleep: async () => {},
		warn: () => {},
		fetch: async (input) => {
			const url = new URL(String(input));
			if (url.pathname !== "/repos/example/project/pulls") throw new Error(`unexpected ${url.pathname}`);
			if (url.searchParams.get("state") === "open") return Response.json(open);
			const head = url.searchParams.get("head");
			return Response.json(merged.filter((row) => `example:${row.head.ref}` === head));
		},
	};
}

test("open PRs and claims read the same through Kixel Quest as from GitHub, landed branches included", async () => {
	const sources = {
		upstream: {
			repository,
			tips: new Map([
				["quest/m0/one", "c".repeat(40)],
				["quest/m0/done", "d".repeat(40)],
				["quest/m0/pushed", "e".repeat(40)],
			]),
		},
	};
	const branches = ["quest/m0/one", "quest/m0/two", "quest/m0/done", "quest/m0/pushed", "quest/m0/free"];
	const github = new GitHubForge(claimsGitHub());
	const { forge, server } = await throughKixelQuest(claimsGitHub);
	expect((await forge.pulls(repository)).value).toEqual((await github.pulls(repository)).value);
	const direct = (await github.held(sources, branches)).value;
	const served = (await forge.held(sources, branches)).value;
	expect(served).toEqual(direct);
	expect(served.claims.map((claim) => claim.branch)).toEqual(["quest/m0/one", "quest/m0/pushed", "quest/m0/two"]);
	expect([...served.landed]).toEqual([["quest/m0/done", "d".repeat(40)]]);
	// The tips git read travel with the request, so Kixel Quest judges the branches the person sees.
	expect(server.requests.find((request) => request.path === "/forge/held")?.body).toMatchObject({
		sources: { upstream: { tips: { "quest/m0/one": "c".repeat(40) } } },
	});
});

describe("wait", () => {
	const scenarios: [string, () => ReturnType<typeof wait.setup>][] = [
		[
			"a review already on the head",
			() =>
				wait.setup([
					wait.pull(),
					wait.response([wait.pushed()]),
					wait.response([wait.committed(wait.A), wait.reviewed()]),
				]),
		],
		[
			"a push found on the third poll",
			() =>
				wait.setup([
					wait.pull(),
					wait.response([wait.pushed()]),
					wait.response([wait.committed(wait.A)]),
					wait.response([wait.committed(wait.A)]),
					wait.response([wait.committed(wait.A), wait.committed(wait.B)]),
				]),
		],
		[
			"the waiter's own reply, then another's",
			() =>
				wait.setup(
					[wait.pull(), wait.response([wait.pushed()]), wait.response([]), wait.response([])],
					[wait.A],
					{
						comments: [
							wait.response([wait.replied(2, wait.POINT, "waiter")]),
							wait.response([wait.replied(2, wait.POINT, "waiter"), wait.replied(3)]),
						],
					},
				),
		],
	];

	test.each(scenarios)("%s wakes the same through Kixel Quest as from GitHub", async (_, scenario) => {
		const direct = scenario();
		const expected = await waitForActivity(
			wait.pr,
			{},
			{ choose: async () => new GitHubForge(direct.deps) },
			direct.deps,
		);
		const fixture = scenario();
		const { forge } = await throughKixelQuest(() => fixture.deps);
		expect(await waitForActivity(wait.pr, {}, { choose: async () => forge }, fixture.deps)).toEqual(expected);
		expect(fixture.sleeps).toEqual(direct.sleeps);
	});

	test("a timeout resumes from Kixel Quest's cursor and says how current its index was", async () => {
		const fixture = wait.setup([wait.pull(), wait.response([wait.pushed()]), wait.response([]), wait.response([])]);
		const { forge } = await throughKixelQuest(() => fixture.deps, { asOf: "2026-10-07T12:09:00Z" });
		const error = await waitForActivity(
			wait.pr,
			{ timeout: 60 },
			{ choose: async () => forge },
			fixture.deps,
		).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(WaitTimeout);
		expect((error as WaitTimeout).cursor).toMatch(/^q1\./);
		expect((error as Error).message).toBe(
			"timed out waiting for pull request activity; Kixel Quest's last answer was current to 2026-10-07T12:09:00Z",
		);
	});
});

describe("wait deadlines and arguments", () => {
	test("the timeout covers asking Kixel Quest which forge to read", async () => {
		const server = kixelQuest(() => wait.setup([]).deps);
		let now = 0;
		// The first reading starts the clock; by the time Kixel Quest would be asked, the timeout has passed.
		const clock = { now: () => (now++ === 0 ? 0 : 20_000), sleep: async () => {} };
		const deps = { ...dependencies(server.fetch, unreachableGitHub), now: clock.now };
		const choice = { choose: (pull: PullRequest, deadline: number) => forgeFor(pull, deps, deadline) };
		const error = await waitForActivity(wait.pr, { timeout: 10 }, choice, clock).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(WaitTimeout);
		expect(server.requests).toEqual([]);
	});

	test("a rate-limited viewer read on GitHub gives up at the wait's timeout", async () => {
		const fixture = wait.setup([wait.pull(), wait.response([wait.pushed()]), wait.response([])], [wait.A], {
			viewer: wait.response(
				{ message: "API rate limit exceeded" },
				{
					"x-ratelimit-remaining": "0",
					"x-ratelimit-reset": String(Date.parse("2026-10-07T13:10:00Z") / 1000),
				},
				403,
			),
		});
		const error = await wait.waitOn(wait.pr, { timeout: 60 }, fixture.deps).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(WaitTimeout);
		expect(fixture.sleeps.reduce((sum, ms) => sum + ms, 0)).toBeLessThanOrEqual(60_000);
	});

	test("Kixel Quest's refusal of a bad wait point is a usage error, as GitHub's is", async () => {
		const bad = { since: "yesterday" };
		const direct = wait.setup([]);
		await expect(wait.waitOn(wait.pr, bad, direct.deps)).rejects.toBeInstanceOf(InputError);
		const fixture = wait.setup([]);
		const { forge } = await throughKixelQuest(() => fixture.deps);
		const error = await waitForActivity(wait.pr, bad, { choose: async () => forge }, fixture.deps).catch(
			(e: unknown) => e,
		);
		expect(error).toBeInstanceOf(InputError);
		expect((error as Error).message).toMatch(
			/^Kixel Quest refused POST \/forge\/watch, invalid timestamp: yesterday/,
		);
	});
});

const unreachableGitHub = (): GitHubDependencies => {
	throw new Error("read GitHub");
};

describe("choosing the forge", () => {
	const unreachable = (): GitHubDependencies => {
		throw new Error("read GitHub");
	};

	test("a repository Kixel Quest does not serve reads GitHub", async () => {
		const server = kixelQuest(unreachable);
		const deps = dependencies(server.fetch, claimsGitHub);
		expect(await forgeFor({ owner: "other", repo: "project" }, deps)).toBeInstanceOf(GitHubForge);
		// Kixel Quest names repositories in lowercase; GitHub ignores case.
		expect(await forgeFor({ owner: "Example", repo: "Project" }, deps)).toBeInstanceOf(KixelQuestForge);
	});

	test("without a token, or with QUEST_FORGE=github, reads go to GitHub and never ask Kixel Quest", async () => {
		const server = kixelQuest(unreachable);
		expect(await forgeFor(repository, dependencies(server.fetch, claimsGitHub, {}, false))).toBeInstanceOf(
			GitHubForge,
		);
		const forced = await forgeFor(repository, dependencies(server.fetch, claimsGitHub, { QUEST_FORGE: "github" }));
		expect(forced).toBeInstanceOf(GitHubForge);
		expect(server.requests).toEqual([]);
		await expect(
			forgeFor(repository, dependencies(server.fetch, claimsGitHub, { QUEST_FORGE: "gitlab" })),
		).rejects.toThrow("QUEST_FORGE is gitlab; set it to github to read GitHub, or leave it unset");
	});

	test("QUEST_KIXEL_URL names another Kixel Quest, whose own token the file pairs with it", async () => {
		const server = kixelQuest(unreachable);
		const deps = dependencies(server.fetch, unreachable, { QUEST_KIXEL_URL: "http://localhost:8787" });
		// The token file pairs the token with kixel.quest only, so the local one gets none and reads go to GitHub.
		await expect(forgeFor(repository, deps)).rejects.toThrow("read GitHub");
		writeFileSync(join(config!, "quest", "records.json"), JSON.stringify({ "http://localhost:8787": TOKEN }));
		expect(await forgeFor(repository, deps)).toBeInstanceOf(KixelQuestForge);
		expect(server.requests.map((request) => new URL(request.path, "http://localhost:8787").pathname)).toEqual([
			"/forge",
		]);
		await expect(
			forgeFor(repository, { ...deps, env: { ...deps.env, QUEST_KIXEL_URL: "http://example.com" } }),
		).rejects.toThrow("not an HTTPS URL");
	});

	test("a Kixel Quest error fails the read, naming the setting that reads GitHub", async () => {
		const override = "set QUEST_FORGE=github to read GitHub";
		const down = kixelQuest(unreachable, { fail: 503 });
		await expect(forgeFor(repository, dependencies(down.fetch, unreachable))).rejects.toThrow(
			`Kixel Quest (${URL_}) failed GET /forge: HTTP 503, index unavailable; ${override}`,
		);
		const refused = kixelQuest(unreachable);
		const deps = dependencies(refused.fetch, unreachable);
		writeFileSync(join(config!, "quest", "records.json"), JSON.stringify({ [URL_]: "revoked" }));
		await expect(forgeFor(repository, deps)).rejects.toThrow(`it refused the token`);
		await expect(forgeFor(repository, deps)).rejects.toThrow(override);
		const malformed = kixelQuest(unreachable, { answer: { value: [], asOf: null, extra: true } });
		const forge = await forgeFor(repository, dependencies(malformed.fetch, unreachable));
		await expect(forge.pulls(repository)).rejects.toThrow(
			`Kixel Quest (${URL_}) failed POST /forge/pulls: malformed forge answer.extra: expected no such field; ${override}`,
		);
	});

	test("the person is the token's, not the reading credential's", async () => {
		const server = kixelQuest(unreachable, { login: "kixelated" });
		const forge = new KixelQuestForge(new KixelQuest(URL_, TOKEN, dependencies(server.fetch, unreachable)));
		expect(await forge.viewer()).toBe("kixelated");
		expect(await new GitHubForge(claimsGitHub(), "kixelated").viewer()).toBe("kixelated");
	});
});

describe("wire", () => {
	const pull: PullRequest = { owner: "example", repo: "project", number: 7 };

	test("requests and answers round-trip, maps included", () => {
		const holdings: Holdings = {
			claims: [{ branch: "quest/m0/one", url: null, pull: null }],
			landed: new Map([["quest/m0/done", "d".repeat(40)]]),
		};
		const sources = { upstream: { repository, tips: new Map([["quest/m0/one", "c".repeat(40)]]) } };
		expect(parseForgeRequest("held", JSON.parse(forgeJson({ sources, branches: ["quest/m0/one"] })))).toEqual({
			sources,
			branches: ["quest/m0/one"],
		});
		expect(parseForgeAnswer("held", JSON.parse(forgeJson({ value: holdings, asOf: null })))).toEqual({
			value: holdings,
			asOf: null,
		});
		expect(parseForgeRequest("watch", { pull, from: null })).toEqual({ pull, from: null });
		expect(parseForgeInfo({ login: "kixelated", repositories: ["moq-dev/quest"] })).toEqual({
			login: "kixelated",
			repositories: ["moq-dev/quest"],
		});
	});

	test("anything missing, extra, or ill-typed is refused whole", () => {
		expect(() => parseForgeRequest("status", { pull: { ...pull, number: 0 } })).toThrow("request.pull.number");
		expect(() => parseForgeRequest("status", { pull, extra: 1 })).toThrow("request.extra: expected no such field");
		expect(() => parseForgeRequest("held", { sources: { upstream: { repository } }, branches: ["main"] })).toThrow(
			"request.branches[0]: expected a quest branch",
		);
		expect(() =>
			parseForgeAnswer("held", { value: { claims: [], landed: { "quest/m0/a": "short" } }, asOf: null }),
		).toThrow("answer.value.landed.quest/m0/a: expected a full commit SHA");
		expect(() => parseForgeAnswer("watch", { value: { events: [], cursor: "q1.x" }, asOf: null })).toThrow(
			"answer.value.pollInterval: expected a value",
		);
		expect(() => parseForgeAnswer("pulls", { value: [], asOf: "yesterday" })).toThrow("answer.asOf");
		expect(() => parseForgeInfo({ login: "kixelated", repositories: ["Moq-Dev/Quest"] })).toThrow(
			"lowercase owner/repo",
		);
	});
});
