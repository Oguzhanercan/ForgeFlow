import { render, screen } from "@testing-library/react";

import { ModelsDashboard } from "./models-dashboard";


test("models dashboard shows local and api providers", () => {
  render(
    <ModelsDashboard
      providers={[
        {
          id: "p1",
          label: "NVIDIA / black-forest-labs/flux.2-klein-4b",
          sourceKind: "api_generic",
          status: "active",
          capabilities: ["image_generation", "image_editing"]
        },
        {
          id: "p2",
          label: "NVIDIA / moonshotai/kimi-k2.5",
          sourceKind: "api_generic",
          status: "active",
          capabilities: ["planner_text", "text_chat", "vision_review"]
        }
      ]}
    />
  );

  expect(screen.getByText("Model Foundry")).toBeInTheDocument();
  expect(screen.getByText("NVIDIA / black-forest-labs/flux.2-klein-4b")).toBeInTheDocument();
  expect(screen.getAllByText("api_generic")).not.toHaveLength(0);
});
