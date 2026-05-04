"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";
import { wikiTypeColor, wikiTypeGroupLabel, wikiTypeIcon } from "./wiki-type-badge";

type GraphNode = SimulationNodeDatum & {
  slug: string;
  title: string;
  page_type: string;
  degree?: number;
};

type GraphLink = SimulationLinkDatum<GraphNode> & {
  from: string;
  to: string;
};

type Props = {
  nodes: { slug: string; title: string; page_type: string }[];
  edges: { from: string; to: string }[];
  centerSlug?: string;
  mini?: boolean;
  height?: number;
  onNodeClick?: (slug: string) => void;
};

// --- Palette ---
const EDGE_COLOR = "rgba(120,112,106,0.35)";
const EDGE_HIGHLIGHT = "#c2652a";
const LABEL_COLOR = "#3a302a";

function nodeRadius(degree: number, mini: boolean): number {
  if (mini) return Math.max(3, Math.min(6, 3 + Math.sqrt(degree) * 1.2));
  return Math.max(5, Math.min(18, 5 + Math.sqrt(degree) * 3));
}

export function WikiGraph({
  nodes: rawNodes,
  edges: rawEdges,
  centerSlug,
  mini = false,
  height,
  onNodeClick,
}: Props) {
  const router = useRouter();
  const svgRef = React.useRef<SVGSVGElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ w: 800, h: height ?? 400 });
  const [simNodes, setSimNodes] = React.useState<GraphNode[]>([]);
  const [simLinks, setSimLinks] = React.useState<GraphLink[]>([]);
  const [hoveredSlug, setHoveredSlug] = React.useState<string | null>(null);
  const [tooltip, setTooltip] = React.useState<{
    x: number;
    y: number;
    title: string;
    type: string;
    degree: number;
  } | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const simulationRef = React.useRef<any>(null);

  // Measure container
  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      const { width, height: h } = entries[0].contentRect;
      setDimensions({ w: width, h: height ?? h });
    });
    obs.observe(el);
    setDimensions({ w: el.clientWidth, h: height ?? el.clientHeight });
    return () => obs.disconnect();
  }, [height]);

  // Build simulation
  React.useEffect(() => {
    if (rawNodes.length === 0) return;

    const degreeMap = new Map<string, number>();
    for (const e of rawEdges) {
      degreeMap.set(e.from, (degreeMap.get(e.from) ?? 0) + 1);
      degreeMap.set(e.to, (degreeMap.get(e.to) ?? 0) + 1);
    }

    const nodes: GraphNode[] = rawNodes.map((n) => ({
      ...n,
      degree: degreeMap.get(n.slug) ?? 0,
      fx: n.slug === centerSlug ? dimensions.w / 2 : undefined,
      fy: n.slug === centerSlug ? dimensions.h / 2 : undefined,
    }));

    const nodeBySlug = new Map(nodes.map((n) => [n.slug, n]));
    const links: GraphLink[] = rawEdges
      .map((e) => ({ ...e, source: nodeBySlug.get(e.from)!, target: nodeBySlug.get(e.to)! }))
      .filter((l) => l.source && l.target);

    const sim = forceSimulation<GraphNode>(nodes)
      .force(
        "link",
        forceLink<GraphNode, GraphLink>(links)
          .id((d) => (d as GraphNode).slug)
          .distance(mini ? 40 : 80)
          .strength(0.4)
      )
      .force("charge", forceManyBody().strength(mini ? -60 : -120))
      .force("center", forceCenter(dimensions.w / 2, dimensions.h / 2).strength(0.05))
      .force("collide", forceCollide<GraphNode>((d) => nodeRadius(d.degree ?? 0, mini) + 4))
      .alphaDecay(0.03);

    sim.on("tick", () => {
      setSimNodes([...nodes]);
      setSimLinks([...links]);
    });

    simulationRef.current = sim;

    return () => {
      sim.stop();
    };
  }, [rawNodes, rawEdges, centerSlug, dimensions.w, dimensions.h, mini]);

  // Neighbors of hovered node
  const neighborSlugs = React.useMemo(() => {
    if (!hoveredSlug) return null;
    const set = new Set<string>([hoveredSlug]);
    for (const l of simLinks) {
      const src = typeof l.source === "object" ? (l.source as GraphNode).slug : String(l.source);
      const tgt = typeof l.target === "object" ? (l.target as GraphNode).slug : String(l.target);
      if (src === hoveredSlug) set.add(tgt);
      if (tgt === hoveredSlug) set.add(src);
    }
    return set;
  }, [hoveredSlug, simLinks]);

  // Type counts for legend
  const typeCounts = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of rawNodes) {
      counts[n.page_type] = (counts[n.page_type] ?? 0) + 1;
    }
    return counts;
  }, [rawNodes]);

  const handleNodeClick = (slug: string) => {
    if (onNodeClick) {
      onNodeClick(slug);
    } else {
      router.push(`/wiki/${slug}`);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full overflow-hidden ${mini ? "rounded-xl border border-border" : ""}`}
      style={{ height: height ?? "100%", background: "var(--color-background, #faf5ee)" }}
    >
      <svg
        ref={svgRef}
        width={dimensions.w}
        height={dimensions.h}
        style={{ display: "block" }}
      >
        {/* Edges */}
        <g>
          {simLinks.map((link, i) => {
            const src = link.source as GraphNode;
            const tgt = link.target as GraphNode;
            if (!src?.x || !tgt?.x) return null;

            const isHighlighted =
              hoveredSlug &&
              (src.slug === hoveredSlug || tgt.slug === hoveredSlug);

            return (
              <line
                key={i}
                x1={src.x}
                y1={src.y}
                x2={tgt.x}
                y2={tgt.y}
                stroke={isHighlighted ? EDGE_HIGHLIGHT : EDGE_COLOR}
                strokeWidth={isHighlighted ? 2.5 : 1.2}
                opacity={hoveredSlug ? (isHighlighted ? 0.9 : 0.1) : 0.5}
                style={{ transition: "opacity 200ms ease, stroke-width 200ms ease" }}
              />
            );
          })}
        </g>

        {/* Nodes */}
        <g>
          {simNodes.map((node) => {
            if (node.x === undefined || node.y === undefined) return null;
            const r = nodeRadius(node.degree ?? 0, mini);
            const color = wikiTypeColor(node.page_type);
            const isDimmed = hoveredSlug && !neighborSlugs?.has(node.slug);
            const isHovered = hoveredSlug === node.slug;
            const isCenter = node.slug === centerSlug;

            return (
              <g
                key={node.slug}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: "pointer" }}
                onClick={() => handleNodeClick(node.slug)}
                onMouseEnter={(e) => {
                  setHoveredSlug(node.slug);
                  const rect = svgRef.current?.getBoundingClientRect();
                  if (rect) {
                    setTooltip({
                      x: e.clientX - rect.left,
                      y: e.clientY - rect.top - 16,
                      title: node.title,
                      type: node.page_type,
                      degree: node.degree ?? 0,
                    });
                  }
                }}
                onMouseLeave={() => {
                  setHoveredSlug(null);
                  setTooltip(null);
                }}
              >
                {/* Glow ring on hover */}
                {isHovered && (
                  <circle
                    r={r * 1.8}
                    fill={color}
                    opacity={0.12}
                    style={{ transition: "r 200ms ease" }}
                  />
                )}
                <circle
                  r={isHovered ? r * 1.3 : r}
                  fill={color}
                  opacity={isDimmed ? 0.15 : 0.9}
                  stroke={isCenter ? "#3a302a" : isHovered ? color : "rgba(255,255,255,0.8)"}
                  strokeWidth={isCenter ? 2.5 : isHovered ? 2 : 1}
                  style={{ transition: "r 200ms ease, opacity 200ms ease" }}
                />
                {!mini && !isDimmed && (
                  <text
                    x={r + 5}
                    y={4}
                    fill={LABEL_COLOR}
                    fontSize={isHovered ? 12 : 11}
                    fontWeight={isHovered ? 600 : 400}
                    opacity={isHovered ? 1 : 0.6}
                    style={{
                      pointerEvents: "none",
                      userSelect: "none",
                      transition: "opacity 200ms ease, font-size 200ms ease",
                    }}
                  >
                    {node.title.length > 24
                      ? node.title.slice(0, 22) + "…"
                      : node.title}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none z-50 px-3 py-2 rounded-lg text-xs shadow-lg"
          style={{
            position: "absolute",
            left: Math.min(tooltip.x + 12, dimensions.w - 200),
            top: Math.max(tooltip.y - 8, 8),
            background: "var(--color-card, #fff)",
            color: "var(--color-foreground, #3a302a)",
            border: "1px solid var(--color-border, rgba(216,208,200,0.6))",
            maxWidth: 220,
          }}
        >
          <p className="font-medium text-sm mb-0.5 truncate">{tooltip.title}</p>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span
              className="w-2 h-2 rounded-full shrink-0"
              style={{ background: wikiTypeColor(tooltip.type) }}
            />
            <span className="capitalize">{tooltip.type}</span>
            <span className="ml-auto">{tooltip.degree} links</span>
          </div>
        </div>
      )}

      {/* Legend */}
      {!mini && (
        <div className="absolute bottom-3 left-3 rounded-xl border border-border bg-card/90 backdrop-blur-sm px-3 py-2.5 text-xs shadow-sm max-w-[220px]">
          <div className="mb-1.5 font-semibold text-foreground text-xs">Node Types</div>
          <div className="flex flex-col gap-1">
            {Object.entries(typeCounts)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => (
                <div
                  key={type}
                  className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-accent/30 transition-colors"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{
                      background: wikiTypeColor(type),
                      boxShadow: `0 0 4px ${wikiTypeColor(type)}40`,
                    }}
                  />
                  <span className="material-symbols-outlined" style={{ fontSize: 11, color: wikiTypeColor(type) }}>
                    {wikiTypeIcon(type)}
                  </span>
                  <span className="text-muted-foreground">{wikiTypeGroupLabel(type)}</span>
                  <span className="text-muted-foreground/60 ml-auto tabular-nums">{count}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function WikiGraphMini({
  slug,
  nodes,
  edges,
}: {
  slug: string;
  nodes: { slug: string; title: string; page_type: string }[];
  edges: { from: string; to: string }[];
}) {
  return (
    <WikiGraph
      nodes={nodes}
      edges={edges}
      centerSlug={slug}
      mini
      height={180}
    />
  );
}
