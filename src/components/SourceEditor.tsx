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
      color: "#24344f",
      backgroundColor: "#fff",
      fontSize: "14px",
    },
    "&.cm-focused": { outline: "none" },
    ".cm-scroller": {
      overflow: "auto",
      fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace',
      lineHeight: "22px",
    },
    ".cm-content": { padding: "15px 0", caretColor: "#315bff" },
    ".cm-line": { padding: "0 18px" },
    ".cm-gutters": {
      color: "#8798b3",
      backgroundColor: "#f8faff",
      borderRight: "1px solid #eef2fa",
    },
    ".cm-gutterElement": { padding: "0 9px" },
    ".cm-activeLine": { backgroundColor: "#315bff05" },
    ".cm-activeLineGutter": { color: "#315bff", backgroundColor: "#e8efff" },
    ".cm-cursor, .cm-dropCursor": { borderLeftColor: "#315bff" },
    "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
      backgroundColor: "#dce7ff",
    },
    ".cm-selectionMatch": { backgroundColor: "#dff5ed" },
    ".cm-foldPlaceholder": {
      color: "#315bff",
      backgroundColor: "#edf2ff",
      border: "1px solid #d8e2f7",
      borderRadius: "4px",
    },
    ".cm-panels": { color: "#52627c", backgroundColor: "#f5f8ff" },
    ".cm-searchMatch": {
      backgroundColor: "#ffe9b5",
      outline: "1px solid #f1c96d",
    },
    ".cm-searchMatch-selected": { backgroundColor: "#ffda85" },
    ".cm-matchingBracket": {
      backgroundColor: "#dce7ff",
      outline: "1px solid #a8bfff",
    },
    ".cm-tooltip": {
      backgroundColor: "#fff",
      border: "1px solid #d9e2f1",
      borderRadius: "6px",
    },
    ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
      color: "#244bd4",
      backgroundColor: "#e8efff",
    },
  },
  { dark: false },
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
