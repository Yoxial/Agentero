/**
 * 广场（Plaza）alphaXiv panel: the site's Explore feed rendered natively.
 *
 * Same card grid as the Hugging Face panel. Rows that are arXiv papers import
 * through the arXiv 魔棒 path; alphaXiv's own uploads only link to the site.
 */

import {
	ChevronDown,
	ExternalLink,
	Eye,
	Languages,
	RotateCw,
	Search,
	Star,
	ThumbsUp,
	X,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SiGithub } from "react-icons/si";
import { CategoryPicker } from "@/components/plaza/plaza-arxiv-rec-view";
import { SelectionSurface } from "@/components/selection/selection-surface";
import { MoveDestinationPicker } from "@/components/sidebar/file-tree/move-destination-picker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger } from "@/components/ui/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { useLibraryStore, useVaultStore } from "@/hooks/use-app-stores";
import { errorText } from "@/lib/core/error";
import { notifyError } from "@/lib/core/notify";
import { openExternalUrl } from "@/lib/core/open-external";
import { cn } from "@/lib/core/utils";
import { lookupSubmit } from "@/lib/paper/import-actions";
import { currentLookupParentDir } from "@/lib/paper/library-actions";
import {
	ALPHAXIV_DEFAULT_INTERVAL,
	ALPHAXIV_DEFAULT_SORT,
	ALPHAXIV_INTERVALS,
	ALPHAXIV_SORTS,
	type AlphaxivInterval,
	type AlphaxivPaper,
	type AlphaxivSort,
	alphaxivPaperUrl,
	loadAlphaxivFeed,
} from "@/lib/plaza/alphaxiv";
import { formatFeedWhen } from "@/lib/plaza/feeds";
import { importPlazaPaper } from "@/lib/plaza/import";
import { matchingImportedIds } from "@/lib/plaza/imported";
import { runTranslate } from "@/lib/translate";

type Query = {
	sort: AlphaxivSort;
	interval: AlphaxivInterval;
	topics: string[];
	search: string;
	nonce: number;
};

export function PlazaAlphaxivView({ className }: { className?: string }) {
	const { t } = useTranslation("sidebar");
	const [query, setQuery] = useState<Query>({
		sort: ALPHAXIV_DEFAULT_SORT,
		interval: ALPHAXIV_DEFAULT_INTERVAL,
		topics: [],
		search: "",
		nonce: 0,
	});
	const [searchDraft, setSearchDraft] = useState("");
	// Search replaces the feed, so its ranking and category controls go idle.
	const searching = query.search !== "";
	const [papers, setPapers] = useState<AlphaxivPaper[]>([]);
	const [page, setPage] = useState(0);
	const [hasMore, setHasMore] = useState(false);
	const [status, setStatus] = useState<
		"loading" | "loadingMore" | "ready" | "error"
	>("loading");
	// A Host command cannot be aborted; stale answers are dropped by id instead.
	const requestRef = useRef(0);
	const [destination, setDestination] = useState<{
		vaultPath: string | null;
		folder: string;
	} | null>(null);
	const vaultPath = useVaultStore((state) => state.vaultPath);
	const library = useLibraryStore((state) => state.papers);
	const importedIds = useMemo(
		() =>
			new Set(
				matchingImportedIds(
					papers.flatMap((paper) => paper.arxivId ?? []),
					library,
				),
			),
		[papers, library],
	);

	const reload = () => setQuery((prev) => ({ ...prev, nonce: prev.nonce + 1 }));

	useEffect(() => {
		const id = ++requestRef.current;
		setStatus("loading");
		loadAlphaxivFeed(query, 0).then(
			(result) => {
				if (id !== requestRef.current) return;
				setPapers(result.papers);
				setPage(0);
				setHasMore(result.hasMore);
				setStatus("ready");
			},
			() => {
				if (id === requestRef.current) setStatus("error");
			},
		);
	}, [query]);

	async function loadMore() {
		const id = ++requestRef.current;
		setStatus("loadingMore");
		try {
			const result = await loadAlphaxivFeed(query, page + 1);
			if (id !== requestRef.current) return;
			setPapers((prev) => {
				const seen = new Set(prev.map((paper) => paper.id));
				return [
					...prev,
					...result.papers.filter((paper) => !seen.has(paper.id)),
				];
			});
			setPage(page + 1);
			setHasMore(result.hasMore);
			setStatus("ready");
		} catch (error) {
			if (id !== requestRef.current) return;
			setStatus("ready");
			notifyError(errorText(error));
		}
	}

	return (
		<div
			className={cn(
				"agentero-scroll @container h-full min-h-0 overflow-y-auto",
				className,
			)}
			aria-busy={status === "loading" || status === "loadingMore"}
		>
			<div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-5">
				<form
					className="relative"
					onSubmit={(event) => {
						event.preventDefault();
						setQuery((prev) => ({ ...prev, search: searchDraft.trim() }));
					}}
				>
					<Search
						aria-hidden
						className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
					/>
					<Input
						type="search"
						className="h-10 rounded-full pr-10 pl-10 text-sm"
						value={searchDraft}
						placeholder={t("plaza.alphaxivPage.searchPlaceholder")}
						aria-label={t("plaza.alphaxivPage.searchPlaceholder")}
						onChange={(event) => setSearchDraft(event.target.value)}
					/>
					{(searchDraft || searching) && (
						<button
							type="button"
							className="absolute top-1/2 right-3 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
							aria-label={t("plaza.alphaxivPage.clearSearch")}
							title={t("plaza.alphaxivPage.clearSearch")}
							onClick={() => {
								setSearchDraft("");
								setQuery((prev) => ({ ...prev, search: "" }));
							}}
						>
							<X className="size-3.5" aria-hidden />
						</button>
					)}
				</form>
				<div className="flex flex-wrap items-center gap-1.5">
					{ALPHAXIV_SORTS.map((sort) => (
						<Button
							key={sort}
							type="button"
							size="sm"
							className="rounded-full"
							variant={query.sort === sort ? "secondary" : "ghost"}
							aria-pressed={query.sort === sort}
							disabled={searching}
							onClick={() => setQuery((prev) => ({ ...prev, sort }))}
						>
							{t(`plaza.alphaxivPage.sort.${sort}`)}
						</Button>
					))}
					<Select
						value={query.interval}
						disabled={searching}
						onValueChange={(interval) =>
							setQuery((prev) => ({
								...prev,
								interval: interval as AlphaxivInterval,
							}))
						}
					>
						<SelectTrigger
							size="sm"
							className="rounded-full"
							aria-label={t("plaza.alphaxivPage.intervalLabel")}
						>
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{ALPHAXIV_INTERVALS.map((interval) => (
								<SelectItem key={interval} value={interval}>
									{t(`plaza.alphaxivPage.interval.${interval}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
					{query.topics.map((topic) => (
						<span
							key={topic}
							className={cn(
								"inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 py-0.5 pr-0.5 pl-2 font-mono text-caption text-foreground",
								searching && "opacity-60",
							)}
						>
							{topic}
							<button
								type="button"
								disabled={searching}
								className="rounded-full p-0.5 hover:bg-foreground/10"
								aria-label={t("plaza.arxivRec.removeCategory", {
									category: topic,
								})}
								onClick={() =>
									setQuery((prev) => ({
										...prev,
										topics: prev.topics.filter((item) => item !== topic),
									}))
								}
							>
								<X className="size-2.5" aria-hidden />
							</button>
						</span>
					))}
					<CategoryPicker
						disabled={searching}
						existing={query.topics}
						onSelect={(topic) =>
							setQuery((prev) => ({
								...prev,
								topics: [...prev.topics, topic],
							}))
						}
					/>
					<Button
						type="button"
						className="ml-auto rounded-full"
						variant="ghost"
						size="icon-sm"
						aria-label={t("plaza.reload")}
						title={t("plaza.reload")}
						disabled={status === "loading"}
						onClick={reload}
					>
						<RotateCw aria-hidden />
					</Button>
				</div>
				{status === "loading" ? (
					<EmptyState>{t("plaza.alphaxivPage.loading")}</EmptyState>
				) : status === "error" ? (
					<EmptyState className="flex flex-col gap-2">
						{t("plaza.alphaxivPage.loadFailed")}
						<Button type="button" size="sm" variant="outline" onClick={reload}>
							{t("plaza.reload")}
						</Button>
					</EmptyState>
				) : papers.length === 0 ? (
					<EmptyState>{t("plaza.alphaxivPage.empty")}</EmptyState>
				) : (
					<>
						<div className="flex flex-col gap-4">
							{papers.map((paper) => (
								<PaperCard
									key={`${vaultPath ?? ""}:${paper.id}`}
									paper={paper}
									imported={
										paper.arxivId != null && importedIds.has(paper.arxivId)
									}
									vaultPath={vaultPath}
									lastFolder={
										destination?.vaultPath === vaultPath
											? destination.folder
											: null
									}
									rememberFolder={(folder) =>
										setDestination({ vaultPath, folder })
									}
								/>
							))}
						</div>
						{hasMore && (
							<div className="flex justify-center pb-1">
								<Button
									type="button"
									size="sm"
									variant="outline"
									className="rounded-full"
									disabled={status === "loadingMore"}
									onClick={() => void loadMore()}
								>
									{t(
										status === "loadingMore"
											? "plaza.alphaxivPage.loading"
											: "plaza.alphaxivPage.loadMore",
									)}
								</Button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}

/**
 * Open the alphaXiv paper page inside the app — for every row, including
 * arXiv papers. The alphaXiv page is the paper's real home here (discussion,
 * AI overview, blog) and carries citation metadata for import; the title
 * click must never jump to the system browser.
 */
function openPaperInApp(paper: AlphaxivPaper, url: string) {
	void (async () => {
		try {
			const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
			const label = `agentero-alphaxiv-${paper.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
			const existing = await WebviewWindow.getByLabel(label);
			if (existing) {
				await existing.setFocus();
				return;
			}
			new WebviewWindow(label, {
				url,
				title: paper.title,
				width: 1100,
				height: 800,
			});
		} catch {
			openExternalUrl(url);
		}
	})();
}

function PaperCard({
	paper,
	imported,
	vaultPath,
	lastFolder,
	rememberFolder,
}: {
	paper: AlphaxivPaper;
	imported: boolean;
	vaultPath: string | null;
	lastFolder: string | null;
	rememberFolder: (folder: string) => void;
}) {
	const { t, i18n } = useTranslation("sidebar");
	const compact = useMemo(
		() =>
			new Intl.NumberFormat(i18n.language, {
				notation: "compact",
				maximumFractionDigits: 1,
			}),
		[i18n.language],
	);
	const popupId = useId();
	const tree = useVaultStore((state) => state.tree);
	const [expanded, setExpanded] = useState(false);
	const [translation, setTranslation] = useState<string | null>(null);
	const [showTranslation, setShowTranslation] = useState(false);
	const [translating, setTranslating] = useState(false);
	const [importState, setImportState] = useState<"idle" | "pending" | "done">(
		"idle",
	);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [newFolder, setNewFolder] = useState("");
	const url = alphaxivPaperUrl(paper);
	const isImported = imported || importState === "done";
	// arXiv categories only; alphaXiv's free-form topic tags are noise here.
	const categories = paper.topics.filter((topic) =>
		/^[a-z-]+\.[A-Za-z-]+$/.test(topic),
	);

	async function translateAbstract() {
		if (translation) {
			setShowTranslation(!showTranslation);
			setExpanded(true);
			return;
		}
		setTranslating(true);
		try {
			setTranslation(
				await runTranslate({
					text: paper.abstractText,
					context: {
						surface: "alphaxiv-feed",
						paperId: paper.arxivId ?? paper.id,
					},
				}),
			);
			setShowTranslation(true);
			setExpanded(true);
		} catch (error) {
			notifyError(errorText(error));
		} finally {
			setTranslating(false);
		}
	}

	async function importTo(folder: string) {
		setPickerOpen(false);
		setImportState("pending");
		rememberFolder(folder);
		let ok = false;
		try {
			if (paper.arxivId) {
				// arXiv rows go through the 魔棒 path (keeps LaTeX source + arxiv id).
				ok = await importPlazaPaper(
					{
						id: paper.arxivId,
						url: `https://arxiv.org/abs/${paper.arxivId}`,
						title: paper.title,
					},
					folder,
				);
			} else {
				// alphaXiv originals have no arXiv id, but their page carries full
				// citation metadata (incl. citation_pdf_url), so the generic URL
				// import fetches the page and downloads its PDF.
				await lookupSubmit([url], { parentDir: folder });
				ok = true;
			}
		} catch (error) {
			notifyError(errorText(error));
		}
		setImportState(ok ? "done" : "idle");
	}

	const importLabel = isImported
		? t("plaza.feeds.imported")
		: importState === "pending"
			? t("plaza.huggingfacePage.importing")
			: t("plaza.feeds.import");
	const importDisabled = isImported || importState === "pending" || !vaultPath;

	const translateLabel = t(
		translating
			? "plaza.huggingfacePage.translating"
			: showTranslation
				? "plaza.huggingfacePage.showOriginal"
				: translation
					? "plaza.huggingfacePage.showTranslation"
					: "plaza.huggingfacePage.translate",
	);
	const expandLabel = t(
		expanded
			? "plaza.huggingfacePage.collapseAbstract"
			: "plaza.huggingfacePage.expandAbstract",
	);
	const when = formatFeedWhen(paper.published, i18n.language);

	// alphaXiv's Explore row: text on the left, cover on the right.
	return (
		<article className="rounded-xl border bg-background px-4 py-3 transition-shadow hover:shadow-md">
			<div className="flex w-full gap-6">
				<div className="flex min-w-0 flex-1 flex-col gap-3">
					<h2 className="font-semibold text-lg leading-tight">
						<button
							type="button"
							className="break-words text-left transition-colors hover:text-primary"
							onClick={() => openPaperInApp(paper, url)}
						>
							{paper.title}
						</button>
					</h2>
					{paper.authors.length > 0 && (
						<p className="truncate text-sm" title={paper.authors.join(", ")}>
							{paper.authors.join(", ")}
						</p>
					)}
					{paper.abstractText && (
						<SelectionSurface
							source={{
								sourcePath: url,
								sourceUrl: url,
								sourceTitle: paper.title,
								origin: "markdown",
								surface: "abstract",
							}}
							className={cn(
								"whitespace-pre-wrap break-words select-text text-muted-foreground text-sm leading-relaxed",
								!expanded && "line-clamp-3",
							)}
						>
							{showTranslation ? translation : paper.abstractText}
						</SelectionSurface>
					)}
					<div className="mt-auto flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
						<div className="flex flex-wrap items-center gap-1">
							{paper.votes != null && (
								<span
									className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted px-2.5 text-xs tabular-nums"
									title={t("plaza.alphaxivPage.votes", { count: paper.votes })}
								>
									<ThumbsUp aria-hidden className="size-3.5" />
									{compact.format(paper.votes)}
								</span>
							)}
							{paper.abstractText && (
								<>
									<Button
										type="button"
										size="icon-sm"
										variant="ghost"
										className="rounded-full"
										aria-expanded={expanded}
										aria-label={expandLabel}
										title={expandLabel}
										onClick={() => setExpanded(!expanded)}
									>
										<ChevronDown
											aria-hidden
											className={cn(
												"transition-transform",
												expanded && "rotate-180",
											)}
										/>
									</Button>
									<Button
										type="button"
										size="icon-sm"
										variant={showTranslation ? "secondary" : "ghost"}
										className="rounded-full"
										disabled={translating}
										aria-label={translateLabel}
										title={translateLabel}
										onClick={() => void translateAbstract()}
									>
										<Languages aria-hidden />
									</Button>
								</>
							)}
							<Button
								type="button"
								size="icon-sm"
								variant="ghost"
								className="rounded-full"
								aria-label={t("plaza.feeds.openOriginal")}
								title={t("plaza.feeds.openOriginal")}
								onClick={() => openExternalUrl(url)}
							>
								<ExternalLink aria-hidden />
							</Button>
							{paper.githubUrl && (
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="rounded-full tabular-nums"
									title={paper.githubUrl}
									onClick={() =>
										paper.githubUrl && openExternalUrl(paper.githubUrl)
									}
								>
									<SiGithub aria-hidden />
									{paper.githubStars != null && (
										<>
											<Star aria-hidden className="size-3" />
											{compact.format(paper.githubStars)}
										</>
									)}
								</Button>
							)}
							<Popover
								open={pickerOpen}
								onOpenChange={(open) => {
									setPickerOpen(open);
									if (!open) setNewFolder("");
								}}
							>
								<PopoverTrigger asChild>
									<Button
										type="button"
										size="sm"
										variant="outline"
										className="rounded-full"
										disabled={importDisabled}
									>
										{importLabel}
									</Button>
								</PopoverTrigger>
								{pickerOpen && (
									<MoveDestinationPicker
										vaultPath={vaultPath}
										nodes={tree}
										sourcePaths={[]}
										selectedFolder={lastFolder ?? currentLookupParentDir()}
										newFolder={newFolder}
										busy={false}
										onNewFolderChange={setNewFolder}
										onConfirm={importTo}
										title={t("plaza.importToFolder")}
										idPrefix={popupId}
										side="bottom"
									/>
								)}
							</Popover>
						</div>
						<div className="flex min-w-0 items-center gap-3 whitespace-nowrap text-muted-foreground text-xs tabular-nums">
							{categories.length > 0 && (
								<span
									className="truncate font-mono"
									title={categories.join(" · ")}
								>
									{categories.slice(0, 2).join(" · ")}
								</span>
							)}
							{paper.published && when && (
								<time dateTime={paper.published} title={paper.published}>
									{when}
								</time>
							)}
							{paper.views != null && (
								<span
									className="inline-flex items-center gap-1"
									title={t("plaza.alphaxivPage.views", { count: paper.views })}
								>
									<Eye aria-hidden className="size-3.5" />
									{compact.format(paper.views)}
								</span>
							)}
						</div>
					</div>
				</div>
				<PaperCover key={paper.thumbnail} thumbnail={paper.thumbnail} />
			</div>
		</article>
	);
}

function PaperCover({ thumbnail }: { thumbnail: string | null }) {
	const [failed, setFailed] = useState(false);
	if (!thumbnail || failed) return null;
	// Only where the row is wide enough to keep the text readable beside it.
	return (
		<div
			className="hidden aspect-[8/5] w-[17.5rem] shrink-0 self-start overflow-hidden rounded-lg border bg-white @2xl:block"
			aria-hidden
		>
			<img
				alt=""
				src={thumbnail}
				loading="lazy"
				decoding="async"
				referrerPolicy="no-referrer"
				// First-page renders are portrait; the title block at the top is the
				// useful part of a landscape cover.
				className="size-full object-cover object-top"
				onError={() => setFailed(true)}
			/>
		</div>
	);
}
