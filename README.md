# ✛ Cathedral — Stained Glass Strategy

A multiplayer, turn-based territory control game played inside a cathedral window. Players take turns claiming regions under adjacency restrictions. The player with the most claimed regions wins.

![Cathedral Game](https://img.shields.io/badge/Game-Cathedral-C8A96E?style=for-the-badge)

## 🎯 Rules

- Players alternate turns claiming unclaimed regions
- A region **cannot** be claimed if it shares an **edge** with an opponent's region
- **Corner-only** contact is allowed
- Game ends when either player has no valid moves
- Winner = most claimed regions

## 🚀 Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

## 📦 Build & Deploy

```bash
npm run build
```

Deploy the `dist/` folder to **Vercel**, **Netlify**, or any static host.

## 🧱 Tech Stack

- **React 18** — UI
- **Vite 5** — Build tool
- **SVG** — Board rendering (Voronoi-based region generation)

## 📄 License

MIT
