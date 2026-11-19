import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  cleanName,
  formatBytes,
  getExtension,
  isUuid,
  makeStoragePath,
  validateUpload,
} from "./documents";

describe("getExtension", () => {
  it("returns the lowercase extension", () => {
    expect(getExtension("NID.PDF")).toBe("pdf");
    expect(getExtension("a.b.docx")).toBe("docx");
  });
  it("returns empty string when there is none", () => {
    expect(getExtension("readme")).toBe("");
    expect(getExtension("trailingdot.")).toBe("");
  });
});

describe("validateUpload", () => {
  it("accepts a normal PDF", () => {
    expect(validateUpload({ name: "nid.pdf", size: 1000 })).toBeNull();
  });
  it("accepts Bangla file names", () => {
    expect(validateUpload({ name: "জাতীয়পরিচয়পত্র.jpg", size: 1000 })).toBeNull();
  });
  it("rejects unsupported types", () => {
    expect(validateUpload({ name: "virus.exe", size: 1000 })).not.toBeNull();
  });
  it("rejects empty and oversized files", () => {
    expect(validateUpload({ name: "a.pdf", size: 0 })).not.toBeNull();
    expect(
      validateUpload({ name: "a.pdf", size: MAX_UPLOAD_BYTES + 1 }),
    ).not.toBeNull();
    expect(validateUpload({ name: "a.pdf", size: MAX_UPLOAD_BYTES })).toBeNull();
  });
});

describe("makeStoragePath", () => {
  it("keeps files inside the user's own folder and drops the original name", () => {
    const path = makeStoragePath("user-1", "doc-1", "জাতীয় পরিচয়.PDF");
    expect(path).toBe("user-1/doc-1.pdf");
  });
  it("strips unsafe extension characters", () => {
    expect(makeStoragePath("u", "d", "x.p/df")).not.toContain("..");
  });
});

describe("cleanName", () => {
  it("trims and accepts normal names", () => {
    expect(cleanName("  Bills 2026  ")).toBe("Bills 2026");
  });
  it("rejects empty names, slashes and very long names", () => {
    expect(cleanName("   ")).toBeNull();
    expect(cleanName("a/b")).toBeNull();
    expect(cleanName("a\\b")).toBeNull();
    expect(cleanName("x".repeat(256))).toBeNull();
    expect(cleanName(undefined)).toBeNull();
  });
});

describe("isUuid", () => {
  it("validates ids", () => {
    expect(isUuid("3f2b8c1e-5d4a-4b7e-9a1c-2d3e4f5a6b7c")).toBe(true);
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats sizes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(null)).toBe("");
  });
});
