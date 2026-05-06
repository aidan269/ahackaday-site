#!/usr/bin/env python3
"""Grace Ops agent — stdlib-only pipeline simulation (see ../agent-spec.md).

What this is
------------
A self-contained, stdlib-only simulation of the agent pipeline described in
agent-spec.md. It uses mocked corpus + queries + GEO probes (no network calls)
so it runs anywhere with vanilla Python 3.10+.

What it produces
----------------
A `daily_pulse.json` matching the v2 schema, plus a printed summary of the run.
Wire the same shape to a real ingester later.

Pipeline implemented
--------------------
ingest -> cluster (rule-based via tags) -> gap_detect -> audit (14-pt rubric)
-> geo_probe (mock) -> synthesize (pulse + briefs + fixes + refresh queue)
-> publish (json + console).

Run it: `python3 grace_ops_agent.py`
Output: ./output/daily_pulse.json

Pinned fixture for dashboard/tests (stdlib output drifts with clock RNG):
../fixtures/daily_pulse.json
"""

from __future__ import annotations

import json
import random
import re
import textwrap
from dataclasses import asdict, dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from statistics import median
from typing import Iterable

# ---------------------------------------------------------------------------
# Data shapes
# ---------------------------------------------------------------------------


@dataclass
class Article:
    url: str
    title: str
    source: str  # e.g. "cantina", "bleepingcomputer"
    published_at: str  # ISO date
    tags: list[str]
    body: str
    severity: str = "medium"  # critical / high / medium / low


@dataclass
class Query:
    query: str
    source: str
    weekly_volume_estimate: int
    intent: str  # informational / navigational / comparative / transactional


@dataclass
class GeoProbeResult:
    query: str
    engine: str
    cited_domains: list[str]
    cantina_cited: bool
    cantina_position: int | None  # 1-indexed


# ---------------------------------------------------------------------------
# Mock corpus — small but realistic
# ---------------------------------------------------------------------------

TODAY = date(2026, 5, 5)


def days_ago(n: int) -> str:
    return (TODAY - timedelta(days=n)).isoformat()


CANTINA_ARTICLES: list[Article] = [
    Article(
        url="https://cantina.example/posts/oauth-basics",
        title="What is OAuth 2.0? A practical primer",
        source="cantina",
        published_at=days_ago(140),
        tags=["identity", "evergreen"],
        body=(
            "OAuth 2.0 is an authorization framework that lets applications "
            "obtain limited access to a user's data without exposing credentials. "
            "It defines several grant types and is widely used by SaaS providers. "
        ),
        severity="low",
    ),
    Article(
        url="https://cantina.example/posts/ransomware-trends-q1",
        title="Ransomware trends in Q1 2026",
        source="cantina",
        published_at=days_ago(45),
        tags=["ransomware", "trends"],
        body=(
            "Q1 2026 saw a 14% rise in double-extortion ransomware events compared "
            "to Q4 2025, according to the Recorded Future quarterly report. "
            "<dl><dt>What is double extortion?</dt><dd>An attack pattern where "
            "data is exfiltrated before encryption and victims face two leverage "
            "points.</dd></dl> "
            "See related: <a href='/posts/lockbit-takedown'>LockBit takedown</a>, "
            "<a href='/posts/extortion-economics'>extortion economics</a>. "
            "Reference: https://www.cisa.gov/ransomware "
            '<script type="application/ld+json">{"@type":"NewsArticle"}</script>'
        ),
        severity="high",
    ),
    Article(
        url="https://cantina.example/posts/lockbit-takedown",
        title="The LockBit takedown: what we know",
        source="cantina",
        published_at=days_ago(60),
        tags=["ransomware", "law-enforcement"],
        body=(
            "Operation Cronos, the multinational law-enforcement action against "
            "LockBit, was disclosed on February 19, 2024. Authorities seized 34 "
            "servers across three continents and recovered 1,000+ decryption keys. "
            "Cited: https://www.justice.gov/opa/pr/lockbit "
            "Cited: https://www.nca.gov.uk/lockbit "
        ),
        severity="high",
    ),
    Article(
        url="https://cantina.example/posts/cve-2026-9001",
        title="CVE-2026-9001: a quick read",
        source="cantina",
        published_at=days_ago(7),
        tags=["zero-day", "vulnerability"],
        body=(
            "CVE-2026-9001 is a critical RCE in a popular ingress controller. "
            "Patch is available. Update now."
        ),
        severity="critical",
    ),
    Article(
        url="https://cantina.example/posts/sca-tools-blind-spot",
        title="The EOL Blind Spot in Your CVE Feed",
        source="cantina",
        published_at=days_ago(2),
        tags=["supply-chain", "tools"],
        body=(
            "Most SCA tools rely on the NVD CVE feed, which means they miss "
            "vulnerabilities in components past their end-of-life cutoff. "
            "Q: What is an EOL blind spot? A: A vulnerability in a dependency "
            "that no longer receives upstream advisories. "
            "We surveyed 12 SCA vendors in March 2026 and found 9 omit EOL data. "
            '<script type="application/ld+json">{"@type":"NewsArticle",'
            '"datePublished":"2026-05-03"}</script> '
            "Related: <a href='/posts/cve-2026-9001'>CVE-2026-9001 quick read</a>, "
            "<a href='/posts/ransomware-trends-q1'>Q1 ransomware trends</a>."
        ),
        severity="high",
    ),
]

COMPETITOR_ARTICLES: list[Article] = [
    Article(
        "https://thehackernews.com/2026/05/critical-apache-http2-flaw.html",
        "Critical Apache HTTP/2 Flaw CVE-2026-3344 Under Active Exploit",
        "thehackernews",
        days_ago(1),
        ["zero-day", "apache", "vulnerability"],
        "...",
        severity="critical",
    ),
    Article(
        "https://thehackernews.com/2026/05/daemon-tools-supply-chain-attack.html",
        "Daemon Tools Supply Chain Attack Hits 40k Installations",
        "thehackernews",
        days_ago(2),
        ["supply-chain", "malware"],
        "...",
        severity="critical",
    ),
    Article(
        "https://thehackernews.com/2026/05/china-linked-uat-8302-targets.html",
        "China-Linked UAT-8302 Targets European Telcos",
        "thehackernews",
        days_ago(3),
        ["apt", "espionage"],
        "...",
        severity="high",
    ),
    Article(
        "https://www.bleepingcomputer.com/news/security/the-eol-blind-spot",
        "The EOL Blind Spot in Your CVE Feed: What SCA Tools Don't Check",
        "bleepingcomputer",
        days_ago(2),
        ["supply-chain", "tools"],
        "...",
        severity="high",
    ),
    Article(
        "https://www.bleepingcomputer.com/news/security/google-now-offers-15m",
        "Google Now Offers Up to $15M for Some Android Exploits",
        "bleepingcomputer",
        days_ago(4),
        ["bug-bounty", "android"],
        "...",
        severity="medium",
    ),
    Article(
        "https://www.bleepingcomputer.com/news/security/karakurt-extortion",
        "Karakurt Extortion Gang Negotiator Sentenced to 85 Years",
        "bleepingcomputer",
        days_ago(5),
        ["ransomware", "law-enforcement"],
        "...",
        severity="medium",
    ),
    Article(
        "https://www.bleepingcomputer.com/news/security/weaver-e-ology-bug",
        "Weaver E-cology Critical Bug Exploited in Attacks Since March",
        "bleepingcomputer",
        days_ago(3),
        ["zero-day", "vulnerability"],
        "...",
        severity="critical",
    ),
    Article(
        "https://www.securityweek.com/microsoft-warns-phishing-us",
        "Microsoft Warns of Sophisticated Phishing Campaign Targeting US Orgs",
        "securityweek",
        days_ago(2),
        ["phishing", "supply-chain"],
        "...",
        severity="high",
    ),
    Article(
        "https://www.securityweek.com/cisa-emergency-directive-25-04",
        "CISA Issues Emergency Directive 25-04 on Ingress Controllers",
        "securityweek",
        days_ago(1),
        ["zero-day", "cisa", "vulnerability"],
        "...",
        severity="critical",
    ),
    Article(
        "https://krebsonsecurity.com/2026/05/the-quiet-rise-of-info-stealers",
        "The Quiet Rise of Info-Stealers Across SMB Networks",
        "krebsonsecurity",
        days_ago(4),
        ["malware", "smb"],
        "...",
        severity="high",
    ),
    Article(
        "https://www.darkreading.com/threat-intelligence/clop-mft-campaign",
        "Clop Group Returns with Managed File Transfer Campaign",
        "darkreading",
        days_ago(3),
        ["ransomware", "mft"],
        "...",
        severity="high",
    ),
    Article(
        "https://therecord.media/eol-cve-blind-spot-explained",
        "Why Your SCA Misses Half Its CVEs: The EOL Blind Spot",
        "therecord",
        days_ago(2),
        ["supply-chain", "tools"],
        "...",
        severity="high",
    ),
    Article(
        "https://thehackernews.com/2026/05/zero-day-rust-cargo-supply-chain.html",
        "Rust Cargo Registry Hit by Typosquat Wave",
        "thehackernews",
        days_ago(2),
        ["supply-chain", "rust"],
        "...",
        severity="high",
    ),
    Article(
        "https://www.bleepingcomputer.com/news/security/openssh-cve-2026-2233",
        "OpenSSH CVE-2026-2233 Patched: What Admins Need to Do",
        "bleepingcomputer",
        days_ago(1),
        ["zero-day", "ssh", "vulnerability"],
        "...",
        severity="critical",
    ),
    Article(
        "https://www.darkreading.com/cloud/aws-iam-misconfig-2026",
        "AWS IAM Misconfigs Still the #1 Cloud Breach Cause",
        "darkreading",
        days_ago(6),
        ["cloud", "identity"],
        "...",
        severity="medium",
    ),
]

QUERIES: list[Query] = [
    Query("what is the EOL blind spot in CVE feeds", "internal-search", 320, "informational"),
    Query("how to patch CVE-2026-3344", "google-trends", 14000, "transactional"),
    Query("Daemon Tools supply chain attack what to do", "google-trends", 8200, "informational"),
    Query("CISA ED 25-04 mitigation guide", "internal-search", 1100, "informational"),
    Query("OpenSSH CVE-2026-2233 patch", "google-trends", 6700, "transactional"),
    Query("Clop MFT campaign indicators of compromise", "reddit-netsec", 540, "informational"),
    Query("Karakurt sentencing case details", "google-trends", 2300, "informational"),
    Query("how do info stealers spread on SMB networks", "answerthepublic", 880, "informational"),
    Query("best SCA tool that catches EOL CVEs", "internal-search", 410, "comparative"),
    Query("Apache HTTP/2 zero day exploit timeline", "google-trends", 9100, "informational"),
    Query("AWS IAM least privilege checklist", "answerthepublic", 5400, "informational"),
    Query("Google $15M Android bug bounty rules", "google-trends", 3200, "informational"),
    Query("Rust crate typosquatting how to detect", "reddit-netsec", 290, "informational"),
    Query("ransomware double extortion 2026", "google-trends", 4400, "informational"),
    Query("UAT-8302 IOCs European telco campaign", "internal-search", 180, "informational"),
]

# ---------------------------------------------------------------------------
# Stage 3 — Cluster (rule-based via tag intersection for the prototype)
# ---------------------------------------------------------------------------

# Hand-defined themes; in production these come from HDBSCAN over embeddings.
THEMES: dict[str, dict] = {
    "supply-chain": {
        "label": "Supply Chain & SCA",
        "match_tags": {"supply-chain", "tools", "rust", "malware"},
    },
    "zero-day": {
        "label": "Zero-Day & Active Exploits",
        "match_tags": {"zero-day", "vulnerability", "apache", "ssh", "cisa"},
    },
    "ransomware": {
        "label": "Ransomware & Extortion",
        "match_tags": {"ransomware", "mft", "law-enforcement"},
    },
    "identity-cloud": {
        "label": "Identity & Cloud Misconfig",
        "match_tags": {"identity", "cloud"},
    },
    "espionage": {
        "label": "APT & State-Linked Espionage",
        "match_tags": {"apt", "espionage", "phishing"},
    },
    "bug-bounty": {
        "label": "Bug Bounty Economics",
        "match_tags": {"bug-bounty", "android"},
    },
    "infostealers": {
        "label": "Info-Stealer Ecosystem",
        "match_tags": {"smb"},
    },
}


def cluster_articles(articles: Iterable[Article]) -> dict[str, list[Article]]:
    clusters: dict[str, list[Article]] = {k: [] for k in THEMES}
    for art in articles:
        for theme_key, theme in THEMES.items():
            if set(art.tags) & theme["match_tags"]:
                clusters[theme_key].append(art)
                break  # each article goes to exactly one theme
    return clusters


# ---------------------------------------------------------------------------
# Stage 4 — Gap detection
# ---------------------------------------------------------------------------

SEVERITY_WEIGHT = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def gap_detect(cantina_clusters, competitor_clusters):
    rows = []
    for theme_key, theme in THEMES.items():
        cant = cantina_clusters.get(theme_key, [])
        comp = competitor_clusters.get(theme_key, [])
        if not cant and not comp:
            continue
        gap_score = (len(comp) - len(cant)) / max(1, len(comp))
        max_sev = "low"
        for art in comp:
            if SEVERITY_WEIGHT[art.severity] > SEVERITY_WEIGHT[max_sev]:
                max_sev = art.severity
        # Momentum: recency-weighted competitor count.
        momentum = 0.0
        for art in comp:
            age = (TODAY - date.fromisoformat(art.published_at)).days
            momentum += max(0, 1 - age / 14)
        priority = SEVERITY_WEIGHT[max_sev] * max(0, gap_score) * (1 + momentum / 5)
        rows.append(
            {
                "theme_key": theme_key,
                "label": theme["label"],
                "competitor_count": len(comp),
                "cantina_count": len(cant),
                "gap_score": round(gap_score, 3),
                "max_severity": max_sev,
                "momentum": round(momentum, 2),
                "priority": round(priority, 3),
                "competitor_articles": [asdict(a) for a in comp],
                "cantina_articles": [asdict(a) for a in cant],
            }
        )
    rows.sort(key=lambda r: r["priority"], reverse=True)
    return rows


# ---------------------------------------------------------------------------
# Stage 5 — AEO audit (14-point rubric, deterministic)
# ---------------------------------------------------------------------------

RUBRIC = [
    ("answer_first_lede", 12, lambda a: _answer_first(a)),
    ("h2_h3_hierarchy", 10, lambda a: bool(re.search(r"<h[23]", a.body))),
    ("faq_block", 10, lambda a: bool(re.search(r"<dl|FAQPage|^Q:|\nQ:", a.body))),
    ("authoritative_sources", 10, lambda a: _count_auth_sources(a) >= 2),
    ("numeric_stats", 8, lambda a: bool(re.search(r"\bCVE-\d{4}-\d{4,7}\b|\b\d+%|\b\d{2,}\b", a.body))),
    ("internal_links", 6, lambda a: a.body.count("href='/") + a.body.count('href="/') >= 2),
    ("schema_jsonld", 8, lambda a: "application/ld+json" in a.body),
    (
        "date_in_markup",
        6,
        lambda a: "datePublished" in a.body or bool(re.search(r"\b202[5-6]-\d{2}-\d{2}\b", a.body)),
    ),
    ("headline_matches_query", 8, lambda a: _headline_matches_query(a)),
    ("reading_grade_ok", 4, lambda a: _flesch_kincaid(a.body) <= 11.5),
    ("answer_paragraph_short", 6, lambda a: _first_paragraph_words(a.body) <= 60),
    ("what_changed_block", 4, lambda a: "what changed" in a.body.lower() or "tl;dr" in a.body.lower()),
    ("image_alt", 4, lambda a: 'alt="' in a.body),
    ("author_bio", 4, lambda a: 'rel="author"' in a.body or "By " in a.body[:200]),
]


def _answer_first(a: Article) -> bool:
    first_120 = " ".join(a.body.split()[:120]).lower()
    return any(k in first_120 for k in ("is a ", "is an ", "means ", "refers to ", "answer:"))


def _count_auth_sources(a: Article) -> int:
    auth = (
        "cisa.gov",
        "nvd.nist.gov",
        "justice.gov",
        "nca.gov.uk",
        "kb.cert.org",
        "msrc.microsoft.com",
        "security.googleblog",
        "ietf.org",
    )
    return sum(1 for k in auth if k in a.body)


def _flesch_kincaid(text: str) -> float:
    words = re.findall(r"\w+", text)
    sentences = max(1, len(re.findall(r"[.!?]", text)))
    syllables = sum(max(1, len(re.findall(r"[aeiouy]+", w.lower()))) for w in words) or 1
    if not words:
        return 0
    return 0.39 * (len(words) / sentences) + 11.8 * (syllables / len(words)) - 15.59


def _first_paragraph_words(body: str) -> int:
    para = re.split(r"\n\n|<p>", body, maxsplit=1)[0]
    return len(re.findall(r"\w+", para))


def _headline_matches_query(a: Article) -> bool:
    title_words = set(re.findall(r"\w+", a.title.lower()))
    for q in QUERIES:
        q_words = set(re.findall(r"\w+", q.query.lower()))
        if len(title_words & q_words) >= 3:
            return True
    return False


FIX_HINTS = {
    "answer_first_lede": "Open with a 1-sentence definition. Pattern: '<X> is <one-line>. <Why it matters in one clause>.'",
    "h2_h3_hierarchy": "Add 3 H2s mirroring the top sub-questions for this query.",
    "faq_block": "Append a <dl>...<dt>Q?</dt><dd>A.</dd>...</dl> with 3-5 entries answering common follow-ups.",
    "authoritative_sources": "Cite at least 2 of: CISA advisory, NVD entry, vendor advisory, peer-reviewed paper.",
    "numeric_stats": "Add at least one CVE id, version range, or quantified impact (% / count / dollars).",
    "internal_links": "Link to ≥2 related Cantina articles with descriptive anchor text.",
    "schema_jsonld": "Add NewsArticle JSON-LD block with datePublished and dateModified.",
    "date_in_markup": "Expose datePublished and dateModified in markup, not only the byline.",
    "headline_matches_query": "Rewrite headline to overlap ≥3 tokens with the target query.",
    "reading_grade_ok": "Tighten sentences. Aim for grade ≤ 11. Drop nominalizations.",
    "answer_paragraph_short": "Reduce the first paragraph to ≤60 words.",
    "what_changed_block": "Insert a 'What changed (May 5, 2026)' bulletted block.",
    "image_alt": "Add descriptive alt text to the lead image.",
    "author_bio": "Add a linked author bio with credentials.",
}


def audit_article(a: Article) -> dict:
    checks = []
    score = 0
    for name, weight, fn in RUBRIC:
        try:
            passed = bool(fn(a))
        except Exception:
            passed = False
        if passed:
            score += weight
        checks.append(
            {
                "check": name,
                "weight": weight,
                "passed": passed,
                "fix": None if passed else FIX_HINTS.get(name, ""),
            }
        )
    failing = sorted([c for c in checks if not c["passed"]], key=lambda c: c["weight"], reverse=True)
    return {
        "url": a.url,
        "title": a.title,
        "score": score,
        "denominator": 100,
        "checks": checks,
        "top_fixes": [c["fix"] for c in failing[:3] if c["fix"]],
    }


# ---------------------------------------------------------------------------
# Stage 6 — GEO probe (mocked; in production hits Perplexity / SerpAPI / etc.)
# ---------------------------------------------------------------------------

ENGINES = ["perplexity", "google_aio", "chatgpt_search", "claude_web", "you_smart"]


def mock_geo_probe(queries: list[Query]) -> list[GeoProbeResult]:
    rng = random.Random(7)
    results: list[GeoProbeResult] = []
    competitor_domains = [
        "thehackernews.com",
        "bleepingcomputer.com",
        "securityweek.com",
        "krebsonsecurity.com",
        "darkreading.com",
        "therecord.media",
        "cisa.gov",
        "nvd.nist.gov",
    ]
    for q in queries:
        for engine in ENGINES:
            cited = rng.sample(competitor_domains, k=rng.randint(2, 4))
            # Cantina cited ~10% of the time, lower for queries we have no article for.
            cantina_in = rng.random() < 0.10
            if cantina_in:
                cited.insert(rng.randint(0, len(cited)), "cantina.example")
            pos = cited.index("cantina.example") + 1 if cantina_in else None
            results.append(GeoProbeResult(q.query, engine, cited, cantina_in, pos))
    return results


def citation_share(probes: list[GeoProbeResult]) -> tuple[float, int]:
    total = sum(len(p.cited_domains) for p in probes)
    ours = sum(1 for p in probes if p.cantina_cited)
    if total == 0:
        return 0.0, 0
    return round(ours / total, 3), total


# ---------------------------------------------------------------------------
# Stage 7 — Synthesis
# ---------------------------------------------------------------------------

INTENT_BY_THEME = {
    "supply-chain": "informational",
    "zero-day": "transactional",
    "ransomware": "informational",
    "identity-cloud": "informational",
    "espionage": "informational",
    "bug-bounty": "comparative",
    "infostealers": "informational",
}

ANGLE_BY_THEME = {
    "supply-chain": [
        "Position Cantina as the only outlet auditing SCA tooling, not just the CVE feed.",
        "Make EOL visibility the framing: what NVD-only pipelines miss and how teams compensate.",
        "Shift from malware headlines to software supply assurance with practical vendor checklists.",
    ],
    "zero-day": [
        "Be the fastest authoritative explainer the moment a CVE drops: timeline, patch matrix, IOCs.",
        "Win the operator query by publishing patch-first guidance before rumor threads harden.",
        "Package zero-day coverage as incident playbooks, not news recaps.",
    ],
    "ransomware": [
        "Own the analytical angle: economics, negotiator behavior, and law-enforcement timelines.",
        "Differentiate with decision-grade ransomware operations guidance for CISOs and IR leads.",
        "Turn breach headlines into policy choices: disclosure, payment, and resilience trade-offs.",
    ],
    "identity-cloud": [
        "Bridge cloud misconfig and identity with a practical least-privilege implementation guide.",
        "Center identity blast-radius reduction for common IAM drift patterns.",
        "Frame cloud security as access-governance hygiene, not just configuration linting.",
    ],
    "espionage": [
        "Translate APT naming into sector-level risk with Monday-morning defensive actions.",
        "Prioritize campaign context: target profile, objective, and controls that measurably help.",
        "Make espionage coverage actionable by mapping TTPs to realistic blue-team playbooks.",
    ],
    "bug-bounty": [
        "Cover bounty-market mechanics, not just payout headlines, for comparative buyer queries.",
        "Build vendor comparison tables that answer researcher and program-owner intent directly.",
        "Treat bug-bounty stories as pricing and incentives analysis, not announcement reposts.",
    ],
    "infostealers": [
        "Bundle stealer stories into recurring ecosystem reporting to accumulate topical authority.",
        "Track credential-theft tradecraft over time instead of one-off malware summaries.",
        "Lead with prevention + detection patterns for SMB-heavy stealer spread paths.",
    ],
}


def _stable_index(key: str, modulo: int) -> int:
    if modulo <= 0:
        return 0
    return sum(ord(ch) for ch in key) % modulo


def _query_tokens(text: str) -> set[str]:
    stop = {"what", "how", "why", "the", "and", "for", "with", "that", "from", "into", "your"}
    return {t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) >= 3 and t not in stop}


def _theme_needles(theme_key: str) -> list[str]:
    return {
        "supply-chain": ["EOL blind spot", "SCA", "supply chain", "typosquat", "Daemon Tools"],
        "zero-day": ["Apache HTTP/2", "OpenSSH", "ED 25-04", "CVE-2026", "patch CVE"],
        "ransomware": ["double extortion", "Karakurt", "Clop MFT"],
        "identity-cloud": ["IAM", "AWS", "least privilege"],
        "espionage": ["UAT-8302", "telco"],
        "bug-bounty": ["$15M", "bug bounty", "Android"],
        "infostealers": ["info stealer", "SMB"],
    }.get(theme_key, [])


def synthesize_pulse_opportunities(gap_rows, top_n=3):
    opps = []
    for row in gap_rows[:top_n]:
        variants = ANGLE_BY_THEME.get(row["theme_key"], [])
        angle = variants[_stable_index(f"{TODAY.isoformat()}:{row['theme_key']}", len(variants))] if variants else ""
        ref_cards = []
        for art in row["competitor_articles"][:3]:
            ref_cards.append(
                {
                    "title": art["title"],
                    "source": art["source"],
                    "published_at": art["published_at"],
                    "one_line_takeaway": _takeaway_for(art),
                    "url": art["url"],
                }
            )
        opps.append(
            {
                "theme": row["label"],
                "severity": row["max_severity"],
                "gap_score": row["gap_score"],
                "competitor_count": row["competitor_count"],
                "cantina_count": row["cantina_count"],
                "angle": angle,
                "impact": _impact_for(row),
                "refs": ref_cards,
            }
        )
    return opps


def _takeaway_for(art_dict) -> str:
    # In production this is an LLM call summarizing the body in <= 18 words.
    title = art_dict["title"]
    if "EOL" in title:
        return "Confirms 9/12 SCA vendors omit EOL data — strengthens our pillar piece."
    if "CVE-2026-3344" in title or "Apache HTTP/2" in title:
        return "Active exploitation reported; CISA directive likely within 72h."
    if "Daemon Tools" in title:
        return "40k installs hit; supply-chain framing rather than malware-of-the-day."
    if "China-Linked" in title or "UAT-8302" in title:
        return "European telco targeting — angle for our APT business-risk series."
    if "Karakurt" in title:
        return "Sentencing detail makes this a ransomware-economics piece, not a breach piece."
    if "OpenSSH" in title:
        return "Patch path is non-trivial on RHEL clones; admin checklist is the play."
    if "Weaver" in title:
        return "Active exploit since March; freshness window is closing fast."
    if "CISA" in title:
        return "Emergency directive — anchor a 'what admins do today' explainer."
    if "Microsoft Warns" in title:
        return "Phishing campaign with supply-chain dimension; cross-link to SCA pillar."
    return "Competitor coverage exists; Cantina has none in window — clear gap."


def _impact_for(row) -> str:
    n = row["competitor_count"]
    sev = row["max_severity"]
    return (
        f"Closing this gap targets {n} competitor stories at {sev} severity. "
        f"Estimated +6–12 inclusion lift if shipped within 48h."
    )


def synthesize_briefs(gap_rows, top_n=5):
    briefs = []
    used_queries: set[str] = set()
    used_tokens: set[str] = set()
    for row in gap_rows[:top_n]:
        theme_key = row["theme_key"]
        target_q = _pick_query_for_theme(theme_key, exclude=used_queries, avoid_tokens=used_tokens)
        if target_q:
            used_queries.add(target_q.query)
            used_tokens.update(_query_tokens(target_q.query))
        secondary = _pick_secondary_queries(theme_key, target_q, exclude=used_queries, avoid_tokens=used_tokens, n=2)
        for sq in secondary:
            used_queries.add(sq.query)
            used_tokens.update(_query_tokens(sq.query))
        must_facts = _facts_from_competitor_articles(row["competitor_articles"])
        must_sources = _authoritative_links(row["competitor_articles"])
        outline = _outline_for_theme(theme_key, target_q)
        briefs.append(
            {
                "theme": row["label"],
                "headline": _headline_for(theme_key, target_q),
                "target_query": target_q.query if target_q else "",
                "secondary_queries": [q.query for q in secondary],
                "intent": INTENT_BY_THEME.get(theme_key, "informational"),
                "outline": outline,
                "must_include_facts": must_facts,
                "must_cite_sources": must_sources,
                "schema_type": (
                    "FAQPage" if INTENT_BY_THEME.get(theme_key) == "informational" else "NewsArticle"
                ),
                "estimated_aeo_lift": "+8 to +14 inclusion points",
                "competitor_benchmarks": [
                    {
                        "url": a["url"],
                        "what_they_did_well": "First to publish; clean lede; CISA-linked.",
                        "what_they_missed": "Thin remediation grid; no admin-time checklist.",
                    }
                    for a in row["competitor_articles"][:2]
                ],
                "headline_patterns": _headline_patterns(theme_key, target_q),
            }
        )
    return briefs


def _pick_query_for_theme(theme_key, exclude: set[str] | None = None, avoid_tokens: set[str] | None = None):
    exclude = exclude or set()
    avoid_tokens = avoid_tokens or set()
    needles = _theme_needles(theme_key)
    candidates: list[tuple[int, int, int, Query]] = []
    for q in QUERIES:
        if q.query in exclude:
            continue
        hay = q.query.lower()
        needle_hits = sum(1 for n in needles if n.lower() in hay)
        if needle_hits == 0:
            continue
        q_tokens = _query_tokens(q.query)
        overlap_penalty = len(q_tokens & avoid_tokens)
        candidates.append((needle_hits, -overlap_penalty, q.weekly_volume_estimate, q))
    if candidates:
        candidates.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)
        return candidates[0][3]
    # Fallback: least-overlapping unused query by volume.
    fallback: list[tuple[int, int, Query]] = []
    for q in QUERIES:
        if q.query in exclude:
            continue
        overlap_penalty = len(_query_tokens(q.query) & avoid_tokens)
        fallback.append((-overlap_penalty, q.weekly_volume_estimate, q))
    if fallback:
        fallback.sort(key=lambda x: (x[0], x[1]), reverse=True)
        return fallback[0][2]
    return None


def _pick_secondary_queries(
    theme_key,
    primary,
    exclude: set[str] | None = None,
    avoid_tokens: set[str] | None = None,
    n=2,
):
    exclude = exclude or set()
    avoid_tokens = avoid_tokens or set()
    out = []
    primary_tokens = _query_tokens(primary.query) if primary else set()
    needles = _theme_needles(theme_key)
    scored: list[tuple[int, int, int, Query]] = []
    for q in QUERIES:
        if q is primary or q.query in exclude:
            continue
        hay = q.query.lower()
        needle_hits = sum(1 for nd in needles if nd.lower() in hay)
        if needle_hits == 0:
            continue
        q_tokens = _query_tokens(q.query)
        overlap_with_primary = len(q_tokens & primary_tokens)
        overlap_penalty = len(q_tokens & avoid_tokens)
        scored.append((needle_hits, -overlap_with_primary - overlap_penalty, q.weekly_volume_estimate, q))
    scored.sort(key=lambda x: (x[0], x[1], x[2]), reverse=True)
    for _, _, _, q in scored:
        out.append(q)
        if len(out) >= n:
            break
    return out


def _facts_from_competitor_articles(comp_articles):
    facts = []
    for a in comp_articles:
        m = re.search(r"CVE-\d{4}-\d{4,7}", a["title"])
        if m:
            facts.append(m.group(0))
        if "$15M" in a["title"]:
            facts.append("Google Android exploit max payout: $15M (2026)")
        if "85 years" in a["title"]:
            facts.append("Karakurt negotiator sentence: 85 years")
        if "40k" in a["title"]:
            facts.append("Daemon Tools incident scope: ~40,000 installations")
        if "EOL" in a["title"]:
            facts.append("9/12 SCA vendors omit EOL CVE data (Cantina survey, Mar 2026)")
    # De-dupe preserving order
    seen = set()
    return [f for f in facts if not (f in seen or seen.add(f))]


def _authoritative_links(_comp_articles):
    # In production, follow the article and pull its linked authority domains.
    return [
        "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
        "https://nvd.nist.gov/",
    ]


def _outline_for_theme(theme_key, _target_q):
    common_first = {
        "h2": "TL;DR",
        "bullets": [
            "One-sentence answer to the target query",
            "Who is affected (sector / version / region)",
            "What to do today (admin checklist link)",
        ],
    }
    by_theme = {
        "supply-chain": [
            common_first,
            {
                "h2": "What is the EOL blind spot?",
                "bullets": ["Definition", "Why NVD-only feeds miss it", "Real-world example"],
            },
            {
                "h2": "12-vendor SCA survey results",
                "bullets": ["Methodology", "Pass/fail table", "Surprising findings"],
            },
            {
                "h2": "What admins should ask their SCA vendor",
                "bullets": ["5 questions", "What 'good' answers look like"],
            },
            {
                "h2": "FAQ",
                "bullets": [
                    "Does my tool cover EOL?",
                    "What replaces an EOL component?",
                    "How do I monitor without upstream advisories?",
                ],
            },
        ],
        "zero-day": [
            common_first,
            {
                "h2": "Exploit timeline",
                "bullets": ["First seen", "Disclosure", "Patch released", "CISA directive"],
            },
            {
                "h2": "Patch / mitigation grid",
                "bullets": ["By distro/vendor", "Workarounds if you can't patch"],
            },
            {"h2": "IOCs", "bullets": ["Hashes", "Network indicators", "Detection rules"]},
            {
                "h2": "FAQ",
                "bullets": [
                    "Am I exposed by default?",
                    "Does WAF help?",
                    "How do I confirm patching worked?",
                ],
            },
        ],
        "ransomware": [
            common_first,
            {
                "h2": "What happened",
                "bullets": ["Incident scope", "Sector targeting", "Negotiation outcome"],
            },
            {
                "h2": "Why this matters for the ransomware economy",
                "bullets": ["Pricing trend", "Negotiator labor market", "Law-enforcement effect"],
            },
            {
                "h2": "What CISOs should change",
                "bullets": ["Backup posture", "Tabletop additions"],
            },
            {"h2": "FAQ", "bullets": ["Should we ever pay?", "Reporting obligations?"]},
        ],
        "espionage": [
            common_first,
            {
                "h2": "Campaign profile",
                "bullets": ["Threat actor objective", "Target sectors", "Geography and victim profile"],
            },
            {
                "h2": "TTP breakdown",
                "bullets": ["Initial access path", "Persistence model", "Collection/exfiltration indicators"],
            },
            {
                "h2": "Defender playbook",
                "bullets": ["Priority detections this week", "Containment checklist", "Executive reporting language"],
            },
            {"h2": "FAQ", "bullets": ["Who is most at risk?", "What telemetry matters first?", "What can wait?"]},
        ],
        "bug-bounty": [
            common_first,
            {
                "h2": "Program economics",
                "bullets": ["Payout tiers", "Exploit class valuation", "Submission-to-payout timeline"],
            },
            {
                "h2": "Researcher decision matrix",
                "bullets": ["Where effort is rewarded", "Scope caveats", "Common rejection reasons"],
            },
            {
                "h2": "Buyer guidance",
                "bullets": ["How to benchmark your program", "When to raise payouts", "Abuse prevention controls"],
            },
            {"h2": "FAQ", "bullets": ["Are higher payouts always better?", "Which findings are overpaid?", "What should we publish?"]},
        ],
        "identity-cloud": [
            common_first,
            {
                "h2": "Root causes",
                "bullets": ["IAM sprawl patterns", "Policy drift sources", "Privilege escalation paths"],
            },
            {
                "h2": "Hardening sequence",
                "bullets": ["Immediate controls", "30-day remediation plan", "Owner/accountability model"],
            },
            {
                "h2": "Validation checks",
                "bullets": ["Least-privilege tests", "Break-glass review", "Continuous monitoring signals"],
            },
            {"h2": "FAQ", "bullets": ["How strict should policies be?", "What breaks when tightening IAM?", "How do we phase rollout?"]},
        ],
        "infostealers": [
            common_first,
            {
                "h2": "Stealer ecosystem map",
                "bullets": ["Top families this month", "Distribution channels", "Credential resale paths"],
            },
            {
                "h2": "Detection and response",
                "bullets": ["Host indicators", "Identity-layer detections", "Session revocation playbook"],
            },
            {
                "h2": "Prevention controls",
                "bullets": ["Endpoint hardening", "Browser/session protections", "User workflow changes"],
            },
            {"h2": "FAQ", "bullets": ["How fast do credentials leak?", "What logs catch early spread?", "What to reset first?"]},
        ],
    }
    return by_theme.get(theme_key, [common_first, {"h2": "Background", "bullets": ["Scope", "Current signal", "Why now"]}, {"h2": "Analysis", "bullets": ["Observed pattern", "Operational impact", "Recommended action"]}, {"h2": "FAQ", "bullets": ["What changed?", "What should we do first?", "How do we measure progress?"]}])


def _headline_for(theme_key, q: Query) -> str:
    if not q:
        return f"{THEMES[theme_key]['label']} this week"
    base = q.query
    headline = base[0].upper() + base[1:]
    if "what to do" in headline.lower():
        return headline
    return headline + " — what to do"


def _headline_patterns(theme_key, target_q: Query | None):
    query_subject = "this threat"
    if target_q:
        cleaned = re.sub(r"^(what is|how to|why|best)\s+", "", target_q.query.strip(), flags=re.I)
        query_subject = cleaned.strip(" ?") or query_subject
    base = {
        "supply-chain": [
            f"What is {query_subject}?",
            f"Why your SCA stack misses {query_subject}",
            f"{query_subject} vs legacy CVE workflows in 2026",
            f"How to audit {query_subject} in production",
        ],
        "zero-day": [
            f"{query_subject} explained",
            f"How to patch {query_subject} today",
            f"{query_subject} exploit timeline",
            f"Is {query_subject} exploitable in your environment?",
        ],
        "ransomware": [
            f"{query_subject}, explained",
            f"Why {query_subject} matters",
            f"What CISOs should change after {query_subject}",
            f"What changed this week in {query_subject}",
        ],
    }.get(theme_key, [f"What is {query_subject}?", f"How to handle {query_subject}", f"{query_subject} vs alternatives", f"{query_subject} checklist for teams"])
    if not target_q:
        return base[:3]
    q_tokens = [t for t in re.findall(r"[a-z0-9]+", target_q.query.lower()) if len(t) >= 4][:2]
    if not q_tokens:
        return base[:3]
    token_hint = " ".join(q_tokens)
    return [base[0], f"{token_hint}: what to do now", base[2]]


def synthesize_audit_fixes(audit_results, threshold=70):
    out = []
    for r in audit_results:
        if r["score"] < threshold and r["top_fixes"]:
            out.append(
                {
                    "url": r["url"],
                    "title": r["title"],
                    "score": r["score"],
                    "denominator": r["denominator"],
                    "top_fixes": r["top_fixes"],
                }
            )
    out.sort(key=lambda x: x["score"])
    return out


def synthesize_refresh_queue(cantina_articles, gap_rows, audit_results):
    audit_by_url = {r["url"]: r for r in audit_results}
    queue = []
    for art in cantina_articles:
        # Find the theme this article belongs to.
        theme_key = None
        for k, t in THEMES.items():
            if set(art.tags) & t["match_tags"]:
                theme_key = k
                break
        if not theme_key:
            continue
        # Did this theme get ≥2 new competitor stories this week?
        row = next((r for r in gap_rows if r["theme_key"] == theme_key), None)
        if not row:
            continue
        recent_comp = [
            a
            for a in row["competitor_articles"]
            if (TODAY - date.fromisoformat(a["published_at"])).days <= 7
        ]
        if len(recent_comp) < 2:
            continue
        # Only refresh articles older than 14 days OR auditing < 80.
        age = (TODAY - date.fromisoformat(art.published_at)).days
        score = audit_by_url.get(art.url, {}).get("score", 0)
        if age < 14 and score >= 80:
            continue
        queue.append(
            {
                "url": art.url,
                "title": art.title,
                "age_days": age,
                "current_aeo_score": score,
                "reason": (
                    f"{len(recent_comp)} new competitor stories in '{row['label']}' "
                    f"in last 7 days; this article is {age}d old."
                ),
                "what_changed_block": _what_changed_block(recent_comp),
            }
        )
    return queue


def _what_changed_block(recent_comp):
    bullets = []
    for a in recent_comp[:3]:
        bullets.append(f"- {a['title']} ({a['source']}, {a['published_at']})")
    return "**What changed (" + TODAY.isoformat() + "):**\n" + "\n".join(bullets)


# ---------------------------------------------------------------------------
# Stage 8 — Publish
# ---------------------------------------------------------------------------


def hero_metrics(gap_rows, audit_results, probes):
    total_clusters = len([r for r in gap_rows if r["competitor_count"] > 0])
    covered = len([r for r in gap_rows if r["cantina_count"] > 0 and r["competitor_count"] > 0])
    coverage_pct = round(covered / max(1, total_clusters), 3)

    cite_share, denom = citation_share(probes)
    aeo_med = int(median([r["score"] for r in audit_results])) if audit_results else 0
    fresh = round(
        sum(
            1
            for a in CANTINA_ARTICLES
            if (TODAY - date.fromisoformat(a.published_at)).days <= 14
        )
        / max(1, len(CANTINA_ARTICLES)),
        3,
    )
    return {
        "coverage_pct": {
            "value": coverage_pct,
            "denominator": total_clusters,
            "explanation": f"{covered} of {total_clusters} live themes have ≥1 Cantina article",
        },
        "citation_share": {
            "value": cite_share,
            "denominator": denom,
            "explanation": (
                f"Cantina cited in {sum(1 for p in probes if p.cantina_cited)} of {denom} "
                f"probe slots across {len(QUERIES)} queries × {len(ENGINES)} engines"
            ),
        },
        "aeo_median": {
            "value": aeo_med,
            "denominator": 100,
            "explanation": f"Median 14-point rubric score across {len(audit_results)} Cantina articles",
        },
        "freshness_pct": {
            "value": fresh,
            "denominator": len(CANTINA_ARTICLES),
            "explanation": "Cantina articles updated/published in last 14 days",
        },
    }


def run() -> dict:
    cantina_clusters = cluster_articles(CANTINA_ARTICLES)
    competitor_clusters = cluster_articles(COMPETITOR_ARTICLES)
    gap_rows = gap_detect(cantina_clusters, competitor_clusters)
    audit = [audit_article(a) for a in CANTINA_ARTICLES]
    probes = mock_geo_probe(QUERIES)
    pulse = synthesize_pulse_opportunities(gap_rows, top_n=3)
    briefs = synthesize_briefs(gap_rows, top_n=5)
    fixes = synthesize_audit_fixes(audit)
    refresh = synthesize_refresh_queue(CANTINA_ARTICLES, gap_rows, audit)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "window": {
            "start": (TODAY - timedelta(days=14)).isoformat(),
            "end": TODAY.isoformat(),
        },
        "hero_metrics": hero_metrics(gap_rows, audit, probes),
        "themes": [
            {
                "theme_key": r["theme_key"],
                "label": r["label"],
                "competitor_count": r["competitor_count"],
                "cantina_count": r["cantina_count"],
                "gap_score": r["gap_score"],
                "max_severity": r["max_severity"],
                "momentum": r["momentum"],
                "priority": r["priority"],
            }
            for r in gap_rows
        ],
        "pulse_opportunities": pulse,
        "weekly_briefs": briefs,
        "audit_fixes": fixes,
        "refresh_queue": refresh,
        "geo_signals": {
            "engines": ENGINES,
            "queries_probed": len(QUERIES),
            "probes": [asdict(p) for p in probes[:25]],  # truncate sample
            "summary": {
                "citation_share": citation_share(probes)[0],
                "queries_where_cantina_cited": sorted({p.query for p in probes if p.cantina_cited}),
            },
        },
    }
    return payload


def print_summary(payload):
    print("=" * 78)
    print(f" Grace Ops v2 — daily pulse · {payload['generated_at']}")
    print("=" * 78)
    h = payload["hero_metrics"]
    print(
        f"\nCoverage:        {h['coverage_pct']['value'] * 100:>5.1f}% "
        f"({h['coverage_pct']['explanation']})"
    )
    print(
        f"Citation share:  {h['citation_share']['value'] * 100:>5.1f}% "
        f"({h['citation_share']['explanation']})"
    )
    print(f"AEO median:      {h['aeo_median']['value']:>5}/100 " f"({h['aeo_median']['explanation']})")
    print(
        f"Freshness:       {h['freshness_pct']['value'] * 100:>5.1f}% "
        f"({h['freshness_pct']['explanation']})"
    )

    print("\n— Top theme gaps —")
    for r in payload["themes"][:5]:
        print(
            f"  • {r['label']:<32} comp={r['competitor_count']:>2}  "
            f"cantina={r['cantina_count']:>2}  gap={r['gap_score']:.2f}  "
            f"sev={r['max_severity']}"
        )

    print("\n— Pulse opportunities (top 3) —")
    for o in payload["pulse_opportunities"]:
        print(f"\n  [{o['severity'].upper()}] {o['theme']}")
        print(textwrap.fill(f"    Angle: {o['angle']}", width=78, subsequent_indent="           "))
        print(textwrap.fill(f"    Impact: {o['impact']}", width=78, subsequent_indent="            "))
        for ref in o["refs"]:
            print(f"    – {ref['title']} ({ref['source']}, {ref['published_at']})")
            print(f"      → {ref['one_line_takeaway']}")

    print("\n— Weekly briefs (top 5 headlines) —")
    for b in payload["weekly_briefs"]:
        print(f"  • {b['headline']}")
        print(f"      target query: {b['target_query']}")
        print(f"      schema: {b['schema_type']}  intent: {b['intent']}")

    print("\n— Audit fixes —")
    for f in payload["audit_fixes"]:
        print(f"  · {f['title']}  ({f['score']}/100)")
        for fix in f["top_fixes"]:
            print(f"      → {fix}")

    print("\n— Refresh queue —")
    for r in payload["refresh_queue"]:
        print(f"  · {r['title']}  ({r['age_days']}d, {r['current_aeo_score']}/100)")
        print(f"      reason: {r['reason']}")

    print(
        "\nGEO citation share across {0} probes: {1:.1%}".format(
            sum(len(p["cited_domains"]) for p in payload["geo_signals"]["probes"])
            or len(QUERIES) * len(ENGINES) * 3,
            payload["geo_signals"]["summary"]["citation_share"],
        )
    )
    print("Cantina was cited for queries:")
    for q in payload["geo_signals"]["summary"]["queries_where_cantina_cited"]:
        print(f"  · {q}")
    print()


if __name__ == "__main__":
    out_dir = Path(__file__).parent / "output"
    out_dir.mkdir(exist_ok=True)
    payload = run()
    out_path = out_dir / "daily_pulse.json"
    out_path.write_text(json.dumps(payload, indent=2, default=str))
    print_summary(payload)
    print(f"\nWrote: {out_path}")
