"use client";

import { create } from "zustand";
import type { ComposerMode, RunStatus, SidebarPanel, SidebarTab } from "../components/types";

type ForgeFlowUiState = {
  selectedAssetId: string | null;
  activeSessionId: string | null;
  composerReferenceAssetId: string | null;

  selectedNodeId: string | null;
  activePanel: SidebarPanel;
  activeSidebarTab: SidebarTab;
  sidebarCollapsed: boolean;
  inspectorCollapsed: boolean;
  commandMode: ComposerMode;
  commandModel: string;
  runStatus: RunStatus;
  credits: number;
  projectName: string;

  setSelectedAssetId: (assetId: string | null) => void;
  setActiveSessionId: (sessionId: string | null) => void;
  setComposerReferenceAssetId: (assetId: string | null) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setActivePanel: (panel: SidebarPanel) => void;
  setActiveSidebarTab: (tab: SidebarTab) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setInspectorCollapsed: (collapsed: boolean) => void;
  setCommandMode: (mode: ComposerMode) => void;
  setCommandModel: (model: string) => void;
  setRunStatus: (status: RunStatus) => void;
  setCredits: (credits: number) => void;
  setProjectName: (name: string) => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
};

export const useForgeFlowUiStore = create<ForgeFlowUiState>((set) => ({
  selectedAssetId: null,
  activeSessionId: null,
  composerReferenceAssetId: null,

  selectedNodeId: null,
  activePanel: "chat",
  activeSidebarTab: "recent",
  sidebarCollapsed: false,
  inspectorCollapsed: false,
  commandMode: "workflow",
  commandModel: "catalog_flux2_klein_4b",
  runStatus: "idle",
  credits: 1240,
  projectName: "Untitled Workflow",

  setSelectedAssetId: (selectedAssetId) => set({ selectedAssetId }),
  setActiveSessionId: (activeSessionId) => set({ activeSessionId }),
  setComposerReferenceAssetId: (composerReferenceAssetId) => set({ composerReferenceAssetId }),
  setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
  setActivePanel: (activePanel) => set({ activePanel }),
  setActiveSidebarTab: (activeSidebarTab) => set({ activeSidebarTab }),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setInspectorCollapsed: (inspectorCollapsed) => set({ inspectorCollapsed }),
  setCommandMode: (commandMode) => set({ commandMode }),
  setCommandModel: (commandModel) => set({ commandModel }),
  setRunStatus: (runStatus) => set({ runStatus }),
  setCredits: (credits) => set({ credits }),
  setProjectName: (projectName) => set({ projectName }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  toggleInspector: () => set((s) => ({ inspectorCollapsed: !s.inspectorCollapsed })),
}));
