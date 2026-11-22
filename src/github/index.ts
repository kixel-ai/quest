// Quest's GitHub readers for a host with no checkout, git, or Node APIs, such as a Worker: the forge reads'
// GitHub backend, a PR's status as `quest status` reads it, and the claims on quest branches as `quest start`
// decides them. The caller supplies `fetch` and the token through `GitHubDependencies`; the read types are
// `quest/core`'s.

export {
	GitHub,
	GitHubDeadline,
	type GitHubDependencies,
	GitHubGraphQLError,
	type GitHubReadDependencies,
	GitHubReader,
	reading,
} from "./client";
export { GitHubForge } from "./forge";
export { type BaseNeeds, type Needs, pullRequestStatus, requiredOf } from "./status";
export { type HoldReport } from "./hold";
export { claimBranches, held, openPullRequests } from "./claims";
