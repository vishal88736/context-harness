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
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { javascript } from "@codemirror/lang-javascript";
import { json } from "@codemirror/lang-json";
import { python } from "@codemirror/lang-python";
import { markdown } from "@codemirror/lang-markdown";
import { html } from "@codemirror/lang-html";
import { css } from "@codemirror/lang-css";

type SourceEditorProps = {
  documentId: string;
  path: string;
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
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

function configuration(path: string, readOnly: boolean): Extension {
  return [
    language(path),
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

const lightTheme = EditorView.theme(
  {
    "&": {
      height: "100%",
      color: "#3f2a22",
      backgroundColor: "#fffcf9",
      fontSize: "14px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
      lineHeight: "22px",
    },
    ".cm-content": { padding: "15px 0", caretColor: "#683b2b" },
    ".cm-line": { padding: "0 18px" },
    ".cm-gutters": {
      color: "#7b6658",
      backgroundColor: "#f6f0e8",
      borderRight: "1px solid #e8ddd0",
    },
    ".cm-gutterElement": { padding: "0 9px" },
    ".cm-activeLine": { backgroundColor: "#683b2b05" },
    ".cm-activeLineGutter": { color: "#683b2b", backgroundColor: "#ede3d6" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#683b2b" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "#e9cfc2",
    },
    ".cm-selectionMatch": { backgroundColor: "#efe3bf" },
    ".cm-foldPlaceholder": {
      color: "#683b2b",
      backgroundColor: "#f6f0e8",
      border: "1px solid #ded1bd",
      borderRadius: "4px",
    },
    ".cm-panels": { color: "#71594b", backgroundColor: "#f6f0e8" },
    ".cm-searchMatch": {
      backgroundColor: "#f4e6b4",
      outline: "1px solid #b08401",
    },
    ".cm-searchMatch-selected": { backgroundColor: "#ead48a" },
    ".cm-matchingBracket": {
      backgroundColor: "#efe3bf",
      outline: "1px solid #b08401",
    },
    ".cm-tooltip": {
      backgroundColor: "#fffcf9",
      border: "1px solid #ded1bd",
      borderRadius: "6px",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      color: "#683b2b",
      backgroundColor: "#ede3d6",
    },
  },
  { dark: false },
);

const warmSyntax = syntaxHighlighting(
  HighlightStyle.define([
    { tag: tags.keyword, color: "#864e3b" },
    {
      tag: [tags.name, tags.deleted, tags.character, tags.macroName],
      color: "#683b2b",
    },
    {
      tag: [tags.function(tags.variableName), tags.labelName],
      color: "#8b6500",
    },
    {
      tag: [tags.color, tags.constant(tags.name), tags.standard(tags.name)],
      color: "#7b4c29",
    },
    { tag: [tags.definition(tags.name), tags.separator], color: "#3f2a22" },
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
      color: "#8a6217",
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
      color: "#995b42",
    },
    { tag: [tags.meta, tags.comment], color: "#7b6658", fontStyle: "italic" },
    { tag: [tags.string, tags.inserted], color: "#6b6535" },
    { tag: tags.invalid, color: "#a73830" },
    { tag: tags.heading, color: "#683b2b", fontWeight: "600" },
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
            EditorState.tabSize.of(2),
            settings.current.of(
              configuration(latest.current.path, latest.current.readOnly),
            ),
            lightTheme,
            warmSyntax,
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
            }),
          ],
        }),
    });
    view.current = editor;
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
        configuration(props.path, props.readOnly),
      ),
    });
  }, [props.documentId, props.path, props.readOnly]);

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
