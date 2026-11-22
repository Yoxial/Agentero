/**
 * 广场（Plaza）— alphaXiv Explore feed (native panel data).
 *
 * api.alphaxiv.org answers CORS for its own origin only, so the Host fetches
 * the feed (`plaza_alphaxiv_feed`) and this module is a thin typed wrapper.
 * Rows carry a bare `arxivId` when they are arXiv papers; alphaXiv's own
 * uploads have `arxivId: null` and can only be opened on the site.
 */

import {
	type AlphaxivFeedPage,
	type AlphaxivInterval,
	type AlphaxivPaper,
	type AlphaxivSort,
	commands,
} from "@/lib/core/bindings";
import { callApi } from "@/lib/core/ipc";

export type { AlphaxivFeedPage, AlphaxivInterval, AlphaxivPaper, AlphaxivSort };

/** Toolbar order; mirrors the site's Explore tabs minus the signed-in one. */
export const ALPHAXIV_SORTS: readonly AlphaxivSort[] = [
	"hot",
	"recent",
	"likes",
	"views",
];

export const ALPHAXIV_INTERVALS: readonly AlphaxivInterval[] = [
	"days3",
	"days7",
	"days30",
	"days90",
	"allTime",
];

export const ALPHAXIV_DEFAULT_SORT: AlphaxivSort = "hot";
export const ALPHAXIV_DEFAULT_INTERVAL: AlphaxivInterval = "days7";

/** Paper page on alphaXiv (discussion, AI overview, blog). */
export function alphaxivPaperUrl(paper: Pick<AlphaxivPaper, "id">): string {
	return `https://www.alphaxiv.org/abs/${encodeURIComponent(paper.id)}`;
}

export type AlphaxivFeedRequest = {
	sort: AlphaxivSort;
	interval: AlphaxivInterval;
	/** arXiv categories; empty lists every field. */
	topics: readonly string[];
	/** Non-empty switches to the site's search (unpaged, ranking ignored). */
	search: string;
};

export async function loadAlphaxivFeed(
	request: AlphaxivFeedRequest,
	page: number,
): Promise<AlphaxivFeedPage> {
	return callApi(
		() =>
			commands.plazaAlphaxivFeed({
				sort: request.sort,
				interval: request.interval,
				page,
				topics: [...request.topics],
				search: request.search.trim() || null,
			}),
		{ fallback: "alphaxiv.loadFailed" },
	);
}
