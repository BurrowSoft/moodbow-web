import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import messages from "@/messages/en.json";
import { TagsField } from "./TagsField";

const t = messages.today;
function Harness({ start = [], recent = [] }: { start?: string[]; recent?: string[] }) {
  const [tags, setTags] = useState(start);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TagsField tags={tags} recent={recent} onChange={setTags} />
      <output data-testid="value">{JSON.stringify(tags)}</output>
    </NextIntlClientProvider>
  );
}
const value = () => JSON.parse(screen.getByTestId("value").textContent!);
const input = () => screen.getByTestId("checkin-tags-input");
afterEach(cleanup);

describe("TagsField", () => {
  it("labelled; Enter or a comma adds a tag, tidied; Enter never sends the form", () => {
    render(<Harness />);
    expect(screen.getByLabelText(t.tagsLabel)).toBe(input());
    fireEvent.change(input(), { target: { value: "  long   walk " } });
    const enter = fireEvent.keyDown(input(), { key: "Enter" });
    expect(enter).toBe(false); // default prevented
    fireEvent.change(input(), { target: { value: "Rain," } });
    expect(value()).toEqual(["long walk", "Rain"]);
    expect(input()).toHaveValue("");
  });
  it("each chip has its own remove button, named by the tag", () => {
    render(<Harness start={["Walk", "Rain"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Walk" }));
    expect(value()).toEqual(["Rain"]);
  });
  it("up to 5 a day, each up to 32 characters, said in the field's own line", () => {
    render(<Harness start={["a", "b", "c", "d", "e"]} />);
    fireEvent.change(input(), { target: { value: "f" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByTestId("checkin-tags-problem")).toHaveTextContent(t.tagsTooMany);
    expect(value()).toHaveLength(5);
    cleanup();
    render(<Harness />);
    fireEvent.change(input(), { target: { value: "x".repeat(33) } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(screen.getByTestId("checkin-tags-problem")).toHaveTextContent(t.tagsTooLong);
    expect(input()).toHaveAccessibleDescription(t.tagsTooLong);
  });
  it("a repeat in another case isn't added, quietly", () => {
    render(<Harness start={["Walk"]} />);
    fireEvent.change(input(), { target: { value: "walk" } });
    fireEvent.keyDown(input(), { key: "Enter" });
    expect(value()).toEqual(["Walk"]);
    expect(screen.queryByTestId("checkin-tags-problem")).toBeNull();
  });
  it("Your tags: the recent ones not on the day yet, one tap adds", () => {
    render(<Harness start={["Walk"]} recent={["walk", "Friends", "Tea"]} />);
    const recent = screen.getByTestId("checkin-tags-recent");
    expect(recent).not.toHaveTextContent("walk");
    fireEvent.click(screen.getByRole("button", { name: "Friends" }));
    expect(value()).toEqual(["Walk", "Friends"]);
  });
});
