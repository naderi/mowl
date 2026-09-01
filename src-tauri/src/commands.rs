//! Tauri commands exposed to the frontend.

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::State;

use crate::settings::Settings;
use crate::{export, file_arg, mdfmt, AppState};

#[derive(Serialize)]
pub struct SettingsPayload {
    pub settings: Settings,
    /// `true` when settings live next to the executable (portable install).
    pub portable: bool,
    /// Absolute path of the settings file, shown in the UI hint / About panel.
    pub location: String,
    /// A file passed on the command line ("Open with" / double-click), if any.
    pub open_with: Option<String>,
    /// App version (`CARGO_PKG_VERSION`), for the About panel.
    pub version: String,
}

#[tauri::command]
pub fn get_settings(state: State<AppState>) -> SettingsPayload {
    let store = state.store.lock().unwrap();
    SettingsPayload {
        settings: store.load(),
        portable: store.portable,
        location: store.path.display().to_string(),
        open_with: file_arg(&std::env::args().collect::<Vec<_>>()),
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

#[tauri::command]
pub fn save_settings(state: State<AppState>, settings: Settings) -> Result<(), String> {
    let sig = state
        .store
        .lock()
        .unwrap()
        .save(&settings)
        .map_err(|e| e.to_string())?;
    *state.last_write.lock().unwrap() = Some(sig);
    Ok(())
}

#[tauri::command]
pub fn read_document(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Cannot read {path}: {e}"))
}

/// Write `contents` to `path`, pretty-printing any GFM tables first.
/// Returns the text that was actually written so the UI can resync.
#[tauri::command]
pub fn write_document(path: String, contents: String) -> Result<String, String> {
    let is_markdown = matches!(
        std::path::Path::new(&path).extension().and_then(|e| e.to_str()),
        Some("md") | Some("markdown") | Some("mdx") | Some("txt") | None
    );
    let formatted = if is_markdown {
        mdfmt::format_tables(&contents)
    } else {
        contents
    };
    std::fs::write(&path, &formatted).map_err(|e| format!("Cannot write {path}: {e}"))?;
    Ok(formatted)
}

/// Render Markdown to a complete, self-contained HTML document.
#[tauri::command]
pub fn render_html(markdown: String, title: String, dir: String) -> String {
    export::render_html(&markdown, &title, &dir)
}

/// Largest image we will inline into the editor as a data URL.
const MAX_IMAGE_BYTES: usize = 24 * 1024 * 1024;

/// Read a local image referenced by a document and return it as a `data:` URL.
///
/// The editor's WebView cannot load images by relative or absolute filesystem
/// path, so `proxyDomURL` in the frontend routes those here. `src` is the raw
/// Markdown image target; `doc_path` is the file it appears in (used as the base
/// for relative targets). Remote (`http(s):`), `data:` and `blob:` targets never
/// reach this command — the frontend passes those straight through.
#[tauri::command]
pub fn read_image_data_url(doc_path: Option<String>, src: String) -> Result<String, String> {
    let decoded = percent_decode(src.trim());
    let target = PathBuf::from(&decoded);

    let resolved = if target.is_absolute() {
        target
    } else {
        let base = doc_path
            .as_deref()
            .map(Path::new)
            .and_then(Path::parent)
            .ok_or("relative image path, but this document has not been saved yet")?;
        base.join(target)
    };

    let bytes = std::fs::read(&resolved)
        .map_err(|e| format!("cannot read image {}: {e}", resolved.display()))?;
    if bytes.len() > MAX_IMAGE_BYTES {
        return Err(format!(
            "image {} is too large to preview ({} MiB)",
            resolved.display(),
            bytes.len() / (1024 * 1024)
        ));
    }

    Ok(format!(
        "data:{};base64,{}",
        image_mime(&resolved),
        base64_encode(&bytes)
    ))
}

fn image_mime(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("apng") => "image/apng",
        Some("jpg" | "jpeg" | "jfif") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        _ => "application/octet-stream",
    }
}

/// Minimal `%XX` decoder for Markdown image targets (spaces, parentheses, …).
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = (hex_val(bytes[i + 1]), hex_val(bytes[i + 2])) {
                out.push((h << 4) | l);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn hex_val(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// Standard base64 (with padding). Kept local to avoid a dependency for the one
/// place we need it — see `assets/export/` for the pre-encoded font blobs.
fn base64_encode(data: &[u8]) -> String {
    const TABLE: &[u8; 64] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = chunk.get(1).copied().unwrap_or(0) as u32;
        let b2 = chunk.get(2).copied().unwrap_or(0) as u32;
        let n = (b0 << 16) | (b1 << 8) | b2;
        out.push(TABLE[((n >> 18) & 63) as usize] as char);
        out.push(TABLE[((n >> 12) & 63) as usize] as char);
        out.push(if chunk.len() > 1 {
            TABLE[((n >> 6) & 63) as usize] as char
        } else {
            '='
        });
        out.push(if chunk.len() > 2 {
            TABLE[(n & 63) as usize] as char
        } else {
            '='
        });
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{base64_encode, image_mime, percent_decode};
    use std::path::Path;

    #[test]
    fn base64_matches_known_vectors() {
        assert_eq!(base64_encode(b""), "");
        assert_eq!(base64_encode(b"f"), "Zg==");
        assert_eq!(base64_encode(b"fo"), "Zm8=");
        assert_eq!(base64_encode(b"foo"), "Zm9v");
        assert_eq!(base64_encode(b"foobar"), "Zm9vYmFy");
    }

    #[test]
    fn percent_decode_handles_spaces_and_literals() {
        assert_eq!(percent_decode("a%20b.png"), "a b.png");
        assert_eq!(percent_decode("plain.png"), "plain.png");
        assert_eq!(percent_decode("100%"), "100%");
    }

    #[test]
    fn mime_by_extension() {
        assert_eq!(image_mime(Path::new("x.PNG")), "image/png");
        assert_eq!(image_mime(Path::new("x.jpeg")), "image/jpeg");
        assert_eq!(image_mime(Path::new("x.svg")), "image/svg+xml");
        assert_eq!(image_mime(Path::new("x.unknown")), "application/octet-stream");
    }
}
