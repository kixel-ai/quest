// An OS lock on a file, which the kernel drops when its holder dies, even by SIGKILL, so no crash leaves one behind.
import { spawn } from "node:child_process";

/** The exit status both lockers give when another process holds the lock. */
const BUSY = 75;

/**
 * Lock `path` until the returned release, which resolves once the lock is free, runs or this process dies, or return
 * null when another process holds it.
 * A child holds it, flock on Linux or BSD lockf on macOS, and exits once our pipe to it closes.
 */
export function lockFile(path: string): Promise<(() => Promise<void>) | null> {
	const [tool, ...flags] =
		process.platform === "darwin"
			? ["lockf", "-k", "-t", "0"]
			: ["flock", "--nonblock", "--conflict-exit-code", String(BUSY)];
	// Shell builtins only, so the holder needs nothing on PATH but the locker.
	// In its own process group, so an interrupt sent to ours leaves the lock held until the owner releases it after
	// its cleanup; it still exits once the owner dies and the pipe closes.
	const child = spawn(tool!, [...flags, path, "/bin/sh", "-c", "printf locked; while read -r _; do :; done"], {
		stdio: ["pipe", "pipe", "pipe"],
		detached: true,
	});
	// A holder that already exited, as on an interrupt, closes its stdin.
	child.stdin.on("error", () => {});
	let stderr = "";
	child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
		stderr += chunk;
	});
	const exited = new Promise<void>((done) => child.once("exit", () => done()));
	const release = () => {
		child.stdin.end();
		return exited;
	};
	return new Promise((done, reject) => {
		child.stdout.once("data", () => done(release));
		child.once("error", (error: NodeJS.ErrnoException) =>
			reject(
				error.code === "ENOENT"
					? new Error(`${tool} is not installed, which quest needs to lock ${path}`)
					: error,
			),
		);
		child.once("exit", (code) =>
			code === BUSY
				? done(null)
				: reject(new Error(`${tool} could not lock ${path}: ${stderr.trim() || `exit ${code}`}`)),
		);
	});
}
