// The messages agent CLIs and their providers fail a turn with once an
// account's usage limit or a key's balance is spent, as opposed to a brief
// rate limit, a context or budget limit, or another failure.
// Claude Code's server throttle says "(not your usage limit)", so the bare
// "usage limit" skips a negation.

/** Provider messages for an API key whose balance cannot pay for the request. */
export const EXHAUSTED = /credit balance is too low|insufficient_quota|exceeded your current quota|quota exceeded/i;

/**
 * Messages for a spent usage limit or key balance, such as Claude Code's
 * "You've hit your weekly limit" or "5-hour limit reached", and Codex's "You've hit
 * your usage limit". A CLIProxyAPI pool whose
 * every credential is cooling down answers "All credentials for model ... are
 * cooling down", which Claude Code shows, with the `model_cooldown` code in the
 * OpenAI-style formats; the proxy has already retried every credential, so it
 * is no brief throttle.
 */
export const LIMIT = new RegExp(
	[
		"(?<!not your )usage (?:credit )?limit",
		"usage_limit_reached",
		"(?:hit|reached) your (?:[\\w'-]+ )*(?:limit|spend cap|budget)",
		"(?:hour|weekly|opus|sonnet|fable) limit reached",
		"out of (?:extra usage|usage credits|credits)",
		"free usage exceeded",
		"credentials for model \\S+ are cooling down",
		"model_cooldown",
		EXHAUSTED.source,
	].join("|"),
	"i",
);

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * When Codex's usage limit resets, in epoch milliseconds, from its "Try again
 * at 3:15 PM." (a reset later today) or "Try again at Nov 5th, 2026 3:15 PM.",
 * or null when the message names none. Codex prints the local time, read here
 * in the same time zone, since both run with the user's environment.
 */
export function codexReset(message: string, now: Date): number | null {
	const match = /try again at (?:([a-z]{3}) (\d{1,2})(?:st|nd|rd|th), (\d{4}) )?(\d{1,2}):(\d{2}) ([ap]m)\b/i.exec(
		message,
	);
	if (match === null) return null;
	const [, month, day, year, hour, minute, half] = match;
	const index = month === undefined ? now.getMonth() : MONTHS.indexOf(month.toLowerCase());
	if (index < 0) return null;
	const date = new Date(
		year === undefined ? now.getFullYear() : Number(year),
		index,
		day === undefined ? now.getDate() : Number(day),
		(Number(hour) % 12) + (half.toLowerCase() === "pm" ? 12 : 0),
		Number(minute),
	);
	return date.getTime();
}

/**
 * Antigravity's failure for a spent quota or a throttled account, as its Go harness renders a Google API error:
 * `Error 429, Message: ..., Status: RESOURCE_EXHAUSTED, Details: [... reason:QUOTA_EXHAUSTED]`.
 */
export const AGY_LIMIT = /\breason:QUOTA_EXHAUSTED\b|\bStatus: RESOURCE_EXHAUSTED\b|\bError 429,/;

/** A Go duration such as `1h2m3.5s`, as the error's details print one. */
const GO_DURATION = /^(?:\d+(?:\.\d+)?(?:ns|us|µs|ms|h|m|s))+$/;
const GO_UNITS: Record<string, number> = { ns: 1e-6, us: 1e-3, µs: 1e-3, ms: 1, s: 1_000, m: 60_000, h: 3_600_000 };

/**
 * When an Antigravity quota resets, in epoch milliseconds: the error's `quotaResetTimeStamp`, else `now` plus its
 * `quotaResetDelay` or a throttle's `retryDelay`, or null when it names none.
 */
export function agyReset(message: string, now: Date): number | null {
	const stamp = Date.parse(/\bquotaResetTimeStamp:([^\s\]]+)/.exec(message)?.[1] ?? "");
	if (!Number.isNaN(stamp)) return stamp;
	const delay = /\b(?:quotaResetDelay|retryDelay):([^\s\]]+)/.exec(message)?.[1];
	if (delay === undefined || !GO_DURATION.test(delay)) return null;
	let ms = 0;
	for (const [, amount, unit] of delay.matchAll(/(\d+(?:\.\d+)?)(ns|us|µs|ms|h|m|s)/g)) ms += Number(amount) * GO_UNITS[unit!]!;
	return now.getTime() + ms;
}
