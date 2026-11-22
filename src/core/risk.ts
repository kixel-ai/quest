// A pull request's risk tier: what could break, for whom, and how hard it is to undo, set from its diff and never
// from who wrote it. The repository's RISK.md lists the paths whose change is always high and says what else is
// customer-facing there; `quest review` sets the tier and records it in the PR body's `## Review` section.
import type { Code, List, ListItem, Paragraph, RootContent } from "mdast";

import { markdown } from "./doc";
import { bodySection, reviewSection } from "./review";

/** The tiers, from least risk to most. */
export const TIERS = ["low", "medium", "high"] as const;
export type Tier = (typeof TIERS)[number];

/** Whether tier `a` is riskier than `b`. */
export const riskier = (a: Tier, b: Tier): boolean => TIERS.indexOf(a) > TIERS.indexOf(b);

/** The repository's risk file, read from the base so a change cannot lower its own tier. */
export const RISK_FILE = "RISK.md";

/** A path pattern whose change is always high, and why. */
export interface HighPath {
	pattern: string;
	reason: string;
}

/** The paths every repository holds high, whatever its risk file says. */
export const ALWAYS_HIGH: readonly HighPath[] = [
	{ pattern: RISK_FILE, reason: "it sets the tier of every later change" },
	{
		pattern: ".github/workflows/",
		reason: "workflows run with the repository's secrets and decide what merges and ships",
	},
	{ pattern: ".github/actions/", reason: "the repository's actions run inside its workflows, with their secrets" },
];

/**
 * Why `pattern` is not a path pattern, or null when it is one: a path from the repository root, `/`-separated,
 * where `*` matches within one segment, `?` one character of it, and a whole `**` segment any number of segments.
 */
export function patternError(pattern: string): string | null {
	if (pattern.trim() === "") return "it is empty";
	if (pattern.startsWith("/")) return "it starts with /, but a pattern is a path from the repository root";
	if (/[[\]{}\\!\s]/.test(pattern))
		return "it holds whitespace or one of [ ] { } \\ !, which patterns do not support";
	const segments = (pattern.endsWith("/") ? pattern.slice(0, -1) : pattern).split("/");
	if (segments.some((segment) => segment === "" || segment === "." || segment === ".."))
		return "it has an empty, `.`, or `..` segment";
	if (segments.some((segment) => segment !== "**" && segment.includes("**"))) return "`**` must be a whole segment";
	return null;
}

const escape = (text: string) => text.replace(/[.+^${}()|[\]\\]/g, "\\$&");
const segmentSource = (segment: string) => escape(segment).replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]");

/** Whether `path` matches `pattern`, as {@link patternError} defines one, or lies under a directory it matches. */
export function matches(pattern: string, path: string): boolean {
	// Adjacent `**` segments match what one does.
	const segments = (pattern.endsWith("/") ? pattern.slice(0, -1) : pattern)
		.split("/")
		.filter((segment, index, all) => segment !== "**" || all[index - 1] !== "**");
	let source = "";
	segments.forEach((segment, index) => {
		const last = index === segments.length - 1;
		if (segment === "**") source += index === 0 ? (last ? ".*" : "(?:[^/]+/)*") : last ? "(?:/.*)?" : "(?:/[^/]+)*";
		else source += (index === 0 || (index === 1 && segments[0] === "**") ? "" : "/") + segmentSource(segment);
	});
	return new RegExp(`^${source}(?:/.*)?$`).test(path);
}

/** A class of change that may land without the maintainer's pick, and the rule over the diff that defines it. */
export interface Class {
	name: string;
	rule: string;
}

/** What a risk file holds: its always-high paths, automatic classes, and full suite, and what keeps it from being read. */
export interface RiskFile {
	high: HighPath[];
	classes: Class[];
	/** The command that runs the repository's whole test suite, which a high change gets beyond its scoped checks. */
	suite: string | null;
	problems: string[];
}

/**
 * The risk file `text`, whose sections are each optional and appear at most once:
 *
 * - `## High`: each item a backticked {@link patternError} pattern, ` - `, and why changing what it matches is always
 *   high.
 * - `## Automatic`: each item a backticked class name, ` - `, and the rule over the diff a change meets to fall in it.
 * - `## Full suite`: one fenced code block holding the command that runs the whole test suite.
 *
 * The rest of the file is prose the classifier reads, such as what is customer-facing.
 */
export function parseRiskFile(text: string): RiskFile {
	const problems: string[] = [];
	const nodes = markdown(text).children;
	const section = (title: string): RootContent[] | null => {
		const headings = nodes.filter(
			(node) => node.type === "heading" && node.depth === 2 && headingText(text, node) === title,
		);
		if (headings.length > 1)
			problems.push(`${RISK_FILE} has ${headings.length} ## ${title} sections; merge them into one`);
		if (headings.length === 0) return null;
		const at = nodes.indexOf(headings[0]!);
		const end = nodes.findIndex((node, index) => index > at && node.type === "heading" && node.depth <= 2);
		return nodes.slice(at + 1, end < 0 ? undefined : end);
	};
	const items = <T>(title: string, parse: (item: ListItem) => T | string): T[] =>
		(section(title) ?? []).flatMap((node) => {
			if (node.type !== "list") return [];
			return (node as List).children.flatMap((item) => {
				const entry = parse(item);
				if (typeof entry !== "string") return [entry];
				problems.push(`${RISK_FILE}:${item.position!.start.line}: ${entry}`);
				return [];
			});
		});
	const high = items("High", (item) => highPath(text, item));
	const classes = items("Automatic", (item) => automaticClass(text, item));
	for (const [index, each] of classes.entries())
		if (classes.findIndex((other) => other.name === each.name) < index)
			problems.push(`${RISK_FILE} lists the class \`${each.name}\` twice`);
	const suiteSection = section("Full suite");
	let suite: string | null = null;
	if (suiteSection !== null) {
		const blocks = suiteSection.filter((node): node is Code => node.type === "code");
		if (blocks.length !== 1 || blocks[0]!.value.trim() === "")
			problems.push(`${RISK_FILE}'s ## Full suite must hold one fenced code block with the command`);
		else suite = blocks[0]!.value.trim();
	}
	return { high, classes, suite, problems };
}

function headingText(text: string, node: RootContent): string {
	return text
		.slice(node.position!.start.offset!, node.position!.end.offset!)
		.replace(/^#+[ \t]*/, "")
		.trim();
}

/** A list item's backticked code and the text after its ` - `, or null when it has not that shape. */
function codeItem(text: string, item: ListItem): { code: string; rest: string } | null {
	const [first, ...rest] = item.children;
	if (first?.type !== "paragraph" || rest.length > 0) return null;
	const [code] = (first as Paragraph).children;
	if (code?.type !== "inlineCode") return null;
	const after = text.slice(code.position!.end.offset!, first.position!.end.offset!);
	const tail = /^[ \t]+-[ \t]+(\S[\s\S]*)$/.exec(after)?.[1]?.replace(/\s+/g, " ").trim();
	return tail === undefined ? null : { code: code.value, rest: tail };
}

/** One `## High` item, or why it is not one. */
function highPath(text: string, item: ListItem): HighPath | string {
	const parsed = codeItem(text, item);
	if (parsed === null) return "a `## High` item is a backticked pattern, ` - `, and why its change is high";
	const problem = patternError(parsed.code);
	if (problem !== null) return `\`${parsed.code}\` is no pattern: ${problem}`;
	return { pattern: parsed.code, reason: parsed.rest };
}

/** A class name: lowercase words joined by hyphens, so a record names it as one token. */
const CLASS_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One `## Automatic` item, or why it is not one. */
function automaticClass(text: string, item: ListItem): Class | string {
	const parsed = codeItem(text, item);
	if (parsed === null) return "an `## Automatic` item is a backticked class name, ` - `, and the rule over the diff";
	if (!CLASS_NAME.test(parsed.code))
		return `\`${parsed.code}\` is no class name: use lowercase words joined by hyphens`;
	return { name: parsed.code, rule: parsed.rest };
}

/** The risk the PR body's `## Review` record names for its head. */
export interface RecordedRisk {
	tier: Tier;
	reason: string;
	/** The classifier's own tier, lower than `tier` when a reviewer raised it. */
	classified: Tier;
	/** How the classifier set it: a model, a path held high, or the default where the base has no risk file. */
	by: "model" | "paths" | "default";
	/** The classifier's session, when a model set the tier. */
	session: string | null;
	/** The head the record names: in full, or its first 12 characters while a finding is open. */
	head: string;
	/** The `## Automatic` class the classifier found the change in, or null for none. */
	class: string | null;
	/** The tier before the maintainer overrode it to `tier`, or null when they did not. */
	overridden: Tier | null;
}

/**
 * The risk `body`'s `## Review` record names, or null when it names none, as a record `quest review` wrote before
 * tiers, or a record of a skipped review. A malformed risk line fails.
 */
export function recordedRisk(body: string): RecordedRisk | null {
	const section = reviewSection(body);
	if (section === null) return null;
	const text = body.slice(section.start, section.end);
	const line = /^- Risk: (.*?)\r?$/m.exec(text);
	if (line === null) return null;
	// Model text is an inline code span, as long a run of backticks as it needs, padded when it starts or ends with one.
	const risk = /^(low|medium|high), (`+) ?(.*?) ?\2$/.exec(line[1]!);
	const classified = /^- Classified: (low|medium|high) by (.*?)\r?$/m.exec(text);
	const head = /^- Head: ([0-9a-f]{12,40})\b/m.exec(text);
	if (risk === null || classified === null || head === null)
		throw new Error(`the ## Review record's risk is malformed: ${line[1]}`);
	const by = classified[2]!;
	const session = /, session (`+) ?(.*?) ?\1$/.exec(by);
	const named = /^- Class: `([a-z0-9-]+)`\r?$/m.exec(text);
	const overridden = /^- Overridden: from (low|medium|high) by the maintainer\r?$/m.exec(text);
	if (/^- Class:/m.test(text) !== (named !== null) || /^- Overridden:/m.test(text) !== (overridden !== null))
		throw new Error("the ## Review record's class or override is malformed");
	return {
		tier: risk[1] as Tier,
		reason: risk[3]!,
		classified: classified[1] as Tier,
		by: by === PATHS ? "paths" : by === DEFAULT ? "default" : "model",
		session: session ? session[2]! : null,
		head: head[1]!,
		class: named ? named[1]! : null,
		overridden: overridden ? (overridden[1] as Tier) : null,
	};
}

/** How a PR is undone: a revert, a flag turned off, or a redeploy of the previous release. */
export const UNDOS = ["revert", "flag", "redeploy"] as const;

/**
 * Why `body` does not state how to undo its PR, or null when it does: a `## Undo` section that opens with one of
 * {@link UNDOS}, then what undoing it leaves behind, such as a migration already run. A low PR needs none, since a
 * revert undoes it whole.
 */
export function undoProblem(body: string): string | null {
	const section = bodySection(body, "Undo");
	if (section === null) return "its body has no ## Undo section saying how to undo it";
	const text = body.slice(section.start, section.end).trim();
	if (!new RegExp(`^(?:${UNDOS.join("|")})\\b`, "i").test(text))
		return `its ## Undo section must open with how it is undone, one of ${UNDOS.join(", ")}, then what that leaves behind`;
	return null;
}

/** How the record names a tier the paths set, and the default where the base has no risk file. */
export const PATHS = "the always-high paths";
export const DEFAULT = "default";
