import { useLayoutEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import {
  Compartment,
  EditorSelection,
  EditorState,
  Prec,
  Transaction,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";
import type { EditorPreferences } from "../editor-preferences";

export type EditorCursor = { line: number; column: number };

type SourceEditorProps = {
  documentId: string;
  path: string;
  value: string;
  readOnly: boolean;
  preferences: EditorPreferences;
  onChange: (value: string) => void;
  onSave: () => void;
  onCursorChange?: (position: EditorCursor) => void;
};
type CachedDocument = {
  state: EditorState;
  scrollTop: number;
  scrollLeft: number;
};

function language(path: string): Extension {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (
    ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"].includes(
      extension ?? "",
    )
  )
    return javascript({
      typescript: ["ts", "tsx", "mts", "cts"].includes(extension!),
      jsx: extension === "jsx" || extension === "tsx",
    });
  if (extension === "json") return json();
  if (extension === "py" || extension === "pyw") return python();
  if (extension === "md" || extension === "markdown") return markdown();
  if (extension === "html" || extension === "htm") return html();
  if (extension === "css") return css();
  return [];
}

export function editorLanguage(path: string): string {
  const extension = path.split(".").at(-1)?.toLowerCase() ?? "";
  if (["ts", "tsx", "mts", "cts"].includes(extension)) return "TypeScript";
  if (["js", "jsx", "mjs", "cjs"].includes(extension)) return "JavaScript";
  if (extension === "json") return "JSON";
  if (["py", "pyw"].includes(extension)) return "Python";
  if (["md", "markdown"].includes(extension)) return "Markdown";
  if (["html", "htm"].includes(extension)) return "HTML";
  if (extension === "css") return "CSS";
  return "Plain text";
}

function configuration(
  path: string,
  readOnly: boolean,
  preferences: EditorPreferences,
): Extension {
  return [
    language(path),
    EditorState.tabSize.of(preferences.tabSize),
    indentUnit.of(" ".repeat(preferences.tabSize)),
    preferences.wordWrap ? EditorView.lineWrapping : [],
    EditorView.theme({
      "&": { fontSize: `${preferences.fontSize}px` },
      ".cm-scroller": { lineHeight: "1.65" },
    }),
    EditorState.readOnly.of(readOnly),
    EditorView.editable.of(!readOnly),
    EditorView.contentAttributes.of({
      role: "textbox",
      "aria-label": `Edit ${path}`,
      "aria-multiline": "true",
      "aria-readonly": String(readOnly),
      "aria-description":
        "Code editor. Press Escape then Tab to move focus out of the editor.",
      spellcheck: "false",
      autocapitalize: "off",
      autocorrect: "off",
      tabindex: "0",
    }),
  ];
}

const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    color: "var(--text)",
    backgroundColor: "var(--surface)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
  },
  ".cm-content": { padding: "15px 0", caretColor: "var(--accent)" },
  ".cm-line": { padding: "0 18px" },
  ".cm-gutters": {
    color: "var(--muted)",
    backgroundColor: "var(--bg)",
    borderRight: "1px solid var(--border-soft)",
  },
  ".cm-gutterElement": { padding: "0 9px" },
  ".cm-activeLine": { backgroundColor: "var(--surface-2)" },
  ".cm-activeLineGutter": {
    color: "var(--accent)",
    backgroundColor: "var(--surface-2)",
  },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
    backgroundColor: "var(--selected)",
  },
  ".cm-selectionMatch": { backgroundColor: "var(--highlight-wash)" },
  ".cm-foldPlaceholder": {
    color: "var(--accent)",
    backgroundColor: "var(--bg)",
    border: "1px solid var(--border)",
    borderRadius: "4px",
  },
  ".cm-panels": {
    color: "var(--secondary)",
    backgroundColor: "var(--bg)",
  },
  ".cm-searchMatch": {
    backgroundColor: "var(--highlight-wash)",
    outline: "1px solid var(--highlight)",
  },
  ".cm-searchMatch-selected": { backgroundColor: "var(--selected)" },
  ".cm-matchingBracket": {
    backgroundColor: "var(--highlight-wash)",
    outline: "1px solid var(--highlight)",
  },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    color: "var(--accent)",
    backgroundColor: "var(--selected)",
  },
});

const syntaxTheme = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "var(--syntax-keyword)" },
    {
      tag: [tags.name, tags.deleted, tags.character, tags.macroName],
      color: "var(--text)",
    },
    {
      tag: [tags.function(tags.variableName), tags.labelName],
      color: "var(--syntax-function)",
    },
    {
      tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
      color: "var(--syntax-number)",
    },
    { tag: [tags.definition(tags.name), tags.separator], color: "var(--text)" },
    {
      tag: [
        tags.typeName,
        tags.className,
        tags.number,
        tags.changed,
        tags.annotation,
        tags.modifier,
        tags.self,
        tags.namespace,
      ],
      color: "var(--syntax-number)",
    },
    {
      tag: [
        tags.operator,
        tags.operatorKeyword,
        tags.url,
        tags.escape,
        tags.regexp,
        tags.link,
        tags.special(tags.string),
      ],
      color: "var(--syntax-operator)",
    },
    {
      tag: [tags.meta, tags.comment],
      color: "var(--syntax-comment)",
      fontStyle: "italic",
    },
    { tag: [tags.string, tags.inserted], color: "var(--syntax-string)" },
    { tag: tags.invalid, color: "var(--syntax-error)" },
    { tag: tags.heading, color: "var(--accent)", fontWeight: "600" },
    { tag: tags.strong, fontWeight: "bold" },
    { tag: tags.emphasis, fontStyle: "italic" },
    { tag: tags.link, textDecoration: "underline" },
    { tag: tags.strikethrough, textDecoration: "line-through" },
  ]),
);

/** One view per active document; ordinary controlled updates keep its selection and history. */
export function SourceEditor(props: SourceEditorProps) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  latest.current = props;
  const settings = useRef(new Compartment());
  const externalUpdate = useRef(false);
  const documents = useRef(new Map<string, CachedDocument>());

  useLayoutEffect(() => {
    if (!host.current) return;
    const cached = documents.current.get(props.documentId);
    const editor = new EditorView({
      parent: host.current,
      state:
        cached?.state ??
        EditorState.create({
          doc: latest.current.value,
          extensions: [
            basicSetup,
            settings.current.of(
              configuration(
                latest.current.path,
                latest.current.readOnly,
                latest.current.preferences,
              ),
            ),
            editorTheme,
            syntaxTheme,
            Prec.highest(
              keymap.of([
                {
                  key: "Mod-s",
                  preventDefault: true,
                  run: (active) => {
                    if (!active.state.readOnly) latest.current.onSave();
                    return true;
                  },
                },
              ]),
            ),
            keymap.of([indentWithTab]),
            EditorView.updateListener.of((update) => {
              if (update.docChanged && !externalUpdate.current)
                latest.current.onChange(update.state.doc.toString());
              if (update.selectionSet || update.docChanged) {
                const position = update.state.selection.main.head;
                const line = update.state.doc.lineAt(position);
                latest.current.onCursorChange?.({
                  line: line.number,
                  column: position - line.from + 1,
                });
              }
            }),
          ],
        }),
    });
    view.current = editor;
    const position = editor.state.selection.main.head;
    const line = editor.state.doc.lineAt(position);
    latest.current.onCursorChange?.({
      line: line.number,
      column: position - line.from + 1,
    });
    const restore = requestAnimationFrame(() => {
      if (cached) {
        editor.scrollDOM.scrollTop = cached.scrollTop;
        editor.scrollDOM.scrollLeft = cached.scrollLeft;
      }
    });
    return () => {
      cancelAnimationFrame(restore);
      documents.current.delete(props.documentId);
      documents.current.set(props.documentId, {
        state: editor.state,
        scrollTop: editor.scrollDOM.scrollTop,
        scrollLeft: editor.scrollDOM.scrollLeft,
      });
      // Bound in-memory undo history to the twelve most recently visited files.
      if (documents.current.size > 12)
        documents.current.delete(documents.current.keys().next().value!);
      editor.destroy();
      if (view.current === editor) view.current = null;
    };
  }, [props.documentId]);

  useLayoutEffect(() => {
    view.current?.dispatch({
      effects: settings.current.reconfigure(
        configuration(props.path, props.readOnly, props.preferences),
      ),
    });
  }, [props.documentId, props.path, props.readOnly, props.preferences]);

  useLayoutEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === props.value) return;
    const cursor = Math.min(
      editor.state.selection.main.head,
      props.value.length,
    );
    externalUpdate.current = true;
    try {
      editor.dispatch({
        changes: { from: 0, to: editor.state.doc.length, insert: props.value },
        selection: EditorSelection.cursor(cursor),
        annotations: Transaction.addToHistory.of(false),
      });
    } finally {
      externalUpdate.current = false;
    }
  }, [props.documentId, props.value]);

  return <div ref={host} className="source-editor" />;
}
