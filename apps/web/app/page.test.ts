import { test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("home page is wired to the commercial workspace layout", () => {
  const source = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
  expect(source).toContain('import { WorkspaceLayout } from "../components/WorkspaceLayout"');
  expect(source).toContain("return <WorkspaceLayout />");
  expect(source).not.toContain("HomeClient");
});
