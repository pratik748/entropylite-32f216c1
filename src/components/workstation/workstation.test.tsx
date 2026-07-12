import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CompanyWorkstationPage from "@/pages/CompanyWorkstationPage";
import {
  WORKSPACES,
  findSection,
  findWorkspace,
  flattenSections,
  sectionPath,
} from "./registry";

vi.mock("@/lib/apiGovernor", () => ({
  governedInvoke: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/company/:ticker/:workspaceId?/:sectionId?" element={<CompanyWorkstationPage />} />
        <Route path="/dashboard" element={<div>desk</div>} />
      </Routes>
    </MemoryRouter>,
  );

describe("workstation registry", () => {
  it("keeps section ids unique across the whole registry", () => {
    const keys = flattenSections().map((e) => `${e.workspace.id}/${e.section.id}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("gives every workspace at least one section and a valid group", () => {
    for (const workspace of WORKSPACES) {
      expect(workspace.sections.length).toBeGreaterThan(0);
      expect(["Company", "Fundamentals", "Market", "Judgment"]).toContain(workspace.group);
    }
  });

  it("resolves workspaces and sections by id", () => {
    const financials = findWorkspace("financials");
    expect(financials?.label).toBe("Financials");
    expect(findSection(financials, "income-statement")?.label).toBe("Income Statement");
    expect(findSection(financials, "nope")).toBeNull();
    expect(findWorkspace("nope")).toBeNull();
  });

  it("builds canonical section paths", () => {
    expect(sectionPath("AAPL", "thesis", "recommendation")).toBe("/company/AAPL/thesis/recommendation");
  });
});

describe("CompanyWorkstationPage", () => {
  it("resolves a bare ticker URL to the overview executive summary", () => {
    renderAt("/company/AAPL");
    expect(screen.getByRole("heading", { name: "Executive Summary" })).toBeInTheDocument();
    expect(screen.getAllByText("AAPL").length).toBeGreaterThan(0);
  });

  it("renders a specific section from its canonical URL", () => {
    renderAt("/company/MSFT/financials/income-statement");
    expect(screen.getByRole("heading", { name: "Income Statement" })).toBeInTheDocument();
  });

  it("resolves an invalid section back to the workspace's first section", () => {
    renderAt("/company/AAPL/financials/not-a-section");
    expect(screen.getByRole("heading", { name: "Income Statement" })).toBeInTheDocument();
  });

  it("resolves an invalid workspace back to the overview", () => {
    renderAt("/company/AAPL/not-a-workspace/whatever");
    expect(screen.getByRole("heading", { name: "Executive Summary" })).toBeInTheDocument();
  });

  it("shows the grouped navigation rail and the inspector empty state", () => {
    renderAt("/company/AAPL");
    const rail = screen.getByRole("navigation", { name: "Workstation sections" });
    expect(rail).toBeInTheDocument();
    for (const workspace of WORKSPACES) {
      expect(screen.getAllByText(workspace.label).length).toBeGreaterThan(0);
    }
    expect(screen.getByText("No evidence selected")).toBeInTheDocument();
  });
});
