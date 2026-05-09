# What LLMs Reward (and Punish) When Citing Content

A working catalog of patterns observed across ChatGPT, Perplexity, Claude, Gemini, and Google AI Overviews. Use this to find concrete edits — every "issue" below has a corresponding rewrite pattern.

## Patterns LLMs reward

### 1. The standalone definitional sentence

LLMs love sentences of the shape `<X> is <Y>, characterized by <A, B, C>.` They are easy to lift, easy to attribute, and read well in a generated answer.

**Weak:** "Smart contract audits are something projects often do before launch."
**Strong:** "A smart contract audit is a manual and automated review of blockchain code, conducted by independent security researchers, that identifies vulnerabilities before deployment."

### 2. The named statistic

A specific number with a named source is one of the highest-value passages on any page.

**Weak:** "Most projects find vulnerabilities during their audits."
**Strong:** "In a 2024 review of 200 audited DeFi protocols, researchers at <named firm> identified at least one critical vulnerability in 67% of codebases." *(Substitute a real, attributable stat from your own data — fabricated numbers will not earn citations and will erode trust if discovered.)*

If the user has no named source, recommend they generate one — original research is a topic recommendation, not just a writing fix.

### 3. The named expert quote

A direct quote attributed to a named, credentialed person.

**Pattern:** `"<one declarative sentence>," said <Name>, <Title> at <Org>.`

Even one good quote per page changes the citation profile materially.

### 4. The Q&A subhead

H2 or H3 phrased as the user's actual query.

**Weak H2:** "Audit Methodology"
**Strong H2:** "How does a smart contract audit work?"

This pattern earns double benefit: it improves on-page structure and increases the odds of matching long-tail conversational queries that AI engines surface.

### 5. The comparison table

Tables get extracted and re-rendered by AI engines almost verbatim. A page with a clean comparison table on a topic with low table coverage in the rest of the SERP is gold.

### 6. The numbered process list

For "how to" topics, an explicit `1. … 2. … 3. …` list is more citable than a paragraph describing the same steps.

### 7. The visible date stamp

`Updated: YYYY-MM-DD` near the top of the page. Costs almost nothing, signals freshness loudly.

### 8. The structured FAQ block

A block of explicit Q&A at the bottom of the page, ideally with FAQPage schema. Each Q&A pair is its own potential citation.

---

## Patterns LLMs punish (anti-patterns to flag)

### A1. The hedge wall

Sentences full of "may," "could," "sometimes," "in some cases," "potentially." LLMs learning from cited corpora down-weight passages that read as low-confidence — the model would be hedging its own answer through the citation, which it does not want to do.

**Flag:** Any sentence with two or more hedging words.
**Fix:** Rewrite as a direct claim where evidence supports it. Where it does not, recommend the user gather evidence (a topic suggestion).

### A2. The buried lede

The actual answer to the page's implied question appears after the first 200 words. Often signaled by openings like "In this post, we will…" or a long history-of-the-field intro.

**Fix:** Move the answer up. A TL;DR block is the cleanest intervention.

### A3. The unsourced claim

"Studies show," "experts agree," "industry research suggests" — without naming the study, expert, or source.

**Fix:** Either source it or remove it. Unsourced claims read as fluff to LLMs and contribute negatively to citation scoring.

### A4. The keyword-stuffed heading

H1 or H2 that reads like SEO from 2014. "Smart Contract Audit Services | Best Audit Firm | Crypto Security Audits."

**Fix:** Rewrite as natural language. LLMs prefer headings that read like a sentence over headings that read like a meta tag.

### A5. The undated post

No publish date, no updated date. Treated as untrustworthy by default.

**Fix:** Add visible publish + updated dates. If content has not been touched in over a year, an actual review pass plus an update stamp is cheap and high-value.

### A6. The anonymous post

No author byline, no bio. Major E-E-A-T penalty.

**Fix:** Add a named author with a one-paragraph bio, ideally with credentials, links to their other work, and `author` schema.

### A7. The wall of text

A 1,500-word post with two H2s and no lists, no tables, no formatting. Hard to scan, hard to extract from.

**Fix:** Break into Q&A subheads, lists, and at least one table or callout. Each scannable element is a potential standalone citation.

### A8. The promotional intro

Opening 200 words is a brand pitch about the company, not the topic.

**Fix:** Cut it. Brand context belongs in the byline and the footer, not in the first paragraph of every post.

---

## How to use this catalog when generating feedback

For each page you score, walk through the anti-patterns first (A1–A8). Each anti-pattern you find on the page gives you a concrete edit suggestion. Then walk through the rewards (1–8) and ask: which of these is missing that would be a high-leverage add for this page? Each missing reward pattern is also a potential edit.

Aim for 3–7 edits per page. More than 7 and the user will not act on any of them.
