import { describe, expect, it } from "vitest";
import { mapFirstRow, mapRows } from "../src/mapper/mapper.js";

describe("mapper", () => {
  it("mapRows passes rows through unchanged", () => {
    const rows = [{ id: 1 }, { id: 2 }];
    expect(mapRows(rows)).toBe(rows);
  });

  it("mapFirstRow returns the first row when present", () => {
    expect(mapFirstRow([{ id: 1 }, { id: 2 }])).toEqual({ id: 1 });
  });

  it("mapFirstRow returns null for an empty result set", () => {
    expect(mapFirstRow([])).toBeNull();
  });
});
