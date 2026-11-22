//! Tauri command for the 广场 alphaXiv panel.
//!
//! The feed client lives in `agentero_core::features::paper::discovery::alphaxiv`;
//! this is only the IPC shell. Imports go through the arXiv 魔棒 path in the
//! renderer, so there is no import command of its own.

use crate::core::error::{map_err, ApiResult};
use agentero_core::features::paper::discovery::alphaxiv::{
    fetch_feed, AlphaxivFeedPage, AlphaxivFeedQuery,
};

#[tauri::command]
#[specta::specta]
pub async fn plaza_alphaxiv_feed(args: AlphaxivFeedQuery) -> ApiResult<AlphaxivFeedPage> {
    match fetch_feed(&args).await {
        Ok(page) => ApiResult::ok(page),
        Err(e) => map_err(e),
    }
}
