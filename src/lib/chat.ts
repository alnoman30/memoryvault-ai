// Pure helpers for the chat assistant (no network, easy to test).

export type ChatSource = {
  n: number;
  document_id: string;
  name: string;
  page: number | null;
  excerpt: string;
};

export type RetrievedChunk = {
  document_id: string;
  document_name: string;
  page: number | null;
  content: string;
};

export type DocSummary = { name: string; summary: string | null; page_count: number | null };

export const MAX_MESSAGE_CHARS = 4000;

export const SYSTEM_PROMPT = `You are MemoryVault, a private assistant that helps one person find information in their own documents.

Language:
- Reply in the language of the user's latest message. Bangla question -> Bangla answer. English question -> English answer. Mixed (Banglish) -> Bangla written in Bangla script, unless they clearly prefer English.

Facts:
- For anything about the user's documents, use ONLY the numbered excerpts provided. Never invent dates, amounts, names or numbers.
- After every sentence that uses an excerpt, cite it like [1] or [2][3]. Use only numbers that exist.
- If the excerpts do not contain the answer, say so plainly and suggest which kind of document to upload or what to ask instead.
- Quote numbers (ID numbers, amounts, dates) exactly as they appear.
- You may use the document list to answer questions such as "what files do I have".
- General questions that are not about the documents can be answered normally, without citations.

Style: short, clear, friendly. Use a short list only when it helps.`;

// Turns the retrieved chunks into numbered sources. Neighbouring chunks of the
// same page are merged so one page is one citation.
export function toSources(chunks: RetrievedChunk[], maxSources = 8): ChatSource[] {
  const sources: ChatSource[] = [];
  for (const chunk of chunks) {
    const existing = sources.find(
      (s) => s.document_id === chunk.document_id && s.page === chunk.page,
    );
    if (existing) {
      if (existing.excerpt.length < 4000) existing.excerpt += `\n…\n${chunk.content}`;
      continue;
    }
    if (sources.length >= maxSources) continue;
    sources.push({
      n: sources.length + 1,
      document_id: chunk.document_id,
      name: chunk.document_name,
      page: chunk.page,
      excerpt: chunk.content,
    });
  }
  return sources;
}

export function sourceLabel(s: Pick<ChatSource, "name" | "page">): string {
  return s.page ? `${s.name} · p. ${s.page}` : s.name;
}

export function buildContextBlock(sources: ChatSource[], documents: DocSummary[]): string {
  const list = documents.length
    ? documents
        .slice(0, 80)
        .map((d) => {
          const pages = d.page_count ? ` (${d.page_count} p.)` : "";
          const about = d.summary ? ` - ${d.summary.slice(0, 220)}` : "";
          return `- ${d.name}${pages}${about}`;
        })
        .join("\n")
    : "(the vault is empty)";

  const excerpts = sources.length
    ? sources.map((s) => `[${s.n}] ${sourceLabel(s)}\n${s.excerpt}`).join("\n\n")
    : "(no matching excerpts were found)";

  return `DOCUMENT LIST (${documents.length} files):\n${list}\n\nEXCERPTS:\n${excerpts}`;
}

// Which numbered sources did the answer actually cite?
export function citedSources(answer: string, sources: ChatSource[]): ChatSource[] {
  const used = new Set<number>();
  for (const match of answer.matchAll(/\[(\d{1,2})\]/g)) used.add(Number(match[1]));
  return sources.filter((s) => used.has(s.n));
}

export function titleFrom(message: string): string {
  const clean = message.replace(/\s+/g, " ").trim();
  if (!clean) return "New chat";
  return clean.length > 60 ? `${clean.slice(0, 57).trimEnd()}…` : clean;
}

// The search query: short follow-ups ("and the rent?") borrow the previous
// question so the search still knows what the conversation is about.
export function searchQuery(message: string, previousUserMessage: string | null): string {
  const words = message.trim().split(/\s+/).length;
  if (previousUserMessage && words < 6) return `${previousUserMessage}\n${message}`;
  return message;
}

const STOP_WORDS = new Set(
  "a an and are as at be by can do does for from has have how i in is it me my of on or our the to was what when where which who why will with you your আমার আমি কি কী কবে কোথায় কত কে এর এই ও এবং তে টা টি আছে হবে".split(" "),
);

// Keyword part of the hybrid search: any of the meaningful words may match
// (websearch syntax "a or b or c"); more matches rank higher.
export function keywordQuery(text: string): string {
  const words = (text.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? []).filter(
    (w) => w.length > 1 && !STOP_WORDS.has(w),
  );
  return [...new Set(words)].slice(0, 16).join(" or ");
}
