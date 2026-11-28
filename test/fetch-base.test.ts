import { execFileSync } from "node:child_process";
import { chmodSync, createReadStream, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";

import { fetchBase } from "../src/cli/review";

afterEach(() => vi.unstubAllEnvs());

test.skipIf(process.platform === "win32").each([
	["stops Git's stalled transport too", ""],
	["kills a transport that ignores SIGTERM after the grace period", "trap '' TERM\n"],
])("an interrupted fetch %s", async (_, trap) => {
	const dir = mkdtempSync(join(tmpdir(), "quest-fetch-"));
	try {
		const repo = join(dir, "repo");
		execFileSync("git", ["init", "-q", repo]);
		execFileSync("git", ["-C", repo, "remote", "add", "origin", "ssh://example.invalid/x.git"]);
		// A transport that stalls, holding a FIFO open for as long as it lives.
		const alive = join(dir, "alive");
		execFileSync("mkfifo", [alive]);
		const ssh = join(dir, "ssh");
		writeFileSync(ssh, `#!/bin/sh\n${trap}exec 3>"${alive}"\nexec sleep 300\n`);
		chmodSync(ssh, 0o755);
		vi.stubEnv("GIT_SSH_COMMAND", ssh);
		const interrupted = new AbortController();
		const reader = createReadStream(alive);
		// Opening the FIFO waits for the transport to open it, and it ends once every holder has exited.
		const started = new Promise<void>((done) => reader.once("open", () => done()));
		const gone = new Promise<void>((done) => reader.once("close", () => done()));
		reader.resume();
		const fetching = fetchBase(repo, "origin/main", interrupted.signal);
		await started;
		// The grace period runs on a mocked clock, so a transport that ignores SIGTERM is killed without waiting.
		vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
		interrupted.abort(new Error("interrupted"));
		vi.advanceTimersByTime(10_000);
		vi.useRealTimers();
		await expect(fetching).rejects.toThrow("interrupted");
		await gone;
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
