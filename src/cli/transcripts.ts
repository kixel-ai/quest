// Uploading session transcripts to Kixel Quest for a person who agreed at `quest login`: each session the sender just
// sent a record of, sub-agents included, gzipped as the harness wrote it, with `PUT /transcripts/<harness>/<session>`.
// An upload replaces the earlier copy, so a transcript is sent again only once its files change.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { loginFor } from "./tokens";
import type { Session } from "./usage";

/** The most Kixel Quest takes gzipped: Cloudflare's limit on a request body. */
export const TRANSCRIPT_LIMIT = 100 * 1024 * 1024;

/** What uploading a pass's transcripts needs. */
export interface TranscriptUploads {
	env: NodeJS.ProcessEnv;
	fetch: typeof globalThis.fetch;
	/** The Kixel Quest the records went to, and the token they went with. */
	url: string;
	token: string;
	/** The sender's state directory. */
	state: string;
	/** The sessions whose records Kixel Quest just stored. */
	sessions: Iterable<Session>;
}

const digest = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

/**
 * Upload each of `sessions`' transcripts not yet sent as they stand, when the person signed in with `token` agreed,
 * returning notes for the stop hook. A 403 says they turned it off at Kixel Quest, so this token sends none again;
 * signing in again issues a new one. Any other refusal throws, so the group's records and transcripts are retried.
 */
export async function sendTranscripts(uploads: TranscriptUploads): Promise<string[]> {
	const { env, url, token, state } = uploads;
	const login = loginFor(url, env);
	// A sign-in during the pass answered again, and its own token's pass will send them.
	if (login?.token !== token || !login.transcripts) return [];
	const refused = join(state, "transcripts-refused", digest(`${url}\0${token}`));
	if (existsSync(refused)) return [];
	const notes: string[] = [];
	for (const s of uploads.sessions) {
		// Another host's transcript is not on this one; one with no ID has no path to upload to.
		if (s.host !== null || s.id === null || s.files.length === 0) continue;
		const sent = join(state, "transcripts", digest(`${url}\0${s.harness}\0${s.id}`));
		let stamp: string;
		try {
			stamp = JSON.stringify(s.files.map((file) => [file, statSync(file).size, statSync(file).mtimeMs]));
		} catch (error) {
			// Deleted since token-max read it: there is nothing left to upload.
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		if (existsSync(sent) && readFileSync(sent, "utf8") === stamp) continue;
		const body = gzipSync(Buffer.concat(s.files.map((file) => readFileSync(file))));
		if (body.length > TRANSCRIPT_LIMIT) {
			notes.push(`${s.harness} session ${s.id}'s transcript is over 100 MiB gzipped, so it was not uploaded`);
			record(sent, stamp);
			continue;
		}
		const endpoint = `${url}/transcripts/${encodeURIComponent(s.harness)}/${encodeURIComponent(s.id)}`;
		const response = await uploads.fetch(endpoint, {
			method: "PUT",
			headers: {
				authorization: `Bearer ${token}`,
				"content-type": "application/gzip",
				"content-length": String(body.length),
			},
			body,
		});
		if (response.status === 403) {
			mkdirSync(join(state, "transcripts-refused"), { recursive: true, mode: 0o700 });
			writeFileSync(refused, "");
			notes.push(
				`${url} no longer stores this person's transcripts, so this host uploads none until \`quest login\``,
			);
			return notes;
		}
		if (!response.ok)
			throw new Error(`${endpoint} answered ${response.status}: ${(await response.text()).slice(0, 500)}`);
		record(sent, stamp);
	}
	return notes;
}

/** Remember the files of a transcript as uploaded, written whole then renamed. */
function record(path: string, stamp: string): void {
	mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
	writeFileSync(`${path}.new`, stamp);
	renameSync(`${path}.new`, path);
}
