export type EditorPreferences = {
  fontSize: 12 | 14 | 16 | 18;
  tabSize: 2 | 4;
  wordWrap: boolean;
};

export const editorPreferencesKey = "canopy.editorPreferences";
export const defaultEditorPreferences: EditorPreferences = {
  fontSize: 14,
  tabSize: 2,
  wordWrap: false,
};

export function readEditorPreferences(): EditorPreferences {
  try {
    const saved: unknown = JSON.parse(
      localStorage.getItem(editorPreferencesKey) ?? "null",
    );
    if (!saved || typeof saved !== "object")
      return { ...defaultEditorPreferences };
    const value = saved as Record<string, unknown>;
    return {
      fontSize: [12, 14, 16, 18].includes(Number(value.fontSize))
        ? (Number(value.fontSize) as EditorPreferences["fontSize"])
        : defaultEditorPreferences.fontSize,
      tabSize: value.tabSize === 4 ? 4 : 2,
      wordWrap: value.wordWrap === true,
    };
  } catch {
    return { ...defaultEditorPreferences };
  }
}

export function writeEditorPreferences(preferences: EditorPreferences) {
  try {
    localStorage.setItem(editorPreferencesKey, JSON.stringify(preferences));
  } catch {
    // Storage may be unavailable in a private or restricted browser session.
    // The current editor still uses the selected preferences in memory.
  }
}
