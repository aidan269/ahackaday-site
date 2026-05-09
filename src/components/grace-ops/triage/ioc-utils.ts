import type { IocType } from "../types";

export function classifyIoc(value: string): IocType {
  const v = value.trim();
  if (!v) return "other";
  if (/^CVE-\d{4}-\d+$/i.test(v)) return "cve";
  if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(v)) return "ip";
  if (/^https?:\/\/\S+/i.test(v)) return "url";
  if (/^[a-f0-9]{32}$|^[a-f0-9]{40}$|^[a-f0-9]{64}$/i.test(v)) return "hash";
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(v)) return "domain";
  if (/[a-z0-9_-]+\/[a-z0-9._-]+/i.test(v) || /^[a-z0-9._-]+$/i.test(v)) return "package";
  return "other";
}

export function toTxt(rows: { type: IocType; value: string }[]) {
  return rows.map((r) => `[${r.type}] ${r.value}`).join("\n");
}

export function iconTypeClass(type: IocType): "h" | "d" | "i" {
  if (type === "hash" || type === "cve") return "h";
  if (type === "domain" || type === "url") return "d";
  return "i";
}
