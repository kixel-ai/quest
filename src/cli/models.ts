// The harnesses, models, and efforts `quest` runs for each size, the same for
// every repository; a repository's AGENTS.md may override them in prose, which
// the session following it passes as flags. The model check
// (quest/m1/model-check.md) audits these lists each milestone.
import { createHash } from "node:crypto";
import { type Doc, SIZES, type Size, onMaintainer, size, waits } from "../core";
import type { HarnessName, ReviewHarness } from "./agent";

/** One harness running one model at one effort. */
export interface Model<H extends ReviewHarness = HarnessName> {
	harness: H;
	model: string;
	effort: string;
}

/** A model `quest review` runs, on any CLI it reviews with. */
export type ReviewModel = Model<ReviewHarness>;

/** The size of a PR with neither a quest nor `--size`. */
export const DEFAULT_SIZE: Size = "M";

const sol = (effort: string): Model => ({ harness: "codex", model: "gpt-6.2-sol", effort });
const astra = (effort: string): Model => ({ harness: "codex", model: "gpt-6.2-astra", effort });
const opus = (effort: string): Model => ({ harness: "claude", model: "claude-opus-5-5", effort });
const sonnet = (effort: string): Model => ({ harness: "claude", model: "claude-sonnet-5-5", effort });
const fable = (effort: string): Model => ({ harness: "claude", model: "claude-fable-5-2", effort });

/**
 * Each size's writers, ranked: a spawn starts the quest on the first that can
 * run, falling through only while nothing is written, since the model that
 * writes a PR runs all its iterates. Only Claude writes; a quest whose writers are all at their usage limit
 * waits for one rather than starting on another vendor. XS runs Sonnet rather
 * than the cheaper Haiku, whose surcharge past 100k input tokens leads users
 * to cap its compaction window there, barely above an agent's fixed load of
 * prompt, context, and skill. No size runs Opus at low, which misses too much.
 * XL starts on Fable, since its quests are hard rather than just big; Opus
 * takes over when Fable hits its usage limit, which a subscription caps at
 * half the weekly limit.
 */
export const WRITERS: Record<Size, readonly Model[]> = {
	XS: [sonnet("high")],
	S: [opus("medium")],
	M: [opus("high")],
	L: [opus("high")],
	XL: [fable("high"), opus("xhigh")],
};

/** The lists a reviewer comes from: each PR size's, and the one every high-risk head reviews from. */
export type Listing = Size | "high";

/**
 * The writers each model is weaker than, so it never reviews their work: Sonnet is weaker than every other model,
 * and Sol is weaker than the frontier models. A model may review its own work, in a session of its own.
 */
const WEAKER_THAN: ReadonlyMap<string, readonly string[]> = new Map([
	["gpt-6.2-sol", ["claude-fable-5-2", "gpt-6.2-astra"]],
	// Retired, yet a gateway may still serve it to `--model`.
	["gpt-6.1-sol", ["claude-fable-5-2", "gpt-6.2-astra"]],
]);

/** Whether model `reviewer` is too weak to review what model `writer` wrote. */
export const weaker = (reviewer: string, writer: string): boolean =>
	reviewer !== writer && (reviewer === "claude-sonnet-5-5" || (WEAKER_THAN.get(reviewer)?.includes(writer) ?? false));

/**
 * Whether an entry runs model `model` or a {@link weaker} one, as `--exclude-model` avoids. `model` is a listed
 * model's ID, so callers pass a record's or flag's spelling through `canonicalModel` first.
 */
export const unfit =
	(model: string) =>
	(entry: ReviewModel): boolean =>
		entry.model === model || weaker(entry.model, model);

/**
 * Each list's reviewers, ranked: the first not {@link weaker} than the latest writer's model reviews the PR, which
 * may be the writer's own model, and one that cannot run passes the review to the next. Another Codex model and then
 * Fable close each size's list, so a PR still has a reviewer while Sol, or all of Codex, is out. A high head reviews
 * from `high`, whatever its size: the pick, then a second reviewer from the other vendor, so Sol and Opus review
 * Opus's work, Opus and Astra Fable's. XL starts on Astra, the vendor's frontier model, at high rather than xhigh. Fable
 * never reviews above high, since its usage limit is the XL writers', and xhigh costs it far more than Opus xhigh.
 */
export const REVIEWERS: Record<Listing, readonly ReviewModel[]> = {
	XS: [sol("medium"), opus("low"), astra("medium"), fable("medium")],
	S: [sol("medium"), opus("low"), astra("medium"), fable("medium")],
	M: [sol("high"), opus("medium"), astra("high"), fable("high")],
	L: [sol("xhigh"), opus("high"), astra("xhigh"), fable("high")],
	XL: [astra("high"), opus("xhigh"), sol("xhigh"), fable("high")],
	high: [sol("xhigh"), opus("xhigh"), fable("high"), astra("xhigh")],
};

/** One side of the writer A/B: A runs the size's own first writer, B the alternative. */
export type Arm = "A" | "B";
export const ARM_NAMES: readonly Arm[] = ["A", "B"];

/**
 * The models that set a PR's risk tier from its diff, ranked: the first that
 * can run classifies, past any logged out or at its usage limit. The tier never depends on who wrote the change,
 * so the list is the same for every PR, unlike the reviewers'. Haiku is the
 * cheapest, and the classifier's prompt stays below the 100k input tokens past
 * which it costs five times as much. Gemini Flash, Antigravity's cheapest,
 * comes last, so a contributor whose only plan is Google's can still classify.
 */
export const CLASSIFIERS: readonly ReviewModel[] = [
	{ harness: "claude", model: "claude-haiku-5-5", effort: "low" },
	sol("low"),
	{ harness: "agy", model: "gemini-3.8-flash", effort: "low" },
];

/**
 * The models that sort a finished session's time into categories, ranked as
 * the classifiers are. Haiku is the cheapest, and each prompt stays below its
 * 100k-token surcharge.
 */
export const SPLITTERS: readonly Model[] = [
	{ harness: "claude", model: "claude-haiku-5-5", effort: "low" },
	sol("low"),
];

/**
 * The stronger models that sort a sample of the same steps again, so each
 * split reports how often its classifier disagrees with a better judge.
 */
export const SPLIT_CHECKERS: readonly Model[] = [sonnet("medium"), sol("medium")];

/**
 * The writer A/B: each armed size's quests split between its first writer
 * and an alternative where published results disagree, until the readout in
 * quest/m0/routing-evidence/README.md deletes it. M and XL run no arm.
 */
export const ARMS: Partial<Record<Size, Record<Arm, Model>>> = {
	XS: { A: sonnet("high"), B: opus("medium") },
	S: { A: opus("medium"), B: sonnet("high") },
	L: { A: opus("high"), B: fable("medium") },
};

/**
 * The writers that start quest `doc`, ranked, and its writer A/B arm. A quest
 * whose size runs an arm starts on the arm's entry, then the size's list
 * without it; the arm hashes the quest's path, so a restart or respawn draws
 * the same one. A `Maintainer:` wait leaves it a decision to settle, so it
 * runs the next size's list and no arm, which keeps each arm at its PR's size.
 */
export function questWriters(doc: Doc): { arm: Arm | null; models: readonly Model[] } {
	const sized = size(doc);
	// `quest check` requires a size of every quest that is not an epic, and only those can be ready.
	if (sized === null) throw new Error(`${doc.path} has no size`);
	if (waits(doc).some(onMaintainer))
		return { arm: null, models: WRITERS[SIZES[Math.min(SIZES.indexOf(sized) + 1, SIZES.length - 1)]!] };
	const arms = ARMS[sized];
	if (!arms) return { arm: null, models: WRITERS[sized] };
	const arm = ARM_NAMES[createHash("sha256").update(doc.path).digest()[0]! & 1]!;
	const entry = arms[arm];
	const same = (e: Model) => e.model === entry.model;
	return { arm, models: [entry, ...WRITERS[sized].filter((e) => !same(e))] };
}

/**
 * The entry that runs `model` on work of `size`: its own in that size's list,
 * else its entry at the nearest size that lists it, the larger on a tie, or
 * null when no list names it.
 */
export function writerAt(size: Size, model: string): Model | null {
	const at = SIZES.indexOf(size);
	const listed = SIZES.flatMap((each, index) => {
		const entry = WRITERS[each].find((e) => e.model === model);
		return entry ? [{ entry, distance: Math.abs(index - at), index }] : [];
	});
	listed.sort((a, b) => a.distance - b.distance || b.index - a.index);
	return listed[0]?.entry ?? null;
}
