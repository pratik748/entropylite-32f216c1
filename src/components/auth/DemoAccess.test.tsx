import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DemoAccess from "./DemoAccess";
import { DemoProvider } from "@/demo/DemoProvider";

const jsonResponse = (body: unknown, status = 200) =>
  ({ ok: status >= 200 && status < 300, status, json: async () => body }) as unknown as Response;

function setup() {
  return render(
    <DemoProvider>
      <DemoAccess />
    </DemoProvider>
  );
}

describe("DemoAccess", () => {
  beforeEach(() => {
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("reveals four numeric cells with a mobile numeric keyboard", async () => {
    setup();
    await userEvent.click(screen.getByText("Explore Demo"));
    const first = screen.getByTestId("demo-code-0");
    expect(screen.getByTestId("demo-code-3")).toBeTruthy();
    expect(first.getAttribute("inputmode")).toBe("numeric");
    expect(first.getAttribute("type")).toBe("tel");
    expect(first.getAttribute("autocomplete")).toBe("one-time-code");
  });

  it("auto-advances while typing and submits on the fourth digit", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ demo: true, token: "t", expiresAt: Date.now() + 60_000, portfolio: [], history: [] })
    );
    vi.stubGlobal("fetch", fetchMock);

    setup();
    await userEvent.click(screen.getByText("Explore Demo"));
    await userEvent.type(screen.getByTestId("demo-code-0"), "9");
    expect(document.activeElement).toBe(screen.getByTestId("demo-code-1"));
    await userEvent.type(screen.getByTestId("demo-code-1"), "7");
    await userEvent.type(screen.getByTestId("demo-code-2"), "4");
    await userEvent.type(screen.getByTestId("demo-code-3"), "0");

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("surfaces the invalid-code failure category and clears the cells", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => jsonResponse({ code: "DEMO_CODE_INVALID", error: "That access code isn't valid." }, 401)));
    setup();
    await userEvent.click(screen.getByText("Explore Demo"));
    await userEvent.click(screen.getByTestId("demo-code-0"));
    await userEvent.paste("1111");

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/DEMO_CODE_INVALID.*isn't valid/));
    expect((screen.getByTestId("demo-code-0") as HTMLInputElement).value).toBe("");
  });
});
