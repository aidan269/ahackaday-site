export type IocType = "cve" | "ip" | "domain" | "url" | "hash" | "package" | "other";

export type TypedIoc = {
  type: IocType;
  value: string;
  confidence: "high" | "mid" | "low";
  score: number;
};

export type ResponseTrack = "contain" | "hunt" | "patch" | "brief";

export type GraceState = {
  kpis: {
    north_star: number;
    answer_inclusion: number;
    freshness: number;
    open_actions: number;
  };
  top_recommendation: {
    id: string;
    title: string;
    status: string;
  } | null;
  recommendation_counts_by_status: Record<string, number>;
  latest_run: {
    run_id: string;
    status: "queued" | "started" | "completed" | "failed";
    created_at: string;
    origin: string;
  } | null;
  stale: boolean;
  ioc_count: number;
  extracted_indicators: string[];
};

export type TriageIncident = {
  slug: string;
  title: string;
  category: string;
  severity: string;
  summary: string;
  iocs: string[];
  sources: string[];
  evidence: {
    cves: string[];
    packages: string[];
  };
};

export type AeoRecommendationRow = {
  id: number;
  rank: number;
  issue: string;
  current_text: string;
  suggested_rewrite: string;
  why_it_helps: string;
  dismissed: boolean;
};

export type TopicQueueItem = {
  target_query: string;
  why_underserved: string;
  brand_angle: string;
  draft_h1: string;
  draft_tldr_40w: string;
};

/** Server-fetched bundle for the Content tab. */
export type ContentData = {
  incidentUuid: string;
  scored_at: string;
  model: string;
  total_score: number;
  sub_scores: {
    direct_answer: number;
    statistics: number;
    structure: number;
    authority: number;
    freshness: number;
    topical_depth: number;
  };
  one_line_diagnosis: string;
  low_content: boolean;
  recommendations: AeoRecommendationRow[];
  topics: TopicQueueItem[];
  isAdminViewer: boolean;
};
