// This host's Kixel Quest sign-ins, which `quest login` writes, and the Kixel Quest they pair with: one built-in URL,
// or the one `QUEST_KIXEL_URL` names. The forge reads and the record sender both send a token only to the URL the
// user's file pairs it with.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/** Kixel Quest's own URL. */
export const KIXEL_QUEST = "https://kixel.quest";
/** The variable naming another Kixel Quest, such as one running locally. */
export const KIXEL_QUEST_URL = "QUEST_KIXEL_URL";

/** One sign-in: the token this host posts with, and whether its person agreed to upload transcripts. */
export interface Login {
	token: string;
	transcripts: boolean;
}

const configDirectory = (env: NodeJS.ProcessEnv) => join(env.XDG_CONFIG_HOME || join(homedir(), ".config"), "quest");

/** The host's sign-ins, by the Kixel Quest URL each token may be sent to: `{"https://...": {"token", "transcripts"}}`. */
export function tokensPath(env: NodeJS.ProcessEnv = process.env): string {
	return join(configDirectory(env), "login.json");
}

/** The Kixel Quest `env` names, without a trailing slash; a malformed or clear-text URL throws. */
export function kixelUrl(env: NodeJS.ProcessEnv): string {
	const named = env[KIXEL_QUEST_URL] || KIXEL_QUEST;
	let url: URL;
	try {
		url = new URL(named);
	} catch {
		throw new Error(`${KIXEL_QUEST_URL}: ${named} is not a URL`);
	}
	// Anything but HTTPS, or HTTP to this host for a local store, would send the token in clear.
	const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
	if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback))
		throw new Error(`${KIXEL_QUEST_URL}: ${named} is not an HTTPS URL`);
	return named.replace(/\/+$/, "");
}

/** The token this host signed in to `url` with, or null. */
export function tokenFor(url: string, env: NodeJS.ProcessEnv = process.env): string | null {
	return readLogins(env)[url]?.token ?? null;
}

/** The token this host signed in to `url` with, failing with what to run when it has none. */
export function requireToken(url: string, env: NodeJS.ProcessEnv = process.env): string {
	const token = tokenFor(url, env);
	if (token === null) throw new Error(notSignedIn(url));
	return token;
}

/** What a host holding no token for `url` is told. */
export const notSignedIn = (url: string) => `this host is not signed in to ${url}; run \`quest login\``;

/** Pair `login` with `url`, replacing any earlier sign-in there. */
export function saveLogin(url: string, login: Login, env: NodeJS.ProcessEnv = process.env): void {
	write(tokensPath(env), { ...readLogins(env), [url]: login });
}

/** Forget the sign-in to `url`, returning whether there was one. */
export function removeLogin(url: string, env: NodeJS.ProcessEnv = process.env): boolean {
	const logins = readLogins(env);
	if (!(url in logins)) return false;
	delete logins[url];
	write(tokensPath(env), logins);
	return true;
}

function readLogins(env: NodeJS.ProcessEnv): Record<string, Login> {
	const path = tokensPath(env);
	if (!existsSync(path)) return moveTokens(env);
	const logins = readObject(path);
	for (const [url, login] of Object.entries(logins)) {
		const { token, transcripts } = (login ?? {}) as Partial<Login>;
		if (
			typeof login !== "object" ||
			login === null ||
			typeof token !== "string" ||
			token === "" ||
			typeof transcripts !== "boolean"
		)
			throw new Error(`${path}: the sign-in to ${url} is not {"token": "...", "transcripts": true or false}`);
	}
	return logins as Record<string, Login>;
}

/**
 * Move the tokens an earlier quest read from `records.json`, `{"https://...": "token"}`, into the sign-ins file, as
 * sign-ins whose person was never asked about transcripts, so they upload none.
 */
function moveTokens(env: NodeJS.ProcessEnv): Record<string, Login> {
	const old = join(configDirectory(env), "records.json");
	if (!existsSync(old)) return {};
	const logins: Record<string, Login> = {};
	for (const [url, token] of Object.entries(readObject(old))) {
		if (typeof token !== "string" || token === "") throw new Error(`${old}: the token for ${url} is not a string`);
		logins[url] = { token, transcripts: false };
	}
	write(tokensPath(env), logins);
	rmSync(old);
	return logins;
}

function readObject(path: string): Record<string, unknown> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(path, "utf8"));
	} catch (error) {
		throw new Error(`${path} is not JSON: ${(error as Error).message}`);
	}
	if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
		throw new Error(`${path} does not hold an object by Kixel Quest URL`);
	return parsed as Record<string, unknown>;
}

/** Write `tokens` whole, readable only by the user, then rename, so no reader sees half a file. */
function write(path: string, tokens: Record<string, unknown>): void {
	mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
	const next = `${path}.${process.pid}.new`;
	writeFileSync(next, `${JSON.stringify(tokens, null, "\t")}\n`, { mode: 0o600 });
	renameSync(next, path);
}
