// Splits long text into overlapping pieces that are small enough to embed
// and to quote back in the chat. Works for Bangla and English: it prefers
// to cut at paragraph breaks, then at sentence ends (". ! ? ।"), then at spaces.

export type ChunkOptions = { size?: number; overlap?: number };

export function normalizeText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Counts letters and digits in any script (Bangla included).
export function meaningfulLength(text: string): number {
  return (text.match(/[\p{L}\p{M}\p{N}]/gu) ?? []).length;
}

function findCut(text: string, start: number, end: number): number {
  const window = text.slice(start, end);
  const minimum = Math.floor((end - start) * 0.5);

  const paragraph = window.lastIndexOf("\n\n");
  if (paragraph >= minimum) return start + paragraph + 2;

  let best = -1;
  const sentence = /[.!?।]["')\]]?\s/g;
  let match: RegExpExecArray | null;
  while ((match = sentence.exec(window)) !== null) {
    if (match.index >= minimum) best = match.index + match[0].length;
  }
  if (best > 0) return start + best;

  const newline = window.lastIndexOf("\n");
  if (newline >= minimum) return start + newline + 1;

  const space = window.lastIndexOf(" ");
  if (space >= minimum) return start + space + 1;

  return end;
}

export function chunkText(input: string, options: ChunkOptions = {}): string[] {
  const size = Math.max(200, options.size ?? 1200);
  const overlap = Math.min(Math.max(0, options.overlap ?? 200), Math.floor(size / 2));
  const text = normalizeText(input);
  if (!text) return [];
  if (text.length <= size) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + size, text.length);
    const cut = end === text.length ? end : findCut(text, start, end);
    const piece = text.slice(start, cut).trim();
    if (piece) chunks.push(piece);
    if (cut >= text.length) break;

    // Step back a little so a sentence cut in half still appears whole once,
    // but always move forward.
    let next = Math.max(cut - overlap, start + 1);
    const space = text.indexOf(" ", next);
    if (space > 0 && space < cut) next = space + 1;
    start = next;
  }
  return chunks;
}
