import { useState, useEffect, useCallback } from "react";
import { STATUS, buildRoomUrl, MSG } from "./useMultiplayer.js";
import styles from "./Lobby.module.css";

export default function Lobby({ multiplayer, onStartGame, onBack }) {
  const {
    status, roomId, isHost, myName, myPlayerIndex, maxPlayers,
    playerNames, connectedCount, error,
    createRoom, joinRoom, disconnect, send, setOnMessage,
  } = multiplayer;

  const [name, setName] = useState("");
  const [roomInput, setRoomInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [view, setView] = useState("menu"); // menu | create | join_name | join
  const [selectedPlayerCount, setSelectedPlayerCount] = useState(2);

  // If joining from URL, show name entry first
  const urlRoom = new URLSearchParams(window.location.search).get("room");
  useEffect(() => {
    if (urlRoom && view === "menu") {
      setRoomInput(urlRoom);
      setView("join_name");
    }
  }, [urlRoom]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for messages in lobby
  useEffect(() => {
    setOnMessage((data) => {
      if (data.type === "start_game") {
        onStartGame(data.seed, data.playerCount, false);
      }
    });
  }, [setOnMessage, onStartGame]);

  // Join handler — connects and transitions to join view
  const handleJoinConnect = useCallback(() => {
    const code = roomInput.trim().toLowerCase();
    if (!code) return;
    const playerName = name.trim() || "Player";
    joinRoom(code, playerName);
    setView("join");
  }, [roomInput, name, joinRoom]);

  const handleCreate = () => {
    const playerName = name.trim() || "Player 1";
    createRoom(playerName, selectedPlayerCount);
    setView("create");
  };

  // Menu join shortcut — goes to name entry if no name, otherwise connects directly
  const handleMenuJoin = () => {
    const code = roomInput.trim().toLowerCase();
    if (!code) return;
    setRoomInput(code);
    setView("join_name");
  };

  const handleCopy = async () => {
    const url = buildRoomUrl(roomId);
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
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
    // Count total players: host + connected joiners
    const totalPlayers = 1 + connectedCount;
    send({ type: "start_game", seed, playerCount: totalPlayers });
    onStartGame(seed, totalPlayers, true);
  };

  const handleBack = () => {
    disconnect();
    if (view !== "menu") {
      setView("menu");
    } else {
      onBack();
    }
  };

  // Total connected (including host)
  const totalPlayers = isHost ? 1 + connectedCount : Object.keys(playerNames).length;
  const canStart = isHost && totalPlayers >= 2;

  // Build player slot display
  const renderPlayerSlots = () => {
    const slots = [];
    const count = isHost ? maxPlayers : (maxPlayers || 4);
    for (let i = 0; i < count; i++) {
      const pName = playerNames[i];
      const isMe = i === myPlayerIndex;
      const filled = !!pName;
      slots.push(
        <div
          key={i}
          className={`${styles.playerSlot} ${filled ? styles.playerSlotFilled : ""}`}
        >
          <div className={styles.slotLabel}>
            Player {i + 1}
            {isMe && " (You)"}
            {i === 0 && !isMe && " (Host)"}
          </div>
          {filled ? (
            <div className={styles.slotName}>{pName}</div>
          ) : (
            <div className={styles.slotEmpty}>Waiting...</div>
          )}
        </div>
      );
    }
    return slots;
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

            {/* Player Count Selector */}
            <div className={styles.nameGroup}>
              <label className={styles.label}>Room Size</label>
              <div className={styles.playerCountRow}>
                {[2, 3, 4].map(n => (
                  <button
                    key={n}
                    className={`${styles.playerCountBtn} ${selectedPlayerCount === n ? styles.playerCountActive : ""}`}
                    onClick={() => setSelectedPlayerCount(n)}
                  >
                    {n} Players
                  </button>
                ))}
              </div>
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
                  onChange={e => setRoomInput(e.target.value.toLowerCase().trim())}
                  placeholder="Room code..."
                  maxLength={10}
                />
                <button
                  className={styles.goBtn}
                  onClick={handleMenuJoin}
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
              {totalPlayers >= maxPlayers
                ? "Room Full!"
                : `Waiting for Players (${totalPlayers}/${maxPlayers})`}
            </div>

            {status !== STATUS.ERROR && (
              <>
                {totalPlayers < maxPlayers && (
                  <>
                    <div className={styles.connStatus + " " + styles.statusConnecting}>
                      <span className={styles.connDot} />
                      {connectedCount === 0
                        ? "Waiting for players to join..."
                        : `${connectedCount} player${connectedCount > 1 ? "s" : ""} connected, waiting for more...`}
                    </div>

                    {connectedCount === 0 && <div className={styles.spinner} />}
                  </>
                )}

                {totalPlayers >= maxPlayers && (
                  <div className={styles.connStatus + " " + styles.statusConnected}>
                    <span className={styles.connDot} />
                    All players connected!
                  </div>
                )}

                <p className={styles.statusText}>
                  Share this link with other players:
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

                <div className={styles.playersReady}>
                  {renderPlayerSlots()}
                </div>

                {canStart && (
                  <button className={styles.startBtn} onClick={handleStartGame}>
                    ⚔ Start Game ({totalPlayers} Players)
                  </button>
                )}
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

        {/* ── Join Name Entry ──────────────────────────────── */}
        {view === "join_name" && (
          <>
            <div className={styles.lobbyTitle}>Join Game</div>

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
                onKeyDown={e => e.key === "Enter" && handleJoinConnect()}
              />
            </div>

            <div className={styles.actions}>
              <button className={styles.createBtn} onClick={handleJoinConnect}>
                ⚔ Join Game
              </button>
              <button className={styles.backBtn} onClick={handleBack}>
                ← Cancel
              </button>
            </div>
          </>
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
                  {renderPlayerSlots()}
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
