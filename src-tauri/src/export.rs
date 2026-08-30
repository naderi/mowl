//! Standalone HTML export. Markdown -> GFM HTML (comrak) wrapped in a
//! self-contained page: all CSS/JS/fonts are embedded, no network needed.
//! KaTeX renders `$...$` / `$$...$$` on load; highlight.js colours code blocks.

use comrak::{markdown_to_html, Options};

const TEMPLATE: &str = include_str!("../assets/export/template.html");
const DOC_CSS: &str = include_str!("../assets/export/doc.css");
const KATEX_CSS: &str = include_str!("../assets/export/katex.min.css");
const HLJS_CSS: &str = include_str!("../assets/export/hljs.css");
const KATEX_JS: &str = include_str!("../assets/export/katex.min.js");
const AUTO_RENDER_JS: &str = include_str!("../assets/export/auto-render.min.js");
const HLJS_JS: &str = include_str!("../assets/export/highlight.min.js");

fn markdown_options() -> Options<'static> {
    let mut opts = Options::default();
    opts.extension.table = true;
    opts.extension.strikethrough = true;
    opts.extension.tasklist = true;
    opts.extension.autolink = true;
    opts.extension.footnotes = true;
    opts.extension.superscript = true;
    opts.extension.math_dollars = true;
    opts.render.r#unsafe = true; // the document is the user's own content
    opts.render.github_pre_lang = true;
    opts
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Render `markdown` to a complete HTML document titled `title`.
/// `dir` is the base writing direction ("ltr" or "rtl").
pub fn render_html(markdown: &str, title: &str, dir: &str) -> String {
    let body = markdown_to_html(markdown, &markdown_options());
    let dir = if dir == "rtl" { "rtl" } else { "ltr" };

    TEMPLATE
        .replace("{{TITLE}}", &escape_html(title))
        .replace("{{DIR}}", dir)
        .replace("{{DOC_CSS}}", DOC_CSS)
        .replace("{{KATEX_CSS}}", KATEX_CSS)
        .replace("{{HLJS_CSS}}", HLJS_CSS)
        .replace("{{KATEX_JS}}", KATEX_JS)
        .replace("{{AUTO_RENDER_JS}}", AUTO_RENDER_JS)
        .replace("{{HLJS_JS}}", HLJS_JS)
        .replace("{{BODY}}", &body)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_basic_markdown() {
        let out = render_html("# Hello\n\n- a\n- b\n", "Doc", "ltr");
        assert!(out.contains("<h1>Hello</h1>"));
        assert!(out.contains("<title>Doc</title>"));
        assert!(out.contains("data:font/woff2;base64"));
    }

    #[test]
    fn keeps_math_delimiters_for_katex() {
        let out = render_html("Euler: $e^{i\\pi}+1=0$\n", "Doc", "ltr");
        assert!(out.contains("renderMathInElement"));
    }

    #[test]
    fn table_extension_active() {
        let md = "| a | b |\n|---|---|\n| 1 | 2 |\n";
        assert!(render_html(md, "t", "rtl").contains("<table>"));
    }
}
