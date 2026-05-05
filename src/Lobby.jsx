import { useState, useEffect, useCallback } from "react";
import { STATUS, buildRoomUrl, MSG } from "./useMultiplayer.js";
import styles from "./Lobby.module.css";

export default function Lobby({ multiplayer, onStartGame, onBack }) {
  const {
    status, roomId, isHost, myName, peerName, error,
    createRoom, joinRoom, disconnect, send, setOnMessage,
  } = multiplayer;

  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState("menu"); // menu | create | join
  const [gameReady, setGameReady] = useState(false);

  // If joining from URL, go straight to join view
  const urlRoom = new URLSearchParams(window.location.search).get("room");
  useEffect(() => {
    if (urlRoom && view === "menu") {
      setRoomInput(urlRoom);
      setView("join");
    }
  }, [urlRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for welcome/seed messages
  useEffect(() => {
    setOnMessage((data) => {
      if (data.type === MSG.WELCOME || data.type === MSG.JOIN) {
        // Connection established — peer name handled by hook
      }
      if (data.type === "start_game") {
        setGameReady(true);
        onStartGame(data.seed, false);
      }
    });
  }, [setOnMessage, onStartGame]);

  // Auto-start when both connected (for host)
  useEffect(() => {
    if (status === STATUS.CONNECTED && isHost && !gameReady) {
      // Small delay so the joiner's name can arrive
      const t = setTimeout(() => setGameReady(true), 600);
      return () => clearTimeout(t);
    }
  }, [status, isHost, gameReady]);

  const handleCreate = () => {
    const playerName = name.trim() || "Player 1";
    createRoom(playerName);
    setView("create");
  };

  const handleJoin = () => {
    const code = roomInput.trim().toLowerCase();
    if (!code) return;
    const playerName = name.trim() || "Player 2";
    joinRoom(code, playerName);
  };

  // Auto-join if we came from URL
  useEffect(() => {
    if (view === "join" && urlRoom && status === STATUS.IDLE) {
      const playerName = name.trim() || "Player 2";
      joinRoom(urlRoom, playerName);
    }
  }, [view, urlRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleCopy = async () => {
    const url = buildRoomUrl(roomId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartGame = () => {
    const seed = Math.floor(Math.random() * 99999);
    send({ type: "start_game", seed });
    onStartGame(seed, true);
  };

  const handleBack = () => {
    disconnect();
    if (view !== "menu") {
      setView("menu");
      setGameReady(false);
    } else {
      onBack();
    }
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
        <p className={styles.subtitle}>Online Multiplayer</p>
      </header>

      <div className={styles.lobbyCard}>
        {/* ── Menu View ─────────────────────────────────────── */}
        {view === "menu" && (
          <>
            <div className={styles.lobbyTitle}>Play Online</div>

            <div className={styles.nameGroup}>
              <label className={styles.label}>Your Name</label>
              <input
                className={styles.nameInput}
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="Enter your name..."
                maxLength={20}
                autoFocus
              />
            </div>

            <div className={styles.actions}>
              <button className={styles.createBtn} onClick={handleCreate}>
                ✦ Create Room
              </button>

              <div className={styles.divider}>
                <span className={styles.dividerLine} />
                <span className={styles.dividerText}>or</span>
                <span className={styles.dividerLine} />
              </div>

              <div className={styles.joinGroup}>
                <input
                  className={styles.roomInput}
                  type="text"
                  value={roomInput}
                  onChange={e => setRoomInput(e.target.value.toLowerCase())}
                  placeholder="Room code..."
                  maxLength={10}
                />
                <button
                  className={styles.goBtn}
                  onClick={() => { setView("join"); handleJoin(); }}
                  disabled={!roomInput.trim()}
                >
                  Join
                </button>
              </div>

              <button className={styles.backBtn} onClick={onBack}>
                ← Back to Local Play
              </button>
            </div>
          </>
        )}

        {/* ── Create View (Host Waiting) ────────────────────── */}
        {view === "create" && (
          <div className={styles.waitingWrap}>
            <div className={styles.lobbyTitle}>
              {status === STATUS.CONNECTED ? "Player Connected!" : "Waiting for Player..."}
            </div>

            {(status === STATUS.CREATING || status === STATUS.WAITING) && (
              <>
                <div className={styles.connStatus + " " + styles.statusConnecting}>
                  <span className={styles.connDot} />
                  Waiting for opponent...
                </div>

                <div className={styles.spinner} />

                <p className={styles.statusText}>
                  Share this link with your opponent:
                </p>

                <div className={styles.linkBox}>
                  <span className={styles.linkText}>{buildRoomUrl(roomId)}</span>
                  <button
                    className={`${styles.copyBtn} ${copied ? styles.copied : ""}`}
                    onClick={handleCopy}
                  >
                    {copied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </>
            )}

            {status === STATUS.CONNECTED && (
              <>
                <div className={styles.connStatus + " " + styles.statusConnected}>
                  <span className={styles.connDot} />
                  Connected
                </div>

                <div className={styles.playersReady}>
                  <div className={`${styles.playerSlot} ${styles.playerSlotFilled}`}>
                    <div className={styles.slotLabel}>Player 1 (You)</div>
                    <div className={styles.slotName}>{name.trim() || "Player 1"}</div>
                  </div>
                  <div className={`${styles.playerSlot} ${styles.playerSlotFilled}`}>
                    <div className={styles.slotLabel}>Player 2</div>
                    <div className={styles.slotName}>{peerName || "Connected"}</div>
                  </div>
                </div>

                <button className={styles.startBtn} onClick={handleStartGame}>
                  ⚔ Start Game
                </button>
              </>
            )}

            {status === STATUS.ERROR && (
              <>
                <div className={styles.connStatus + " " + styles.statusError}>
                  <span className={styles.connDot} />
                  Error
                </div>
                <p className={styles.errorText}>{error}</p>
              </>
            )}

            <button className={styles.backBtn} onClick={handleBack}>
              ← Cancel
            </button>
          </div>
        )}

        {/* ── Join View ─────────────────────────────────────── */}
        {view === "join" && (
          <div className={styles.waitingWrap}>
            <div className={styles.lobbyTitle}>
              {status === STATUS.CONNECTED ? "Connected!" : "Joining Room..."}
            </div>

            {(status === STATUS.CONNECTING || status === STATUS.IDLE) && (
              <>
                <div className={styles.connStatus + " " + styles.statusConnecting}>
                  <span className={styles.connDot} />
                  Connecting to host...
                </div>
                <div className={styles.spinner} />
              </>
            )}

            {status === STATUS.CONNECTED && (
              <>
                <div className={styles.connStatus + " " + styles.statusConnected}>
                  <span className={styles.connDot} />
                  Connected
                </div>

                <div className={styles.playersReady}>
                  <div className={`${styles.playerSlot} ${styles.playerSlotFilled}`}>
                    <div className={styles.slotLabel}>Player 1 (Host)</div>
                    <div className={styles.slotName}>{peerName || "Host"}</div>
                  </div>
                  <div className={`${styles.playerSlot} ${styles.playerSlotFilled}`}>
                    <div className={styles.slotLabel}>Player 2 (You)</div>
                    <div className={styles.slotName}>{name.trim() || "Player 2"}</div>
                  </div>
                </div>

                <p className={styles.statusText}>Waiting for host to start the game...</p>
                <div className={styles.spinner} />
              </>
            )}

            {status === STATUS.ERROR && (
              <>
                <div className={styles.connStatus + " " + styles.statusError}>
                  <span className={styles.connDot} />
                  Error
                </div>
                <p className={styles.errorText}>{error}</p>
              </>
            )}

            <button className={styles.backBtn} onClick={handleBack}>
              ← Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
