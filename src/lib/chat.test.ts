import { describe, expect, it } from "vitest";
import {
  buildContextBlock,
  citedSources,
  keywordQuery,
  searchQuery,
  sourceLabel,
  titleFrom,
  toSources,
} from "./chat";

const chunks = [
  { document_id: "d1", document_name: "lease.pdf", page: 4, content: "Ends 31 March 2028." },
  { document_id: "d1", document_name: "lease.pdf", page: 4, content: "Rent 20,000 BDT." },
  { document_id: "d2", document_name: "nid.jpg", page: 1, content: "নাম: রহিম" },
  { document_id: "d3", document_name: "notes.txt", page: null, content: "Buy milk" },
];

describe("toSources", () => {
  it("numbers sources and merges chunks of the same page", () => {
    const s = toSources(chunks);
    expect(s.map((x) => x.n)).toEqual([1, 2, 3]);
    expect(s[0].excerpt).toContain("Rent 20,000");
  });
  it("respects the maximum", () => {
    expect(toSources(chunks, 2)).toHaveLength(2);
  });
});

describe("citations", () => {
  it("keeps only cited sources", () => {
    const s = toSources(chunks);
    expect(citedSources("It ends in 2028 [1]. Name is Rahim [3][9].", s).map((x) => x.n)).toEqual([1, 3]);
    expect(citedSources("No idea.", s)).toEqual([]);
  });
  it("labels with page numbers when there are pages", () => {
    expect(sourceLabel({ name: "a.pdf", page: 2 })).toBe("a.pdf · p. 2");
    expect(sourceLabel({ name: "a.txt", page: null })).toBe("a.txt");
  });
});

describe("prompt context", () => {
  it("contains the document list and numbered excerpts", () => {
    const block = buildContextBlock(toSources(chunks), [
      { name: "lease.pdf", summary: "A rental agreement.", page_count: 12 },
    ]);
    expect(block).toContain("lease.pdf (12 p.) - A rental agreement.");
    expect(block).toContain("[1] lease.pdf · p. 4");
  });
  it("says when nothing matched", () => {
    expect(buildContextBlock([], [])).toContain("no matching excerpts");
  });
});

describe("titles and search queries", () => {
  it("makes short titles", () => {
    expect(titleFrom("  When does   my lease end? ")).toBe("When does my lease end?");
    expect(titleFrom("x".repeat(100)).length).toBeLessThanOrEqual(60);
  });
  it("adds the previous question to short follow-ups", () => {
    expect(searchQuery("and the rent?", "When does my lease end?")).toContain("lease");
    expect(searchQuery("What is written on page two of my passport scan?", "x")).not.toContain("x\n");
  });
});

describe("keywordQuery", () => {
  it("joins meaningful words with or", () => {
    expect(keywordQuery("When does my lease end?")).toBe("lease or end");
    expect(keywordQuery("আমার ভাড়া কত?")).toBe("ভাড়া");
    expect(keywordQuery("?? !!")).toBe("");
  });
});
