/* =========================================================
   Pathfinding Visualizer — Canvas Graph Engine
   Algorithms: BFS, Dijkstra, A*, DFS
   Rendering: HTML5 Canvas with requestAnimationFrame
   ========================================================= */

'use strict';

// ── Configuration ────────────────────────────────────────────
const CFG = {
  kNeighbors: 5,
  nodeRadius: 4,
  heroRadius: 9,
  padding: 45,
  hoverRadius: 18,
  bgDotSpacing: 50,
};

let canvas, ctx, W, H, dpr;
let nodes = [], edges = [];
let startNode = null, endNode = null;

let isRunning = false, stopRequested = false;
let hoveredNode = null;
let clickState = 'start'; // 'start' → 'end' → 'end'

// Animation state
let visitQueue = [], pathNodes = [];
let animIdx = 0;
let animPhase = 'idle'; // 'idle' | 'visiting' | 'path' | 'done'
let frameId = null;
let startTime = 0;
let lastAnimTick = 0;

// Step mode
let stepVisited = [], stepPath = [], stepIdx = 0, stepPhase = 'visited';

// ── DOM Elements ─────────────────────────────────────────────
const algoSel       = document.getElementById('algoSelect');
const graphSel      = document.getElementById('graphSelect');
const nodeSel       = document.getElementById('nodeSelect');
const genGraphBtn   = document.getElementById('genGraphBtn');
const startBtn      = document.getElementById('startBtn');
const stopBtn       = document.getElementById('stopBtn');
const stepBtn       = document.getElementById('stepBtn');
const clearPathBtn  = document.getElementById('clearPathBtn');
const clearAllBtn   = document.getElementById('clearAllBtn');
const speedSlider   = document.getElementById('speedSlider');
const visitedCountEl= document.getElementById('visitedCount');
const pathCountEl   = document.getElementById('pathCount');
const timeMsEl      = document.getElementById('timeMs');
const nodeCountEl   = document.getElementById('nodeCount');
const edgeCountEl   = document.getElementById('edgeCount');
const modeIndicator = document.getElementById('modeIndicator');
const toastEl       = document.getElementById('toast');

const algoMeta = {
  dijkstra: { name:"Dijkstra's",  time:"O((V+E) log V)", space:"O(V)",  shortest:"Yes (weighted)" },
  bfs:      { name:"BFS",         time:"O(V + E)",       space:"O(V)",  shortest:"Yes (unweighted)" },
  astar:    { name:"A* Search",   time:"O(E log V)",     space:"O(V)",  shortest:"Yes (heuristic)" },
  dfs:      { name:"DFS",         time:"O(V + E)",       space:"O(V)",  shortest:"No" },
};

// ── Toast ────────────────────────────────────────────────────
function showToast(msg, type = 'info', dur = 2500) {
  toastEl.textContent = msg;
  toastEl.className = `toast ${type} show`;
  clearTimeout(toastEl._timer);
  toastEl._timer = setTimeout(() => toastEl.classList.remove('show'), dur);
}

// ── Canvas Setup ─────────────────────────────────────────────
function initCanvas() {
  canvas = document.getElementById('graphCanvas');
  ctx = canvas.getContext('2d');
  resizeCanvas();
  window.addEventListener('resize', () => {
    const oldW = W, oldH = H;
    resizeCanvas();
    if (oldW && oldH && nodes.length) {
      const sx = W / oldW, sy = H / oldH;
      for (const n of nodes) { n.x *= sx; n.y *= sy; }
    }
    render();
  });
}

function resizeCanvas() {
  const container = document.getElementById('canvasContainer');
  dpr = window.devicePixelRatio || 1;
  W = container.clientWidth || window.innerWidth;
  H = container.clientHeight || 400;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ── Node Factory ─────────────────────────────────────────────
function createNode(id, x, y) {
  return {
    id, x, y,
    neighbors: [],
    visited: false, inFrontier: false, isPath: false,
    previous: null, prevEdge: null,
    dist: Infinity, f: Infinity, g: Infinity,
    visitedAt: 0, pathAt: 0,
  };
}

// ── Graph Generation ─────────────────────────────────────────
function getNodeCount() { return parseInt(nodeSel.value) || 350; }

function generateGraph() {
  const type = graphSel.value;
  const count = getNodeCount();
  nodes = [];
  edges = [];
  startNode = null;
  endNode = null;
  clickState = 'start';

  // Re-read canvas size in case container changed
  resizeCanvas();

  const p = CFG.padding;
  const w = W - p * 2;
  const h = H - p * 2;

  if (w <= 0 || h <= 0) {
    showToast('Canvas too small. Resize window.', 'error');
    return;
  }

  switch (type) {
    case 'random':   placeRandom(count, w, h, p); break;
    case 'grid':     placeGrid(count, w, h, p); break;
    case 'clusters': placeClusters(count, w, h, p); break;
    case 'circular': placeCircular(count, w, h, p); break;
    case 'mesh':     placeRandom(count, w, h, p); break;
  }

  if (nodes.length < 2) {
    showToast('Failed to place nodes. Try regenerating.', 'error');
    nodeCountEl.textContent = '0';
    edgeCountEl.textContent = '0';
    render();
    return;
  }

  const k = type === 'mesh' ? 8 : CFG.kNeighbors;
  connectKNN(k);
  ensureConnected();

  // Auto-pick start (leftmost) and end (rightmost)
  let left = nodes[0], right = nodes[0];
  for (const n of nodes) {
    if (n.x < left.x) left = n;
    if (n.x > right.x) right = n;
  }
  startNode = left;
  endNode = right;
  clickState = 'end';
  modeIndicator.textContent = '🖱️ Click: end node | Shift+click: start';

  nodeCountEl.textContent = nodes.length;
  edgeCountEl.textContent = edges.length;

  resetAlgoState();
  render();
  showToast(`Graph: ${nodes.length} nodes, ${edges.length} edges`, 'info');
}

// ── Placement Strategies ─────────────────────────────────────
function placeRandom(count, w, h, pad) {
  const minDist = Math.max(16, Math.sqrt((w * h) / count) * 0.55);
  let attempts = 0;
  while (nodes.length < count && attempts < count * 40) {
    const x = pad + Math.random() * w;
    const y = pad + Math.random() * h;
    let ok = true;
    for (const n of nodes) {
      if (Math.hypot(n.x - x, n.y - y) < minDist) { ok = false; break; }
    }
    if (ok) nodes.push(createNode(nodes.length, x, y));
    attempts++;
  }
}

function placeGrid(count, w, h, pad) {
  const aspect = w / h;
  const cols = Math.round(Math.sqrt(count * aspect));
  const rows = Math.round(count / cols);
  const cw = w / Math.max(cols - 1, 1);
  const ch = h / Math.max(rows - 1, 1);
  const jitter = Math.min(cw, ch) * 0.12;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (nodes.length >= count) break;
      const x = pad + c * cw + (Math.random() - 0.5) * jitter;
      const y = pad + r * ch + (Math.random() - 0.5) * jitter;
      nodes.push(createNode(nodes.length, x, y));
    }
  }
}

function placeClusters(count, w, h, pad) {
  const nc = 5 + Math.floor(Math.random() * 4);
  const centers = [];
  for (let i = 0; i < nc; i++) {
    centers.push({ x: pad + Math.random() * w, y: pad + Math.random() * h });
  }
  const radius = Math.min(w, h) / (nc * 0.7);
  const perCluster = Math.floor(count / nc);

  for (let ci = 0; ci < nc; ci++) {
    const n = ci === nc - 1 ? count - nodes.length : perCluster;
    for (let i = 0; i < n; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * radius;
      const x = Math.max(pad, Math.min(pad + w, centers[ci].x + Math.cos(angle) * r));
      const y = Math.max(pad, Math.min(pad + h, centers[ci].y + Math.sin(angle) * r));
      nodes.push(createNode(nodes.length, x, y));
    }
  }
}

function placeCircular(count, w, h, pad) {
  const cx = pad + w / 2, cy = pad + h / 2;
  const maxR = Math.min(w, h) / 2 - 5;
  // Dynamically compute rings to fit all nodes
  const spacing = Math.max(12, Math.min(24, maxR / Math.sqrt(count / 6)));
  const rings = Math.max(4, Math.ceil(maxR / spacing));
  let placed = 0;

  // Center node
  nodes.push(createNode(0, cx, cy));
  placed++;

  for (let ring = 1; ring <= rings && placed < count; ring++) {
    const r = maxR * ring / rings;
    const circumference = 2 * Math.PI * r;
    const nodeSpacing = Math.max(8, spacing * 0.8);
    const n = Math.min(Math.round(circumference / nodeSpacing), count - placed);
    if (n <= 0) break;
    for (let i = 0; i < n && placed < count; i++, placed++) {
      const angle = (i / n) * Math.PI * 2 + (Math.random() - 0.5) * 0.12;
      nodes.push(createNode(placed, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r));
    }
  }
}

// ── Edge Generation (K-Nearest Neighbors) ────────────────────
function connectKNN(k) {
  const edgeSet = new Set();

  for (let i = 0; i < nodes.length; i++) {
    const dists = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      dists.push({ j, d: Math.hypot(nodes[i].x - nodes[j].x, nodes[i].y - nodes[j].y) });
    }
    dists.sort((a, b) => a.d - b.d);

    const limit = Math.min(k, dists.length);
    for (let n = 0; n < limit; n++) {
      const j = dists[n].j;
      const key = Math.min(i, j) + '-' + Math.max(i, j);
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      const d = dists[n].d;
      const edge = { a: nodes[i], b: nodes[j], weight: d, visited: false, isPath: false };
      edges.push(edge);
      nodes[i].neighbors.push({ node: nodes[j], edge, weight: d });
      nodes[j].neighbors.push({ node: nodes[i], edge, weight: d });
    }
  }
}

// ── Ensure Connectivity (Union-Find) ─────────────────────────
function ensureConnected() {
  const parent = nodes.map((_, i) => i);
  const rank = new Array(nodes.length).fill(0);

  function find(x) { return parent[x] === x ? x : (parent[x] = find(parent[x])); }
  function union(a, b) {
    const pa = find(a), pb = find(b);
    if (pa === pb) return;
    if (rank[pa] < rank[pb]) parent[pa] = pb;
    else if (rank[pa] > rank[pb]) parent[pb] = pa;
    else { parent[pb] = pa; rank[pa]++; }
  }

  for (const e of edges) union(e.a.id, e.b.id);

  const components = {};
  for (const n of nodes) {
    const root = find(n.id);
    if (!components[root]) components[root] = [];
    components[root].push(n);
  }

  const keys = Object.keys(components);
  if (keys.length <= 1) return;

  let mainKey = keys[0];
  for (const k of keys) {
    if (components[k].length > components[mainKey].length) mainKey = k;
  }

  for (const k of keys) {
    if (k === mainKey) continue;
    let minD = Infinity, bestA = null, bestB = null;
    for (const a of components[k]) {
      for (const b of components[mainKey]) {
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < minD) { minD = d; bestA = a; bestB = b; }
      }
    }
    if (bestA && bestB) {
      const edge = { a: bestA, b: bestB, weight: minD, visited: false, isPath: false };
      edges.push(edge);
      bestA.neighbors.push({ node: bestB, edge, weight: minD });
      bestB.neighbors.push({ node: bestA, edge, weight: minD });
      union(bestA.id, bestB.id);
    }
  }
}

// ── State Management ─────────────────────────────────────────
function resetAlgoState() {
  for (const n of nodes) {
    n.visited = false; n.inFrontier = false; n.isPath = false;
    n.previous = null; n.prevEdge = null;
    n.dist = Infinity; n.f = Infinity; n.g = Infinity;
    n.visitedAt = 0; n.pathAt = 0;
  }
  for (const e of edges) { e.visited = false; e.isPath = false; }
  visitQueue = []; pathNodes = [];
  animIdx = 0; animPhase = 'idle';
  stepIdx = 0; stepPhase = 'visited'; stepVisited = []; stepPath = [];
  visitedCountEl.textContent = '0';
  pathCountEl.textContent = '0';
  timeMsEl.textContent = '0';
}

// ── Priority Queue (Min-Heap) ────────────────────────────────
class MinHeap {
  constructor(key = 'dist') { this.heap = []; this.key = key; }
  push(item) { this.heap.push(item); this._up(this.heap.length - 1); }
  pop() {
    const top = this.heap[0]; const last = this.heap.pop();
    if (this.heap.length) { this.heap[0] = last; this._down(0); }
    return top;
  }
  get size() { return this.heap.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.heap[p][this.key] <= this.heap[i][this.key]) break;
      [this.heap[p], this.heap[i]] = [this.heap[i], this.heap[p]]; i = p;
    }
  }
  _down(i) {
    while (true) {
      let s = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < this.heap.length && this.heap[l][this.key] < this.heap[s][this.key]) s = l;
      if (r < this.heap.length && this.heap[r][this.key] < this.heap[s][this.key]) s = r;
      if (s === i) break;
      [this.heap[s], this.heap[i]] = [this.heap[i], this.heap[s]]; i = s;
    }
  }
}

// ── Heuristic ────────────────────────────────────────────────
function heuristic(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// ── Algorithm Implementations ────────────────────────────────
function runDijkstra() {
  const visited = [];
  const pq = new MinHeap('dist');
  startNode.dist = 0; pq.push(startNode);
  while (pq.size) {
    const cur = pq.pop();
    if (cur.visited) continue;
    cur.visited = true; visited.push(cur);
    if (cur === endNode) break;
    for (const { node: nb, edge, weight } of cur.neighbors) {
      const d = cur.dist + weight;
      if (d < nb.dist) { nb.dist = d; nb.previous = cur; nb.prevEdge = edge; pq.push(nb); }
    }
  }
  const path = reconstructPath();
  for (const n of nodes) n.visited = false;
  return { visited, path };
}

function runBFS() {
  const visited = [];
  const queue = [startNode];
  startNode.visited = true;
  while (queue.length) {
    const cur = queue.shift();
    visited.push(cur);
    if (cur === endNode) break;
    for (const { node: nb, edge } of cur.neighbors) {
      if (!nb.visited) { nb.visited = true; nb.previous = cur; nb.prevEdge = edge; queue.push(nb); }
    }
  }
  const path = reconstructPath();
  for (const n of nodes) n.visited = false;
  return { visited, path };
}

function runDFS() {
  const visited = [];
  const stack = [startNode];
  startNode.visited = true;
  let found = false;
  while (stack.length && !found) {
    const cur = stack.pop();
    visited.push(cur);
    if (cur === endNode) { found = true; break; }
    for (const { node: nb, edge } of cur.neighbors) {
      if (!nb.visited) { nb.visited = true; nb.previous = cur; nb.prevEdge = edge; stack.push(nb); }
    }
  }
  const path = found ? reconstructPath() : [];
  for (const n of nodes) n.visited = false;
  return { visited, path };
}

function runAStar() {
  const visited = [];
  startNode.g = 0; startNode.f = heuristic(startNode, endNode);
  const open = new MinHeap('f'); open.push(startNode);
  while (open.size) {
    const cur = open.pop();
    if (cur.visited) continue;
    cur.visited = true; visited.push(cur);
    if (cur === endNode) break;
    for (const { node: nb, edge, weight } of cur.neighbors) {
      if (nb.visited) continue;
      const g = cur.g + weight;
      if (g < nb.g) { nb.g = g; nb.f = g + heuristic(nb, endNode); nb.previous = cur; nb.prevEdge = edge; open.push(nb); }
    }
  }
  const path = reconstructPath();
  for (const n of nodes) n.visited = false;
  return { visited, path };
}

function reconstructPath() {
  const path = [];
  let node = endNode;
  while (node && node !== startNode) { path.unshift(node); node = node.previous; }
  return node === startNode ? path : [];
}

// ── Rendering ────────────────────────────────────────────────
function render() {
  if (!ctx) return;
  const now = performance.now();
  const nr = CFG.nodeRadius;

  ctx.clearRect(0, 0, W, H);

  // Subtle background dot grid
  ctx.fillStyle = 'hsla(220, 12%, 18%, 0.35)';
  for (let x = CFG.bgDotSpacing; x < W; x += CFG.bgDotSpacing) {
    for (let y = CFG.bgDotSpacing; y < H; y += CFG.bgDotSpacing) {
      ctx.fillRect(x - 0.5, y - 0.5, 1, 1);
    }
  }

  ctx.lineCap = 'round';

  // ── Layer 1: Unvisited edges ──
  ctx.beginPath();
  ctx.strokeStyle = 'hsla(220, 12%, 24%, 0.4)';
  ctx.lineWidth = 0.5;
  for (const e of edges) {
    if (e.visited || e.isPath) continue;
    ctx.moveTo(e.a.x, e.a.y);
    ctx.lineTo(e.b.x, e.b.y);
  }
  ctx.stroke();

  // ── Layer 2: Visited edges ──
  ctx.beginPath();
  ctx.strokeStyle = 'hsla(210, 65%, 50%, 0.45)';
  ctx.lineWidth = 1.5;
  for (const e of edges) {
    if (!e.visited || e.isPath) continue;
    ctx.moveTo(e.a.x, e.a.y);
    ctx.lineTo(e.b.x, e.b.y);
  }
  ctx.stroke();

  // ── Layer 3: Path edges — glow ──
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = 'hsl(45, 100%, 50%)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  for (const e of edges) {
    if (!e.isPath) continue;
    ctx.moveTo(e.a.x, e.a.y);
    ctx.lineTo(e.b.x, e.b.y);
  }
  ctx.stroke();
  ctx.restore();

  // Path edges — solid
  ctx.beginPath();
  ctx.strokeStyle = 'hsl(45, 100%, 60%)';
  ctx.lineWidth = 2.5;
  for (const e of edges) {
    if (!e.isPath) continue;
    ctx.moveTo(e.a.x, e.a.y);
    ctx.lineTo(e.b.x, e.b.y);
  }
  ctx.stroke();

  // ── Layer 4: Nodes ──

  // Unvisited nodes (batch)
  ctx.fillStyle = 'hsl(220, 12%, 28%)';
  ctx.beginPath();
  for (const n of nodes) {
    if (n === startNode || n === endNode || n.visited || n.isPath || n.inFrontier) continue;
    ctx.moveTo(n.x + nr, n.y);
    ctx.arc(n.x, n.y, nr, 0, Math.PI * 2);
  }
  ctx.fill();

  // Visited nodes with pop effect
  for (const n of nodes) {
    if (!n.visited || n === startNode || n === endNode || n.isPath) continue;
    const age = now - n.visitedAt;
    const scale = age < 180 ? 1 + (1 - age / 180) * 0.7 : 1;
    const radius = nr * scale;
    const lightness = age < 180 ? 70 - (age / 180) * 28 : 42;

    ctx.beginPath();
    ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `hsl(210, 70%, ${lightness}%)`;
    ctx.fill();
  }

  // Frontier nodes (pulsing ring)
  const pulse = 0.85 + Math.sin(now / 120) * 0.25;
  for (const n of nodes) {
    if (!n.inFrontier || n.visited || n === startNode || n === endNode) continue;
    // Outer glow ring
    ctx.beginPath();
    ctx.arc(n.x, n.y, nr * 1.8 * pulse, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(190, 100%, 70%, 0.15)';
    ctx.fill();
    // Core
    ctx.beginPath();
    ctx.arc(n.x, n.y, nr * 1.1, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(190, 100%, 72%)';
    ctx.fill();
  }

  // Path nodes with glow
  for (const n of nodes) {
    if (!n.isPath || n === startNode || n === endNode) continue;
    const age = now - n.pathAt;
    const scale = age < 220 ? 1 + (1 - age / 220) * 0.9 : 1;
    const r = nr * 1.4 * scale;
    // Glow
    ctx.beginPath();
    ctx.arc(n.x, n.y, r + 4, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(45, 100%, 55%, 0.15)';
    ctx.fill();
    // Core
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(45, 100%, 60%)';
    ctx.fill();
  }

  // ── Layer 5: Start & End heroes ──
  const hr = CFG.heroRadius;

  if (startNode) {
    // Outer glow
    ctx.beginPath();
    ctx.arc(startNode.x, startNode.y, hr + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(190, 100%, 55%, 0.12)';
    ctx.fill();
    // Core
    ctx.beginPath();
    ctx.arc(startNode.x, startNode.y, hr, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(190, 100%, 55%)';
    ctx.fill();
    // Label
    ctx.fillStyle = 'hsl(222, 28%, 6%)';
    ctx.font = `bold ${hr}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('S', startNode.x, startNode.y + 0.5);
  }

  if (endNode) {
    ctx.beginPath();
    ctx.arc(endNode.x, endNode.y, hr + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'hsla(280, 100%, 65%, 0.12)';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(endNode.x, endNode.y, hr, 0, Math.PI * 2);
    ctx.fillStyle = 'hsl(280, 100%, 65%)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${hr}px Outfit, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('E', endNode.x, endNode.y + 0.5);
  }

  // ── Layer 6: Hover highlight ──
  if (hoveredNode && !isRunning) {
    // Highlight edges
    ctx.strokeStyle = 'hsla(190, 100%, 60%, 0.35)';
    ctx.lineWidth = 1.5;
    for (const { node: nb } of hoveredNode.neighbors) {
      ctx.beginPath();
      ctx.moveTo(hoveredNode.x, hoveredNode.y);
      ctx.lineTo(nb.x, nb.y);
      ctx.stroke();
      // Neighbor dot highlight
      ctx.beginPath();
      ctx.arc(nb.x, nb.y, nr + 1.5, 0, Math.PI * 2);
      ctx.fillStyle = 'hsla(190, 100%, 60%, 0.5)';
      ctx.fill();
    }
    // Hover ring
    ctx.beginPath();
    ctx.arc(hoveredNode.x, hoveredNode.y, CFG.hoverRadius, 0, Math.PI * 2);
    ctx.strokeStyle = 'hsla(190, 100%, 60%, 0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ── Animation Loop ───────────────────────────────────────────
function getBatchSize() {
  const v = parseInt(speedSlider.value);
  return Math.max(1, Math.round(Math.pow(v, 2.15) * 0.4));
}

function getStepIntervalMs() {
  const v = parseInt(speedSlider.value) || 1;
  // Lower slider values wait longer between processing ticks.
  return Math.max(12, 100 - (v - 1) * 9);
}

function animationLoop() {
  if (stopRequested) {
    animPhase = 'idle'; isRunning = false;
    setRunningUI(false);
    showToast('Stopped', 'error');
    render();
    return;
  }

  const now = performance.now();
  const interval = getStepIntervalMs();

  if (now - lastAnimTick < interval) {
    timeMsEl.textContent = (now - startTime).toFixed(0);
    render();
    frameId = requestAnimationFrame(animationLoop);
    return;
  }

  lastAnimTick = now;
  const batch = getBatchSize();

  if (animPhase === 'visiting') {
    for (let i = 0; i < batch && animIdx < visitQueue.length; i++, animIdx++) {
      const node = visitQueue[animIdx];
      node.visited = true;
      node.visitedAt = now;
      node.inFrontier = false;
      if (node.prevEdge) node.prevEdge.visited = true;

      // Mark unvisited neighbors as frontier
      for (const { node: nb } of node.neighbors) {
        if (!nb.visited && nb !== startNode) nb.inFrontier = true;
      }
    }
    visitedCountEl.textContent = animIdx;

    if (animIdx >= visitQueue.length) {
      for (const n of nodes) n.inFrontier = false;
      if (pathNodes.length === 0) {
        animPhase = 'done'; isRunning = false; setRunningUI(false);
        showToast('No path found! 😔', 'error', 3000);
      } else {
        animPhase = 'path'; animIdx = 0;
      }
    }
  } else if (animPhase === 'path') {
    const pb = Math.max(1, Math.ceil(batch / 3));
    for (let i = 0; i < pb && animIdx < pathNodes.length; i++, animIdx++) {
      const node = pathNodes[animIdx];
      node.isPath = true;
      node.pathAt = now;
      if (node.prevEdge) node.prevEdge.isPath = true;
    }
    pathCountEl.textContent = animIdx;

    if (animIdx >= pathNodes.length) {
      animPhase = 'done'; isRunning = false; setRunningUI(false);
      showToast(`Path found! ${pathNodes.length} nodes, ${visitQueue.length} visited 🎉`, 'success', 3500);
    }
  }

  timeMsEl.textContent = (now - startTime).toFixed(0);
  render();

  if (animPhase !== 'done' && animPhase !== 'idle') {
    frameId = requestAnimationFrame(animationLoop);
  }
}

// ── Canvas Interaction ───────────────────────────────────────
function getNodeAtPos(mx, my) {
  let closest = null, minD = CFG.hoverRadius;
  for (const n of nodes) {
    const d = Math.hypot(n.x - mx, n.y - my);
    if (d < minD) { minD = d; closest = n; }
  }
  return closest;
}

function setupCanvasEvents() {
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const node = getNodeAtPos(mx, my);
    if (node !== hoveredNode) {
      hoveredNode = node;
      canvas.style.cursor = node ? 'pointer' : 'default';
      if (!isRunning || animPhase === 'done') render();
    }
  });

  canvas.addEventListener('click', (e) => {
    if (isRunning && animPhase !== 'done') return;

    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const node = getNodeAtPos(mx, my);
    if (!node) return;

    if (clickState === 'start' || e.shiftKey) {
      if (node === endNode) return;
      startNode = node;
      clickState = 'end';
      modeIndicator.textContent = '🎯 Click another node to set end';
    } else {
      if (node === startNode) return;
      endNode = node;
      modeIndicator.textContent = '🖱️ Click: end node | Shift+click: start';
    }

    resetAlgoState();
    render();
  });

  canvas.addEventListener('mouseleave', () => {
    hoveredNode = null;
    if (!isRunning || animPhase === 'done') render();
  });
}

// ── Algorithm Info ───────────────────────────────────────────
function updateAlgoInfo() {
  const m = algoMeta[algoSel.value];
  document.getElementById('algoName').textContent = m.name;
  document.getElementById('timeComp').textContent = m.time;
  document.getElementById('spaceComp').textContent = m.space;
  document.getElementById('shortestTag').textContent = m.shortest;
}
algoSel.addEventListener('change', updateAlgoInfo);

// ── Button Handlers ──────────────────────────────────────────
startBtn.addEventListener('click', () => {
  if (isRunning) return;
  if (!startNode || !endNode) { showToast('Click two nodes to set start & end', 'error'); return; }

  isRunning = true; stopRequested = false;
  setRunningUI(true);
  resetAlgoState();

  startTime = performance.now();
  lastAnimTick = startTime;
  const algoMap = { dijkstra: runDijkstra, bfs: runBFS, dfs: runDFS, astar: runAStar };
  const { visited, path } = algoMap[algoSel.value]();

  visitQueue = visited;
  pathNodes = path;
  animIdx = 0;
  animPhase = 'visiting';

  frameId = requestAnimationFrame(animationLoop);
});

stopBtn.addEventListener('click', () => { stopRequested = true; });

clearPathBtn.addEventListener('click', () => {
  if (isRunning && animPhase !== 'done') return;
  if (frameId) cancelAnimationFrame(frameId);
  resetAlgoState();
  render();
});

clearAllBtn.addEventListener('click', () => {
  if (isRunning && animPhase !== 'done') return;
  if (frameId) cancelAnimationFrame(frameId);
  generateGraph();
});

genGraphBtn.addEventListener('click', () => {
  if (isRunning && animPhase !== 'done') return;
  if (frameId) cancelAnimationFrame(frameId);
  generateGraph();
});

// ── Step Mode ────────────────────────────────────────────────
stepBtn.addEventListener('click', () => {
  if (isRunning && animPhase !== 'done' && animPhase !== 'idle') return;

  if (stepIdx === 0 && stepPhase === 'visited') {
    resetAlgoState();
    if (!startNode || !endNode) { showToast('Set start & end nodes first', 'error'); return; }

    startTime = performance.now();
    const algoMap = { dijkstra: runDijkstra, bfs: runBFS, dfs: runDFS, astar: runAStar };
    const { visited, path } = algoMap[algoSel.value]();
    stepVisited = visited;
    stepPath = path;
    showToast('Step mode: click ⏭ to advance', 'info');
  }

  const now = performance.now();

  if (stepPhase === 'visited') {
    if (stepIdx < stepVisited.length) {
      const node = stepVisited[stepIdx];
      node.visited = true;
      node.visitedAt = now;
      node.inFrontier = false;
      if (node.prevEdge) node.prevEdge.visited = true;

      for (const { node: nb } of node.neighbors) {
        if (!nb.visited && nb !== startNode) nb.inFrontier = true;
      }
      stepIdx++;
      visitedCountEl.textContent = stepIdx;
    }
    if (stepIdx >= stepVisited.length) {
      for (const n of nodes) n.inFrontier = false;
      stepPhase = 'path'; stepIdx = 0;
      if (stepPath.length === 0) showToast('No path found!', 'error');
    }
  } else {
    if (stepIdx < stepPath.length) {
      const node = stepPath[stepIdx];
      node.isPath = true;
      node.pathAt = now;
      if (node.prevEdge) node.prevEdge.isPath = true;
      stepIdx++;
      pathCountEl.textContent = stepIdx;
    }
    if (stepIdx >= stepPath.length) {
      showToast('Done stepping!', 'success');
      stepIdx = 0; stepPhase = 'visited';
    }
  }

  timeMsEl.textContent = (now - startTime).toFixed(0);
  render();
});

function setRunningUI(running) {
  startBtn.disabled = running;
  stopBtn.disabled = !running;
  stepBtn.disabled = running;
  genGraphBtn.disabled = running;
}

// ── Initialization ───────────────────────────────────────────
window.addEventListener('load', () => {
  initCanvas();
  setupCanvasEvents();
  updateAlgoInfo();
  generateGraph();
  showToast('Click nodes to set start → end, then ▶ Visualize', 'info', 4000);
});
