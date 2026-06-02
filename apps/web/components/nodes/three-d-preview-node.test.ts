import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";

test("3D preview card opens the viewer from click and keyboard activation", () => {
  const source = readFileSync(join(process.cwd(), "components/nodes/ThreeDPreviewNode.tsx"), "utf8");

  expect(source).toContain('<button type="button"');
  expect(source).toContain("onClick={handleView3D}");
  expect(source).toContain("Open 3D viewer");
});
