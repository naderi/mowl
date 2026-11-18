// Syntax colours of code blocks for colour themes: a CodeMirror highlight style
// whose colours are the --tok-* custom properties that theme.ts sets from the
// theme's token rules, so switching themes needs no new editor.
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags as t } from "@lezer/highlight";
import type { Tag } from "@lezer/highlight";

const KINDS: [string, Tag[]][] = [
  ["comment", [t.comment, t.lineComment, t.blockComment, t.docComment]],
  ["string", [t.string, t.regexp, t.special(t.string), t.character]],
  ["escape", [t.escape]],
  ["number", [t.number, t.integer, t.float]],
  ["literal", [t.bool, t.null, t.atom, t.self]],
  ["keyword", [t.keyword]],
  ["control", [t.controlKeyword]],
  ["operator", [t.operator, t.operatorKeyword, t.compareOperator, t.logicOperator, t.arithmeticOperator]],
  ["storage", [t.definitionKeyword, t.modifier, t.moduleKeyword]],
  ["type", [t.typeName, t.className, t.namespace]],
  ["func", [t.function(t.variableName), t.function(t.propertyName), t.definition(t.function(t.variableName))]],
  ["variable", [t.variableName, t.definition(t.variableName), t.labelName]],
  ["property", [t.propertyName]],
  ["attribute", [t.attributeName]],
  ["tag", [t.tagName]],
  ["punctuation", [t.punctuation, t.bracket, t.separator, t.angleBracket, t.squareBracket, t.paren, t.brace]],
  ["meta", [t.meta, t.processingInstruction]],
  ["annotation", [t.annotation]],
  ["heading", [t.heading]],
  ["strong", [t.strong]],
  ["emphasis", [t.emphasis]],
  ["link", [t.link, t.url]],
  ["inserted", [t.inserted]],
  ["deleted", [t.deleted]],
  ["changed", [t.changed]],
  ["invalid", [t.invalid]],
];

/** Highlighting that follows the active colour theme; replaces CodeMirror's default colours. */
export function colourThemeHighlighting(): ReturnType<typeof syntaxHighlighting> {
  return syntaxHighlighting(
    HighlightStyle.define(
      KINDS.map(([name, tags]) => ({
        tag: tags,
        color: `var(--tok-${name})`,
        fontStyle: `var(--tok-${name}-italic)`,
        fontWeight: `var(--tok-${name}-bold)`,
      })),
    ),
  );
}
