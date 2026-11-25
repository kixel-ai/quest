// A PR's code must not judge or land the PR: the source run inside a checkout is that PR's own build.
import { realpathSync } from "node:fs";
import { dirname } from "node:path";

import { git } from "./git";

/** Why a source run records no review, which the report names beside the round. */
export const OWN_REVIEW =
	"this quest runs from the source of the checkout it judges; rerun with an installed quest for the record that counts";

/** Why a source run lands nothing. */
export const OWN_MERGE = "this quest runs from the source of the checkout it lands; rerun with an installed quest";

/**
 * Whether one of the `entries` the running quest executes from lies in the same Git checkout as `root`, as
 * `bun src/cli/bin.ts` or a `dist/quest.js` built there does; an installed bundle or binary lives outside every
 * checkout it judges. Without entries, as under test, nothing runs from a checkout.
 */
export function runsFromCheckout(root: string, entries: string[] | undefined): boolean {
	if (entries === undefined) return false;
	let judged: string;
	try {
		judged = realpathSync(git(root, ["rev-parse", "--show-toplevel"]));
	} catch {
		// Not a checkout, so the command fails on its own terms.
		return false;
	}
	return entries.some((entry) => {
		try {
			return realpathSync(git(dirname(realpathSync(entry)), ["rev-parse", "--show-toplevel"])) === judged;
		} catch {
			// A path outside any checkout, or inside a compiled binary's virtual file system.
			return false;
		}
	});
}
