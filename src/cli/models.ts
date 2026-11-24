// The harnesses, models, and efforts `quest` runs for each size, the same for
// every repository; a repository's AGENTS.md may override them in prose, which
// the session following it passes as flags. The model check
// (quest/m1/model-check.md) audits these lists and rungs each milestone.
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
 * writes a PR runs all its iterates. Only Claude writes, so every review
 * crosses vendor or model; a quest whose writers are all at their usage limit
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

const neon = (effort: string): ReviewModel => ({ harness: "agy", model: "gemini-4-neon", effort });

/** The reviewer rungs' names, from the cheapest to the strongest. */
export const RUNG_NAMES = ["light", "standard", "deep", "frontier"] as const;
export type Rung = (typeof RUNG_NAMES)[number];

/**
 * Each rung's reviewers: configurations of about equal cost and quality across vendors, each model at one effort, so a
 * round on any of them is the same depth of review from another vendor. They are seated from public benchmarks and
 * list prices, then retuned only from `quest usage`'s per-model tallies on real PRs. Gemini Neon sits on the
 * standard and deep rungs alone: low is too weak to review, and xhigh costs 72% more than high for one index point.
 * Fable sits on the two strongest, since its limit also writes XL quests. Sonnet reviews nothing.
 */
export const RUNGS: Record<Rung, readonly ReviewModel[]> = {
	light: [sol("medium"), opus("low")],
	standard: [sol("high"), opus("medium"), neon("medium")],
	deep: [sol("xhigh"), opus("high"), astra("medium"), neon("high"), fable("medium")],
	frontier: [astra("high"), opus("xhigh"), fable("high")],
};

/** The rung each PR size's rounds draw around. */
export const SIZE_RUNGS: Record<Size, Rung> = { XS: "light", S: "light", M: "standard", L: "deep", XL: "frontier" };

/** Which way a round's rung lies from its size's: the size's own, or one stronger or cheaper. */
export const DRAWN = ["size", "up", "down"] as const;
export type Drawn = (typeof DRAWN)[number];

/**
 * The rung a round of a PR of `size` draws, given `roll` in [0, 1): the size's half the time, the next stronger a
 * quarter, and the next cheaper a quarter, so each rung is measured against its neighbors on the same sizes. The
 * top and bottom rungs have no step past them, so that quarter goes to the size's.
 */
export function drawRung(size: Size, roll: number): Rung {
	const at = RUNG_NAMES.indexOf(SIZE_RUNGS[size]);
	const step = roll < 0.5 ? 0 : roll < 0.75 ? 1 : -1;
	return RUNG_NAMES[at + step] ?? RUNG_NAMES[at]!;
}

/** Which way `rung` lies from the rung of `size`. */
export function drawnFrom(size: Size, rung: Rung): Drawn {
	const step = RUNG_NAMES.indexOf(rung) - RUNG_NAMES.indexOf(SIZE_RUNGS[size]);
	return step === 0 ? "size" : step > 0 ? "up" : "down";
}

/**
 * The rungs a seat looks through for a PR of `size` whose round drew `drawn`, in order: the drawn rung, the size's,
 * then each rung outward from the size's, the stronger first. A seat leaves a rung only when none of its models
 * can take it.
 */
export function rungOrder(size: Size, drawn: Rung): Rung[] {
	const at = RUNG_NAMES.indexOf(SIZE_RUNGS[size]);
	const outward = RUNG_NAMES.map((_, distance) => distance).flatMap((distance) =>
		distance === 0 ? [at] : [at + distance, at - distance],
	);
	return [...new Set([drawn, ...outward.flatMap((index) => RUNG_NAMES[index] ?? [])])];
}

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
