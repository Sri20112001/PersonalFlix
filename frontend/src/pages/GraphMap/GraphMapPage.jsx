import React, { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { forceSimulation, forceLink, forceManyBody, forceCollide } from "d3-force";
import { api } from "../../api/apiClient";
import { performerImage } from "../../utilities/media";
import Spinner from "../../components/Spinner";
import GraphToolbar from "./GraphToolbar";
import GraphInspector from "./GraphInspector";
import "./graph-uiverse.css";

// Image cache for canvas rendering
const imageCache = new Map();
function getCachedImage(url) {
  if (!url) return null;
  if (imageCache.has(url)) return imageCache.get(url);
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = url;
  imageCache.set(url, img);
  return img;
}

function forceRadialShell(getOrbitRadius) {
  let nodes = [];

  function force(alpha) {
    for (const node of nodes) {
      const targetR = getOrbitRadius(node);
      if (targetR === 0) {
        // Pull nucleus nodes strongly to origin (0, 0)
        node.vx += -node.x * 0.15 * alpha;
        node.vy += -node.y * 0.15 * alpha;
        continue;
      }

      // Current distance from center
      const currentR = Math.hypot(node.x, node.y) || 1;
      const k = ((targetR - currentR) / currentR) * 0.12 * alpha;

      node.vx += node.x * k;
      node.vy += node.y * k;
    }
  }

  force.initialize = (_nodes) => {
    nodes = _nodes;
  };

  return force;
}

const ORBIT_RADII = {
  nucleus: 0,       // Center: Studios or active selection
  shell1: 180,      // Inner orbit: Performers
  shell2: 360,      // Outer orbit: Scenes / Co-stars
};

const getOrbitRadius = (node) => {
  if (node.type === "studio") return ORBIT_RADII.nucleus;
  if (node.type === "performer") return ORBIT_RADII.shell1;
  return ORBIT_RADII.shell2;
};

// Static type-based shell key, used only for initial ring pre-placement.
const orbitKey = (node) => {
  if (node.type === "studio") return "nucleus";
  if (node.type === "performer") return "shell1";
  return "shell2";
};



export default function GraphMap() {
  const navigate = useNavigate();
  const canvasRef = useRef(null);

  const [graphData, setGraphData] = useState(null);
  const [loading, setLoading] = useState(true);

  // View & Filter States
  const [mode, setMode] = useState("collab"); // "collab" (performers & studios) | "full" (includes scenes)
  const [showStudios, setShowStudios] = useState(true);
  const [showPerformers, setShowPerformers] = useState(true);
  const [showScenes, setShowScenes] = useState(true);
  const [minScenes, setMinScenes] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  // Interaction States
  const [selectedNode, setSelectedNode] = useState(null);
  const [hoveredNode, setHoveredNode] = useState(null);
  const [isPaused, setIsPaused] = useState(false);

  // Transform (pan & zoom)
  const transformRef = useRef({ x: 0, y: 0, k: 0.8 });
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedNodeRef = useRef(null);
  const simRef = useRef(null);
  const animFrameRef = useRef(null);
  // Last-known node positions, so filter/mode changes don't scatter the atom.
  const posRef = useRef(new Map());
  const didFitRef = useRef(false);

  // Fetch Graph Data
  useEffect(() => {
    setLoading(true);
    api
      .graph()
      .then((data) => {
        setGraphData(data);
      })
      .catch((err) => console.error("Failed to load graph data", err))
      .finally(() => setLoading(false));
  }, []);

  // Stable simulation nodes/links: rebuilt only on data/mode/filter changes,
  // so hovering or selecting never restarts the physics or wipes positions.
  const { activeNodes, activeLinks } = useMemo(() => {
    if (!graphData) {
      return { activeNodes: [], activeLinks: [] };
    }

    const rawNodes = graphData.nodes || [];
    const rawLinks = mode === "full" ? graphData.links || [] : graphData.collab_links || [];

    // Filter nodes
    const filteredNodes = rawNodes.filter((n) => {
      if (n.type === "studio" && !showStudios) return false;
      if (n.type === "performer" && !showPerformers) return false;
      if (n.type === "scene" && (mode !== "full" || !showScenes)) return false;
      if (n.scene_count != null && n.scene_count < minScenes) return false;
      return true;
    });

    const validIdSet = new Set(filteredNodes.map((n) => n.id));

    // Group totals for uniform ring pre-placement (prevents link tangling).
    const groupTotals = { nucleus: 0, shell1: 0, shell2: 0 };
    for (const n of filteredNodes) groupTotals[orbitKey(n)] += 1;
    const groupPlaced = { nucleus: 0, shell1: 0, shell2: 0 };

    // Clone nodes for D3 simulation mutability
    const simNodes = filteredNodes.map((n) => {
      const cloned = { ...n };
      // Assign initial radius based on type and importance
      if (cloned.type === "studio") {
        cloned.radius = Math.max(16, Math.min(36, 14 + Math.sqrt(cloned.scene_count || 1) * 2.5));
        cloned.color = "#6366F1"; // Indigo hub
      } else if (cloned.type === "performer") {
        cloned.radius = Math.max(12, Math.min(28, 10 + Math.sqrt(cloned.scene_count || 1) * 2));
        cloned.color = "#E5A919"; // Gold accent
      } else {
        cloned.radius = 5;
        cloned.color = "#64748B"; // Slate scene dot
      }
      const cached = posRef.current.get(cloned.id);
      if (cached) {
        // Keep last-known position across filter/mode changes.
        cloned.x = cached.x;
        cloned.y = cached.y;
      } else {
        // Distribute uniformly along the target ring rather than randomly.
        const key = orbitKey(n);
        const targetR = ORBIT_RADII[key];
        const idx = groupPlaced[key]++;
        const total = Math.max(1, groupTotals[key]);
        const angle = (idx / total) * Math.PI * 2;
        const jitter = key === "nucleus" ? 30 : 20;
        cloned.x = Math.cos(angle) * targetR + (Math.random() - 0.5) * jitter;
        cloned.y = Math.sin(angle) * targetR + (Math.random() - 0.5) * jitter;
      }
      return cloned;
    });

    // Filter links
    const simLinks = [];
    for (const l of rawLinks) {
      const sourceId = typeof l.source === "object" ? l.source.id : l.source;
      const targetId = typeof l.target === "object" ? l.target.id : l.target;
      if (validIdSet.has(sourceId) && validIdSet.has(targetId)) {
        simLinks.push({
          source: sourceId,
          target: targetId,
          type: l.type,
          weight: l.weight || 1,
        });
      }
    }

    return { activeNodes: simNodes, activeLinks: simLinks };
  }, [graphData, mode, showStudios, showPerformers, showScenes, minScenes]);

  const nodeMap = useMemo(
    () => new Map(activeNodes.map((n) => [n.id, n])),
    [activeNodes]
  );

  // Neighbors of selected or hovered node for highlighting (cheap: no sim restart).
  const neighborSet = useMemo(() => {
    const nSet = new Set();
    const activeFocusId = selectedNode?.id || hoveredNode?.id;
    if (activeFocusId) {
      nSet.add(activeFocusId);
      for (const l of activeLinks) {
        const sId = typeof l.source === "object" ? l.source.id : l.source;
        const tId = typeof l.target === "object" ? l.target.id : l.target;
        if (sId === activeFocusId) nSet.add(tId);
        if (tId === activeFocusId) nSet.add(sId);
      }
    }
    return nSet;
  }, [selectedNode?.id, hoveredNode?.id, activeLinks]);

  // BFS depth from the selected node for the dynamic focal atom:
  // selected → nucleus, 1st-degree → shell1, 2nd-degree → shell2.
  const depthMap = useMemo(() => {
    const depths = new Map();
    const selId = selectedNode?.id;
    if (!selId) return depths;
    const adj = new Map();
    const addEdge = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    };
    for (const l of activeLinks) {
      const sId = typeof l.source === "object" ? l.source.id : l.source;
      const tId = typeof l.target === "object" ? l.target.id : l.target;
      addEdge(sId, tId);
      addEdge(tId, sId);
    }
    depths.set(selId, 0);
    let frontier = [selId];
    for (let d = 1; d <= 2; d++) {
      const next = [];
      for (const id of frontier) {
        for (const nb of adj.get(id) || []) {
          if (!depths.has(nb)) {
            depths.set(nb, d);
            next.push(nb);
          }
        }
      }
      frontier = next;
    }
    return depths;
  }, [selectedNode?.id, activeLinks]);

  // Dynamic focal atom: with a selection, orbits are relative to it;
  // otherwise studios sit at the nucleus, performers shell1, scenes shell2.
  const orbitRadiusFor = useCallback(
    (node) => {
      if (selectedNode?.id) {
        const d = depthMap.get(node.id);
        if (d === 0) return ORBIT_RADII.nucleus;
        if (d === 1) return ORBIT_RADII.shell1;
        return ORBIT_RADII.shell2;
      }
      return getOrbitRadius(node);
    },
    [selectedNode?.id, depthMap]
  );

  // Initialize or Reheat D3 Force Simulation
  useEffect(() => {
    if (activeNodes.length === 0) return;
    if (simRef.current) simRef.current.stop();

    const sim = forceSimulation(activeNodes)
      // 1. Radial force keeps nodes on their atomic orbits
      .force("shell", forceRadialShell(orbitRadiusFor))
      // 2. Link force maintains connections, but weaker so it won't crush shells
      .force(
        "link",
        forceLink(activeLinks)
          .id((d) => d.id)
          .distance(60)
          .strength(0.15)
      )
      // 3. Collision force prevents overlapping electrons on the same shell
      .force("collide", forceCollide().radius((d) => d.radius + 12).iterations(2))
      // 4. Low charge prevents orbits from expanding outward
      .force("charge", forceManyBody().strength(-40))
      .alphaDecay(0.018);

    simRef.current = sim;
    return () => sim.stop();
  }, [activeNodes, activeLinks, orbitRadiusFor]);

  // Canvas Drawing Loop
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const dpr = window.devicePixelRatio || 1;

    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Apply Pan & Zoom Transform
    const { x, y, k } = transformRef.current;
    ctx.translate(x, y);
    ctx.scale(k, k);

    const hasFocus = neighborSet.size > 0;
    const activeFocusId = selectedNode?.id || hoveredNode?.id;

    // Orbit tracks, drawn before links. Labels adapt to focal mode:
    // with a selection the shells are 1st/2nd-degree neighbors.
    const ringDefs = selectedNode
      ? [
          { radius: ORBIT_RADII.shell1, label: "1ST DEGREE" },
          { radius: ORBIT_RADII.shell2, label: "2ND DEGREE" },
        ]
      : [
          { radius: ORBIT_RADII.shell1, label: "PERFORMERS" },
          { radius: ORBIT_RADII.shell2, label: "SCENES" },
        ];

    ringDefs.forEach(({ radius, label }) => {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(148, 163, 184, 0.18)";
      ctx.lineWidth = 1.5 / k;
      ctx.setLineDash([6 / k, 8 / k]); // Dashed orbital track
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = `${10 / k}px monospace`;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = "rgba(148, 163, 184, 0.5)";
      ctx.fillText(label, 0, -radius - 6 / k);
      ctx.restore();
    });

    // 1. Draw Links
    for (const link of activeLinks) {
      const source = link.source;
      const target = link.target;
      // Note: == null (not !x) so nucleus nodes at x/y = 0 still draw links.
      if (source.x == null || target.x == null) continue;

      const isConnected =
        activeFocusId &&
        (source.id === activeFocusId || target.id === activeFocusId);

      ctx.beginPath();
      ctx.moveTo(source.x, source.y);
      ctx.lineTo(target.x, target.y);

      if (isConnected) {
        ctx.strokeStyle = "#FFC52F";
        ctx.lineWidth = Math.min(6, 1.5 + (link.weight || 1) * 0.8) / k;
        ctx.globalAlpha = 0.9;
      } else {
        ctx.strokeStyle = link.type === "co_star" ? "#E5A919" : link.type === "performer_studio" ? "#818CF8" : "#334155";
        ctx.lineWidth = (link.weight ? Math.min(3.5, 0.8 + link.weight * 0.4) : 0.8) / k;
        ctx.globalAlpha = hasFocus ? 0.08 : link.type === "studio_scene" ? 0.25 : 0.35;
      }

      ctx.stroke();
    }

    // 2. Draw Nodes
    for (const node of activeNodes) {
      if (node.x == null || node.y == null) continue;

      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isNeighbor = neighborSet.has(node.id);
      const isDimmed = hasFocus && !isNeighbor;

      ctx.globalAlpha = isDimmed ? 0.15 : 1.0;

      // Studio Node: Hexagonal Glowing Hub
      if (node.type === "studio") {
        const r = node.radius;

        // Glow ring
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 7, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(99, 102, 241, 0.35)";
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#818CF8" : "#4F46E5";
        ctx.fill();
        ctx.strokeStyle = isSelected || isHovered ? "#A5B4FC" : "rgba(255,255,255,0.3)";
        ctx.lineWidth = 2.5 / k;
        ctx.stroke();

        // Studio Icon / Initial
        ctx.fillStyle = "#FFFFFF";
        ctx.font = `bold ${Math.max(10, Math.min(18, r * 0.8))}px sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(node.name[0]?.toUpperCase() || "S", node.x, node.y);

        // Label below
        if (k > 0.4 || isHovered || isSelected) {
          ctx.font = `bold ${Math.max(10, 12 / k)}px sans-serif`;
          ctx.fillStyle = isSelected || isHovered ? "#FFC52F" : "#E2E8F0";
          ctx.fillText(node.name, node.x, node.y + r + 13 / k);

          ctx.font = `${Math.max(9, 10 / k)}px monospace`;
          ctx.fillStyle = "#94A3B8";
          ctx.fillText(`${node.scene_count || 0} scenes`, node.x, node.y + r + 24 / k);
        }
      }

      // Performer Node: Circular Portrait
      else if (node.type === "performer") {
        const r = node.radius;

        // Selection / Hover Glow
        if (isSelected || isHovered) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, r + 6, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(229, 169, 25, 0.4)";
          ctx.fill();
        }

        // Clip circular portrait
        const imgUrl = node.image_url ? performerImage(node.image_url) : null;
        const img = imgUrl ? getCachedImage(imgUrl) : null;

        ctx.save();
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.clip();

        if (img && img.complete && img.naturalWidth > 0) {
          ctx.drawImage(img, node.x - r, node.y - r, r * 2, r * 2);
        } else {
          // Fallback Gradient Avatar
          const grad = ctx.createLinearGradient(node.x - r, node.y - r, node.x + r, node.y + r);
          grad.addColorStop(0, "#27272A");
          grad.addColorStop(1, "#3F3F46");
          ctx.fillStyle = grad;
          ctx.fillRect(node.x - r, node.y - r, r * 2, r * 2);

          ctx.fillStyle = "#F4F4F5";
          ctx.font = `bold ${Math.max(9, Math.min(16, r * 0.9))}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(node.name[0]?.toUpperCase() || "?", node.x, node.y);
        }
        ctx.restore();

        // Border
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.strokeStyle = isSelected || isHovered ? "#FFC52F" : "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = (isSelected || isHovered ? 3 : 1.5) / k;
        ctx.stroke();

        // Label
        if (k > 0.55 || isHovered || isSelected) {
          ctx.font = `600 ${Math.max(9, 11 / k)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = isSelected || isHovered ? "#FFC52F" : "#FFFFFF";
          ctx.fillText(node.name, node.x, node.y + r + 4 / k);
        }
      }

      // Scene Node (Full Mode)
      else if (node.type === "scene") {
        const r = isSelected || isHovered ? 8 : node.radius;

        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected || isHovered ? "#EF4444" : "#94A3B8";
        ctx.fill();
        ctx.strokeStyle = isSelected || isHovered ? "#FFFFFF" : "rgba(0,0,0,0.4)";
        ctx.lineWidth = 1.5 / k;
        ctx.stroke();

        if (k > 1.3 || isHovered || isSelected) {
          ctx.font = `${Math.max(8, 10 / k)}px sans-serif`;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillStyle = isSelected || isHovered ? "#FFFFFF" : "#CBD5E1";
          ctx.fillText(node.name, node.x, node.y + r + 3 / k);
        }
      }

      // Cache last-known position so rebuilds don't scatter the atom.
      posRef.current.set(node.id, { x: node.x, y: node.y });
    }

    ctx.restore();
  }, [activeNodes, activeLinks, neighborSet, selectedNode?.id, hoveredNode?.id]);

  // Animation Loop
  useEffect(() => {
    let running = true;
    const loop = () => {
      if (!running) return;
      draw();
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [draw]);

  // Find node at mouse coords
  const getNodeAt = (screenX, screenY) => {
    const { x, y, k } = transformRef.current;
    const worldX = (screenX - x) / k;
    const worldY = (screenY - y) / k;

    // Search in reverse order (top nodes first)
    for (let i = activeNodes.length - 1; i >= 0; i--) {
      const n = activeNodes[i];
      if (n.x == null || n.y == null) continue;
      const dist = Math.hypot(n.x - worldX, n.y - worldY);
      if (dist <= n.radius + 4 / k) {
        return n;
      }
    }
    return null;
  };

  // Center view on a specific node
  const zoomToNode = useCallback((node) => {
    if (!node || node.x == null || node.y == null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;
    const targetK = node.type === "scene" ? 1.8 : 1.3;

    transformRef.current = {
      x: width / 2 - node.x * targetK,
      y: height / 2 - node.y * targetK,
      k: targetK,
    };
    setSelectedNode(node);
  }, []);

  // Fit all nodes nicely in view
  const fitView = useCallback(() => {
    if (activeNodes.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const n of activeNodes) {
      if (n.x == null || n.y == null) continue;
      if (n.x < minX) minX = n.x;
      if (n.x > maxX) maxX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.y > maxY) maxY = n.y;
    }

    if (minX === Infinity) return;

    const graphWidth = maxX - minX + 100;
    const graphHeight = maxY - minY + 100;
    const k = Math.min(1.4, Math.max(0.15, Math.min(width / graphWidth, height / graphHeight) * 0.9));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    transformRef.current = {
      x: width / 2 - centerX * k,
      y: height / 2 - centerY * k,
      k,
    };
  }, [activeNodes]);

  // Center the atom on screen once data first arrives (origin starts at 0,0).
  useEffect(() => {
    if (!didFitRef.current && activeNodes.length > 0) {
      didFitRef.current = true;
      fitView();
    }
  }, [activeNodes, fitView]);

  // Mouse Handlers
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const node = getNodeAt(mouseX, mouseY);
    if (node) {
      draggedNodeRef.current = node;
      node.fx = node.x;
      node.fy = node.y;
      if (simRef.current && !isPaused) {
        simRef.current.alphaTarget(0.3).restart();
      }
    } else {
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMove = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (draggedNodeRef.current) {
      const { x, y, k } = transformRef.current;
      draggedNodeRef.current.fx = (mouseX - x) / k;
      draggedNodeRef.current.fy = (mouseY - y) / k;
      return;
    }

    if (isDraggingRef.current) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      transformRef.current.x += dx;
      transformRef.current.y += dy;
      return;
    }

    // Hover detection
    const hovered = getNodeAt(mouseX, mouseY);
    setHoveredNode(hovered);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = hovered ? "pointer" : isDraggingRef.current ? "grabbing" : "default";
    }
  };

  const handleMouseUp = () => {
    if (draggedNodeRef.current) {
      if (!isPaused) {
        draggedNodeRef.current.fx = null;
        draggedNodeRef.current.fy = null;
        if (simRef.current) simRef.current.alphaTarget(0);
      }
      draggedNodeRef.current = null;
    }
    isDraggingRef.current = false;
  };

  const handleClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const node = getNodeAt(mouseX, mouseY);
    setSelectedNode(node);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const { x, y, k } = transformRef.current;
    const newK = Math.max(0.1, Math.min(4.5, k * zoomFactor));

    // Zoom centered on mouse
    const worldX = (mouseX - x) / k;
    const worldY = (mouseY - y) / k;
    transformRef.current = {
      x: mouseX - worldX * newK,
      y: mouseY - worldY * newK,
      k: newK,
    };
  };

  // Toggle Physics Pause / Resume
  const togglePause = () => {
    if (!simRef.current) return;
    if (isPaused) {
      simRef.current.alpha(0.3).restart();
      setIsPaused(false);
    } else {
      simRef.current.stop();
      setIsPaused(true);
    }
  };

  // Search Results for Jump
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !graphData) return [];
    const q = searchQuery.toLowerCase().trim();
    return (graphData.nodes || [])
      .filter((n) => (n.name || "").toLowerCase().includes(q))
      .slice(0, 10);
  }, [searchQuery, graphData]);

  const onSelectSearchResult = (r) => {
    const found = nodeMap.get(r.id);
    if (found) zoomToNode(found);
    setSearchOpen(false);
  };

  return (
    <div className="h-full w-full bg-background flex flex-col relative overflow-hidden select-none">
      {/* Top Floating Control Toolbar */}
      <GraphToolbar
        mode={mode}
        setMode={setMode}
        showStudios={showStudios}
        setShowStudios={setShowStudios}
        showPerformers={showPerformers}
        setShowPerformers={setShowPerformers}
        showScenes={showScenes}
        setShowScenes={setShowScenes}
        minScenes={minScenes}
        setMinScenes={setMinScenes}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        searchResults={searchResults}
        onSelectSearchResult={onSelectSearchResult}
        fitView={fitView}
        togglePause={togglePause}
        isPaused={isPaused}
      />

      {/* Main Canvas Viewport */}
      {loading ? (
        <div className="h-full flex items-center justify-center">
          <Spinner />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onClick={handleClick}
          onWheel={handleWheel}
          className="w-full h-full block bg-background cursor-grab active:cursor-grabbing"
        />
      )}

      {/* Bottom Metrics Bar */}
      <div className="uv-scope uv-stats">
        <span className="uv-stat uv-hot">
          <b>{activeNodes.length}</b> nodes
        </span>
        <span className="uv-stat uv-hot">
          <b>{activeLinks.length}</b> links
        </span>
        <span className="uv-stat">Scroll to zoom · Drag to pan</span>
      </div>

      {/* Slide-out Inspector Drawer */}
      <GraphInspector
        selectedNode={selectedNode}
        onClose={() => setSelectedNode(null)}
        navigate={navigate}
      />
    </div>
  );
}
