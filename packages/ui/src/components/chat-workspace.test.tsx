import { render, screen } from "@testing-library/react";

import { ChatWorkspace } from "./chat-workspace";


test("chat workspace renders review chips and result cards", () => {
  render(
    <ChatWorkspace
      sessionTitle="Sci-Fi Character Pack"
      runStatus="awaiting_review_mode"
      messages={[
        { id: "m1", role: "user", type: "user", content: "Generate two shield concepts." },
        {
          id: "m2",
          role: "assistant",
          type: "pipeline_plan",
          content: "Plan ready.",
          planSummary: "Image -> Review -> 3D"
        }
      ]}
      reviewOptions={["manual", "automatic_vlm", "hybrid"]}
      imageGroups={[
        {
          title: "Shield Variants",
          items: [
            { id: "a1", title: "Variant A", status: "generated" },
            { id: "a2", title: "Variant B", status: "generated" }
          ]
        }
      ]}
      modelSummary={{
        planner: "moonshotai/kimi-k2.5",
        image: "black-forest-labs/flux.2-klein-4b",
        object3d: "microsoft/trellis",
      }}
    />
  );

  expect(screen.getByText("Sci-Fi Character Pack")).toBeInTheDocument();
  expect(screen.getByText("automatic_vlm")).toBeInTheDocument();
  expect(screen.getAllByText("Shield Variants")).toHaveLength(2);
  expect(screen.getAllByText(/flux\.2-klein-4b/i)).not.toHaveLength(0);
});
