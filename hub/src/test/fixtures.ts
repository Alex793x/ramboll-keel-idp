/**
 * Test fixtures mirroring the canonical `fixtures/mock-data.json` shared with
 * keel-api. Used by component/integration tests so the hub tests are independent
 * of a live API.
 */
import type { Blueprint, Department, User } from "../lib/types";

export const FIXTURE_DEPARTMENTS: Department[] = [
  { id: "buildings", name: "Buildings", team_slug: "buildings" },
  { id: "transport", name: "Transport", team_slug: "transport" },
  { id: "platform-engineering", name: "Platform Engineering", team_slug: "platform-engineering" },
];

export const FIXTURE_USERS: Record<string, User[]> = {
  buildings: [
    { id: "u-anya", name: "Anya Sørensen", email: "anya.sorensen@ramboll.com", github_login: "anya-ramboll" },
    { id: "u-mads", name: "Mads Jensen", email: "mads.jensen@ramboll.com", github_login: "mads-ramboll" },
  ],
  transport: [
    { id: "u-priya", name: "Priya Nair", email: "priya.nair@ramboll.com", github_login: "priya-ramboll" },
    { id: "u-lars", name: "Lars Holm", email: "lars.holm@ramboll.com", github_login: "lars-ramboll" },
  ],
  "platform-engineering": [
    { id: "u-alex", name: "Alex Holmberg", email: "axth@syncable.dev", github_login: "Alex793x" },
    { id: "u-bo", name: "Bo Andersson", email: "bo.andersson@ramboll.com", github_login: "bo-ramboll" },
  ],
};

export const FIXTURE_BLUEPRINTS: Blueprint[] = [
  {
    name: "python-service",
    title: "Python Service",
    description: "FastAPI / worker golden path: README, architecture.md, CI, agent skills.",
    version: "1.0.0",
  },
  {
    name: "rust-service",
    title: "Rust Service",
    description: "Axum service blueprint.",
    version: "0.0.0",
  },
];
