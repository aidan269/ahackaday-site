import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveVulnLabel } from "@/lib/incident-vuln";

test("deriveVulnLabel prefers CVE", () => {
  assert.equal(
    deriveVulnLabel({
      title: "Vendor discloses breach",
      evidence: { packages: [], versions: [], cves: ["CVE-2024-1234"], dates: [], systems: [] },
      cve: undefined,
    }),
    "CVE-2024-1234",
  );
});

test("deriveVulnLabel falls back to title fragment before verb", () => {
  assert.equal(
    deriveVulnLabel({
      title: "Acme Corp discloses data breach affecting EU customers",
      evidence: { packages: [], versions: [], cves: [], dates: [], systems: [] },
      cve: null,
    }),
    "Acme Corp",
  );
});
