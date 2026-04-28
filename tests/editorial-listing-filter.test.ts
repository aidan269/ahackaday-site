import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isEditorialListingNoise, omitEditorialListingNoise } from "../src/lib/editorial-listing-filter";
import type { Incident } from "../src/lib/incident-types";

function stub(partial: Partial<Pick<Incident, "title" | "summary" | "affected">>): Pick<Incident, "title" | "summary" | "affected"> {
  return {
    title: partial.title ?? "",
    summary: partial.summary ?? "",
    affected: partial.affected ?? "",
  };
}

describe("isEditorialListingNoise", () => {
  it("flags webinar promo titles", () => {
    assert.equal(
      isEditorialListingNoise(
        stub({
          title: "Webinar: Spotting cyberattacks before they begin",
          summary: "BleepingComputer is hosting a webinar on April 30 about threat intelligence.",
        }),
      ),
      true,
    );
  });

  it("flags hosting + webinar in body copy", () => {
    assert.equal(
      isEditorialListingNoise(
        stub({
          title: "Learn threat hunting live",
          summary: "We are hosting a webinar next Tuesday on detection engineering.",
        }),
      ),
      true,
    );
  });

  it("flags weekly digest style titles", () => {
    assert.equal(
      isEditorialListingNoise(
        stub({
          title: "Weekly security roundup: patches and breaches",
          summary: "A digest of what happened this week.",
        }),
      ),
      true,
    );
  });

  it("flags week in review", () => {
    assert.equal(
      isEditorialListingNoise(
        stub({
          title: "Week in review: major stories",
          summary: "Highlights from the week.",
        }),
      ),
      true,
    );
  });

  it("does not flag a normal incident that mentions webinars casually", () => {
    assert.equal(
      isEditorialListingNoise(
        stub({
          title: "Ransomware crew uses fake webinar invites in phishing",
          summary: "Attackers sent calendar invites mimicking vendor webinars to steal creds.",
        }),
      ),
      false,
    );
  });

  it("omitEditorialListingNoise drops only noise rows", () => {
    const rows = [
      { title: "Webinar: Foo", summary: "", affected: "" },
      { title: "Real CVE in VPN", summary: "Pre-auth RCE under active exploitation.", affected: "VPN" },
    ] as Incident[];
    const kept = omitEditorialListingNoise(rows);
    assert.equal(kept.length, 1);
    assert.equal(kept[0]!.title, "Real CVE in VPN");
  });
});
