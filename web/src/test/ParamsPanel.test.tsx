import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ParamsPanel from "@/components/ParamsPanel";
import type { ParamSpec } from "@/lib/api";

const specs: ParamSpec[] = [
  { name: "exaggeration", label: "Exaggeration", type: "float", default: 0.5, min: 0, max: 2, step: 0.05 },
  { name: "is_fast", label: "Fast mode", type: "bool", default: false },
  { name: "lang", label: "Lang", type: "enum", default: "en", choices: ["en", "fr"] },
];

describe("ParamsPanel", () => {
  it("renders one control per spec", () => {
    render(<ParamsPanel specs={specs} values={{}} onChange={() => {}} />);
    expect(screen.getByLabelText(/exaggeration/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/fast mode/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^lang$/i)).toBeInTheDocument();
  });

  it("emits onChange with merged values", () => {
    const onChange = vi.fn();
    render(<ParamsPanel specs={specs} values={{}} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(/exaggeration/i), { target: { value: "1.2" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ exaggeration: 1.2 }));
  });
});

const specsMixed: ParamSpec[] = [
  { name: "temperature", label: "Temperature", type: "float", default: 0.8, min: 0.1, max: 1.5, step: 0.05, group: "basic" },
  { name: "seed", label: "Seed", type: "int", default: -1, min: -1, step: 1, group: "advanced" },
  { name: "top_p", label: "Top p", type: "float", default: 1.0, min: 0, max: 1, step: 0.01, group: "advanced" },
];

describe("ParamsPanel groups", () => {
  it("renders basic params and a closed advanced disclosure by default", () => {
    render(<ParamsPanel specs={specsMixed} values={{}} onChange={() => {}} />);
    expect(screen.getByLabelText(/temperature/i)).toBeInTheDocument();
    // advanced is in the DOM but not visible until <details> opens
    const seed = screen.getByLabelText(/^seed$/i) as HTMLInputElement;
    const detailsAncestor = seed.closest("details");
    expect(detailsAncestor).not.toBeNull();
    expect(detailsAncestor!.open).toBe(false);
  });

  it("opens disclosure on summary click and shows advanced params", () => {
    render(<ParamsPanel specs={specsMixed} values={{}} onChange={() => {}} />);
    const summary = screen.getByText(/advanced/i);
    fireEvent.click(summary);
    const seed = screen.getByLabelText(/^seed$/i) as HTMLInputElement;
    expect(seed.closest("details")!.open).toBe(true);
  });

  it("propagates onChange from advanced params", () => {
    const onChange = vi.fn();
    render(<ParamsPanel specs={specsMixed} values={{}} onChange={onChange} />);
    fireEvent.click(screen.getByText(/advanced/i));
    fireEvent.change(screen.getByLabelText(/^top p$/i), { target: { value: "0.6" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ top_p: 0.6 }));
  });
});

describe("ParamsPanel seed control", () => {
  it("renders an int input plus a randomize button for seed", () => {
    const specs: ParamSpec[] = [
      { name: "seed", label: "Seed", type: "int", default: -1, min: -1, step: 1, group: "advanced" },
    ];
    render(<ParamsPanel specs={specs} values={{}} onChange={() => {}} />);
    fireEvent.click(screen.getByText(/advanced/i));
    expect(screen.getByLabelText(/^seed$/i)).toHaveAttribute("type", "number");
    expect(screen.getByRole("button", { name: /random/i })).toBeInTheDocument();
  });

  it("clicking randomize sets seed to -1 via onChange", () => {
    const specs: ParamSpec[] = [
      { name: "seed", label: "Seed", type: "int", default: -1, min: -1, step: 1, group: "advanced" },
    ];
    const onChange = vi.fn();
    render(<ParamsPanel specs={specs} values={{ seed: 42 }} onChange={onChange} />);
    fireEvent.click(screen.getByText(/advanced/i));
    fireEvent.click(screen.getByRole("button", { name: /random/i }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ seed: -1 }));
  });
});
