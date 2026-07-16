import { NavLink } from "react-router-dom";
import { WORKSPACE_GROUPS, sectionPath, type WorkspaceDef } from "./registry";
import { visibleWorkspaces } from "./availability";
import { useEvidence } from "./EvidenceContext";

interface SectionRailProps {
  ticker: string;
  activeWorkspaceId: string;
  activeSectionId: string;
}

/**
 * Workstation navigation rail — workspaces in 4 semantic groups.
 * Selecting a workspace lands on its first section; the active workspace
 * expands to show its sections. Vertical rail on md+, horizontal strip below.
 *
 * The rail is availability-aware: sections whose data cannot be pulled or
 * derived are withdrawn from navigation entirely rather than shown as
 * empty shells (the active section always stays reachable while open).
 */
const SectionRail = ({ ticker, activeWorkspaceId, activeSectionId }: SectionRailProps) => {
  const { availableSections } = useEvidence();
  const workspaces = visibleWorkspaces(availableSections);

  return (
    <>
      {/* Desktop: grouped vertical rail */}
      <nav
        aria-label="Workstation sections"
        className="hidden w-[184px] shrink-0 flex-col overflow-y-auto border-r border-border/70 bg-surface-1/60 py-2 md:flex"
      >
        {WORKSPACE_GROUPS.map((group) => {
          const grouped = workspaces.filter((w) => w.group === group);
          if (grouped.length === 0) return null;
          return (
            <div key={group} className="mb-1.5">
              <p className="px-4 pb-1 pt-2 text-[9.5px] font-semibold uppercase tracking-[0.16em] text-muted-foreground/60">
                {group}
              </p>
              {grouped.map((workspace) => {
                const isActiveWorkspace = workspace.id === activeWorkspaceId;
                return (
                  <div key={workspace.id}>
                    <NavLink
                      to={sectionPath(ticker, workspace.id, workspace.sections[0].id)}
                      aria-current={isActiveWorkspace ? "page" : undefined}
                      className={`relative block px-4 py-1.5 text-[12.5px] font-medium tracking-tight transition-colors ${
                        isActiveWorkspaceStyle(isActiveWorkspace)
                      }`}
                    >
                      {isActiveWorkspace && (
                        <span className="absolute bottom-1 left-0 top-1 w-[2.5px] rounded-full bg-foreground" />
                      )}
                      {workspace.label}
                    </NavLink>
                    {isActiveWorkspace && workspace.sections.length > 1 && (
                      <div className="mb-1 mt-0.5">
                        {workspace.sections.map((section) => (
                          <NavLink
                            key={section.id}
                            to={sectionPath(ticker, workspace.id, section.id)}
                            aria-current={section.id === activeSectionId ? "location" : undefined}
                            className={`block py-[3px] pl-7 pr-3 text-[11.5px] tracking-tight transition-colors ${
                              section.id === activeSectionId
                                ? "text-foreground"
                                : "text-muted-foreground/75 hover:text-foreground"
                            }`}
                          >
                            {section.label}
                          </NavLink>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Mobile: workspace strip + section strip */}
      <div className="md:hidden">
        <nav
          aria-label="Workstation workspaces"
          className="mask-fade-x flex items-center gap-0.5 overflow-x-auto border-b border-border/70 bg-surface-1/60 px-2 py-1.5 scrollbar-hide"
        >
          {workspaces.map((workspace) => (
            <NavLink
              key={workspace.id}
              to={sectionPath(ticker, workspace.id, workspace.sections[0].id)}
              className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-[11.5px] font-semibold tracking-tight transition-colors ${
                workspace.id === activeWorkspaceId
                  ? "bg-surface-3 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {workspace.label}
            </NavLink>
          ))}
        </nav>
        <SectionStrip
          ticker={ticker}
          activeWorkspaceId={activeWorkspaceId}
          activeSectionId={activeSectionId}
          workspaces={workspaces}
        />
      </div>
    </>
  );
};

const SectionStrip = ({
  ticker,
  activeWorkspaceId,
  activeSectionId,
  workspaces,
}: SectionRailProps & { workspaces: WorkspaceDef[] }) => {
  const workspace = workspaces.find((w) => w.id === activeWorkspaceId);
  if (!workspace || workspace.sections.length <= 1) return null;
  return (
    <nav
      aria-label="Workspace sections"
      className="mask-fade-x flex items-center gap-0.5 overflow-x-auto border-b border-border/50 px-2 py-1 scrollbar-hide"
    >
      {workspace.sections.map((section) => (
        <NavLink
          key={section.id}
          to={sectionPath(ticker, workspace.id, section.id)}
          className={`whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] tracking-tight transition-colors ${
            section.id === activeSectionId
              ? "bg-surface-2 text-foreground"
              : "text-muted-foreground/75 hover:text-foreground"
          }`}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
};

function isActiveWorkspaceStyle(active: boolean): string {
  return active ? "text-foreground" : "text-muted-foreground/80 hover:text-foreground";
}

export default SectionRail;
