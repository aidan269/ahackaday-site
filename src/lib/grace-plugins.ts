/**
 * Grace plugin contract (Phase 4): small synchronous runners invoked after a run is logged.
 * Extend with async IO (Slack, enrichment) behind feature flags.
 */

import { buildOpsIocRows } from "@/lib/ops-iocs";

export type GracePluginContext = {
  incidentSlug: string;
  canonicalId: string;
  track: "contain" | "hunt" | "patch" | "brief";
  title: string;
  severity: string;
  summary: string;
  sources: string[];
  iocs: string[];
  evidence: { cves: string[]; packages: string[] };
};

export type GracePluginResult = {
  name: string;
  ok: boolean;
  summary: string;
  detail?: Record<string, unknown>;
};

export type GracePlugin = {
  name: string;
  description: string;
  run: (ctx: GracePluginContext) => GracePluginResult | Promise<GracePluginResult>;
};

export const iocEnricherPlugin: GracePlugin = {
  name: "ioc-enricher",
  description: "Summarize staged IOC rows for downstream automation.",
  run(ctx) {
    const rows = buildOpsIocRows({
      title: ctx.title,
      summary: ctx.summary,
      iocs: ctx.iocs,
      sources: ctx.sources,
      evidence: ctx.evidence,
    });
    return {
      name: "ioc-enricher",
      ok: true,
      summary: `${rows.length} IOC rows staged`,
      detail: { sample: rows.slice(0, 5).map((r) => r.value) },
    };
  },
};

export const sigmaStubPlugin: GracePlugin = {
  name: "sigma-stub",
  description: "Placeholder Sigma/YARA generator bridge (client-side rules remain authoritative).",
  run(ctx) {
    return {
      name: "sigma-stub",
      ok: true,
      summary: `Sigma scaffold queued for ${ctx.track} track`,
      detail: { track: ctx.track },
    };
  },
};

export const slackStubPlugin: GracePlugin = {
  name: "slack-notify-stub",
  description: "Outbound Slack bridge (configure webhook + signing secret in prod).",
  run(ctx) {
    return {
      name: "slack-notify-stub",
      ok: Boolean(process.env.GRACE_SLACK_WEBHOOK_URL),
      summary: process.env.GRACE_SLACK_WEBHOOK_URL
        ? "Slack webhook configured — delivery stub only in OSS build."
        : "Slack webhook not configured — noop.",
    };
  },
};

export const DEFAULT_GRACE_PLUGINS: GracePlugin[] = [iocEnricherPlugin, sigmaStubPlugin, slackStubPlugin];

export async function runGracePlugins(
  ctx: GracePluginContext,
  plugins: GracePlugin[] = DEFAULT_GRACE_PLUGINS,
): Promise<GracePluginResult[]> {
  const results: GracePluginResult[] = [];
  for (const plugin of plugins) {
    try {
      results.push(await plugin.run(ctx));
    } catch (error) {
      results.push({
        name: plugin.name,
        ok: false,
        summary: error instanceof Error ? error.message : "plugin failure",
      });
    }
  }
  return results;
}
