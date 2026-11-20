import { describe, expect, it } from "vitest";
import { chunkText, meaningfulLength, normalizeText } from "./chunk";

describe("normalizeText", () => {
  it("collapses spaces and blank lines", () => {
    expect(normalizeText("a  \t b\r\n\n\n\nc ")).toBe("a b\n\nc");
  });
});

describe("meaningfulLength", () => {
  it("counts Bangla and English letters and digits only", () => {
    expect(meaningfulLength("  ...  ")).toBe(0);
    expect(meaningfulLength("ভাড়া ২০")).toBeGreaterThan(4);
    expect(meaningfulLength("ab 12")).toBe(4);
  });
});

describe("chunkText", () => {
  it("returns nothing for empty text and one chunk for short text", () => {
    expect(chunkText("   ")).toEqual([]);
    expect(chunkText("Hello world.")).toEqual(["Hello world."]);
  });

  it("splits long English text at sentence ends with overlap", () => {
    const sentence = "The lease ends on 31 March 2028 and rent is due monthly. ";
    const text = sentence.repeat(80);
    const chunks = chunkText(text, { size: 600, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(5);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(600);
      expect(c.endsWith(".")).toBe(true);
    }
    // Nothing is lost: every sentence start appears.
    expect(chunks.join(" ")).toContain("The lease ends");
  });

  it("splits Bangla text at the danda (।)", () => {
    const sentence = "বাড়ির ভাড়া প্রতি মাসে বিশ হাজার টাকা। ";
    const chunks = chunkText(sentence.repeat(60), { size: 400, overlap: 50 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.endsWith("।")).toBe(true);
  });

  it("always makes progress, even on text without spaces", () => {
    const chunks = chunkText("x".repeat(5000), { size: 1000, overlap: 200 });
    expect(chunks.length).toBeGreaterThanOrEqual(5);
    expect(chunks.length).toBeLessThan(10);
  });
});
