//! alphaXiv (alphaxiv.org) Explore feed for the 广场 panel.
//!
//! The site is a client-rendered SPA whose API answers CORS only for its own
//! origin, so neither route the other sources take works here: a same-origin
//! proxy embed (ModelScope) would leave the page's own API calls blocked, and a
//! renderer `fetch` (Hugging Face) is refused outright. The Host fetches the
//! feed and the panel renders it natively. The public sorts need no credential;
//! `ForYou` is the account's recommendation feed and carries the stored
//! alphaXiv API key as a bearer header.
//!
//! Same undocumented, unauthenticated endpoint family as the metadata source in
//! `scholar_api::sources::alphaxiv`, same posture: best effort, never
//! authoritative. Only the real abstract is surfaced — `paper_summary` and
//! `feed_description` are alphaXiv's AI-generated text.
//!
//! alphaXiv also hosts uploads of its own (`universal_paper_id` such as
//! `2611.harness-cg`); those rows carry no `arxiv_id` and cannot be imported.

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::error::AppError;
use crate::features::scholar_api::client;
use crate::features::scholar_api::identifiers::extract_arxiv_id;

const API_BASE: &str = "https://api.alphaxiv.org";
/// One screen of cards; the panel pages with `page`.
pub const PAGE_SIZE: usize = 30;

/// Ranking of the Explore feed. `ForYou` is the signed-in recommendation feed
/// and needs the stored API key; the API ignores its interval and topics.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum AlphaxivSort {
    Hot,
    Recent,
    Likes,
    Views,
    #[serde(rename = "forYou")]
    ForYou,
}

impl AlphaxivSort {
    fn api_value(self) -> &'static str {
        match self {
            Self::Hot => "Hot",
            Self::Recent => "Recent",
            Self::Likes => "Likes",
            Self::Views => "Views",
            Self::ForYou => "ForYou",
        }
    }
}

/// Publication window of the Explore feed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum AlphaxivInterval {
    Days3,
    Days7,
    Days30,
    Days90,
    AllTime,
}

impl AlphaxivInterval {
    fn api_value(self) -> &'static str {
        match self {
            Self::Days3 => "3 Days",
            Self::Days7 => "7 Days",
            Self::Days30 => "30 Days",
            Self::Days90 => "90 Days",
            Self::AllTime => "All time",
        }
    }
}

#[derive(Debug, Clone, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlphaxivFeedQuery {
    pub sort: AlphaxivSort,
    pub interval: AlphaxivInterval,
    /// Zero-based page.
    pub page: u32,
    /// arXiv categories (`cs.CV`); a paper in any of them matches. Empty = all.
    #[serde(default)]
    pub topics: Vec<String>,
    /// Free-text search. When set, the site's search answers instead of the
    /// feed: one unpaged result list, and the ranking fields do not apply.
    #[serde(default)]
    pub search: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlphaxivPaper {
    /// alphaXiv's paper id — the `/abs/{id}` path on the site. Equals the bare
    /// arXiv id for arXiv papers.
    pub id: String,
    /// Bare arXiv id; `None` for alphaXiv's own uploads, which cannot be imported.
    pub arxiv_id: Option<String>,
    pub title: String,
    /// The paper's abstract, never alphaXiv's AI summary.
    pub abstract_text: String,
    pub authors: Vec<String>,
    /// arXiv categories plus alphaXiv's own topic tags.
    pub topics: Vec<String>,
    /// `YYYY-MM-DD` of the first publication.
    pub published: Option<String>,
    pub votes: Option<i64>,
    pub views: Option<i64>,
    /// Cover from alphaXiv's asset CDN only.
    pub thumbnail: Option<String>,
    pub github_url: Option<String>,
    pub github_stars: Option<i64>,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AlphaxivFeedPage {
    pub page: u32,
    pub papers: Vec<AlphaxivPaper>,
    /// A full page came back, so the next one is worth asking for.
    pub has_more: bool,
}

/// Only arXiv category names reach the URL (`cs.CV`, `stat.ML`, `hep-th`).
fn is_category(topic: &str) -> bool {
    !topic.is_empty()
        && topic.len() <= 32
        && topic
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'-'))
}

pub fn feed_url(query: &AlphaxivFeedQuery) -> String {
    let topics: Vec<&str> = query
        .topics
        .iter()
        .map(|topic| topic.trim())
        .filter(|topic| is_category(topic))
        .collect();
    let topics = serde_json::to_string(&topics).unwrap_or_else(|_| "[]".to_string());
    format!(
        "{API_BASE}/papers/v3/feed?pageNum={}&pageSize={PAGE_SIZE}&sort={}&interval={}&topics={}",
        query.page,
        urlencoding::encode(query.sort.api_value()),
        urlencoding::encode(query.interval.api_value()),
        urlencoding::encode(&topics),
    )
}

pub fn search_url(text: &str) -> String {
    format!("{API_BASE}/v1/search/paper?q={}", urlencoding::encode(text))
}

/// `api_key` is the stored alphaXiv API key; only `ForYou` sends it.
pub async fn fetch_feed(
    query: &AlphaxivFeedQuery,
    api_key: Option<&str>,
) -> Result<AlphaxivFeedPage, AppError> {
    let search = query
        .search
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());
    if let Some(text) = search {
        let value = client::get_json(&search_url(text)).await?;
        return parse_search(&value)
            .ok_or_else(|| AppError::message("alphaXiv search: unexpected response shape"));
    }
    let url = feed_url(query);
    let value = if query.sort == AlphaxivSort::ForYou {
        let key = api_key
            .map(str::trim)
            .filter(|key| !key.is_empty())
            .ok_or_else(|| {
                AppError::domain("alphaxiv_key_missing", "AlphaXiv API key is not set")
            })?;
        client::get_json_with_bearer(&url, key).await?
    } else {
        client::get_json(&url).await?
    };
    parse_feed(&value, query.page)
        .ok_or_else(|| AppError::message("alphaXiv feed: unexpected response shape"))
}

/// Top-level array of feed-shaped rows; the search is not paged.
pub fn parse_search(value: &Value) -> Option<AlphaxivFeedPage> {
    let rows = value.as_array()?;
    Some(AlphaxivFeedPage {
        page: 0,
        has_more: false,
        papers: rows.iter().filter_map(map_paper).collect(),
    })
}

/// `{ papers: [...], page }`; rows without a title are dropped.
pub fn parse_feed(value: &Value, page: u32) -> Option<AlphaxivFeedPage> {
    let rows = value.get("papers")?.as_array()?;
    let papers: Vec<AlphaxivPaper> = rows.iter().filter_map(map_paper).collect();
    Some(AlphaxivFeedPage {
        page,
        has_more: rows.len() >= PAGE_SIZE,
        papers,
    })
}

fn text(item: &Value, key: &str) -> Option<String> {
    item.get(key)
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(String::from)
}

fn strings(item: &Value, key: &str) -> Vec<String> {
    item.get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(str::trim)
                .filter(|s| !s.is_empty())
                .map(String::from)
                .collect()
        })
        .unwrap_or_default()
}

/// Covers are loaded by the renderer; only the site's own asset CDN is allowed.
fn thumbnail(raw: Option<String>) -> Option<String> {
    let raw = raw?;
    let url = url::Url::parse(&raw).ok()?;
    let host = url.host_str()?;
    (url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && (host == "alphaxiv.org" || host.ends_with(".alphaxiv.org")))
    .then_some(raw)
}

fn map_paper(item: &Value) -> Option<AlphaxivPaper> {
    let title = text(item, "title")?;
    let id = text(item, "universal_paper_id")?;
    let metrics = item.get("metrics");
    Some(AlphaxivPaper {
        arxiv_id: extract_arxiv_id(&id),
        title,
        abstract_text: text(item, "abstract").unwrap_or_default(),
        authors: strings(item, "authors"),
        topics: strings(item, "topics"),
        published: text(item, "first_publication_date")
            .or_else(|| text(item, "publication_date"))
            .and_then(|d| d.get(..10).map(String::from)),
        votes: metrics
            .and_then(|m| m.get("public_total_votes"))
            .and_then(Value::as_i64),
        views: metrics
            .and_then(|m| m.get("visits_count"))
            .and_then(|v| v.get("all"))
            .and_then(Value::as_i64),
        thumbnail: thumbnail(text(item, "image_url")),
        github_url: text(item, "github_url"),
        github_stars: item.get("github_stars").and_then(Value::as_i64),
        id,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn arxiv_row() -> Value {
        json!({
            "id": "01a1f7f7-6f2c-7b5d-8d7e-0c1a4e6b9a10",
            "title": "Counterfactual World Models",
            "abstract": "We study JEPAs that reason about what if.",
            "feed_description": "AI blurb that must not leak",
            "paper_summary": { "summary": "AI summary that must not leak" },
            "image_url": "https://thumbnails.assets.alphaxiv.org/2611.24778.png",
            "universal_paper_id": "2611.24778",
            "canonical_id": "2611.24778v1",
            "metrics": {
                "visits_count": { "all": 5682, "last_7_days": 5682 },
                "total_votes": 69,
                "public_total_votes": 267
            },
            "first_publication_date": "2026-11-19T00:00:00.000Z",
            "publication_date": "2026-11-20T00:00:00.000Z",
            "topics": ["Computer Science", "cs.AI", "cs.CV"],
            "github_stars": 120,
            "github_url": "https://github.com/example/cwm",
            "authors": ["Ada Lovelace", "Alan Turing"]
        })
    }

    fn native_row() -> Value {
        json!({
            "title": "A Society of AI Scientists",
            "universal_paper_id": "2611.society-ai-scientists",
            "image_url": "https://evil.example.com/x.png",
            "authors": []
        })
    }

    #[test]
    fn maps_arxiv_row() {
        let paper = map_paper(&arxiv_row()).expect("mapped");
        assert_eq!(paper.id, "2611.24778");
        assert_eq!(paper.arxiv_id.as_deref(), Some("2611.24778"));
        assert_eq!(
            paper.abstract_text,
            "We study JEPAs that reason about what if."
        );
        assert_eq!(paper.authors, vec!["Ada Lovelace", "Alan Turing"]);
        assert_eq!(paper.topics.len(), 3);
        // First publication, date only.
        assert_eq!(paper.published.as_deref(), Some("2026-11-19"));
        assert_eq!(paper.votes, Some(267));
        assert_eq!(paper.views, Some(5682));
        assert_eq!(
            paper.thumbnail.as_deref(),
            Some("https://thumbnails.assets.alphaxiv.org/2611.24778.png")
        );
        assert_eq!(paper.github_stars, Some(120));
    }

    /// alphaXiv's own uploads list fine but cannot be imported, and covers
    /// come from its CDN only.
    #[test]
    fn native_upload_has_no_arxiv_id_and_drops_foreign_cover() {
        let paper = map_paper(&native_row()).expect("mapped");
        assert_eq!(paper.id, "2611.society-ai-scientists");
        assert_eq!(paper.arxiv_id, None);
        assert_eq!(paper.thumbnail, None);
        assert_eq!(paper.abstract_text, "");
        assert_eq!(paper.published, None);
    }

    #[test]
    fn rows_without_title_or_id_are_dropped() {
        assert_eq!(
            map_paper(&json!({ "universal_paper_id": "2611.24778" })),
            None
        );
        assert_eq!(map_paper(&json!({ "title": "Untitled" })), None);
    }

    #[test]
    fn parses_page_and_reports_has_more() {
        let short = json!({ "papers": [arxiv_row(), native_row()], "page": 0 });
        let page = parse_feed(&short, 0).expect("parsed");
        assert_eq!(page.papers.len(), 2);
        assert!(!page.has_more);

        let rows: Vec<Value> = (0..PAGE_SIZE).map(|_| arxiv_row()).collect();
        let full = parse_feed(&json!({ "papers": rows }), 2).expect("parsed");
        assert_eq!(full.page, 2);
        assert!(full.has_more);

        assert!(parse_feed(&json!({ "error": "nope" }), 0).is_none());
    }

    /// The API validates these literally; `3 Days` and `All time` are the
    /// upstream spellings.
    #[test]
    fn feed_url_uses_upstream_enum_spellings() {
        let url = feed_url(&AlphaxivFeedQuery {
            sort: AlphaxivSort::Hot,
            interval: AlphaxivInterval::Days3,
            page: 1,
            topics: Vec::new(),
            search: None,
        });
        assert_eq!(
            url,
            "https://api.alphaxiv.org/papers/v3/feed?pageNum=1&pageSize=30&sort=Hot&interval=3%20Days&topics=%5B%5D"
        );
        assert!(feed_url(&AlphaxivFeedQuery {
            sort: AlphaxivSort::Recent,
            interval: AlphaxivInterval::AllTime,
            page: 0,
            topics: Vec::new(),
            search: None,
        })
        .contains("sort=Recent&interval=All%20time"));
    }

    /// Categories go out as a JSON array; anything that is not a category
    /// name is dropped rather than forwarded.
    #[test]
    fn feed_url_filters_by_arxiv_categories() {
        let url = feed_url(&AlphaxivFeedQuery {
            sort: AlphaxivSort::Hot,
            interval: AlphaxivInterval::Days7,
            page: 0,
            topics: vec![
                "cs.CV".to_string(),
                " stat.ML ".to_string(),
                "\"],\"x".to_string(),
                String::new(),
            ],
            search: None,
        });
        assert!(url.ends_with("&topics=%5B%22cs.CV%22%2C%22stat.ML%22%5D"));
    }

    #[test]
    fn search_is_one_unpaged_list() {
        assert_eq!(
            search_url("diffusion transformer"),
            "https://api.alphaxiv.org/v1/search/paper?q=diffusion%20transformer"
        );
        let page = parse_search(&json!([arxiv_row(), native_row()])).expect("parsed");
        assert_eq!(page.papers.len(), 2);
        assert!(!page.has_more);
        assert!(parse_search(&json!({ "error": "nope" })).is_none());
    }

    /// Wire names are what the renderer sends (`bindings.ts`).
    #[test]
    fn query_enums_deserialize_from_renderer_spelling() {
        let query: AlphaxivFeedQuery =
            serde_json::from_value(json!({ "sort": "likes", "interval": "days30", "page": 0 }))
                .expect("query");
        assert_eq!(query.sort, AlphaxivSort::Likes);
        assert_eq!(query.interval, AlphaxivInterval::Days30);
    }

    #[test]
    fn for_you_sort_uses_upstream_spelling() {
        let query: AlphaxivFeedQuery =
            serde_json::from_value(json!({ "sort": "forYou", "interval": "days7", "page": 0 }))
                .expect("query");
        assert_eq!(query.sort, AlphaxivSort::ForYou);
        assert!(feed_url(&query).contains("sort=ForYou"));
        assert_eq!(
            serde_json::to_value(AlphaxivSort::ForYou).expect("serialized"),
            json!("forYou")
        );
    }

    /// ForYou without a stored key fails before any request goes out.
    #[tokio::test]
    async fn for_you_requires_a_key() {
        let query = AlphaxivFeedQuery {
            sort: AlphaxivSort::ForYou,
            interval: AlphaxivInterval::Days7,
            page: 0,
            topics: Vec::new(),
            search: None,
        };
        for key in [None, Some(""), Some("   ")] {
            let err = fetch_feed(&query, key).await.expect_err("missing key");
            assert!(
                matches!(&err, AppError::Domain { code, .. } if *code == "alphaxiv_key_missing"),
                "unexpected error: {err:?}"
            );
        }
    }
}
