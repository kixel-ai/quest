// Merge a `quest run --report` directory into the one junit.xml and metrics.json at an artifact's root, which is
// all Kixel Quest reads of a `kixel-metrics` artifact. platform.yml runs it before uploading.
//
//   bun scripts/kixel-metrics.ts <report-dir> <out-dir>

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** The merged reports, each null when no task wrote one. */
export type Merged = { junit: string | null; metrics: { units: Record<string, string>; samples: unknown[] } | null };

/** Merge every junit.xml and metrics.json under `dir`, in path order; throws on a file Kixel Quest would refuse. */
export function mergeReports(dir: string): Merged {
	const files = existsSync(dir) ? walk(dir).sort() : [];
	const junits = files.filter((file) => file.endsWith("/junit.xml"));
	const metrics = files.filter((file) => file.endsWith("/metrics.json"));
	return {
		junit:
			junits.length === 0
				? null
				: `<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n${junits
						.map((file) => suites(readFileSync(join(dir, file), "utf8"), file))
						.filter((each) => each !== "")
						.join("\n")}\n</testsuites>\n`,
		metrics:
			metrics.length === 0
				? null
				: mergeMetrics(metrics.map((file) => [file, readFileSync(join(dir, file), "utf8")])),
	};
}

/** Every file under `dir`, relative to it with `/` separators. */
function walk(dir: string, prefix = ""): string[] {
	return readdirSync(join(dir, prefix), { withFileTypes: true }).flatMap((entry) => {
		const path = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
		return entry.isDirectory() ? walk(dir, path) : [path];
	});
}

/** The `<testsuite>` elements of one JUnit file, whose root is either `<testsuites>` or a single `<testsuite>`. */
function suites(xml: string, file: string): string {
	// The prolog: a byte order mark, the XML declaration, comments, and whitespace.
	const body = xml.replace(/^﻿?(?:\s*<\?xml[^>]*\?>)?(?:\s*<!--[\s\S]*?-->)*\s*/, "").trimEnd();
	if (/^<testsuites\b[^>]*\/>$/.test(body)) return "";
	const open = /^<testsuites\b[^>]*>/.exec(body);
	if (open !== null) {
		if (!body.endsWith("</testsuites>")) throw new Error(`${file}: <testsuites> is not closed at the end`);
		return body.slice(open[0].length, -"</testsuites>".length).trim();
	}
	if (/^<testsuite\b/.test(body)) return body;
	throw new Error(`${file}: the root is neither <testsuites> nor <testsuite>`);
}

/** One metrics object holding every file's units and samples; a measure two files give different units fails. */
function mergeMetrics(files: [string, string][]): NonNullable<Merged["metrics"]> {
	const units: Record<string, string> = {};
	const samples: unknown[] = [];
	for (const [file, text] of files) {
		const metrics = JSON.parse(text) as { units?: unknown; samples?: unknown };
		if (typeof metrics.units !== "object" || metrics.units === null || Array.isArray(metrics.units))
			throw new Error(`${file}: units must be an object`);
		if (!Array.isArray(metrics.samples)) throw new Error(`${file}: samples must be an array`);
		for (const [measure, unit] of Object.entries(metrics.units)) {
			if (typeof unit !== "string") throw new Error(`${file}: the unit of ${measure} must be a string`);
			if (measure in units && units[measure] !== unit)
				throw new Error(`${file}: ${measure} is in ${unit} here but ${units[measure]} in another report`);
			units[measure] = unit;
		}
		samples.push(...metrics.samples);
	}
	return { units, samples };
}

if (import.meta.main) {
	const [dir, out] = process.argv.slice(2);
	if (dir === undefined || out === undefined) {
		console.error("usage: bun scripts/kixel-metrics.ts <report-dir> <out-dir>");
		process.exit(2);
	}
	const merged = mergeReports(dir);
	mkdirSync(out, { recursive: true });
	if (merged.junit !== null) writeFileSync(join(out, "junit.xml"), merged.junit);
	if (merged.metrics !== null) writeFileSync(join(out, "metrics.json"), `${JSON.stringify(merged.metrics)}\n`);
	console.log(`merged ${dir} into ${out}`);
}
