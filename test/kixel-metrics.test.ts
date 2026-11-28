// scripts/kixel-metrics.ts: a `quest run --report` directory merged into the root reports Kixel Quest reads.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { expect, test } from "vitest";

import { mergeReports } from "../scripts/kixel-metrics";
import { tempDir } from "./fixture";

function reports(files: Record<string, string>): string {
	const dir = tempDir();
	for (const [path, text] of Object.entries(files)) {
		mkdirSync(dirname(join(dir, path)), { recursive: true });
		writeFileSync(join(dir, path), text);
	}
	return dir;
}

test("a missing or empty report directory merges into nothing", () => {
	expect(mergeReports(join(tempDir(), "none"))).toEqual({ junit: null, metrics: null });
	expect(mergeReports(reports({ "lint/out.txt": "" }))).toEqual({ junit: null, metrics: null });
});

test("tasks' and crates' JUnit files merge their suites under one root, in path order", () => {
	const dir = reports({
		"test/b/junit.xml": `﻿<?xml version="1.0"?>\n<!-- nextest -->\n<testsuites name="b" tests="1">\n  <testsuite name="b"/>\n</testsuites>\n`,
		"test/a/junit.xml": `<testsuite name="a"><testcase name="x"/></testsuite>`,
		"empty/junit.xml": `<testsuites/>`,
	});
	expect(mergeReports(dir).junit).toBe(
		`<?xml version="1.0" encoding="UTF-8"?>\n<testsuites>\n<testsuite name="a"><testcase name="x"/></testsuite>\n<testsuite name="b"/>\n</testsuites>\n`,
	);
});

test("a JUnit file with another root, or an unclosed one, fails", () => {
	expect(() => mergeReports(reports({ "t/junit.xml": "<report/>" }))).toThrow("t/junit.xml: the root is neither");
	expect(() => mergeReports(reports({ "t/junit.xml": "<testsuites><testsuite/>" }))).toThrow("is not closed");
});

test("metrics merge units and concatenate samples, and a measure in two units fails", () => {
	const sample = (value: number) => ({ metrics: { bench: { latency: { value } } } });
	const dir = reports({
		"a/metrics.json": JSON.stringify({ units: { latency: "ns" }, samples: [sample(1)] }),
		"b/x/metrics.json": JSON.stringify({ units: { latency: "ns", size: "B" }, samples: [sample(2)] }),
	});
	expect(mergeReports(dir).metrics).toEqual({ units: { latency: "ns", size: "B" }, samples: [sample(1), sample(2)] });

	const clash = reports({
		"a/metrics.json": JSON.stringify({ units: { latency: "ns" }, samples: [] }),
		"b/metrics.json": JSON.stringify({ units: { latency: "ms" }, samples: [] }),
	});
	expect(() => mergeReports(clash)).toThrow("b/metrics.json: latency is in ms here but ns in another report");
	expect(() => mergeReports(reports({ "a/metrics.json": "{}" }))).toThrow("a/metrics.json: units must be an object");
});
