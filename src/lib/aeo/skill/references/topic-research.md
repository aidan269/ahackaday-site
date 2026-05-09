# Finding Topic Opportunities for AI Search

The goal of weekly topic recommendations is not "more posts." It is to identify the queries where (a) users are asking AI engines something, (b) the AI engines do not have a good source to cite, and (c) the user's brand is credibly positioned to be that source.

## Methods

### 1. Ask the AI engines directly

For each priority topic cluster the user has set, run 10–20 conversational queries against the actual AI engines:

- Use the WebFetch tool against `https://www.perplexity.ai/?q=<query>` or comparable.
- Or, simulate by checking whether ChatGPT/Claude returns confident, well-cited answers for the query.

Look for queries where:
- The AI engine's answer is short, vague, or hedged → opportunity to be the canonical source.
- The cited sources are weak (forum posts, outdated articles, competitors with thin content) → opportunity to displace them.
- No sources are cited at all, only a generic answer → strong opportunity.

### 2. Mine the user's own content for incomplete topics

Pages scoring poorly on "topical depth" (sub-score 6 in the rubric) are signal that the user is leaving sub-questions on the table. Each missing sub-question is a potential standalone post.

For each cluster, list the canonical user questions:
- What is X?
- How does X work?
- How much does X cost?
- How long does X take?
- X vs Y?
- Common mistakes in X?
- How to choose an X provider?
- X case study / examples
- X for [specific persona]
- X best practices in [year]

If the user does not have a strong page on each of these, that is the topic queue.

### 3. Mine competitor content that is getting cited

For the 1–3 competitors named in `aeo-config.md`, check which of their pages currently appear in AI Overviews / Perplexity / ChatGPT for cluster queries. For each competitor page that gets cited:
- Read the page.
- Identify the specific passage being lifted (it will usually be a direct definitional sentence or a stat).
- Ask: can the user write a stronger, more specific, more recent passage on the same topic? If yes, that is a topic.

### 4. Look for "dated by year" queries

Queries with a year in them ("X best practices 2026," "state of X in 2026") are a recurring high-opportunity pattern because the canonical sources go stale every January. AI engines visibly prefer recent dates in these queries.

### 5. Look for primary-research opportunities

If the user has data nobody else has — audit findings, customer benchmarks, internal stats — the highest-leverage topics are the ones built around publishing that data. Original research is the gold standard for AEO/GEO because every other source ends up citing back to it.

---

## How to rank the topic queue

For each candidate topic, score on three dimensions:

- **Demand:** Are users actually asking this in AI engines? (Inferable from query volume in classic search tools, or from how natural the phrasing is.)
- **Gap:** How weak is the current set of cited sources for this query?
- **Fit:** Does the user's brand have the credibility, data, or perspective to win this query?

Rank topics by `Demand × Gap × Fit`. The top 5–10 go in the weekly report. Anything where Fit is low (the user has no credibility on the topic) gets dropped, even if Demand and Gap are high.

## Output format for each topic

```
## Topic N: <one-line topic>
- **Target query:** "<the actual phrase a user would type into ChatGPT or Perplexity>"
- **Why it's underserved:** <one or two sentences>
- **Brand angle:** <how this user's brand should position the answer>
- **Draft H1:** <proposed page title>
- **Draft TL;DR (40 words, citable):** <a 40-word lead paragraph that, if it stood alone, would itself be a clean citation>
```

The 40-word draft TL;DR is the most valuable part of each topic recommendation. If the user only acts on the draft TL;DR and gives that to a writer to expand, they have already won most of the AEO benefit.
