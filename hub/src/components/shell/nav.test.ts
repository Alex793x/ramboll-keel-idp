import { describe, expect, it } from "vitest";
import {
  NAV_GROUPS,
  initialsFromName,
  isNavItemActive,
  type NavItem,
} from "./nav";

describe("NAV_GROUPS model", () => {
  it("has WORKSPACE and PLATFORM groups, in order", () => {
    expect(NAV_GROUPS.map((g) => g.label)).toEqual(["WORKSPACE", "PLATFORM"]);
  });

  it("WORKSPACE holds Home, Projects, Knowledge Base with routes and icons", () => {
    const workspace = NAV_GROUPS[0];
    expect(workspace?.items).toEqual([
      { name: "Home", icon: "home", to: "/" },
      { name: "Projects", icon: "folder", to: "/projects" },
      { name: "Knowledge Base", icon: "book", to: "/knowledge" },
    ]);
  });

  it("no WORKSPACE item is marked soon", () => {
    for (const item of NAV_GROUPS[0]?.items ?? []) {
      expect(item.soon).toBeUndefined();
    }
  });

  it("PLATFORM holds the five soon items with icons and no routes", () => {
    const platform = NAV_GROUPS[1];
    expect(platform?.items).toEqual([
      { name: "Software Catalog", icon: "grid", soon: true },
      { name: "Repositories", icon: "branch", soon: true },
      { name: "Golden Paths", icon: "zap", soon: true },
      { name: "Agents", icon: "bot", soon: true },
      { name: "Platform Support", icon: "help", soon: true },
    ]);
  });
});

describe("isNavItemActive", () => {
  const home: NavItem = { name: "Home", icon: "home", to: "/" };
  const projects: NavItem = { name: "Projects", icon: "folder", to: "/projects" };
  const knowledge: NavItem = {
    name: "Knowledge Base",
    icon: "book",
    to: "/knowledge",
  };
  const soonItem: NavItem = { name: "Agents", icon: "bot", soon: true };

  it("Home is active only on exactly /", () => {
    expect(isNavItemActive(home, "/")).toBe(true);
    expect(isNavItemActive(home, "/projects")).toBe(false);
    expect(isNavItemActive(home, "/knowledge")).toBe(false);
  });

  it("Projects matches its exact route", () => {
    expect(isNavItemActive(projects, "/projects")).toBe(true);
    expect(isNavItemActive(projects, "/")).toBe(false);
    expect(isNavItemActive(projects, "/knowledge")).toBe(false);
  });

  it("Knowledge Base stays active on knowledge sub-paths", () => {
    expect(isNavItemActive(knowledge, "/knowledge")).toBe(true);
    expect(isNavItemActive(knowledge, "/knowledge/py-gp-001")).toBe(true);
    expect(isNavItemActive(knowledge, "/knowledge/a/b/c")).toBe(true);
  });

  it("does not match unrelated prefixes", () => {
    expect(isNavItemActive(knowledge, "/knowledgebase")).toBe(false);
    expect(isNavItemActive(projects, "/projectsX")).toBe(false);
  });

  it("soon items are never active", () => {
    expect(isNavItemActive(soonItem, "/")).toBe(false);
    expect(isNavItemActive(soonItem, "/agents")).toBe(false);
  });
});

describe("initialsFromName", () => {
  it("takes the first letters of the first two words, uppercased", () => {
    expect(initialsFromName("Kristoffer Pedersen")).toBe("KP");
    expect(initialsFromName("Anya Sorensen")).toBe("AS");
  });

  it("uses only the first two words of longer names", () => {
    expect(initialsFromName("Anna Maria Berg Larsen")).toBe("AM");
  });

  it("handles single-word names", () => {
    expect(initialsFromName("Anya")).toBe("A");
  });

  it("handles empty and whitespace-only input", () => {
    expect(initialsFromName("")).toBe("");
    expect(initialsFromName("   ")).toBe("");
  });

  it("uppercases lowercase input", () => {
    expect(initialsFromName("kristoffer pedersen")).toBe("KP");
  });
});
