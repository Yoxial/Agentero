/**
 * 广场（Plaza）alphaXiv panel: the site's Explore feed rendered natively.
 *
 * Same card grid as the Hugging Face panel. Rows that are arXiv papers import
 * through the arXiv 魔棒 path; alphaXiv's own uploads only link to the site.
 */

import {
	ExternalLink,
	FileText,
	Languages,
	RotateCw,
	Star,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { SiGithub } from "react-icons/si";
import { SelectionSurface } from "@/components/selection/selection-surface";
import { MoveDestinationPicker } from "@/components/sidebar/file-tree/move-destination-picker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
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
import { importPlazaPaper } from "@/lib/plaza/import";
import { matchingImportedIds } from "@/lib/plaza/imported";
import { runTranslate } from "@/lib/translate";

type Query = { sort: AlphaxivSort; interval: AlphaxivInterval; nonce: number };

export function PlazaAlphaxivView({ className }: { className?: string }) {
	const { t } = useTranslation("sidebar");
	const [query, setQuery] = useState<Query>({
		sort: ALPHAXIV_DEFAULT_SORT,
		interval: ALPHAXIV_DEFAULT_INTERVAL,
		nonce: 0,
	});
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
		loadAlphaxivFeed(query.sort, query.interval, 0).then(
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
			const result = await loadAlphaxivFeed(
				query.sort,
				query.interval,
				page + 1,
			);
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
		<div className={cn("flex h-full min-h-0 flex-col", className)}>
			<div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
				{ALPHAXIV_SORTS.map((sort) => (
					<Button
						key={sort}
						type="button"
						size="sm"
						variant={query.sort === sort ? "secondary" : "ghost"}
						aria-pressed={query.sort === sort}
						onClick={() => setQuery((prev) => ({ ...prev, sort }))}
					>
						{t(`plaza.alphaxivPage.sort.${sort}`)}
					</Button>
				))}
				<Select
					value={query.interval}
					onValueChange={(interval) =>
						setQuery((prev) => ({
							...prev,
							interval: interval as AlphaxivInterval,
						}))
					}
				>
					<SelectTrigger
						size="sm"
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
				<Button
					type="button"
					className="ml-auto"
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
			<div
				className="agentero-scroll min-h-0 flex-1 overflow-y-auto p-3"
				aria-busy={status === "loading" || status === "loadingMore"}
			>
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
						<div className="mx-auto grid max-w-7xl grid-cols-[repeat(auto-fill,minmax(min(100%,21rem),1fr))] items-start gap-3">
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
							<div className="mx-auto flex max-w-7xl justify-center pt-4 pb-1">
								<Button
									type="button"
									size="sm"
									variant="outline"
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
	const { t } = useTranslation("sidebar");
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
		if (!paper.arxivId) return;
		setPickerOpen(false);
		setImportState("pending");
		rememberFolder(folder);
		const ok = await importPlazaPaper(
			{
				id: paper.arxivId,
				url: `https://arxiv.org/abs/${paper.arxivId}`,
				title: paper.title,
			},
			folder,
		);
		setImportState(ok ? "done" : "idle");
	}

	const importLabel = isImported
		? t("plaza.feeds.imported")
		: importState === "pending"
			? t("plaza.huggingfacePage.importing")
			: t("plaza.feeds.import");
	const importDisabled = isImported || importState === "pending" || !vaultPath;

	return (
		<article className="min-w-0 overflow-hidden rounded-lg border bg-background">
			<PaperCover key={paper.thumbnail} thumbnail={paper.thumbnail} />
			<div className="p-3">
				<h2 className="break-words font-medium text-sm leading-snug">
					{paper.title}
				</h2>
				{paper.authors.length > 0 && (
					<p
						className="mt-1 line-clamp-2 text-muted-foreground text-xs"
						title={paper.authors.join(", ")}
					>
						{paper.authors.join(", ")}
					</p>
				)}
				<div className="mt-1 flex flex-wrap items-center gap-x-3 text-caption text-muted-foreground">
					{paper.published && (
						<time dateTime={paper.published}>{paper.published}</time>
					)}
					{paper.votes != null && (
						<span>{t("plaza.alphaxivPage.votes", { count: paper.votes })}</span>
					)}
					{paper.views != null && (
						<span>{t("plaza.alphaxivPage.views", { count: paper.views })}</span>
					)}
					{categories.length > 0 && (
						<span className="truncate" title={categories.join(" · ")}>
							{categories.slice(0, 3).join(" · ")}
						</span>
					)}
				</div>
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
							"mt-2 whitespace-pre-wrap break-words select-text text-muted-foreground text-xs leading-relaxed",
							!expanded && "line-clamp-3",
						)}
					>
						{showTranslation ? translation : paper.abstractText}
					</SelectionSurface>
				)}
				<div className="mt-2 flex flex-wrap items-center gap-1">
					{paper.abstractText && (
						<>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								aria-expanded={expanded}
								onClick={() => setExpanded(!expanded)}
							>
								{t(
									expanded
										? "plaza.huggingfacePage.collapseAbstract"
										: "plaza.huggingfacePage.expandAbstract",
								)}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="ghost"
								disabled={translating}
								onClick={() => void translateAbstract()}
							>
								<Languages aria-hidden />
								{t(
									translating
										? "plaza.huggingfacePage.translating"
										: showTranslation
											? "plaza.huggingfacePage.showOriginal"
											: translation
												? "plaza.huggingfacePage.showTranslation"
												: "plaza.huggingfacePage.translate",
								)}
							</Button>
						</>
					)}
					<Button
						type="button"
						size="sm"
						variant="ghost"
						onClick={() => openExternalUrl(url)}
					>
						<ExternalLink aria-hidden />
						{t("plaza.feeds.openOriginal")}
					</Button>
					{paper.githubUrl && (
						<Button
							type="button"
							size="sm"
							variant="ghost"
							title={paper.githubUrl}
							onClick={() =>
								paper.githubUrl && openExternalUrl(paper.githubUrl)
							}
						>
							<SiGithub aria-hidden />
							{paper.githubStars != null && (
								<>
									<Star aria-hidden className="size-3" />
									{paper.githubStars}
								</>
							)}
						</Button>
					)}
					{paper.arxivId && (
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
					)}
				</div>
			</div>
		</article>
	);
}

function PaperCover({ thumbnail }: { thumbnail: string | null }) {
	const [failed, setFailed] = useState(false);
	return (
		<div
			className="relative aspect-[2/1] overflow-hidden border-b bg-muted/50"
			aria-hidden
		>
			<div className="absolute inset-0 grid place-items-center text-muted-foreground/50">
				<FileText className="size-9" />
			</div>
			{thumbnail && !failed && (
				<img
					alt=""
					src={thumbnail}
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					// First-page renders are portrait; the title block at the top is the
					// useful part of a 2:1 cover.
					className="relative h-full w-full bg-muted object-cover object-top"
					onError={() => setFailed(true)}
				/>
			)}
		</div>
	);
}
