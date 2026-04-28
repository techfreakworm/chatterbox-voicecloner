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
