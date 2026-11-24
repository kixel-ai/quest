// A pull request's risk tier: what could break, for whom, and how hard it is to undo, set from its diff and never
// from who wrote it. The repository's RISK.md lists the paths whose change is always high and says what else is
// customer-facing there; `quest review` sets the tier and records it in the PR body's `## Review` section.
import type { List, ListItem, Paragraph, RootContent } from "mdast";

import { markdown } from "./doc";
import { reviewSection } from "./review";

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
	// A backtick would end the code span that holds the pattern in RISK.md.
	if (/[[\]{}\\!`\s]/.test(pattern))
		return "it holds whitespace or one of [ ] { } \\ ! `, which patterns do not support";
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
	// `s`, so a path holding a line break matches like any other.
	return new RegExp(`^${patternSource(pattern)}(?:/.*)?$`, "s").test(path);
}

/**
 * Whether `pattern` names `path` itself, or a directory holding it when the pattern ends in `/`: unlike
 * {@link matches}, a file pattern such as `*.md` never covers a directory whose name happens to fit it.
 */
function names(pattern: string, path: string): boolean {
	return new RegExp(`^${patternSource(pattern)}${pattern.endsWith("/") ? "(?:/.*)?" : ""}$`, "s").test(path);
}

/** A regular expression's source for the paths `pattern` matches, not counting what lies under them. */
function patternSource(pattern: string): string {
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
	return source;
}

/** A class of change that may land without the maintainer's pick, and the rule over the diff that defines it. */
export interface Class {
	name: string;
	/**
	 * Patterns one of which names every changed path, checked before a model judges the rule; null for any path. A
	 * pattern names a whole path, and everything under a directory only when it ends in `/` or `/**`.
	 */
	scope: string[] | null;
	rule: string;
}

/**
 * The classes a change may fall in: each whose scope holds every path in `paths`, which must list both sides of a
 * rename so a move out of a scope leaves it, and none when no path changed.
 */
export function classesFor(classes: readonly Class[], paths: readonly string[]): Class[] {
	if (paths.length === 0) return [];
	return classes.filter(
		({ scope }) => scope === null || paths.every((path) => scope.some((pattern) => names(pattern, path))),
	);
}

/** What a risk file holds: its always-high paths and automatic classes, and what keeps it from being read. */
export interface RiskFile {
	high: HighPath[];
	classes: Class[];
	problems: string[];
}

/**
 * The risk file `text`, whose sections are each optional and appear at most once:
 *
 * - `## High`: each item a backticked {@link patternError} pattern, ` - `, and why changing what it matches is always
 *   high.
 * - `## Automatic`: each item a backticked class name; optionally its scope, backticked {@link patternError} patterns
 *   joined by `, ` in parentheses; ` - `; and the rule over the diff a change meets to fall in it.
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
	return { high, classes, problems };
}

function headingText(text: string, node: RootContent): string {
	return text
		.slice(node.position!.start.offset!, node.position!.end.offset!)
		.replace(/^#+[ \t]*/, "")
		.trim();
}

/** A list item's leading backticked code and its source after that, or null when it has not that shape. */
function codeItem(text: string, item: ListItem): { code: string; after: string } | null {
	const [first, ...rest] = item.children;
	if (first?.type !== "paragraph" || rest.length > 0) return null;
	const [code] = (first as Paragraph).children;
	if (code?.type !== "inlineCode") return null;
	return { code: code.value, after: text.slice(code.position!.end.offset!, first.position!.end.offset!) };
}

/** The text after the ` - ` that opens `after`, on one line, or null when `after` does not open with one. */
function dashed(after: string): string | null {
	return /^[ \t]+-[ \t]+(\S[\s\S]*)$/.exec(after)?.[1]?.replace(/\s+/g, " ").trim() ?? null;
}

/** One `## High` item, or why it is not one. */
function highPath(text: string, item: ListItem): HighPath | string {
	const parsed = codeItem(text, item);
	const reason = parsed && dashed(parsed.after);
	if (!parsed || !reason) return "a `## High` item is a backticked pattern, ` - `, and why its change is high";
	const problem = patternError(parsed.code);
	if (problem !== null) return `\`${parsed.code}\` is no pattern: ${problem}`;
	return { pattern: parsed.code, reason };
}

/** A class name: lowercase words joined by hyphens, so a record names it as one token. */
const CLASS_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** One `## Automatic` item, or why it is not one. */
function automaticClass(text: string, item: ListItem): Class | string {
	const parsed = codeItem(text, item);
	if (parsed === null)
		return (
			"an `## Automatic` item is a backticked class name, optionally a scope of backticked path patterns in " +
			"parentheses, ` - `, and the rule over the diff"
		);
	const name = parsed.code;
	if (!CLASS_NAME.test(name)) return `\`${name}\` is no class name: use lowercase words joined by hyphens`;
	// Parentheses around anything but backticked spans, so a pattern may hold one.
	const scoped = /^\s*\(((?:[^`)]|`[^`]*`)*)\)/.exec(parsed.after);
	const scope = scoped ? scopeOf(name, scoped[1]!) : null;
	if (typeof scope === "string") return scope;
	const rule = dashed(scoped ? parsed.after.slice(scoped[0].length) : parsed.after);
	if (rule === null)
		return scoped
			? `\`${name}\`'s scope must be followed by \` - \` and the rule, with nothing between`
			: `\`${name}\` must be followed by its optional scope in parentheses, \` - \`, and the rule over the diff`;
	// A scope after the dash would read as prose the classifier judges, not a scope the code checks.
	if (rule.startsWith("(`")) return `\`${name}\`'s scope goes before \` - \`, not at the start of its rule`;
	return { name, scope, rule };
}

/** The patterns in class `name`'s parenthesized scope `inside`, or why it holds none. */
function scopeOf(name: string, inside: string): string[] | string {
	if (inside.trim() === "") return `\`${name}\`'s scope is empty: list its patterns, or drop the parentheses`;
	if (!/^`[^`]+`(?:,\s+`[^`]+`)*$/.test(inside))
		return `\`${name}\`'s scope is not backticked path patterns joined by \`, \`: (${inside.replace(/\s+/g, " ")})`;
	const patterns = [...inside.matchAll(/`([^`]+)`/g)].map((match) => match[1]!);
	for (const pattern of patterns) {
		const problem = patternError(pattern);
		if (problem !== null) return `\`${pattern}\` in \`${name}\`'s scope is no pattern: ${problem}`;
	}
	return patterns;
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

/** A `## Review` record whose risk lines `quest review` did not write, and what is wrong with them. */
export interface MalformedRisk {
	malformed: string;
}

/**
 * The risk `body`'s `## Review` record names, or null when it names none, as a record `quest review` wrote before
 * tiers, or a record of a skipped review. A body is its author's text, so a risk line that does not parse is returned
 * as {@link MalformedRisk} for the reader to refuse, rather than thrown to stop a read of many PRs.
 */
export function recordedRisk(body: string): RecordedRisk | MalformedRisk | null {
	const section = reviewSection(body);
	if (section === null) return null;
	const text = body.slice(section.start, section.end);
	// Any risk line makes a record, so a line that misses its pattern, such as `- Risk:dire`, is malformed, not absent.
	if (!/^- (?:Risk|Classified|Class|Overridden):/m.test(text)) return null;
	const line = /^- Risk:(.*?)\r?$/m.exec(text);
	if (line === null) return { malformed: "the ## Review record's risk is malformed: it has no - Risk: line" };
	// Model text is an inline code span, as long a run of backticks as it needs, padded when it starts or ends with one.
	const risk = /^ (low|medium|high), (`+) ?(.*?) ?\2$/.exec(line[1]!);
	const classified = /^- Classified: (low|medium|high) by (.*?)\r?$/m.exec(text);
	const head = /^- Head: ([0-9a-f]{12,40})\b/m.exec(text);
	if (risk === null || classified === null || head === null)
		return { malformed: `the ## Review record's risk is malformed: ${line[1]!.trim()}` };
	const by = classified[2]!;
	const session = /, session (`+) ?(.*?) ?\1$/.exec(by);
	const named = /^- Class: `([a-z0-9-]+)`\r?$/m.exec(text);
	const overridden = /^- Overridden: from (low|medium|high) by the maintainer\r?$/m.exec(text);
	if (/^- Class:/m.test(text) !== (named !== null) || /^- Overridden:/m.test(text) !== (overridden !== null))
		return { malformed: "the ## Review record's class or override is malformed" };
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

/** How the record names a tier the paths set, and the default where the base has no risk file. */
export const PATHS = "the always-high paths";
export const DEFAULT = "default";
