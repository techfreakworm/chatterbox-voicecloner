import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import MadeBy from "@/components/MadeBy";

describe("MadeBy", () => {
  it("renders an anchor to mayankgupta.in opening in a new tab", () => {
    render(<MadeBy />);
    const link = screen.getByRole("link", { name: /made by/i });
    expect(link).toHaveAttribute("href", "https://mayankgupta.in");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link.textContent).toMatch(/techfreakworm/);
  });

  it("includes the heart and the year", () => {
    render(<MadeBy />);
    const link = screen.getByRole("link", { name: /made by/i });
    expect(link.textContent).toMatch(/♥/);
    expect(link.textContent).toMatch(/2026/);
  });
});
