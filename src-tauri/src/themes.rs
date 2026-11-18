//! Colour themes in the VS Code theme format, read from the `Themes` folder next to
//! `settings.toml`. The bundled copies (compiled in) only fill that folder on the
//! first start.

use std::collections::HashMap;
use std::path::Path;

use serde::Serialize;
use serde_json::Value;

const BUNDLED: &[(&str, &str)] = &[
    ("github-dark", include_str!("../assets/themes/github-dark.json")),
    ("github-light", include_str!("../assets/themes/github-light.json")),
];

#[derive(Serialize)]
pub struct Token {
    pub scopes: Vec<String>,
    pub foreground: Option<String>,
    pub font_style: Option<String>,
}

#[derive(Serialize)]
pub struct Theme {
    /// File name without extension, lower case: the value stored in `settings.toml`.
    pub id: String,
    pub name: String,
    pub dark: bool,
    pub colors: HashMap<String, String>,
    pub tokens: Vec<Token>,
}

/// Theme files carry `//` and `/* */` comments (JSONC): drop them, leaving strings alone.
fn strip_comments(src: &str) -> String {
    let mut out = String::with_capacity(src.len());
    let mut chars = src.chars().peekable();
    let mut in_str = false;
    while let Some(c) = chars.next() {
        if in_str {
            out.push(c);
            if c == '\\' {
                if let Some(n) = chars.next() {
                    out.push(n);
                }
            } else if c == '"' {
                in_str = false;
            }
            continue;
        }
        match (c, chars.peek()) {
            ('"', _) => {
                in_str = true;
                out.push(c);
            }
            ('/', Some('/')) => {
                while let Some(&n) = chars.peek() {
                    if n == '\n' {
                        break;
                    }
                    chars.next();
                }
            }
            ('/', Some('*')) => {
                chars.next();
                let mut prev = ' ';
                for n in chars.by_ref() {
                    if prev == '*' && n == '/' {
                        break;
                    }
                    prev = n;
                }
            }
            _ => out.push(c),
        }
    }
    out
}

fn parse(id: &str, src: &str) -> Option<Theme> {
    let v: Value = serde_json::from_str(&strip_comments(src)).ok()?;
    let colors = v
        .get("colors")?
        .as_object()?
        .iter()
        .filter_map(|(k, c)| Some((k.clone(), c.as_str()?.to_string())))
        .collect();
    let tokens = v
        .get("tokenColors")
        .and_then(Value::as_array)
        .map(|rules| {
            rules
                .iter()
                .filter_map(|r| {
                    let scopes = match r.get("scope")? {
                        Value::String(s) => s.split(',').map(|p| p.trim().to_string()).collect(),
                        Value::Array(a) => a.iter().filter_map(|s| s.as_str().map(String::from)).collect(),
                        _ => return None,
                    };
                    let st = r.get("settings")?;
                    Some(Token {
                        scopes,
                        foreground: st.get("foreground").and_then(Value::as_str).map(String::from),
                        font_style: st.get("fontStyle").and_then(Value::as_str).map(String::from),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let name = v.get("name").and_then(Value::as_str).filter(|n| !n.is_empty()).unwrap_or(id);
    let dark = match v.get("type").and_then(Value::as_str) {
        Some(t) => !t.eq_ignore_ascii_case("light"),
        None => true,
    };
    Some(Theme { id: id.to_string(), name: name.to_string(), dark, colors, tokens })
}

/// First start: write the bundled themes into a new (or still empty, e.g. created by
/// Scoop's persist) `Themes` folder. Afterwards the folder alone decides which themes
/// exist, so users can delete or add files.
fn seed(dir: &Path) -> bool {
    let empty = |d: &Path| std::fs::read_dir(d).map_or(true, |mut e| e.next().is_none());
    if dir.exists() && !empty(dir) {
        return true;
    }
    if std::fs::create_dir_all(dir).is_err() {
        return dir.is_dir();
    }
    for (id, src) in BUNDLED {
        let _ = std::fs::write(dir.join(format!("{id}.json")), src);
    }
    true
}

/// All usable themes, sorted by display name. `dir` is the `Themes` folder; the
/// bundled themes are only used when that folder cannot be created.
pub fn list(dir: Option<&Path>) -> Vec<Theme> {
    let mut all: Vec<Theme> = Vec::new();
    match dir.filter(|d| seed(d)).and_then(|d| std::fs::read_dir(d).ok()) {
        Some(entries) => {
            for e in entries.flatten() {
                let p = e.path();
                if p.extension().and_then(|x| x.to_str()).map(str::to_ascii_lowercase).as_deref() != Some("json") {
                    continue;
                }
                let Some(id) = p.file_stem().and_then(|s| s.to_str()).map(str::to_ascii_lowercase) else { continue };
                if let Some(t) = std::fs::read_to_string(&p).ok().and_then(|s| parse(&id, &s)) {
                    all.push(t);
                }
            }
        }
        None => all.extend(BUNDLED.iter().filter_map(|(id, src)| parse(id, src))),
    }
    all.sort_by_key(|t| t.name.to_lowercase());
    all
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_themes_parse() {
        for (id, src) in BUNDLED {
            let t = parse(id, src).unwrap_or_else(|| panic!("{id} does not parse"));
            assert!(t.colors.contains_key("editor.background"), "{id}");
            assert!(!t.tokens.is_empty(), "{id}");
        }
    }

    #[test]
    fn comments_inside_strings_stay() {
        let s = strip_comments("{\"a\": \"x//y\" /* c */, // d
 \"b\": 1}");
        let v: Value = serde_json::from_str(&s).unwrap();
        assert_eq!(v["a"], "x//y");
        assert_eq!(v["b"], 1);
    }
}
