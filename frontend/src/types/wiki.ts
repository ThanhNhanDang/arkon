export type WikiPageType = "entity" | "concept" | "topic" | "source" | "index" | "log";

export type WikiPageSummary = {
  slug: string;
  title: string;
  page_type: WikiPageType;
  summary: string;
  knowledge_type_slugs: string[];
  source_ids: string[];
  scope_type?: string;
  scope_id?: string;
  version: number;
  updated_at: string;
};

export type WikiPageDetail = WikiPageSummary & {
  content_md: string;
  backlinks: string[];
  outlinks: string[];
};

export type WikiGraphNode = {
  slug: string;
  title: string;
  page_type: string;
  // injected by d3-force simulation
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
};

export type WikiGraphEdge = {
  from: string;
  to: string;
  // d3-force replaces string refs with node objects after simulation init
  source?: WikiGraphNode | string;
  target?: WikiGraphNode | string;
};

export type WikiGraphData = {
  nodes: WikiGraphNode[];
  edges: WikiGraphEdge[];
};
