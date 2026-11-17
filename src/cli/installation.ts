// The App installation tokens Kixel Quest mints for a person's reads, kept on disk until shortly before they expire:
// a person's hourly cap on minting is spent within a minute if each command mints its own.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { Repository } from "../core";

/** A read-only token for one repository, and the person it was minted for. */
export interface Installation {
	token: string;
	/** Epoch milliseconds. */
	expiresAt: number;
	/** The GitHub login of the person, who is not the token's own account. */
	login: string;
}

/** How long before expiry a token stops being reused, so a command never starts its reads on one about to lapse. */
export const REUSE_MARGIN = 5 * 60_000;

/** Where tokens live: `$XDG_CACHE_HOME/quest/installation`, else `~/.cache/quest/installation`. */
export function installationDirectory(env: NodeJS.ProcessEnv = process.env): string {
	return join(env.XDG_CACHE_HOME || join(homedir(), ".cache"), "quest", "installation");
}

/** The file for a token: a hash of the Kixel Quest, the person's token for it, and the repository, so none is named. */
function file(directory: string, url: string, kixelToken: string, repository: Repository): string {
	const name = `${repository.owner}/${repository.repo}`.toLowerCase();
	return join(directory, createHash("sha256").update(`${url}\n${kixelToken}\n${name}`).digest("hex"));
}

/** The kept token for `repository` that still has `REUSE_MARGIN` left at `now`, or null; a damaged file is a miss. */
export function kept(
	directory: string,
	url: string,
	kixelToken: string,
	repository: Repository,
	now: number,
): Installation | null {
	let text: string;
	try {
		text = readFileSync(file(directory, url, kixelToken, repository), "utf8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw error;
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		return null;
	}
	if (typeof value !== "object" || value === null) return null;
	const { token, expiresAt, login } = value as Record<string, unknown>;
	if (typeof token !== "string" || token === "" || typeof login !== "string" || typeof expiresAt !== "number")
		return null;
	return expiresAt - now > REUSE_MARGIN ? { token, expiresAt, login } : null;
}

/** Keep `installation`, private to the user; a finished file is renamed into place, so no reader sees half of one. */
export function keep(
	directory: string,
	url: string,
	kixelToken: string,
	repository: Repository,
	installation: Installation,
): void {
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const path = file(directory, url, kixelToken, repository);
	const temporary = `${path}.${process.pid}.${crypto.randomUUID()}.tmp`;
	writeFileSync(temporary, JSON.stringify(installation), { mode: 0o600 });
	renameSync(temporary, path);
}

/** How long a lock may stand before it is taken for a crashed holder's, and how often a waiter looks again. */
const STALE = 30_000;
const POLL = 100;

/** The clock a lock waits on. */
export interface Clock {
	now(): number;
	sleep(milliseconds: number): Promise<unknown>;
}

/** A lock was still held when the caller's deadline passed. */
export class LockDeadline extends Error {
	constructor() {
		super("its deadline passed while another quest minted the token");
	}
}

/**
 * Run `run` while holding the one lock for `repository`'s token, so parallel agents on a cold or expiring cache mint
 * once between them: each waits, then finds the winner's token. The lock is a file created exclusively, holding its
 * time, so a holder that crashed is taken over after `STALE` milliseconds; two waiters that take over at once may
 * mint twice, which only spends one more of the cap. Waits until `deadline`, epoch milliseconds.
 */
export async function exclusive<T>(
	directory: string,
	url: string,
	kixelToken: string,
	repository: Repository,
	clock: Clock,
	deadline: number,
	run: () => Promise<T>,
): Promise<T> {
	mkdirSync(directory, { recursive: true, mode: 0o700 });
	const lock = `${file(directory, url, kixelToken, repository)}.lock`;
	for (;;) {
		try {
			writeFileSync(lock, String(clock.now()), { flag: "wx", mode: 0o600 });
			break;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
		}
		let since = Number.NaN;
		try {
			const text = readFileSync(lock, "utf8");
			// Created but not yet written: its holder has only just taken it.
			since = text === "" ? clock.now() : Number(text);
		} catch (error) {
			// Released between the two reads: try to take it again.
			if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
			throw error;
		}
		if (!(clock.now() - since <= STALE)) {
			rmSync(lock, { force: true });
			continue;
		}
		if (clock.now() >= deadline) throw new LockDeadline();
		await clock.sleep(Math.min(POLL, deadline - clock.now()));
	}
	try {
		return await run();
	} finally {
		rmSync(lock, { force: true });
	}
}
