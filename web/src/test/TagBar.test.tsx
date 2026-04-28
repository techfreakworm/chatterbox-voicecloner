import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useRef } from "react";
import TagBar from "@/components/TagBar";

function Host({ tags }: { tags: string[] }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  return (
    <>
      <textarea ref={ref} aria-label="text" defaultValue="hello world" />
      <TagBar tags={tags} targetRef={ref} />
    </>
  );
}

describe("TagBar", () => {
  it("inserts tag at cursor position", () => {
    render(<Host tags={["[laugh]"]} />);
    const ta = screen.getByLabelText("text") as HTMLTextAreaElement;
    ta.focus();
    ta.setSelectionRange(5, 5);
    fireEvent.click(screen.getByRole("button", { name: /\[laugh\]/i }));
    expect(ta.value).toBe("hello[laugh] world");
  });

  it("renders nothing when tags is empty", () => {
    const { container } = render(<Host tags={[]} />);
    expect(container.querySelectorAll("button").length).toBe(0);
  });
});
