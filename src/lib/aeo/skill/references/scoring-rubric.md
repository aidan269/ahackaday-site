# Citation-Worthiness Scoring Rubric (0–100)

Six sub-scores. Total = sum. Score what is on the page right now, not what could be there with edits.

The headline number matters less than the sub-scores — the sub-scores tell the user where to focus. A page scoring 70/100 with a 5/20 on "Direct answer up front" needs a different fix than a page scoring 70/100 with a 5/15 on "Authority."

---

## 1. Direct answer up front (0–20)

Does the page answer the implied query in the first 100 words? LLMs heavily favor passages near the top of a page, especially the first heading-and-paragraph block. A page that buries the answer under 600 words of intro will lose to a thinner page that leads with the answer.

- **20** — TL;DR or summary block in the first 100 words that directly states the answer in 1–3 sentences. The answer is self-contained — a reader could cite the passage without reading further.
- **15** — Answer appears in the first 200 words but is interleaved with framing or context.
- **10** — Answer appears in the first half of the page but is not isolated as a standalone passage.
- **5** — Answer appears late in the page or is implied rather than stated.
- **0** — No clear answer to the implied query.

Look for: explicit "TL;DR," "In short," or a leading paragraph that begins with the subject ("X is Y, because Z"). Avoid: "In this post, we will explore…" — that is the worst possible opening for AEO.

## 2. Statistics and evidence (0–20)

Does the page contain named statistics, sourced data, or primary evidence?

- **20** — Multiple specific statistics with named sources (e.g., "according to a 2025 OWASP study, 43% of audited codebases…"). Original data or research on the page itself counts double here.
- **15** — Several specific statistics, but sources are vague ("studies show," "industry research").
- **10** — A few numbers, but mostly approximate or unattributed.
- **5** — Mostly qualitative claims with one or two numbers.
- **0** — Pure opinion or framework, no quantitative grounding.

LLMs disproportionately cite passages containing numbers because numbers are cheap signals of specificity. A page with three named stats in the first 300 words is doing more for its citation odds than 1,000 words of prose.

## 3. Structure (0–15)

How scannable is the page for an LLM crawler?

- **15** — Clear H2/H3 hierarchy with question-shaped subheads ("What is X?", "How does X work?"), at least one list or table, and either a FAQ block at the bottom or schema.org markup (FAQPage, HowTo, Article) in the source.
- **11** — H2/H3 hierarchy, some lists, but no question-shaped subheads or schema.
- **7** — Some structure, but mostly long prose paragraphs.
- **3** — Walls of text with minimal heading hierarchy.
- **0** — One giant block of text.

Question-shaped subheads matter because they mirror how users phrase queries to AI engines. A subhead "What is a smart contract audit?" is more discoverable than "Audit Overview."

## 4. Authority and E-E-A-T (0–15)

Is the source trustworthy from the LLM's perspective?

- **15** — Named author with linked bio, visible credentials/affiliations, page references original research or first-hand experience, brand has clear topical authority on its homepage.
- **11** — Named author and credentials, but no original research; brand is a recognizable name in the space.
- **7** — Named author, no credentials shown.
- **3** — No author byline, but brand is established.
- **0** — Anonymous content from an unknown publisher.

LLMs do not "know" authors directly, but they pick up signals from page structure (`author` schema, `<address>` tags, bio links, "About the author" boxes) and from the surrounding domain. Domain authority on the topic in question is what matters here, not generic domain authority.

## 5. Freshness (0–15)

How recent is the content, and does the page show its age?

- **15** — Visible publish date AND visible "last updated" date within the last 6 months. Cited sources are also recent.
- **11** — Visible publish date within the last 12 months, sources mostly recent.
- **7** — Date visible but older than 12 months, or content is undated but obviously recent.
- **3** — No visible date.
- **0** — Content is stale (more than 2 years old, references outdated tools/practices) and shows it.

Stale content is not always a problem — for evergreen topics ("what is a hash function") freshness matters less. But for AI-search topics, where the underlying field is moving, LLMs increasingly weight recency. A visible "Updated YYYY-MM-DD" stamp is one of the cheapest wins available.

## 6. Topical depth (0–15)

Does the page cover the related questions a curious reader would also ask, or does it leave them needing to go elsewhere?

- **15** — Page covers the main question plus 3–5 directly related sub-questions, with internal links to deeper resources where relevant. Reads like the canonical reference on the topic.
- **11** — Covers the main question and 1–2 related angles.
- **7** — Single-angle treatment; misses obvious follow-ups.
- **3** — Surface-level only.
- **0** — Thin content (<300 words on a substantive topic).

This sub-score correlates with whether an LLM cites this page versus a competitor's. Given two pages of equal quality, the LLM will prefer the one whose neighbors (related questions, internal links) confirm the source's authority on the broader topic.

---

## Output format for each scored page

```
URL: <url>
Score: <total>/100
- Direct answer up front: X/20
- Statistics and evidence: X/20
- Structure: X/15
- Authority / E-E-A-T: X/15
- Freshness: X/15
- Topical depth: X/15

Top 1-line diagnosis: <the single biggest reason this page is or is not getting cited>
```

The "top 1-line diagnosis" is what the user reads first. Make it count.
