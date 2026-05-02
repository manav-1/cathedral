import { useState, useCallback, useMemo } from "react";
import {
  buildBoard, isValidMove, getValidMoves,
  PLAYERS, ARCH_PATH, CX, SPRING_Y, ARCH_R
} from "./gameLogic.js";
import styles from "./CathedralGame.module.css";

export default function CathedralGame() {
  const [boardSeed, setBoardSeed] = useState(42);
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
  const [scores, setScores] = useState([0, 0]);
  const [lastClaimed, setLastClaimed] = useState(null);
  const [prevSeed, setPrevSeed] = useState(boardSeed);

  if (prevSeed !== boardSeed) {
    setPrevSeed(boardSeed);
    setClaimed(mkClaimed());
    setCurrentPlayer(0);
    setHovered(null);
    setInvalid(null);
    setGameOver(false);
    setScores([0, 0]);
    setLastClaimed(null);
  }

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
    // End game immediately when either player has no valid moves
    let next = 1 - currentPlayer;
    const nextHasMoves = getValidMoves(next, nc, regions).length > 0;
    const currentHasMoves = getValidMoves(currentPlayer, nc, regions).length > 0;
    if (!nextHasMoves || !currentHasMoves) {
      setClaimed(nc); setScores(ns); setLastClaimed(id); setGameOver(true);
      return;
    }
    setClaimed(nc); setScores(ns); setLastClaimed(id); setCurrentPlayer(next);
  }, [claimed, currentPlayer, gameOver, scores, regions]);

  const resetGame = useCallback(() => {
    setClaimed(mkClaimed());
    setCurrentPlayer(0);
    setHovered(null);
    setInvalid(null);
    setGameOver(false);
    setScores([0, 0]);
    setLastClaimed(null);
  }, [mkClaimed]);

  const newGame = () => setBoardSeed(Math.floor(Math.random() * 99999));

  const validMoves = gameOver ? [] : getValidMoves(currentPlayer, claimed, regions);
  const winner = gameOver
    ? (scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : null)
    : null;
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

      {/* Scoreboard */}
      <div className={styles.scoreboard}>
        {PLAYERS.map(p => (
          <div
            key={p.id}
            className={`${styles.card} ${!gameOver && cp === p.id ? styles.cardActive : ""}`}
            style={{
              borderColor: p.color,
              opacity: !gameOver && cp !== p.id ? 0.45 : 1,
              boxShadow: !gameOver && cp === p.id
                ? `0 0 24px ${p.glow}44, inset 0 0 10px ${p.glow}12` : "none",
            }}
          >
            <div className={styles.dot} style={{ background: p.color, boxShadow: `0 0 8px ${p.glow}` }} />
            <div>
              <div className={styles.pname}>{p.name}</div>
              <div className={styles.pscore} style={{ color: p.color }}>{scores[p.id]}</div>
            </div>
            {!gameOver && cp === p.id && (
              <div className={styles.pip} style={{ background: p.color }}>YOUR TURN</div>
            )}
            {gameOver && winner === p.id && (
              <div className={styles.pip} style={{ background: p.color }}>WINNER ✦</div>
            )}
            {gameOver && winner === null && p.id === 0 && (
              <div className={styles.pip} style={{ background: "#666" }}>DRAW</div>
            )}
          </div>
        ))}
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
              if (owner !== null) { fill = PLAYERS[owner].color; stroke = "#ffffff55"; sw = 1.5; }
              else if (isInv) { fill = "#4a0000"; stroke = "#ff2020"; sw = 2.5; }
              else if (isHov && isVal) { fill = PLAYERS[cp].light; stroke = PLAYERS[cp].color; sw = 2; }
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
              ? `${PLAYERS[winner].name} wins with ${scores[winner]} regions!`
              : `Draw — ${scores[0]} each.`}
          </span>
        ) : (
          <span className={styles.sTxt}>
            <span style={{ color: PLAYERS[cp].color }}>{PLAYERS[cp].name}</span>
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
