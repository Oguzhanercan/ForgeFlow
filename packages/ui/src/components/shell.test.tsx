import { fireEvent, render, screen } from "@testing-library/react";

import { AppShell } from "./shell";

test("app shell opens mobile navigation drawer", () => {
  render(
    <AppShell activeNav="Chat" title="ForgeFlow" subtitle="Chat Workspace" statusPill="idle">
      <main>Workspace</main>
    </AppShell>
  );

  expect(screen.getByText("Workspace")).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: /toggle navigation/i }));

  expect(screen.getByText("Navigation")).toBeInTheDocument();
  expect(screen.getAllByText("Projects").length).toBeGreaterThan(0);
});
