import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";

import { lockFile } from "../src/cli/lock";

test("a lock refuses a second holder until released, and a killed holder leaves none behind", async () => {
	const dir = mkdtempSync(join(tmpdir(), "quest-lock-"));
	try {
		const path = join(dir, "lock");
		const release = await lockFile(path);
		expect(release).not.toBeNull();
		expect(await lockFile(path)).toBeNull();
		await release!();
		// Released means free at once, not once the holder gets around to exiting.
		const again = await lockFile(path);
		expect(again).not.toBeNull();
		await again!();
		// A holder killed by SIGKILL runs no cleanup; the kernel drops its lock once its locker sees our pipe close.
		const holder = spawn(
			process.execPath,
			[
				"-e",
				`const { lockFile } = await import(${JSON.stringify(join(import.meta.dirname, "../src/cli/lock.ts"))}); await lockFile(${JSON.stringify(path)}); console.log("held"); setInterval(() => {}, 1e6);`,
			],
			{ stdio: ["ignore", "pipe", "inherit"] },
		);
		await new Promise<void>((done) => holder.stdout.once("data", () => done()));
		expect(await lockFile(path)).toBeNull();
		holder.kill("SIGKILL");
		// Blocks in the kernel until the lock is free, rather than polling for it.
		const [tool, ...flags] =
			process.platform === "darwin" ? ["lockf", "-k", "-t", "10"] : ["flock", "--timeout", "10"];
		expect(spawnSync(tool!, [...flags, path, "true"]).status).toBe(0);
		const after = await lockFile(path);
		expect(after).not.toBeNull();
		await after!();
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
