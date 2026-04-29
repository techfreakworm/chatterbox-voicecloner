import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import DialogComposer from "@/components/DialogComposer";
import type { ModelInfo } from "@/lib/api";

const models: ModelInfo[] = [
  {
    id: "chatterbox-en",
    label: "Chatterbox (English)",
    description: "",
    languages: [{ code: "en", label: "English" }],
    paralinguistic_tags: [],
    supports_voice_clone: true,
    params: [
      { name: "temperature", label: "Temperature", type: "float", default: 0.8, min: 0.1, max: 1.5, step: 0.05, group: "basic" },
    ],
  },
  {
    id: "chatterbox-mtl",
    label: "Chatterbox Multilingual",
    description: "",
    languages: [
      { code: "en", label: "English" },
      { code: "fr", label: "French" },
    ],
    paralinguistic_tags: [],
    supports_voice_clone: true,
    params: [
      { name: "exaggeration", label: "Exaggeration", type: "float", default: 0.5, min: 0, max: 2, step: 0.05, group: "basic" },
    ],
  },
];

describe("DialogComposer", () => {
  it("starts with two speaker slots A and B", () => {
    render(
      <DialogComposer
        models={models}
        engineId="chatterbox-en"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    expect(screen.getByLabelText(/speaker a voice/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/speaker b voice/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/speaker c voice/i)).toBeNull();
  });

  it("adds speaker C when + add speaker is clicked", () => {
    render(
      <DialogComposer
        models={models}
        engineId="chatterbox-en"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add speaker/i }));
    expect(screen.getByLabelText(/speaker c voice/i)).toBeInTheDocument();
  });

  it("does not allow more than 4 speakers", () => {
    render(
      <DialogComposer
        models={models}
        engineId="chatterbox-en"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /add speaker/i })); // C
    fireEvent.click(screen.getByRole("button", { name: /add speaker/i })); // D
    expect(screen.queryByRole("button", { name: /add speaker/i })).toBeNull();
  });

  it("renders the language picker only when mtl engine is active", () => {
    const { rerender } = render(
      <DialogComposer
        models={models}
        engineId="chatterbox-en"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    expect(screen.queryByLabelText(/^language$/i)).toBeNull();

    rerender(
      <DialogComposer
        models={models}
        engineId="chatterbox-mtl"
        onEngineChange={() => {}}
        onSubmit={() => {}}
        loadingModel={false}
        busy={false}
      />,
    );
    expect(screen.getByLabelText(/^language$/i)).toBeInTheDocument();
  });
});
