import { useEffect, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import ContextBar from "@/components/workstation/ContextBar";
import SectionRail from "@/components/workstation/SectionRail";
import InspectorPanel from "@/components/workstation/InspectorPanel";
import SectionScaffold from "@/components/workstation/SectionScaffold";
import {
  findSection,
  findWorkspace,
  flattenSections,
  sectionPath,
} from "@/components/workstation/registry";
import { normalizeUserTicker } from "@/lib/ticker";

/**
 * Equity Workstation — /company/:ticker/:workspaceId?/:sectionId?
 *
 * The dedicated surface for deep company analysis. Phase 0 ships the shell:
 * context bar (identity, live price, freshness), grouped section rail,
 * inspector slot, URL-addressable sections and [ / ] keyboard navigation.
 */
const CompanyWorkstationPage = () => {
  const { ticker: rawTicker, workspaceId, sectionId } = useParams();
  const navigate = useNavigate();
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const ticker = normalizeUserTicker(rawTicker ?? "");
  const workspace = findWorkspace(workspaceId);
  const section = findSection(workspace, sectionId);

  // [ / ] step through every section in registry order.
  useEffect(() => {
    if (!ticker || !workspace || !section) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" && e.key !== "]") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) return;
      const flat = flattenSections();
      const index = flat.findIndex(
        (entry) => entry.workspace.id === workspace.id && entry.section.id === section.id,
      );
      if (index === -1) return;
      const next = flat[(index + (e.key === "]" ? 1 : -1) + flat.length) % flat.length];
      navigate(sectionPath(ticker, next.workspace.id, next.section.id));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ticker, workspace, section, navigate]);

  if (!ticker) return <Navigate to="/dashboard" replace />;

  // Resolve partial or invalid paths to a canonical section URL.
  if (!workspace || !section) {
    const target = workspace ?? findWorkspace("overview")!;
    return <Navigate to={sectionPath(ticker, target.id, target.sections[0].id)} replace />;
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <ContextBar
        ticker={ticker}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((open) => !open)}
      />
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <SectionRail ticker={ticker} activeWorkspaceId={workspace.id} activeSectionId={section.id} />
        <main className="no-touch-bounce min-w-0 flex-1 overflow-auto">
          <SectionScaffold ticker={ticker} workspace={workspace} section={section} />
        </main>
        {inspectorOpen && <InspectorPanel />}
      </div>
    </div>
  );
};

export default CompanyWorkstationPage;
