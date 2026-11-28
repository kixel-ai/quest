// Uploading session transcripts to Kixel Quest for a person who agreed at `quest login`: each session the sender just
// sent a record of, sub-agents included, gzipped as the harness wrote it, with `PUT /transcripts/<harness>/<session>`.
// An upload replaces the earlier copy, so a transcript is sent again only once its files change.
import { createHash, randomUUID } from "node:crypto";
import {
	createReadStream,
	createWriteStream,
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { loginFor } from "./tokens";
import type { Session } from "./usage";

/** The most Kixel Quest takes gzipped: Cloudflare's limit on a request body. */
export const TRANSCRIPT_LIMIT = 100 * 1024 * 1024;

/** What uploading a group's transcripts needs. */
export interface TranscriptUploads {
	env: NodeJS.ProcessEnv;
	fetch: typeof globalThis.fetch;
	/** The Kixel Quest the records went to, and the token they went with. */
	url: string;
	token: string;
	/** The repository the records name, which a transcript is readable under. */
	repository: string;
	/** The sender's state directory. */
	state: string;
	/** The sessions whose records Kixel Quest just stored. */
	sessions: Iterable<Session>;
}

const digest = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

/**
 * Upload each of `sessions`' transcripts not yet sent as they stand, when the person signed in with `token` agreed,
 * returning notes for the stop hook. A 403, which Kixel Quest answers only to a person who has not agreed, as after
 * turning it off on its Tokens page, stops this token's uploads; signing in again issues a new one. A failure that
 * may pass, 5xx, 401, or 429, throws, so the group's records and transcripts are retried; any other refusal is said
 * and not retried until the transcript changes.
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
		// Under the token and repository too: a new agreement or a moved record needs the copy sent again.
		const sent = join(
			state,
			"transcripts",
			digest(JSON.stringify([url, token, uploads.repository, s.harness, s.id])),
		);
		let stamp: string;
		try {
			stamp = JSON.stringify(
				s.files.map((file) => {
					const { size, mtimeMs } = statSync(file);
					return [file, size, mtimeMs];
				}),
			);
		} catch (error) {
			// Deleted since token-max read it: there is nothing left to upload.
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		if (existsSync(sent) && readFileSync(sent, "utf8") === stamp) continue;
		const body = await gzipped(s.files, state);
		if (body === "missing") continue;
		if (body === "over") {
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
			// A redirect could carry the transcript off the origin the person agreed to.
			redirect: "error",
		});
		const said = async () => `${endpoint} answered ${response.status}: ${(await response.text()).slice(0, 500)}`;
		if (response.status === 403) {
			mkdirSync(join(state, "transcripts-refused"), { recursive: true, mode: 0o700 });
			writeFileSync(refused, "");
			notes.push(
				`${url} no longer stores this person's transcripts, so this host uploads none until \`quest login\``,
			);
			return notes;
		}
		if (response.status >= 500 || response.status === 401 || response.status === 429) throw new Error(await said());
		if (!response.ok) notes.push(`${s.harness} session ${s.id}'s transcript was not uploaded: ${await said()}`);
		record(sent, stamp);
	}
	return notes;
}

class Over extends Error {}

/**
 * `files` concatenated and gzipped, or "over" once that passes {@link TRANSCRIPT_LIMIT}, or "missing" when a file is
 * gone. It streams through a private file under `state`, so the sender holds at most the limit, never the transcript.
 */
async function gzipped(files: string[], state: string): Promise<Buffer | "over" | "missing"> {
	const dir = join(state, "transcripts", "gzip");
	mkdirSync(dir, { recursive: true, mode: 0o700 });
	const path = join(dir, randomUUID());
	let size = 0;
	const cap = new Transform({
		transform(chunk: Buffer, _, done) {
			size += chunk.length;
			done(size > TRANSCRIPT_LIMIT ? new Over() : null, chunk);
		},
	});
	async function* source() {
		for (const file of files) yield* createReadStream(file);
	}
	try {
		await pipeline(source(), createGzip(), cap, createWriteStream(path, { mode: 0o600 }));
		return readFileSync(path);
	} catch (error) {
		if (error instanceof Over) return "over";
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return "missing";
		throw error;
	} finally {
		rmSync(path, { force: true });
	}
}

/** Remember the files of a transcript as uploaded, written whole then renamed. */
function record(path: string, stamp: string): void {
	mkdirSync(join(path, ".."), { recursive: true, mode: 0o700 });
	writeFileSync(`${path}.new`, stamp);
	renameSync(`${path}.new`, path);
}
