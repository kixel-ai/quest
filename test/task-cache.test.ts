// The task cache's inputs: the files Git would store, and each Cargo crate's closure.
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "vitest";

import { cargoWorkspace, nixSystem, treeFiles, workspaceManifest } from "../src/cli/task-cache";
import { initRepository, tempDir } from "./fixture";

const posix = process.platform !== "win32";

/** A repository holding a file, an executable, and a symlink, uncommitted. */
function files(): string {
	const dir = initRepository(tempDir());
	mkdirSync(join(dir, "src"));
	writeFileSync(join(dir, "src", "a.rs"), "fn a() {}\n");
	writeFileSync(join(dir, "run.sh"), "#!/bin/sh\n");
	chmodSync(join(dir, "run.sh"), 0o755);
	symlinkSync("src/a.rs", join(dir, "link"));
	writeFileSync(join(dir, ".gitignore"), "target/\n");
	mkdirSync(join(dir, "target"));
	writeFileSync(join(dir, "target", "out"), "built");
	return dir;
}

test.runIf(posix)("a checkout's files hash the same committed, modified, or untracked", () => {
	const untracked = files();
	const committed = files();
	execFileSync("git", ["-C", committed, "add", "-A"], { stdio: "ignore" });
	execFileSync("git", ["-C", committed, "commit", "-q", "-m", "files"], { stdio: "ignore" });
	const clean = treeFiles(committed);
	expect(clean.map(({ path, mode }) => `${mode} ${path}`)).toEqual([
		"100644 .gitignore",
		"120000 link",
		"100755 run.sh",
		"100644 src/a.rs",
	]);
	expect(treeFiles(untracked)).toEqual(clean);

	// A modification counts as it is, and a deleted file is gone.
	writeFileSync(join(committed, "src", "a.rs"), "fn b() {}\n");
	rmSync(join(committed, "run.sh"));
	writeFileSync(join(untracked, "src", "a.rs"), "fn b() {}\n");
	rmSync(join(untracked, "run.sh"));
	const modified = treeFiles(committed);
	expect(modified.map(({ path }) => path)).toEqual([".gitignore", "link", "src/a.rs"]);
	expect(modified.find(({ path }) => path === "src/a.rs")!.oid).not.toBe(
		clean.find(({ path }) => path === "src/a.rs")!.oid,
	);
	expect(treeFiles(untracked)).toEqual(modified);
});

test("a crate's closure takes every kind of its own dependencies, and only what its dependencies build with", () => {
	const top = "/repo";
	const id = (name: string) => `path+file:///repo/${name}#${name}@0.1.0`;
	const serde = "registry+https://github.com/rust-lang/crates.io-index#serde@1.0.0";
	const output = JSON.stringify({
		workspace_root: top,
		workspace_members: [id("app"), id("lib"), id("fixtures")],
		packages: [
			{ id: id("app"), name: "app", version: "0.1.0", source: null, manifest_path: "/repo/app/Cargo.toml" },
			{ id: id("lib"), name: "lib", version: "0.1.0", source: null, manifest_path: "/repo/lib/Cargo.toml" },
			{
				id: id("fixtures"),
				name: "fixtures",
				version: "0.1.0",
				source: null,
				manifest_path: "/repo/lib/fixtures/Cargo.toml",
			},
			{
				id: serde,
				name: "serde",
				version: "1.0.0",
				source: "registry+https://github.com/rust-lang/crates.io-index",
				manifest_path: "/registry/serde/Cargo.toml",
			},
		],
		resolve: {
			nodes: [
				{ id: id("app"), features: [], deps: [{ pkg: id("lib"), dep_kinds: [{ kind: null }] }] },
				{
					id: id("lib"),
					features: [],
					deps: [
						{ pkg: serde, dep_kinds: [{ kind: "build" }] },
						{ pkg: id("fixtures"), dep_kinds: [{ kind: "dev" }] },
					],
				},
				{ id: id("fixtures"), features: [], deps: [] },
				{ id: serde, features: ["std", "derive"], deps: [] },
			],
		},
	});
	const workspace = cargoWorkspace(output, top);
	expect(workspace.dirs.sort()).toEqual(["app", "lib", "lib/fixtures"]);
	expect(workspace.crates).toEqual([
		// lib's dev-dependency builds only lib's tests.
		{
			name: "app",
			dirs: ["app", "lib"],
			packages: ["serde 1.0.0 registry+https://github.com/rust-lang/crates.io-index [derive,std]"],
			names: ["app", "lib", "serde"],
		},
		{ name: "fixtures", dirs: ["lib/fixtures"], packages: [], names: ["fixtures"] },
		{
			name: "lib",
			dirs: ["lib", "lib/fixtures"],
			packages: ["serde 1.0.0 registry+https://github.com/rust-lang/crates.io-index [derive,std]"],
			names: ["fixtures", "lib", "serde"],
		},
	]);

	expect(() => cargoWorkspace(output, "/elsewhere")).toThrow(
		"cargo = true needs the Cargo workspace at the repository root",
	);
	const outside = output.replace("/repo/lib/fixtures/Cargo.toml", "/vendor/fixtures/Cargo.toml");
	expect(() => cargoWorkspace(outside, top)).toThrow("crate fixtures is a path dependency outside the repository");
});

test("the root manifest a crate reads keeps only the workspace dependencies its closure uses", () => {
	const base =
		'[workspace]\nmembers = ["a"]\n\n[workspace.dependencies]\nserde = "1"\njson = { package = "serde_json", version = "1" }\nb = { path = "b" }\n\n[profile.release]\nlto = true\n';
	const read = (text: string) => workspaceManifest(text, ["a", "serde_json"]);
	// serde and b are outside a's closure; serde_json is in it under another name.
	expect(read(base)).toBe(read(base.replace('serde = "1"', 'serde = "2"').replace('path = "b"', 'path = "b2"')));
	expect(read(base)).not.toBe(read(base.replace('version = "1" }', 'version = "1", features = ["std"] }')));
	expect(read(base)).not.toBe(read(base.replace("lto = true", "lto = false")));
});

test.runIf(posix)("a submodule with uncommitted changes cannot be hashed", () => {
	const inner = initRepository(tempDir());
	writeFileSync(join(inner, "file"), "1");
	execFileSync("git", ["-C", inner, "add", "-A"], { stdio: "ignore" });
	execFileSync("git", ["-C", inner, "commit", "-q", "-m", "inner"], { stdio: "ignore" });
	const outer = initRepository(tempDir());
	execFileSync("git", ["-C", outer, "-c", "protocol.file.allow=always", "submodule", "add", "-q", inner, "sub"], {
		stdio: "ignore",
	});
	execFileSync("git", ["-C", outer, "commit", "-q", "-m", "outer"], { stdio: "ignore" });
	expect(treeFiles(outer).map(({ path, mode }) => `${mode} ${path}`)).toEqual(["100644 .gitmodules", "160000 sub"]);
	writeFileSync(join(outer, "sub", "file"), "2");
	expect(() => treeFiles(outer)).toThrow(
		"sub is a submodule or nested repository with changes the index does not hold",
	);
});

test("the Nix system names the host's CPU and OS as flakes do", () => {
	expect(nixSystem("linux", "x64")).toBe("x86_64-linux");
	expect(nixSystem("darwin", "arm64")).toBe("aarch64-darwin");
	expect(() => nixSystem("win32", "x64")).toThrow("not x64 win32");
});
