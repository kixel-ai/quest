// Reads on the installation token Kixel Quest mints, and writes on the person's own, against a fake Kixel Quest and a
// fake GitHub that record the token each request carries.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, test } from "vitest";

import { type ForgeDependencies, liveFor } from "../src/cli/forge";
import { HOLD, REUSE_MARGIN, exclusive, installationDirectory } from "../src/cli/installation";
import { waitForActivity } from "../src/cli/wait";
import { GitHubWrites } from "../src/cli/writes";
import {
	GitHub,
	type GitHubDependencies,
	type GitHubReadDependencies,
	GitHubReader,
	reading,
} from "../src/github/client";
import * as wait from "./wait-fakes";

const KIXEL = "https://kixel.test";
const KIXEL_TOKEN = "kq-token";
const PERSON = "person-token";
const repository = { owner: "example", repo: "project" };
const START = Date.parse("2026-11-17T00:00:00Z");

let cache: string;
let config: string;
let clock: number;
beforeEach(() => {
	config = mkdtempSync(join(tmpdir(), "quest-installation-config-"));
	cache = mkdtempSync(join(tmpdir(), "quest-installation-cache-"));
	mkdirSync(join(config, "quest"));
	writeFileSync(join(config, "quest", "records.json"), JSON.stringify({ [KIXEL]: KIXEL_TOKEN }));
	clock = START;
});

/** A fake Kixel Quest minting tokens, and the GitHub requests the person's reads and writes make, with their tokens. */
function world(options: { mint?: (n: number, repository: string) => Response; github?: typeof fetch } = {}) {
	const mints: { repository: string; authorization: string | null }[] = [];
	const github: { method: string; path: string; token: string | null }[] = [];
	const env = { XDG_CONFIG_HOME: config, XDG_CACHE_HOME: cache, QUEST_KIXEL_URL: KIXEL } as NodeJS.ProcessEnv;
	const mint =
		options.mint ??
		((n: number, name: string) =>
			Response.json({
				token: `minted-${n}`,
				expiresAt: new Date(clock + 3_600_000).toISOString(),
				repository: name,
				login: "waiter",
			}));
	const fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
		const url = new URL(String(input));
		if (url.origin === KIXEL) {
			if (url.pathname !== "/installation-token") throw new Error(`unexpected Kixel Quest ${url.pathname}`);
			const { repository: name } = JSON.parse(String(init?.body)) as { repository: string };
			mints.push({ repository: name, authorization: new Headers(init?.headers).get("authorization") });
			return mint(mints.length, name);
		}
		const token = new Headers(init?.headers).get("authorization")?.replace(/^Bearer /, "") ?? null;
		github.push({ method: init?.method ?? "GET", path: url.pathname, token });
		return options.github ? options.github(input, init) : Response.json([]);
	};
	const person = (): GitHubDependencies => ({
		fetch: fetch as typeof globalThis.fetch,
		now: () => clock,
		sleep: async () => {},
		token: PERSON,
		quota: "fail",
		warn: () => {},
	});
	const deps: ForgeDependencies = {
		env,
		fetch: fetch as typeof globalThis.fetch,
		now: () => clock,
		sleep: async (ms) => void (clock += ms),
		github: person,
	};
	return { deps, mints, github, person, env };
}

describe("reads on a minted installation token", () => {
	test("a read goes out on the minted token and a write on the person's", async () => {
		const w = world();
		const forge = await liveFor(repository, w.deps);
		await forge.pulls(repository);
		await new GitHubWrites(w.person(), null as never).close({ ...repository, number: 7 });
		expect(w.mints).toEqual([{ repository: "example/project", authorization: `Bearer ${KIXEL_TOKEN}` }]);
		expect(w.github).toEqual([
			{ method: "GET", path: "/repos/example/project/pulls", token: "minted-1" },
			{ method: "PATCH", path: "/repos/example/project/pulls/7", token: PERSON },
		]);
		// The person is the mint's login, not the installation's account.
		expect(await forge.viewer()).toBe("waiter");
	});

	test("a read client cannot write: not in its types, and not at run time for a mutation", async () => {
		const w = world();
		const reader = new GitHubReader({ ...reading(w.person()), readToken: "minted" });
		// @ts-expect-error a read has no method or body
		const request = () => reader.request("/repos/example/project/pulls/7", { method: "PATCH", body: {} });
		void request;
		// @ts-expect-error a write takes the person's token, not read dependencies
		const write = () => new GitHub({ ...reading(w.person()), readToken: "minted" });
		void write;
		// @ts-expect-error a client that writes is not made from a reader's dependencies
		const forge = () => new GitHubWrites(reading(w.person()), null as never);
		void forge;
		await expect(reader.graphql("mutation { x }", {})).rejects.toThrow("cannot run a mutation");
		await expect(reader.graphql("# note\nmutation { x }", {})).rejects.toThrow("cannot run a mutation");
		await expect(reader.graphql("fragment f on X { y }\nmutation { x { ...f } }", {})).rejects.toThrow(
			"cannot run a mutation",
		);
		expect(w.github).toEqual([]);
	});

	test("a required workflow's repository the minted token cannot see is named on the person's token", async () => {
		const w = world({
			github: async (_input, init) => {
				const token = new Headers(init?.headers).get("authorization");
				return token === `Bearer ${PERSON}`
					? Response.json({ full_name: "example/policies" })
					: Response.json({ message: "Not Found" }, { status: 404 });
			},
		});
		const forge = await liveFor(repository, w.deps);
		// The forge's own dependencies, as its status read builds its reader from them.
		const deps = (forge as unknown as { deps: GitHubReadDependencies }).deps;
		expect(await new GitHubReader(deps).repositoryName(2)).toBe("example/policies");
		expect(w.github).toEqual([
			{ method: "GET", path: "/repositories/2", token: "minted-1" },
			{ method: "GET", path: "/repositories/2", token: PERSON },
		]);
		// Without a token to fall back on, a repository the read token cannot see has no name.
		w.github.length = 0;
		expect(await new GitHubReader({ ...deps, names: undefined }).repositoryName(2)).toBeNull();
		expect(w.github.map((request) => request.token)).toEqual(["minted-1"]);
	});

	test("a host whose members are a class's methods keeps them as read dependencies", async () => {
		const w = world();
		const person = w.person();
		class Host {
			token = PERSON;
			quota = "fail" as const;
			fetch = person.fetch;
			now() {
				return person.now();
			}
			sleep(milliseconds: number) {
				return person.sleep(milliseconds);
			}
			warn(message: string) {
				person.warn(message);
			}
		}
		await new GitHub(new Host()).request("/repos/example/project/pulls");
		expect(w.github).toEqual([{ method: "GET", path: "/repos/example/project/pulls", token: PERSON }]);
	});

	test("the token is minted once and reused across runs until shortly before it expires", async () => {
		const w = world();
		await liveFor(repository, w.deps);
		clock += 30 * 60_000;
		await (await liveFor(repository, w.deps)).pulls(repository);
		expect(w.mints).toHaveLength(1);
		expect(w.github.map((request) => request.token)).toEqual(["minted-1"]);
		// Another repository has a token of its own.
		await liveFor({ owner: "example", repo: "other" }, w.deps);
		expect(w.mints.map((mint) => mint.repository)).toEqual(["example/project", "example/other"]);
		// One that has `REUSE_MARGIN` left is not reused; the next mint replaces it.
		clock = START + 3_600_000 - REUSE_MARGIN;
		await (await liveFor(repository, w.deps)).pulls(repository);
		expect(w.mints).toHaveLength(3);
		expect(w.github.map((request) => request.token)).toEqual(["minted-1", "minted-3"]);
		// The file is private to the person, and no name or token appears in its path.
		const directory = installationDirectory(w.env);
		for (const name of readdirSync(directory)) {
			expect(name).toMatch(/^[0-9a-f]{64}$/);
			expect(statSync(join(directory, name)).mode & 0o777).toBe(0o600);
		}
		expect(statSync(directory).mode & 0o777).toBe(0o700);
	});

	test("agents starting on a cold cache mint once between them", async () => {
		const w = world();
		// Each waiter lets the others run while it sleeps, as parallel processes do.
		const slow: ForgeDependencies = { ...w.deps, sleep: async (ms) => void (await Promise.resolve((clock += ms))) };
		const forges = await Promise.all(Array.from({ length: 8 }, () => liveFor(repository, slow)));
		await Promise.all(forges.map((forge) => forge.pulls(repository)));
		expect(w.mints).toHaveLength(1);
		expect(new Set(w.github.map((request) => request.token))).toEqual(new Set(["minted-1"]));
		expect(files(w.env).filter((name) => name.endsWith(".lock"))).toEqual([]);
	});

	test("a lock a crashed agent left is taken over once stale, and a held one is waited for until the deadline", async () => {
		const w = world();
		const lock = join(
			installationDirectory(w.env),
			`${createHash("sha256").update(`${KIXEL}\n${KIXEL_TOKEN}\nexample/project`).digest("hex")}.lock`,
		);
		mkdirSync(installationDirectory(w.env), { recursive: true });
		writeFileSync(lock, String(clock));
		await expect(liveFor(repository, w.deps, clock + 1000)).rejects.toThrow(
			"its deadline passed while another quest minted the token",
		);
		expect(w.mints).toEqual([]);
		clock += 60_000;
		await liveFor(repository, w.deps);
		expect(w.mints).toHaveLength(1);
		expect(files(w.env).filter((name) => name.endsWith(".lock"))).toEqual([]);
	});

	test("a lock left empty by an agent that died before writing it is taken over once stale", async () => {
		const w = world();
		const lock = join(
			installationDirectory(w.env),
			`${createHash("sha256").update(`${KIXEL}\n${KIXEL_TOKEN}\nexample/project`).digest("hex")}.lock`,
		);
		mkdirSync(installationDirectory(w.env), { recursive: true });
		writeFileSync(lock, "");
		await expect(liveFor(repository, w.deps, clock + 1000)).rejects.toThrow(
			"its deadline passed while another quest minted the token",
		);
		expect(w.mints).toEqual([]);
		await liveFor(repository, w.deps);
		expect(w.mints).toHaveLength(1);
		expect(files(w.env).filter((name) => name.endsWith(".lock"))).toEqual([]);
	});

	test("a holder gets less time than it takes to be taken over, and never releases another's lock", async () => {
		const directory = installationDirectory({ XDG_CACHE_HOME: cache });
		const clockwork = { now: () => clock, sleep: async (ms: number) => void (clock += ms) };
		let until = 0;
		await exclusive(directory, KIXEL, KIXEL_TOKEN, repository, clockwork, Infinity, async (limit) => {
			until = limit;
		});
		expect(until).toBe(START + HOLD);
		// A holder that overran, whose lock another took over, leaves the new holder's lock be.
		await exclusive(directory, KIXEL, KIXEL_TOKEN, repository, clockwork, Infinity, async () => {
			const [held] = readdirSync(directory);
			writeFileSync(join(directory, held!), `${clock} another`);
		});
		expect(readdirSync(directory).filter((name) => name.endsWith(".lock"))).toHaveLength(1);
	});

	test("a person with another Kixel Quest token mints their own", async () => {
		const w = world();
		await liveFor(repository, w.deps);
		writeFileSync(join(config, "quest", "records.json"), JSON.stringify({ [KIXEL]: "other-token" }));
		await liveFor(repository, w.deps);
		expect(w.mints.map((mint) => mint.authorization)).toEqual([`Bearer ${KIXEL_TOKEN}`, "Bearer other-token"]);
	});

	test("a repository Kixel Quest does not serve reads on the person's token, minting nothing to keep", async () => {
		const w = world({ mint: () => Response.json({ error: "not indexed" }, { status: 404 }) });
		await (await liveFor(repository, w.deps)).pulls(repository);
		expect(w.github.map((request) => request.token)).toEqual([PERSON]);
		expect(files(w.env)).toEqual([]);
	});

	test("without a Kixel Quest token, or with reads forced onto GitHub, none is minted", async () => {
		const w = world();
		await (await liveFor(repository, { ...w.deps, env: { ...w.env, QUEST_FORGE: "github" } })).pulls(repository);
		writeFileSync(join(config, "quest", "records.json"), "{}");
		await (await liveFor(repository, w.deps)).pulls(repository);
		expect(w.mints).toEqual([]);
		expect(w.github.map((request) => request.token)).toEqual([PERSON, PERSON]);
	});

	test.each([
		[
			"429",
			() => new Response("{}", { status: 429, headers: { "retry-after": "1200" } }),
			"try again in 1200 seconds",
		],
		["502", () => Response.json({ error: "GitHub refused" }, { status: 502 }), "HTTP 502, GitHub refused"],
		["503", () => Response.json({ error: "App down" }, { status: 503 }), "HTTP 503, App down"],
		["401", () => new Response("{}", { status: 401 }), "refused the token"],
	])("a %s fails the command, naming the setting that reads GitHub with the person's token", async (_, mint, why) => {
		const w = world({ mint });
		const error = await liveFor(repository, w.deps).catch((error: Error) => error);
		expect(error).toBeInstanceOf(Error);
		expect((error as Error).message).toContain(why);
		expect((error as Error).message).toContain("set QUEST_FORGE=github to read GitHub");
		// A refused mint never quietly spends the person's quota, and is asked again, not kept.
		expect(w.github).toEqual([]);
		expect(files(w.env)).toEqual([]);
	});

	test.each([
		["names no login", { token: "t", expiresAt: "2026-11-17T01:00:00Z", repository: "example/project" }],
		["is for another repository", { token: "t", expiresAt: "2026-11-17T01:00:00Z", repository: "a/b", login: "x" }],
		[
			"is about to expire",
			{ token: "t", expiresAt: "2026-11-17T00:01:00Z", repository: "example/project", login: "x" },
		],
	])("a mint that %s fails rather than reads on it", async (_, answer) => {
		const w = world({ mint: () => Response.json(answer) });
		await expect(liveFor(repository, w.deps)).rejects.toThrow("failed POST /installation-token");
		expect(w.github).toEqual([]);
	});

	test("a cache that cannot be written fails, since every command would mint", async () => {
		const w = world();
		writeFileSync(join(cache, "quest"), "a file where the directory goes");
		await expect(liveFor(repository, w.deps)).rejects.toThrow(/cannot (read|keep) installation tokens/);
	});
});

/** The tokens kept on disk. */
const files = (env: NodeJS.ProcessEnv) =>
	existsSync(installationDirectory(env)) ? readdirSync(installationDirectory(env)) : [];

/** A comment its author edited after the wait began. */
const edited = (id: number, login: string) => ({
	id,
	body: "My reply",
	created_at: "2026-10-06T12:00:00Z",
	updated_at: "2026-10-07T12:05:00Z",
	user: { login },
	html_url: `https://github.com/example/project/pull/1#issuecomment-${id}`,
});

describe("quest wait on a minted token", () => {
	test("the person's own reply, reaction, label, and edit do not wake it, though the token's account is the App's", async () => {
		const label = (event: string, id: number, name: string, login: string) => ({
			event,
			id,
			created_at: wait.POINT,
			actor: { login },
			label: { name, color: "ffffff" },
		});
		const fixture = wait.setup(
			[
				wait.pull(),
				wait.response([wait.pushed()]),
				wait.response([label("labeled", 1, "merge", "waiter")], { etag: '"t"' }),
				wait.response([label("labeled", 1, "merge", "waiter"), label("labeled", 3, "needs review", "person")]),
			],
			[wait.A],
			{
				comments: [
					wait.response([
						wait.replied(1, wait.POINT, "reviewer", null),
						wait.replied(2, wait.POINT, "waiter"),
					]),
					wait.response([
						wait.replied(1, wait.POINT, "reviewer", null),
						wait.replied(2, wait.POINT, "waiter"),
					]),
				],
				graphql: [wait.reactions([wait.reacted("r1", wait.POINT, "waiter")])],
				edits: [wait.response([edited(1, "waiter")])],
				// On an installation token GitHub says the viewer is the App.
				viewer: wait.response({ data: { viewer: { login: "quest[bot]" } } }),
			},
		);
		const w = world({ github: fixture.deps.fetch });
		const deps: ForgeDependencies = {
			...w.deps,
			github: () => ({ ...fixture.deps, token: PERSON }) as GitHubDependencies,
		};
		const lines = await waitForActivity(wait.pr, {}, { choose: async (pull) => liveFor(pull, deps) }, fixture.deps);
		expect(lines.map((line) => line.split(" ").slice(1, 3).join(" "))).toEqual(["labeled:needs_review person"]);
		const tokens = new Set(
			[...fixture.calls, ...fixture.sideCalls, ...fixture.editCalls, ...fixture.checkCalls].map((call) =>
				call.headers.get("authorization"),
			),
		);
		expect(tokens).toEqual(new Set(["Bearer minted-1"]));
		expect(w.mints).toHaveLength(1);
	});
});
