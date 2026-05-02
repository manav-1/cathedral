import { useState, useCallback, useMemo } from "react";
import {
  buildBoard, isValidMove, getValidMoves,
  getPlayers, ARCH_PATH, CX, SPRING_Y, ARCH_R
} from "./gameLogic.js";
import styles from "./CathedralGame.module.css";

export default function CathedralGame() {
  const [playerCount, setPlayerCount] = useState(2);
  const [boardSeed, setBoardSeed] = useState(42);

  const players = useMemo(() => getPlayers(playerCount), [playerCount]);
  const regions = useMemo(() => buildBoard(boardSeed), [boardSeed]);
  const mkClaimed = useCallback(
    () => Object.fromEntries(regions.map(r => [r.id, null])),
    [regions]
  );

  const [claimed, setClaimed] = useState(mkClaimed);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [hovered, setHovered] = useState(null);
  const [invalid, setInvalid] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [scores, setScores] = useState(() => new Array(playerCount).fill(0));
  const [eliminated, setEliminated] = useState(() => new Array(playerCount).fill(false));
  const [lastClaimed, setLastClaimed] = useState(null);
  const [prevSeed, setPrevSeed] = useState(boardSeed);
  const [prevPlayerCount, setPrevPlayerCount] = useState(playerCount);

  // Reset when board seed or player count changes
  if (prevSeed !== boardSeed || prevPlayerCount !== playerCount) {
    setPrevSeed(boardSeed);
    setPrevPlayerCount(playerCount);
    setClaimed(mkClaimed());
    setCurrentPlayer(0);
    setHovered(null);
    setInvalid(null);
    setGameOver(false);
    setScores(new Array(playerCount).fill(0));
    setEliminated(new Array(playerCount).fill(false));
    setLastClaimed(null);
  }

  // Find the next active (non-eliminated) player who has valid moves
  const findNextPlayer = useCallback((from, nc, elim) => {
    for (let i = 1; i <= playerCount; i++) {
      const p = (from + i) % playerCount;
      if (!elim[p] && getValidMoves(p, nc, regions).length) return p;
    }
    return -1; // no one can move
  }, [playerCount, regions]);

  const handleClick = useCallback((id) => {
    if (gameOver) return;
    if (!isValidMove(id, currentPlayer, claimed, regions)) {
      setInvalid(id);
      setTimeout(() => setInvalid(null), 500);
      return;
    }
    const nc = { ...claimed, [id]: currentPlayer };
    const ns = [...scores];
    ns[currentPlayer]++;

    // Eliminate any players who now have no valid moves
    const ne = [...eliminated];
    for (let p = 0; p < playerCount; p++) {
      if (!ne[p] && !getValidMoves(p, nc, regions).length) {
        ne[p] = true;
      }
    }

    // Count active players remaining
    const activePlayers = ne.filter(e => !e).length;

    if (activePlayers === 0) {
      // All players eliminated — game over, determine winner by score
      setClaimed(nc); setScores(ns); setEliminated(ne); setLastClaimed(id); setGameOver(true);
      return;
    }

    // Find next active player
    const next = findNextPlayer(currentPlayer, nc, ne);
    if (next === -1) {
      setClaimed(nc); setScores(ns); setEliminated(ne); setLastClaimed(id); setGameOver(true);
      return;
    }

    setClaimed(nc); setScores(ns); setEliminated(ne); setLastClaimed(id); setCurrentPlayer(next);
  }, [claimed, currentPlayer, gameOver, scores, eliminated, regions, playerCount, findNextPlayer]);

  const resetGame = useCallback(() => {
    setClaimed(mkClaimed());
    setCurrentPlayer(0);
    setHovered(null);
    setInvalid(null);
    setGameOver(false);
    setScores(new Array(playerCount).fill(0));
    setEliminated(new Array(playerCount).fill(false));
    setLastClaimed(null);
  }, [mkClaimed, playerCount]);

  const newGame = () => setBoardSeed(Math.floor(Math.random() * 99999));

  const changePlayerCount = (n) => {
    setPlayerCount(n);
    setBoardSeed(Math.floor(Math.random() * 99999));
  };

  const validMoves = gameOver ? [] : getValidMoves(currentPlayer, claimed, regions);

  // Determine results — find top scorers and losers
  const results = useMemo(() => {
    if (!gameOver) return { winners: [], losers: [], maxScore: 0, isTie: false };
    const maxScore = Math.max(...scores);
    const winners = [];
    const losers = [];
    for (let i = 0; i < playerCount; i++) {
      if (scores[i] === maxScore) winners.push(i);
      else losers.push(i);
    }
    return { winners, losers, maxScore, isTie: winners.length > 1 };
  }, [gameOver, scores, playerCount]);

  const winner = results.winners.length === 1 ? results.winners[0] : null;

  const cp = currentPlayer;

  return (
    <div className={styles.root}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.cross}>✛</span>
          <h1 className={styles.title}>CATHEDRAL</h1>
          <span className={styles.cross}>✛</span>
        </div>
        <p className={styles.subtitle}>Stained Glass Territory</p>
      </header>

      {/* Player Count Selector */}
      <div className={styles.playerSelect}>
        {[2, 3, 4].map(n => (
          <button
            key={n}
            className={`${styles.playerBtn} ${playerCount === n ? styles.playerBtnActive : ""}`}
            onClick={() => changePlayerCount(n)}
          >
            {n} Players
          </button>
        ))}
      </div>

      {/* Scoreboard */}
      <div className={styles.scoreboard}>
        {players.map(p => {
          const isElim = eliminated[p.id];
          const isActive = !gameOver && cp === p.id;
          return (
            <div
              key={p.id}
              className={`${styles.card} ${isActive ? styles.cardActive : ""} ${isElim ? styles.cardEliminated : ""}`}
              style={{
                borderColor: isElim ? "#333" : p.color,
                opacity: isElim ? 0.35 : (!gameOver && cp !== p.id ? 0.45 : 1),
                boxShadow: isActive
                  ? `0 0 24px ${p.glow}44, inset 0 0 10px ${p.glow}12` : "none",
              }}
            >
              <div className={styles.dot} style={{ background: isElim ? "#444" : p.color, boxShadow: isElim ? "none" : `0 0 8px ${p.glow}` }} />
              <div>
                <div className={styles.pname}>{p.name}</div>
                <div className={styles.pscore} style={{ color: isElim ? "#555" : p.color }}>{scores[p.id]}</div>
              </div>
              {isActive && (
                <div className={styles.pip} style={{ background: p.color }}>YOUR TURN</div>
              )}
              {isElim && !gameOver && (
                <div className={styles.pip} style={{ background: "#444" }}>OUT</div>
              )}
              {gameOver && winner === p.id && (
                <div className={styles.pip} style={{ background: p.color }}>WINNER ✦</div>
              )}
              {gameOver && results.isTie && results.winners.includes(p.id) && (
                <div className={styles.pip} style={{ background: p.color }}>DRAW</div>
              )}
              {gameOver && results.losers.includes(p.id) && (
                <div className={styles.pip} style={{ background: "#444" }}>LOST</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Board */}
      <div className={styles.boardWrap}>
        <svg viewBox="0 0 400 440" className={styles.svg}>
          <defs>
            <clipPath id="arch"><path d={ARCH_PATH} /></clipPath>
            <filter id="glow">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect width="400" height="440" fill="#080604" />
          <path d={ARCH_PATH} fill="#0a0806" stroke="#5a3e14" strokeWidth="16" />

          <g clipPath="url(#arch)">
            <path d={ARCH_PATH} fill="#160e08" />
            {regions.map(r => {
              const owner = claimed[r.id];
              const isHov = hovered === r.id;
              const isInv = invalid === r.id;
              const isVal = validMoves.includes(r.id);
              const isLast = lastClaimed === r.id;

              let fill = "#1e1408", stroke = "#8a6428", sw = 1.2;
              if (owner !== null) { fill = players[owner].color; stroke = "#ffffff55"; sw = 1.5; }
              else if (isInv) { fill = "#4a0000"; stroke = "#ff2020"; sw = 2.5; }
              else if (isHov && isVal) { fill = players[cp].light; stroke = players[cp].color; sw = 2; }
              else if (isHov) { fill = "#250808"; stroke = "#551010"; sw = 2; }

              return (
                <path
                  key={r.id}
                  d={r.path}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={sw}
                  strokeLinejoin="round"
                  className={isInv ? "shake" : isLast ? "pulse-in" : ""}
                  filter={isLast && owner !== null ? "url(#glow)" : undefined}
                  style={{ cursor: gameOver ? "default" : "pointer", transition: "fill 0.1s" }}
                  onMouseEnter={() => !gameOver && setHovered(r.id)}
                  onMouseLeave={() => setHovered(null)}
                  onPointerDown={() => handleClick(r.id)}
                />
              );
            })}
          </g>

          {/* Window frame */}
          <path d={ARCH_PATH} fill="none" stroke="#7a5520" strokeWidth="14" />
          <path d={ARCH_PATH} fill="none" stroke="#D4A840" strokeWidth="3.5" />
          <path d={ARCH_PATH} fill="none" stroke="#f0cc6855" strokeWidth="1" />
          <ellipse cx={CX} cy={SPRING_Y - ARCH_R + 2} rx="14" ry="9" fill="#C8A040" />
          <ellipse cx={CX} cy={SPRING_Y - ARCH_R + 2} rx="7" ry="4.5" fill="#080604" />
        </svg>
      </div>

      {/* Status */}
      <div className={styles.status}>
        {gameOver ? (
          <span className={styles.sTxt}>
            {winner !== null
              ? `${players[winner].name} wins with ${scores[winner]} regions!`
              : `${results.winners.map(i => players[i].name).join(" & ")} draw with ${results.maxScore} regions${results.losers.length ? ` · ${results.losers.map(i => players[i].name).join(", ")} lost` : ""}`}
          </span>
        ) : (
          <span className={styles.sTxt}>
            <span style={{ color: players[cp].color }}>{players[cp].name}</span>
            {" — claim a region not edge-touching your opponent's"}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        <button className={styles.btn} onClick={newGame}>✦ New Board</button>
        <button className={styles.btn} onClick={resetGame}>↺ Restart</button>
      </div>

      {/* Legend */}
      <div className={styles.legend}>
        <span className={styles.legendItem}>Hover to preview</span>
        <span className={styles.legendDot}>·</span>
        <span className={styles.legendItem}>Red hover = blocked</span>
        <span className={styles.legendDot}>·</span>
        <span className={styles.legendItem}>Corner-only touch OK</span>
      </div>
    </div>
  );
}
