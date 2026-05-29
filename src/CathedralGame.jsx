import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  buildBoard,
  isValidMove,
  getValidMoves,
  getPlayers,
  ARCH_PATH,
  CX,
  SPRING_Y,
  ARCH_R,
} from "./gameLogic.js";
import { STATUS, MSG } from "./useMultiplayer.js";
import styles from "./CathedralGame.module.css";

export default function CathedralGame({
  multiplayer,
  onlineSeed,
  onlinePlayerCount,
  onLeave,
  onBack,
}) {
  const isOnline = !!multiplayer;
  const isHost = multiplayer?.isHost ?? false;
  const myPlayerIndex = isOnline ? multiplayer.myPlayerIndex : null;

  const [playerCount, setPlayerCount] = useState(
    isOnline ? onlinePlayerCount || 2 : 2,
  );
  const [boardSeed, setBoardSeed] = useState(isOnline ? onlineSeed || 42 : 42);

  const players = useMemo(() => getPlayers(playerCount), [playerCount]);
  const regions = useMemo(() => buildBoard(boardSeed), [boardSeed]);
  const mkClaimed = useCallback(
    () => Object.fromEntries(regions.map((r) => [r.id, null])),
    [regions],
  );

  const [claimed, setClaimed] = useState(mkClaimed);
  const [currentPlayer, setCurrentPlayer] = useState(0);
  const [hovered, setHovered] = useState(null);
  const [invalid, setInvalid] = useState(null);
  const [gameOver, setGameOver] = useState(false);
  const [scores, setScores] = useState(() => new Array(playerCount).fill(0));
  const [eliminated, setEliminated] = useState(() =>
    new Array(playerCount).fill(false),
  );
  const [lastClaimed, setLastClaimed] = useState(null);
  const [prevSeed, setPrevSeed] = useState(boardSeed);
  const [prevPlayerCount, setPrevPlayerCount] = useState(playerCount);
  const [disconnectedPlayers, setDisconnectedPlayers] = useState(new Set());

  // Online player names — from multiplayer hook's playerNames map
  const onlinePlayerNames = isOnline ? multiplayer.playerNames : {};

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
  const findNextPlayer = useCallback(
    (from, nc, elim) => {
      for (let i = 1; i <= playerCount; i++) {
        const p = (from + i) % playerCount;
        if (!elim[p] && getValidMoves(p, nc, regions).length) return p;
      }
      return -1;
    },
    [playerCount, regions],
  );

  // Core move processing logic
  const processMove = useCallback(
    (id, cp, currentClaimed, currentScores, currentEliminated) => {
      if (!isValidMove(id, cp, currentClaimed, regions)) {
        return null;
      }
      const nc = { ...currentClaimed, [id]: cp };
      const ns = [...currentScores];
      ns[cp]++;

      const ne = [...currentEliminated];
      let activeMoveCount = 0;
      for (let p = 0; p < playerCount; p++) {
        const hasMoves = getValidMoves(p, nc, regions).length > 0;
        if (!ne[p] && !hasMoves) {
          ne[p] = true;
        }
        if (hasMoves) activeMoveCount++;
      }

      const isGameOver = activeMoveCount <= 1;
      let nextPlayer = cp;

      if (!isGameOver) {
        const next = findNextPlayer(cp, nc, ne);
        if (next === -1) {
          nextPlayer = cp;
        } else {
          nextPlayer = next;
        }
      }

      return {
        claimed: nc,
        scores: ns,
        eliminated: ne,
        lastClaimed: id,
        gameOver: isGameOver,
        currentPlayer: nextPlayer,
      };
    },
    [regions, playerCount, findNextPlayer],
  );

  // Apply a state update
  const applyState = useCallback((state) => {
    setClaimed(state.claimed);
    setScores(state.scores);
    setEliminated(state.eliminated);
    setLastClaimed(state.lastClaimed);
    setGameOver(state.gameOver);
    setCurrentPlayer(state.currentPlayer);
  }, []);

  // Handle click on a region
  const handleClick = useCallback(
    (id) => {
      if (gameOver) return;

      // In online mode, only allow moves on your turn
      if (isOnline && currentPlayer !== myPlayerIndex) return;

      if (isOnline && !isHost) {
        // Non-host: send move request to host
        if (!isValidMove(id, currentPlayer, claimed, regions)) {
          setInvalid(id);
          setTimeout(() => setInvalid(null), 500);
          return;
        }
        multiplayer.send({ type: MSG.MOVE, regionId: id });
        return;
      }

      // Local mode or Host: process move directly
      const result = processMove(
        id,
        currentPlayer,
        claimed,
        scores,
        eliminated,
      );
      if (!result) {
        setInvalid(id);
        setTimeout(() => setInvalid(null), 500);
        return;
      }

      applyState(result);

      // Host: broadcast state to all joiners
      if (isOnline && isHost) {
        multiplayer.send({ type: MSG.STATE, ...result });
      }
    },
    [
      claimed,
      currentPlayer,
      gameOver,
      scores,
      eliminated,
      regions,
      isOnline,
      isHost,
      myPlayerIndex,
      multiplayer,
      processMove,
      applyState,
    ],
  );

  // Ref-based state for host to process async moves
  const stateRef = useRef({
    claimed,
    currentPlayer,
    scores,
    eliminated,
    gameOver,
  });
  useEffect(() => {
    stateRef.current = { claimed, currentPlayer, scores, eliminated, gameOver };
  }, [claimed, currentPlayer, scores, eliminated, gameOver]);

  // Setup online message handler
  useEffect(() => {
    if (!isOnline) return;

    multiplayer.setOnMessage((data) => {
      if (data.type === MSG.MOVE && isHost) {
        const s = stateRef.current;
        if (s.gameOver) return;
        const result = processMove(
          data.regionId,
          s.currentPlayer,
          s.claimed,
          s.scores,
          s.eliminated,
        );
        if (result) {
          applyState(result);
          multiplayer.send({ type: MSG.STATE, ...result });
        }
      }

      if (data.type === MSG.STATE && !isHost) {
        applyState(data);
      }

      if (data.type === MSG.RESTART) {
        setClaimed((prev) => {
          const fresh = {};
          for (const key of Object.keys(prev)) fresh[key] = null;
          return fresh;
        });
        setCurrentPlayer(0);
        setHovered(null);
        setInvalid(null);
        setGameOver(false);
        setScores(new Array(playerCount).fill(0));
        setEliminated(new Array(playerCount).fill(false));
        setLastClaimed(null);
      }

      if (data.type === MSG.NEW_BOARD && !isHost) {
        setBoardSeed(data.seed);
      }

      if (data.type === "start_game") {
        setBoardSeed(data.seed);
        if (data.playerCount) setPlayerCount(data.playerCount);
      }

      if (data.type === "player_disconnected") {
        setDisconnectedPlayers((prev) => new Set([...prev, data.playerIndex]));
      }
    });
  }, [isOnline, isHost, multiplayer, processMove, applyState, playerCount]);

  // Track host disconnection (for joiners)
  useEffect(() => {
    if (isOnline && !isHost && multiplayer.status === STATUS.DISCONNECTED) {
      setDisconnectedPlayers((prev) => new Set([...prev, -1])); // -1 = host disconnected
    }
  }, [isOnline, isHost, multiplayer?.status]);

  const hostDisconnected = isOnline && !isHost && disconnectedPlayers.has(-1);
  const anyDisconnected = disconnectedPlayers.size > 0;

  const resetGame = useCallback(() => {
    setClaimed(mkClaimed());
    setCurrentPlayer(0);
    setHovered(null);
    setInvalid(null);
    setGameOver(false);
    setScores(new Array(playerCount).fill(0));
    setEliminated(new Array(playerCount).fill(false));
    setLastClaimed(null);

    if (isOnline) {
      multiplayer.send({ type: MSG.RESTART });
    }
  }, [mkClaimed, playerCount, isOnline, multiplayer]);

  const newGame = () => {
    const seed = Math.floor(Math.random() * 99999);
    setBoardSeed(seed);
    if (isOnline && isHost) {
      multiplayer.send({ type: MSG.NEW_BOARD, seed });
    }
  };

  const changePlayerCount = (n) => {
    if (isOnline) return;
    setPlayerCount(n);
    setBoardSeed(Math.floor(Math.random() * 99999));
  };

  const validMoves = gameOver
    ? []
    : getValidMoves(currentPlayer, claimed, regions);

  // Is it my turn?
  const isMyTurn = isOnline ? currentPlayer === myPlayerIndex : true;

  // Determine results
  const results = useMemo(() => {
    if (!gameOver)
      return { winners: [], losers: [], maxScore: 0, isTie: false };
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

  // Get display name for a player index
  const getPlayerName = (idx) => {
    if (!isOnline) return players[idx].name;
    return onlinePlayerNames[idx] || `Player ${idx + 1}`;
  };

  return (
    <div className={styles.root}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.cross}>✛</span>
          <h1 className={styles.title}>CATHEDRAL</h1>
          <span className={styles.cross}>✛</span>
        </div>
        <p className={styles.subtitle}>
          {isOnline
            ? `Online Match · ${playerCount} Players`
            : "Stained Glass Territory"}
        </p>
      </header>

      {/* Online connection banner */}
      {isOnline && (
        <div className={styles.onlineBanner}>
          {hostDisconnected ? (
            <span className={styles.disconnectedBadge}>
              <span className={styles.connDotRed} /> Host disconnected
            </span>
          ) : anyDisconnected ? (
            <span className={styles.disconnectedBadge}>
              <span className={styles.connDotRed} /> A player disconnected
            </span>
          ) : (
            <span className={styles.connectedBadge}>
              <span className={styles.connDotGreen} /> {playerCount} players
              connected
            </span>
          )}
        </div>
      )}

      {/* Player Count Selector — only in local mode */}
      {!isOnline && (
        <div className={styles.playerSelect}>
          {[2, 3, 4].map((n) => (
            <button
              key={n}
              className={`${styles.playerBtn} ${playerCount === n ? styles.playerBtnActive : ""}`}
              onClick={() => changePlayerCount(n)}
            >
              {n} Players
            </button>
          ))}
        </div>
      )}

      {/* Scoreboard */}
      <div className={styles.scoreboard}>
        {players.map((p) => {
          const isElim = eliminated[p.id];
          const isActive = !gameOver && cp === p.id;
          const isMe = isOnline && p.id === myPlayerIndex;
          const isDisconn = isOnline && disconnectedPlayers.has(p.id);
          return (
            <div
              key={p.id}
              className={`${styles.card} ${isActive && !isDisconn ? styles.cardActive : ""} ${isElim ? styles.cardEliminated : ""}`}
              style={{
                borderColor: isDisconn ? "#5a2020" : isElim ? "#333" : p.color,
                opacity: isDisconn
                  ? 0.4
                  : isElim
                    ? 0.35
                    : !gameOver && cp !== p.id
                      ? 0.45
                      : 1,
                boxShadow:
                  isActive && !isDisconn
                    ? `0 0 24px ${p.glow}44, inset 0 0 10px ${p.glow}12`
                    : "none",
              }}
            >
              <div
                className={styles.dot}
                style={{
                  background: isDisconn ? "#5a2020" : isElim ? "#444" : p.color,
                  boxShadow: isDisconn
                    ? "0 0 6px #e74c3c"
                    : isElim
                      ? "none"
                      : `0 0 8px ${p.glow}`,
                }}
              />
              <div>
                <div className={styles.pname}>
                  {getPlayerName(p.id)}
                  {isOnline && isMe && (
                    <span className={styles.youTag}> (you)</span>
                  )}
                </div>
                <div
                  className={styles.pscore}
                  style={{
                    color: isDisconn ? "#5a2020" : isElim ? "#555" : p.color,
                  }}
                >
                  {scores[p.id]}
                </div>
              </div>
              {isDisconn && (
                <div className={styles.pip} style={{ background: "#5a2020" }}>
                  ⚡ DISCONNECTED
                </div>
              )}
              {!isDisconn && isActive && (
                <div className={styles.pip} style={{ background: p.color }}>
                  {isOnline ? (isMe ? "YOUR TURN" : "THEIR TURN") : "YOUR TURN"}
                </div>
              )}
              {!isDisconn && isElim && !gameOver && (
                <div className={styles.pip} style={{ background: "#444" }}>
                  OUT
                </div>
              )}
              {gameOver && winner === p.id && (
                <div className={styles.pip} style={{ background: p.color }}>
                  {isOnline && isMe ? "YOU WIN ✦" : "WINNER ✦"}
                </div>
              )}
              {gameOver && results.isTie && results.winners.includes(p.id) && (
                <div className={styles.pip} style={{ background: p.color }}>
                  DRAW
                </div>
              )}
              {gameOver && results.losers.includes(p.id) && (
                <div className={styles.pip} style={{ background: "#444" }}>
                  LOST
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Board */}
      <div className={styles.boardWrap}>
        <svg viewBox="0 0 400 440" className={styles.svg}>
          <defs>
            <clipPath id="arch">
              <path d={ARCH_PATH} />
            </clipPath>
            <filter id="glow">
              <feGaussianBlur stdDeviation="5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect width="400" height="440" fill="#080604" />
          <path
            d={ARCH_PATH}
            fill="#0a0806"
            stroke="#5a3e14"
            strokeWidth="16"
          />

          <g clipPath="url(#arch)">
            <path d={ARCH_PATH} fill="#160e08" />
            {regions.map((r) => {
              const owner = claimed[r.id];
              const isHov = hovered === r.id;
              const isInv = invalid === r.id;
              const isVal = validMoves.includes(r.id);
              const isLast = lastClaimed === r.id;

              const showValid = isOnline ? isMyTurn && isVal : isVal;

              let fill = "#1e1408",
                stroke = "#8a6428",
                sw = 1.2;
              if (owner !== null) {
                fill = players[owner].color;
                stroke = "#ffffff55";
                sw = 1.5;
              } else if (isInv) {
                fill = "#4a0000";
                stroke = "#ff2020";
                sw = 2.5;
              } else if (isHov && showValid) {
                fill = players[cp].light;
                stroke = players[cp].color;
                sw = 2;
              } else if (isHov) {
                fill = "#250808";
                stroke = "#551010";
                sw = 2;
              }

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
                  style={{
                    cursor:
                      gameOver || (isOnline && !isMyTurn)
                        ? "default"
                        : "pointer",
                    transition: "fill 0.1s",
                  }}
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
          <ellipse
            cx={CX}
            cy={SPRING_Y - ARCH_R + 2}
            rx="14"
            ry="9"
            fill="#C8A040"
          />
          <ellipse
            cx={CX}
            cy={SPRING_Y - ARCH_R + 2}
            rx="7"
            ry="4.5"
            fill="#080604"
          />
        </svg>
      </div>

      {/* Status */}
      <div className={styles.status}>
        {hostDisconnected ? (
          <span className={styles.sTxt} style={{ color: "#e74c3c" }}>
            Host disconnected — game ended
          </span>
        ) : gameOver ? (
          <span className={styles.sTxt}>
            {winner !== null
              ? isOnline
                ? winner === myPlayerIndex
                  ? `You win with ${scores[winner]} regions!`
                  : `${getPlayerName(winner)} wins with ${scores[winner]} regions!`
                : `${getPlayerName(winner)} wins with ${scores[winner]} regions!`
              : `${results.winners.map((i) => getPlayerName(i)).join(" & ")} draw with ${results.maxScore} regions${results.losers.length ? ` · ${results.losers.map((i) => getPlayerName(i)).join(", ")} lost` : ""}`}
          </span>
        ) : (
          <span className={styles.sTxt}>
            {isOnline ? (
              isMyTurn ? (
                <>
                  <span style={{ color: players[cp].color }}>Your turn</span>
                  {" — claim a region not edge-touching opponents"}
                </>
              ) : (
                <>
                  <span style={{ color: players[cp].color }}>
                    {getPlayerName(cp)}
                  </span>
                  {" is thinking..."}
                </>
              )
            ) : (
              <>
                <span style={{ color: players[cp].color }}>
                  {getPlayerName(cp)}
                </span>
                {" — claim a region not edge-touching opponents"}
              </>
            )}
          </span>
        )}
      </div>

      {/* Controls */}
      <div className={styles.controls}>
        {(!isOnline || isHost) && (
          <>
            <button className={styles.btn} onClick={newGame}>
              ✦ New Board
            </button>
            <button className={styles.btn} onClick={resetGame}>
              ↺ Restart
            </button>
          </>
        )}
        {isOnline ? (
          <button
            className={styles.btn}
            onClick={onLeave}
            style={{ borderColor: "#5a2020", color: "#c87070" }}
          >
            ✕ Leave Room
          </button>
        ) : onBack ? (
          <button className={styles.btn} onClick={onBack}>
            ← Menu
          </button>
        ) : null}
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
