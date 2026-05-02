// ═══════════════════════════════════════════════════════════════════════════════
// CATHEDRAL — Board Generation & Game Logic
// ═══════════════════════════════════════════════════════════════════════════════

const W = 400, H = 440;
const CX = 200, SPRING_Y = 155, ARCH_R = 150, LEFT = 50, RIGHT = 350, BOTTOM = 415;

export function inArch(x, y) {
  if (x < LEFT || x > RIGHT || y > BOTTOM) return false;
  if (y >= SPRING_Y) return true;
  const dx = x - CX, dy = y - SPRING_Y;
  return dx * dx + dy * dy <= ARCH_R * ARCH_R;
}

export const ARCH_PATH = (() => {
  const pts = [];
  for (let a = Math.PI; a >= 0; a -= 0.05) {
    const x = CX + ARCH_R * Math.cos(a);
    const y = SPRING_Y - ARCH_R * Math.sin(a); // negative sin to arch upward in SVG coords
    if (x >= LEFT && x <= RIGHT) pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return `M${LEFT},${BOTTOM} L${LEFT},${SPRING_Y} ` +
    pts.map(p => `L${p}`).join(" ") +
    ` L${RIGHT},${SPRING_Y} L${RIGHT},${BOTTOM} Z`;
})();

export { CX, SPRING_Y, ARCH_R };

// ── Seeded RNG ─────────────────────────────────────────────────────────────────
function makeRng(seed) {
  let s = (seed ^ 0xdeadbeef) >>> 0;
  return () => {
    s ^= s << 13; s ^= s >> 17; s ^= s << 5;
    return ((s >>> 0) / 0x100000000);
  };
}

// ── Douglas-Peucker line simplification ────────────────────────────────────────
function douglasPeucker(pts, eps) {
  if (pts.length <= 2) return pts;
  let maxD = 0, idx = 0;
  const [x1, y1] = pts[0], [x2, y2] = pts[pts.length - 1];
  const dx = x2 - x1, dy = y2 - y1, len = Math.sqrt(dx * dx + dy * dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const d = len < 0.001 ? Math.hypot(pts[i][0] - x1, pts[i][1] - y1)
      : Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len;
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD > eps) {
    const l = douglasPeucker(pts.slice(0, idx + 1), eps);
    const r = douglasPeucker(pts.slice(idx), eps);
    return [...l.slice(0, -1), ...r];
  }
  return [pts[0], pts[pts.length - 1]];
}

// ── Build board ────────────────────────────────────────────────────────────────
const GRID_STEP = 3;
const MIN_SHARED_EDGES = 3; // Minimum shared grid edges to count as true edge-neighbor

export function buildBoard(seed) {
  const rng = makeRng(seed);

  // 1. Place seeds inside arch with minimum distance enforcement
  const N = 32; // Increased from 24 for more regions
  const MIN_D2 = 24 * 24; // Slightly reduced min distance to fit more
  const seeds = [];
  let tries = 0;
  while (seeds.length < N && tries < 8000) {
    tries++;
    const x = LEFT + 10 + rng() * (RIGHT - LEFT - 20);
    const y = (SPRING_Y - ARCH_R + 15) + rng() * (BOTTOM - (SPRING_Y - ARCH_R + 15) - 15);
    if (!inArch(x, y)) continue;
    let ok = true;
    for (const s of seeds) {
      const dx = x - s[0], dy = y - s[1];
      if (dx * dx + dy * dy < MIN_D2) { ok = false; break; }
    }
    if (ok) seeds.push([x, y]);
  }
  const K = seeds.length;

  // 2. Assign each grid cell to nearest seed
  const cols = Math.ceil((RIGHT - LEFT) / GRID_STEP) + 2;
  const rows = Math.ceil((BOTTOM - (SPRING_Y - ARCH_R)) / GRID_STEP) + 2;
  const OX = LEFT, OY = SPRING_Y - ARCH_R;

  function gIdx(gc, gr) { return gr * cols + gc; }
  const assignment = new Int16Array(cols * rows).fill(-1);

  for (let gr = 0; gr < rows; gr++) {
    for (let gc = 0; gc < cols; gc++) {
      const px = OX + gc * GRID_STEP;
      const py = OY + gr * GRID_STEP;
      if (!inArch(px, py)) continue;
      let best = -1, bestD = Infinity;
      for (let i = 0; i < K; i++) {
        const dx = px - seeds[i][0], dy = py - seeds[i][1];
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = i; }
      }
      assignment[gIdx(gc, gr)] = best;
    }
  }

  // 3. Build adjacency — count shared boundary pixels, require minimum threshold
  const adjCount = new Map();
  const DIRS = [[1, 0], [0, 1]];
  for (let gr = 0; gr < rows; gr++) {
    for (let gc = 0; gc < cols; gc++) {
      const a = assignment[gIdx(gc, gr)];
      if (a < 0) continue;
      for (const [dc, dr] of DIRS) {
        const gc2 = gc + dc, gr2 = gr + dr;
        if (gc2 >= cols || gr2 >= rows) continue;
        const b = assignment[gIdx(gc2, gr2)];
        if (b >= 0 && b !== a) {
          const key = a < b ? `${a},${b}` : `${b},${a}`;
          adjCount.set(key, (adjCount.get(key) || 0) + 1);
        }
      }
    }
  }

  // Only count pairs with enough shared boundary as true edge-neighbors
  const neighbors = Array.from({ length: K }, () => []);
  for (const [key, count] of adjCount) {
    if (count >= MIN_SHARED_EDGES) {
      const [a, b] = key.split(",").map(Number);
      neighbors[a].push(b);
      neighbors[b].push(a);
    }
  }

  // 4. Build outline path for each region
  function buildRegionPath(id) {
    const segs = [];
    const gs = GRID_STEP;
    for (let gr = 0; gr < rows; gr++) {
      for (let gc = 0; gc < cols; gc++) {
        if (assignment[gIdx(gc, gr)] !== id) continue;
        const wx = OX + gc * gs;
        const wy = OY + gr * gs;
        const topId = gr > 0 ? assignment[gIdx(gc, gr - 1)] : -1;
        if (topId !== id) segs.push([wx, wy, wx + gs, wy]);
        const botId = gr + 1 < rows ? assignment[gIdx(gc, gr + 1)] : -1;
        if (botId !== id) segs.push([wx + gs, wy + gs, wx, wy + gs]);
        const leftId = gc > 0 ? assignment[gIdx(gc - 1, gr)] : -1;
        if (leftId !== id) segs.push([wx, wy + gs, wx, wy]);
        const rightId = gc + 1 < cols ? assignment[gIdx(gc + 1, gr)] : -1;
        if (rightId !== id) segs.push([wx + gs, wy, wx + gs, wy + gs]);
      }
    }
    if (segs.length === 0) return null;

    const ptKey = (x, y) => `${Math.round(x * 10)},${Math.round(y * 10)}`;
    const endMap = new Map();
    const addSeg = (si, x, y) => {
      const k = ptKey(x, y);
      if (!endMap.has(k)) endMap.set(k, []);
      endMap.get(k).push(si);
    };
    segs.forEach((s, i) => {
      addSeg(i, s[0], s[1]);
      addSeg(i, s[2], s[3]);
    });

    const used = new Uint8Array(segs.length);
    const chains = [];
    for (let start = 0; start < segs.length; start++) {
      if (used[start]) continue;
      const chain = [[segs[start][0], segs[start][1]], [segs[start][2], segs[start][3]]];
      used[start] = 1;
      let changed = true;
      while (changed) {
        changed = false;
        const tail = chain[chain.length - 1];
        const candidates = endMap.get(ptKey(tail[0], tail[1])) || [];
        for (const si of candidates) {
          if (used[si]) continue;
          used[si] = 1;
          const s = segs[si];
          if (ptKey(s[0], s[1]) === ptKey(tail[0], tail[1])) {
            chain.push([s[2], s[3]]);
          } else {
            chain.push([s[0], s[1]]);
          }
          changed = true;
          break;
        }
      }
      if (chain.length > 2) chains.push(chain);
    }
    if (chains.length === 0) return null;
    chains.sort((a, b) => b.length - a.length);
    const simplified = douglasPeucker(chains[0], 2.5);
    if (simplified.length < 3) return null;
    return "M" + simplified.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L") + " Z";
  }

  // 5. Assemble regions
  const regions = [];
  const idRemap = new Array(K).fill(-1);
  for (let i = 0; i < K; i++) {
    const path = buildRegionPath(i);
    if (!path) continue;
    idRemap[i] = regions.length;
    const cells = [];
    for (let gr = 0; gr < rows; gr++)
      for (let gc = 0; gc < cols; gc++)
        if (assignment[gIdx(gc, gr)] === i)
          cells.push([OX + gc * GRID_STEP + GRID_STEP / 2, OY + gr * GRID_STEP + GRID_STEP / 2]);
    const cx = cells.reduce((s, c) => s + c[0], 0) / cells.length;
    const cy = cells.reduce((s, c) => s + c[1], 0) / cells.length;
    regions.push({ id: regions.length, origId: i, path, label: [cx, cy], neighbors: [] });
  }

  regions.forEach(r => {
    r.neighbors = neighbors[r.origId]
      .map(n => idRemap[n])
      .filter(n => n >= 0);
  });

  return regions;
}

// ── Game Logic ────────────────────────────────────────────────────────────────
export function isValidMove(id, cp, claimed, regions) {
  if (claimed[id] !== null) return false;
  for (const nid of regions[id].neighbors)
    if (claimed[nid] !== null && claimed[nid] !== cp) return false;
  return true;
}

export function getValidMoves(cp, claimed, regions) {
  return regions.filter(r => isValidMove(r.id, cp, claimed, regions)).map(r => r.id);
}

// ── Players ───────────────────────────────────────────────────────────────────
const PLAYER_PALETTE = [
  { color: "#b83232", light: "#e74c3c28", glow: "#e74c3c" },  // Red
  { color: "#1660a0", light: "#3498db28", glow: "#3498db" },  // Blue
  { color: "#1a8a4a", light: "#2ecc7128", glow: "#2ecc71" },  // Green
  { color: "#8a32b8", light: "#9b59b628", glow: "#9b59b6" },  // Purple
];

export function getPlayers(count) {
  return PLAYER_PALETTE.slice(0, count).map((p, i) => ({
    id: i,
    name: `Player ${i + 1}`,
    ...p,
  }));
}
