// The checks `quest run` makes of a task's JUnit XML and metrics, by Kixel Quest's reader's rules (its src/junit.ts
// and src/metrics.ts), so no report it would refuse, which drops a whole attempt there, leaves a run unnoticed.
import { SaxesParser } from "saxes";

/** The longest measure or unit name Kixel Quest takes, in characters. */
const NAME_LIMIT = 64;
/** The longest benchmark name Kixel Quest takes, in characters, as Bencher allows. */
const BENCHMARK_LIMIT = 1024;

/** Why Kixel Quest would refuse `bytes` as a report named `name`, `junit.xml` or `metrics.json`, or null. */
export function reportProblem(name: "junit.xml" | "metrics.json", bytes: Uint8Array): string | null {
	let text: string;
	try {
		text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(bytes);
	} catch {
		return "it is not UTF-8";
	}
	return name === "junit.xml" ? junitProblem(text) : metricsProblem(text);
}

/**
 * Why a JUnit file is refused: XML that is not well formed, a DTD, a root other than `testsuites` or `testsuite`, or a
 * `testcase` outside a `testsuite`, inside another, or with no name.
 */
function junitProblem(text: string): string | null {
	const parser = new SaxesParser();
	const stack: string[] = [];
	let problem: string | null = null;
	let inCase = false;
	const fail = (why: string) => {
		problem ??= why;
	};
	parser.on("doctype", () => fail("it declares a DTD"));
	parser.on("opentag", (tag) => {
		const parent = stack.at(-1);
		stack.push(tag.name);
		if (parent === undefined) {
			if (tag.name !== "testsuites" && tag.name !== "testsuite")
				fail(`its root is ${tag.name}, not testsuites or testsuite`);
		} else if (tag.name === "testcase") {
			if (inCase || !stack.includes("testsuite")) fail("a testcase is outside a testsuite");
			if ((tag.attributes.name ?? "") === "") fail("a testcase has no name");
			inCase = true;
		}
	});
	parser.on("closetag", (tag) => {
		stack.pop();
		if (tag.name === "testcase") inCase = false;
	});
	try {
		parser.write(text).close();
	} catch (error) {
		fail((error as Error).message);
	}
	return problem;
}

/**
 * Why a metrics file is refused: anything but an object of `units`, each measure's unit, and a non-empty list of
 * `samples`, each an optional full `commit` ID and `metrics` in the Bencher Metric Format, every measure with a unit and
 * finite values inside their bounds.
 */
function metricsProblem(text: string): string | null {
	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		return "it is not JSON";
	}
	const isObject = (value: unknown): value is Record<string, unknown> =>
		typeof value === "object" && value !== null && !Array.isArray(value);
	const extra = (value: Record<string, unknown>, keys: string[], what: string): string | null => {
		const key = Object.keys(value).find((each) => !keys.includes(each));
		return key === undefined ? null : `${what} has an unknown field ${JSON.stringify(key)}`;
	};
	const badName = (value: string, limit: number, what: string): string | null =>
		value !== "" && [...value].length <= limit && !/\p{Cc}/u.test(value) ? null : `bad ${what} name`;
	const finite = (value: unknown) => typeof value === "number" && Number.isFinite(value);

	if (!isObject(json)) return "it is not an object";
	const top = extra(json, ["units", "samples"], "the file");
	if (top !== null) return top;
	const { units, samples } = json;
	if (!isObject(units)) return "units is not an object";
	for (const [measure, unit] of Object.entries(units)) {
		const problem =
			badName(measure, NAME_LIMIT, "measure") ??
			(typeof unit === "string"
				? badName(unit, NAME_LIMIT, "unit")
				: `measure ${measure}'s unit is not a string`);
		if (problem !== null) return problem;
	}
	if (!Array.isArray(samples) || samples.length === 0) return "samples is not a non-empty list";
	for (const [i, sample] of samples.entries()) {
		const where = `sample ${i}`;
		if (!isObject(sample)) return `${where} is not an object`;
		const fields = extra(sample, ["commit", "metrics"], where);
		if (fields !== null) return fields;
		if (
			sample.commit !== undefined &&
			(typeof sample.commit !== "string" || !/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(sample.commit))
		)
			return `${where}'s commit is not a full commit ID`;
		if (!isObject(sample.metrics) || Object.keys(sample.metrics).length === 0)
			return `${where}'s metrics is not a non-empty object`;
		for (const [benchmark, measures] of Object.entries(sample.metrics)) {
			const name = badName(benchmark, BENCHMARK_LIMIT, "benchmark");
			if (name !== null) return name;
			if (!isObject(measures) || Object.keys(measures).length === 0)
				return `${where}'s ${benchmark} is not a non-empty object`;
			for (const [measure, metric] of Object.entries(measures)) {
				const what = `${where}'s ${benchmark} ${measure}`;
				if (typeof units[measure] !== "string") return `${what} has no unit`;
				if (!isObject(metric)) return `${what} is not an object`;
				const keys = extra(metric, ["value", "lower_value", "upper_value"], what);
				if (keys !== null) return keys;
				const { value, lower_value: lower, upper_value: upper } = metric;
				if (!finite(value)) return `${what}'s value is not a finite number`;
				if (lower !== undefined && !finite(lower)) return `${what}'s lower_value is not a finite number`;
				if (upper !== undefined && !finite(upper)) return `${what}'s upper_value is not a finite number`;
				if (
					(lower !== undefined && (lower as number) > (value as number)) ||
					(upper !== undefined && (upper as number) < (value as number))
				)
					return `${what}'s value is outside its bounds`;
			}
		}
	}
	return null;
}
