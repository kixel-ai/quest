// A PR body's `## Review` record, which `quest review` writes and `quest status` reads.

import type { Nodes } from "mdast";

import { markdown } from "./doc";

/**
 * Where the body of the first `## Review` section runs: from after its heading's line to the next level-1
 * or level-2 heading's line, or the end. Only top-level headings count, as Markdown parses them, so an
 * example inside a code fence, a list, or a quote is text. Null without one.
 */
export function reviewSection(body: string): { start: number; end: number } | null {
	const lineStart = (offset: number) => body.lastIndexOf("\n", offset - 1) + 1;
	let start: number | undefined;
	for (const node of markdown(body).children) {
		if (node.type !== "heading" || node.depth > 2) continue;
		const from = node.position!.start.offset!;
		if (start !== undefined) return { start, end: lineStart(from) };
		const to = node.position!.end.offset!;
		if (node.depth === 2 && /^##[ \t]+Review[ \t]*$/.test(body.slice(lineStart(from), to)))
			start = body[to] === "\r" ? to + 1 : to;
	}
	return start === undefined ? null : { start, end: body.length };
}

/**
 * The `## Review` section's text as `quest status` compares its versions, or null without one: without the HTML
 * comments GitHub hides, such as CodeRabbit's markers, with `\n` line ends, no trailing spaces, and single blank lines,
 * so neither a bot's markers nor a browser's re-encoding changes it.
 */
export function reviewText(body: string): string | null {
	const section = reviewSection(body);
	if (section === null) return null;
	const text = body.slice(section.start, section.end).replace(/\r\n?/g, "\n");
	const hidden: [number, number][] = [];
	const visit = (node: Nodes) => {
		if (node.type === "html" && node.value.startsWith("<!--"))
			hidden.push([node.position!.start.offset!, node.position!.end.offset!]);
		else if ("children" in node) node.children.forEach(visit);
	};
	visit(markdown(text));
	let shown = "";
	let at = 0;
	for (const [start, end] of hidden) {
		shown += text.slice(at, start);
		at = end;
	}
	shown += text.slice(at);
	return shown
		.replace(/[ \t]+$/gm, "")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/** The land fixer's `mechanical fix by` lines, which `quest land` adds to the section from its bot account. */
export const FIX_LINE = /^mechanical fix by [^:\n]+: .*$/gm;

/**
 * {@link reviewText}'s `text` as the record's readers take it, a body of its own: without the land fixer's lines,
 * whose full SHA names a head it fixed, not one a review covered.
 */
export function recordBody(text: string): string {
	return `## Review\n\n${text.replace(FIX_LINE, "").trim()}\n`;
}
