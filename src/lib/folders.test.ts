import { describe, expect, it } from "vitest";
import { buildBreadcrumbs, folderOptions, type FolderNode } from "./folders";

const folders: FolderNode[] = [
  { id: "a", name: "Work", parent_id: null },
  { id: "b", name: "Bills", parent_id: "a" },
  { id: "c", name: "2026", parent_id: "b" },
  { id: "d", name: "Personal", parent_id: null },
];

describe("buildBreadcrumbs", () => {
  it("returns the path from top to current", () => {
    expect(buildBreadcrumbs(folders, "c").map((f) => f.name)).toEqual([
      "Work",
      "Bills",
      "2026",
    ]);
  });
  it("returns an empty path for root or unknown ids", () => {
    expect(buildBreadcrumbs(folders, null)).toEqual([]);
    expect(buildBreadcrumbs(folders, "zzz")).toEqual([]);
  });
  it("does not loop forever on bad data", () => {
    const loop: FolderNode[] = [
      { id: "x", name: "X", parent_id: "y" },
      { id: "y", name: "Y", parent_id: "x" },
    ];
    expect(buildBreadcrumbs(loop, "x").length).toBeLessThanOrEqual(2);
  });
});

describe("folderOptions", () => {
  it("builds readable sorted labels", () => {
    expect(folderOptions(folders).map((o) => o.label)).toEqual([
      "Personal",
      "Work",
      "Work / Bills",
      "Work / Bills / 2026",
    ]);
  });
});
