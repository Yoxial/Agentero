//! Tauri command for the 广场 alphaXiv panel.
//!
//! The feed client lives in `agentero_core::features::paper::discovery::alphaxiv`;
//! this is only the IPC shell. Imports go through the arXiv 魔棒 path in the
//! renderer, so there is no import command of its own. The stored alphaXiv API
//! key rides along for the signed-in `ForYou` sort only.

use crate::core::error::{map_err, ApiResult};
use crate::features::system::settings::AppSettingsStore;
use agentero_core::features::paper::discovery::alphaxiv::{
    fetch_feed, AlphaxivFeedPage, AlphaxivFeedQuery,
};
use tauri::{AppHandle, Manager};

#[tauri::command]
#[specta::specta]
pub async fn plaza_alphaxiv_feed(
    app: AppHandle,
    args: AlphaxivFeedQuery,
) -> ApiResult<AlphaxivFeedPage> {
    let api_key = app.state::<AppSettingsStore>().alphaxiv_api_key();
    match fetch_feed(&args, api_key.as_deref()).await {
        Ok(page) => ApiResult::ok(page),
        Err(e) => map_err(e),
    }
}
