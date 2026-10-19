import path from "node:path";
import { readText, listFiles, checkedPath, redact } from "./security";
import type { Workspace } from "./schema";

export interface Hit {
  path: string;
  line: number;
  content: string;
  score: number;
}
export async function searchRepository(
  workspace: Workspace,
  folders: string[],
  query: string,
  dataDir: string,
  limit = 8,
  signal?: AbortSignal,
): Promise<Hit[]> {
  const terms = [
    ...new Set(query.toLowerCase().match(/[\p{L}\p{N}_./-]{2,}/gu) ?? []),
  ].slice(0, 24);
  if (!terms.length) return [];
  const files = [
    ...new Set(
      (
        await Promise.all(
          folders.map((f) => listFiles(workspace, f, dataDir, 1500)),
        )
      ).flat(),
    ),
  ];
  const hits: Hit[] = [];
  // A bounded, fresh lexical scan avoids stale index entries and never searches disabled folders.
  for (const filename of files.slice(0, 2000)) {
    signal?.throwIfAborted();
    let text: string;
    try {
      text = await readText(
        await checkedPath(workspace, filename, { dataDir }),
        160_000,
      );
    } catch {
      continue;
    }
    const lines = text.split("\n");
    const pathScore = terms.reduce(
      (n, t) => n + (filename.toLowerCase().includes(t) ? 2 : 0),
      0,
    );
    for (let i = 0; i < lines.length; i += 18) {
      const excerpt = lines.slice(Math.max(0, i - 2), i + 22).join("\n");
      const lower = excerpt.toLowerCase();
      const score = terms.reduce(
        (n, t) => n + (lower.includes(t) ? 1 : 0),
        pathScore,
      );
      if (score > 0)
        hits.push({
          path: filename,
          line: Math.max(0, i - 2) + 1,
          content: redact(excerpt).slice(0, 6000),
          score,
        });
    }
    if (hits.length > 400) {
      hits.sort((a, b) => b.score - a.score);
      hits.splice(80);
    }
  }
  return hits
    .sort(
      (a, b) =>
        b.score - a.score || a.path.localeCompare(b.path) || a.line - b.line,
    )
    .slice(0, limit);
}
