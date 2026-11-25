// What a quest waits on outside its own work: the `## Waiting` section, where
// each top-level item opens with who acts, `Maintainer:`, `Maintainer (action):`,
// `Maintainer (PC):`, or an outside party such as `moq-dev/moq:`. A plain
// `Maintainer:` item with a nested choice list, one bullet marked
// `(Recommended)`, is a decision a client can render as buttons. The same
// heading hands a draft PR back (claim.ts).

import type { Doc, Entry, NestedList, Part } from "./doc";
import { entries } from "./doc";

/** The section a quest names what it waits on in. */
export const WAITING = "Waiting";

/** The party that names the maintainer: a decision or action only they can take. */
export const MAINTAINER = "Maintainer";

/** One item of a `## Waiting` section, by the kind of answer it needs. */
export type Wait = Prose | Decision | Action;

interface Item {
	/** 1-based source line, for findings. */
	line: number;
	/** Who acts, as the item opens: `Maintainer`, or an outside party. */
	party: string;
	/** The condition, and how to check or advance it; a decision's leaves out its choice list. */
	text: string;
}

/** An item read as written: an outside party's condition, or a maintainer's item without a marked choice list. */
export interface Prose extends Item {
	kind: "prose";
}

/** The maintainer's choice among the options its choice list gives. */
export interface Decision extends Item {
	kind: "decision";
	choices: Choice[];
}

/** A step only the maintainer can take, opened as `Maintainer (action):` or `Maintainer (PC):`. */
export interface Action extends Item {
	kind: "action";
	/** A step they can take only at one of their computers, opened as `Maintainer (PC):`. */
	pc: boolean;
}

/** One option of a decision, written `label` or `label - description`. */
export interface Choice {
	label: string;
	description: string | null;
	/** The one choice marked `(Recommended)`. */
	recommended: boolean;
}

/** A malformed choice list, which `quest check` rejects and a draft's hand-back reads as prose. */
export interface WaitProblem {
	line: number;
	message: string;
}

/** An item as `readWait` reads it: `null` when it does not open with its party. */
export interface ReadWait {
	wait: Wait | null;
	problems: WaitProblem[];
}

// A party is a short label before the first colon: `Maintainer`, `moq-dev/moq`,
// `Akamai sales`. A longer run reads as a sentence that happens to hold a colon.
const PARTY = /^([^:\s][^:]{0,39}):\s+(\S[\s\S]*)$/;

// The maintainer with a qualifier; only `(action)` and `(PC)` are ones, so a typo such as
// `(local)` fails `quest check` instead of reading as an outside party.
const QUALIFIED = /^maintainer\s*\((.*)\)$/i;

const MARKER = /\(recommended\)/i;
const MARKED_LABEL = /\s*\(recommended\)$/i;

// A choice's label runs to its first ` - `; the rest describes it.
const SEPARATOR = " - ";

function render(parts: Part[]): string {
	return parts
		.map((part) => (typeof part === "string" ? part : part.bullets.map((bullet) => bullet.text).join(" ")))
		.join(" ")
		.replace(/\s+/g, " ")
		.trim();
}

function split(text: string): { label: string; description: string | null } {
	const at = text.indexOf(SEPARATOR);
	if (at < 0) return { label: text.trim(), description: null };
	return { label: text.slice(0, at).trim(), description: text.slice(at + SEPARATOR.length).trim() || null };
}

// Whether a bullet's label ends with the marker, the only way an item other than a decision can mark one.
function endsLabel(text: string): boolean {
	return MARKED_LABEL.test(split(text).label);
}

// A marked list's choices, or the problems that make it no choice list.
function choicesOf(list: NestedList): { choices: Choice[]; problems: WaitProblem[] } {
	const problems: WaitProblem[] = [];
	const seen = new Set<string>();
	const choices = list.bullets.map((bullet): Choice => {
		const { label: marked, description } = split(bullet.text);
		const recommended = MARKED_LABEL.test(marked);
		const label = marked.replace(MARKED_LABEL, "").trim();
		const marks = bullet.text.split(MARKER).length - 1;
		if (marks > (recommended ? 1 : 0))
			problems.push({
				line: bullet.line,
				message: "'(Recommended)' must end its choice's label, as 'label (Recommended) - description'",
			});
		if (label === "") problems.push({ line: bullet.line, message: "a choice needs a label" });
		else if (seen.has(label.toLowerCase()))
			problems.push({ line: bullet.line, message: `choice '${label}' is listed twice` });
		seen.add(label.toLowerCase());
		return { label, description, recommended };
	});
	if (choices.length < 2) problems.push({ line: list.line, message: "a choice list needs at least two choices" });
	if (choices.filter((choice) => choice.recommended).length !== 1)
		problems.push({ line: list.line, message: "a choice list marks exactly one choice '(Recommended)'" });
	return { choices, problems };
}

/**
 * Read one `## Waiting` item: its party, and the kind of answer it needs. An
 * item with a malformed choice list reads as prose beside its problems.
 */
export function readWait(entry: Pick<Entry, "line" | "parts">): ReadWait {
	const none: ReadWait = { wait: null, problems: [] };
	const match = PARTY.exec(render(entry.parts));
	if (!match) return none;
	const party = match[1].trim();
	const qualified = QUALIFIED.exec(party);
	const qualifier = qualified?.[1].trim().toLowerCase();
	if (qualifier !== undefined && qualifier !== "pc" && qualifier !== "action") return none;
	const plain = qualified === null && party.toLowerCase() === MAINTAINER.toLowerCase();
	const base = { line: entry.line, party: qualified ? MAINTAINER : party, text: match[2] };
	const fallback: Wait =
		qualifier === undefined ? { ...base, kind: "prose" } : { ...base, kind: "action", pc: qualifier === "pc" };
	// A malformed choice list is an unsettled question, never a step to mark done.
	const broken: Wait = { ...base, kind: "prose" };

	// Only a marker makes a nested list a choice list, so checklists and detail lists stay prose. Under a
	// decision a marker anywhere counts, so a misplaced one is caught; elsewhere only one ending a label.
	const marked = entry.parts.filter(
		(part): part is NestedList =>
			typeof part !== "string" &&
			part.bullets.some((bullet) => (plain ? MARKER.test(bullet.text) : endsLabel(bullet.text))),
	);
	if (marked.length === 0) return { wait: fallback, problems: [] };
	if (!plain)
		return {
			wait: broken,
			problems: marked.map((list) => ({
				line: list.line,
				message: `a choice list belongs only under a plain '${MAINTAINER}:' decision`,
			})),
		};
	const [list, ...extra] = marked;
	const { choices, problems } = choicesOf(list);
	for (const other of extra)
		problems.push({
			line: other.line,
			message: "a decision holds one choice list; split the others into items of their own",
		});
	if (problems.length > 0) return { wait: broken, problems };
	const question = PARTY.exec(render(entry.parts.filter((part) => part !== list)));
	if (!question)
		return {
			wait: broken,
			problems: [{ line: entry.line, message: "a decision needs its question before its choices" }],
		};
	return { wait: { ...base, kind: "decision", text: question[2], choices }, problems: [] };
}

/** `doc`'s waits, in source order; an item without a party is left to `quest check`. */
export function waits(doc: Doc): Wait[] {
	return entries(doc, WAITING)
		.map((entry) => readWait(entry).wait)
		.filter((wait): wait is Wait => wait !== null);
}

/** Whether `wait` is the maintainer's to settle. */
export function onMaintainer(wait: Wait): boolean {
	return wait.party.toLowerCase() === MAINTAINER.toLowerCase();
}

/** `wait` as one line: its party, qualifier, text, and a decision's choices. */
export function waitLine(wait: Wait): string {
	const qualifier = wait.kind === "action" ? (wait.pc ? " (PC)" : " (action)") : "";
	const choices =
		wait.kind === "decision"
			? ` Choices: ${wait.choices
					.map(
						(choice) =>
							`${choice.label}${choice.recommended ? " (Recommended)" : ""}${choice.description === null ? "" : ` - ${choice.description}`}`,
					)
					.join("; ")}`
			: "";
	return `${wait.party}${qualifier}: ${wait.text}${choices}`;
}
