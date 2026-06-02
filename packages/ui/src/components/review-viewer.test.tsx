import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

import { ReviewViewerSurface } from "./review-viewer";

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children }: { children: React.ReactNode }) => <div data-testid="three-canvas">{children}</div>,
  useThree: () => ({
    gl: { dispose: vi.fn(), forceContextLoss: vi.fn() },
    scene: { clear: vi.fn() },
  }),
}));

vi.mock("@react-three/drei", () => ({
  Center: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  OrbitControls: () => <div data-testid="orbit-controls" />,
  useGLTF: () => ({
    scene: {
      clone: () => ({
        traverse: vi.fn(),
      }),
    },
  }),
}));

test("review viewer supports compact modal layout without page-level main sizing", () => {
  render(<ReviewViewerSurface modelUrl="/asset.glb" surface="modal" modelLabel="Shield" />);

  expect(screen.getByTestId("review-viewer-surface")).toHaveClass("h-full");
  expect(screen.getByTestId("review-viewer-canvas-shell")).toHaveClass("min-h-0");
  expect(screen.getByText((_, element) => element?.textContent === "Asset: Shield")).toBeInTheDocument();
});
