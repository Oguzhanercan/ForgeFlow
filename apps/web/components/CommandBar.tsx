"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Paperclip, Send, ChevronDown, Sparkles, Pencil, Scissors, Box, ZoomIn, GitBranch } from "lucide-react";
import { useForgeFlowUiStore } from "../lib/store";
import { buildModelMetadata, filterModelsForMode, type ModelOption } from "../lib/model-registry";
import type { CanvasNode, CommandModelSelection, ComposerMode } from "./types";

const modes: { id: ComposerMode; label: string; icon: React.ComponentType<{ className?: string }>; shortcut: string }[] = [
  { id: "text_to_image", label: "Text to Image", icon: Sparkles, shortcut: "T" },
  { id: "image_edit", label: "Image Edit", icon: Pencil, shortcut: "E" },
  { id: "background_removal", label: "Background Removal", icon: Scissors, shortcut: "B" },
  { id: "image_to_3d", label: "Image to 3D", icon: Box, shortcut: "3" },
  { id: "upscale", label: "Upscale", icon: ZoomIn, shortcut: "U" },
  { id: "workflow", label: "Workflow", icon: GitBranch, shortcut: "W" },
];

type CommandBarProps = {
  disabled?: boolean;
  isSubmitting?: boolean;
  modelOptions?: ModelOption[];
  selectedNode?: CanvasNode | null;
  onSubmitPrompt?: (prompt: string, mode: ComposerMode, modelSelection: CommandModelSelection) => void;
};

export function CommandBar({ disabled = false, isSubmitting = false, modelOptions = [], selectedNode = null, onSubmitPrompt }: CommandBarProps) {
  const commandMode = useForgeFlowUiStore((s) => s.commandMode);
  const setCommandMode = useForgeFlowUiStore((s) => s.setCommandMode);
  const commandModel = useForgeFlowUiStore((s) => s.commandModel);
  const setCommandModel = useForgeFlowUiStore((s) => s.setCommandModel);
  const selectedNodeId = useForgeFlowUiStore((s) => s.selectedNodeId);

  const [modeOpen, setModeOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");

  const currentMode = modes.find((m) => m.id === commandMode) ?? modes[5];
  const ModeIcon = currentMode.icon;
  const filteredModels = filterModelsForMode(modelOptions, commandMode);
  const selectedModel = filteredModels.find((model) => model.id === commandModel) ?? filteredModels[0] ?? null;
  const placeholder = selectedNodeId
    ? commandMode === "image_to_3d"
      ? "Modify selected 3D asset..."
      : "Edit selected image..."
    : "Describe what you want to create...";

  const submit = () => {
    const value = inputValue.trim();
    if (!value || disabled) return;
    onSubmitPrompt?.(value, commandMode, buildModelMetadata(selectedModel, commandMode));
    setInputValue("");
  };

  return (
    <div className="sticky bottom-0 z-20 border-t border-white/[0.04] bg-[#0c0c0d]/95 backdrop-blur-xl">
      <div className="flex items-center gap-2 px-3 py-2">
        {selectedNodeId && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-[10px] bg-white/[0.04] px-3 py-1.5 text-[11px] text-[#859399]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#00d1ff]" />
            {selectedNode ? `${selectedNode.title} · reference` : "Selected asset"}
          </motion.div>
        )}

        <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-[#5a6368] transition hover:bg-white/[0.06] hover:text-[#a4e6ff]">
          <Paperclip className="h-4 w-4" />
        </button>

        <div className="relative flex-1">
          <input
            type="text"
            placeholder={placeholder}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
              e.preventDefault();
              submit();
            }}
            className="h-9 w-full rounded-[10px] bg-white/[0.04] px-3 text-[13px] text-[#d2d0ce] placeholder-[#5a6368] outline-none transition focus:bg-white/[0.06] focus:ring-1 focus:ring-[#00d1ff]/30"
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setModeOpen(!modeOpen)}
            className="flex h-9 items-center gap-1.5 rounded-[10px] bg-white/[0.04] px-3 text-[11px] text-[#a4e6ff] transition hover:bg-white/[0.08]"
          >
            <ModeIcon className="h-3.5 w-3.5 text-[#00d1ff]" />
            <span className="hidden sm:inline">{currentMode.label}</span>
            <ChevronDown className="h-3 w-3 text-[#5a6368]" />
          </button>

          <AnimatePresence>
            {modeOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setModeOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.97 }}
                  className="absolute bottom-full right-0 z-20 mb-2 w-56 rounded-[14px] border border-white/[0.06] bg-[#161718] p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                >
                  {modes.map((mode) => {
                    const Icon = mode.icon;
                    const active = mode.id === commandMode;
                    return (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setCommandMode(mode.id);
                          setModeOpen(false);
                        }}
                        className={[
                          "flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[12px] transition",
                          active
                            ? "bg-[#0d2932] text-[#a4e6ff]"
                            : "text-[#859399] hover:bg-white/[0.04] hover:text-[#d2d0ce]",
                        ].join(" ")}
                      >
                        <Icon className={active ? "h-3.5 w-3.5 text-[#00d1ff]" : "h-3.5 w-3.5"} />
                        <span className="flex-1">{mode.label}</span>
                        <kbd className="rounded-[6px] bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-medium text-[#5a6368]">
                          {mode.shortcut}
                        </kbd>
                      </button>
                    );
                  })}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="relative">
          <button
            onClick={() => setModelOpen(!modelOpen)}
            className="flex h-9 items-center gap-1 rounded-[10px] bg-white/[0.04] px-2.5 text-[11px] text-[#859399] transition hover:bg-white/[0.08] hover:text-[#a4e6ff]"
          >
            <span className="hidden max-w-[142px] truncate md:inline">{selectedModel?.label ?? "No model"}</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          <AnimatePresence>
            {modelOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setModelOpen(false)} />
                <motion.div
                  initial={{ opacity: 0, y: 4, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 4, scale: 0.97 }}
                  className="absolute bottom-full right-0 z-20 mb-2 max-h-[360px] w-80 overflow-y-auto rounded-[14px] border border-white/[0.06] bg-[#161718] p-1.5 shadow-[0_24px_80px_rgba(0,0,0,0.55)] backdrop-blur-xl"
                >
                  {filteredModels.length === 0 ? (
                    <div className="px-3 py-2 text-[12px] text-[#859399]">No registered model for {currentMode.label}</div>
                  ) : null}
                  {filteredModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => {
                        setCommandModel(model.id);
                        setModelOpen(false);
                      }}
                      className={[
                        "flex w-full flex-col rounded-[10px] px-3 py-2 text-left text-[12px] transition",
                        model.id === selectedModel?.id
                          ? "bg-[#0d2932] text-[#a4e6ff]"
                          : "text-[#859399] hover:bg-white/[0.04] hover:text-[#d2d0ce]",
                      ].join(" ")}
                    >
                      <span className="w-full truncate font-semibold">{model.label}</span>
                      <span className="mt-0.5 w-full truncate text-[10px] text-[#5a6368]">
                        {model.origin} · {model.sourceKind} · {model.normalizedId}
                      </span>
                    </button>
                  ))}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <button
          disabled={disabled || !inputValue.trim()}
          onClick={submit}
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-[#00d1ff] text-[#0a0f11] transition hover:bg-[#00bce8] disabled:opacity-45"
        >
          {isSubmitting && <span className="absolute inset-1 rounded-[8px] border border-[#0a0f11]/30 border-t-transparent animate-spin" />}
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
