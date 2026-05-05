import { useState, useCallback, useEffect } from 'react';
import CathedralGame from './CathedralGame.jsx';
import Lobby from './Lobby.jsx';
import { useMultiplayer, getRoomFromUrl, STATUS } from './useMultiplayer.js';
import { inject } from '@vercel/analytics';
import styles from './App.module.css';

// Initialize Vercel Analytics
inject();

export default function App() {
  // Check if joining via URL
  const urlRoom = getRoomFromUrl();
  const [mode, setMode] = useState(urlRoom ? "online" : null); // null = mode selection, "local", "online"
  const [onlineGameStarted, setOnlineGameStarted] = useState(false);
  const [onlineSeed, setOnlineSeed] = useState(null);

  const multiplayer = useMultiplayer();

  const handleStartOnlineGame = useCallback((seed, isHostStarting) => {
    setOnlineSeed(seed);
    setOnlineGameStarted(true);
  }, []);

  const handleLeaveOnlineGame = useCallback(() => {
    multiplayer.disconnect();
    setOnlineGameStarted(false);
    setOnlineSeed(null);
    setMode(null);
  }, [multiplayer]);

  // Local mode
  if (mode === "local") {
    return <CathedralGame onBack={() => setMode(null)} />;
  }

  // Online mode
  if (mode === "online") {
    if (onlineGameStarted && onlineSeed !== null) {
      return (
        <CathedralGame
          multiplayer={multiplayer}
          onlineSeed={onlineSeed}
          onLeave={handleLeaveOnlineGame}
        />
      );
    }
    return (
      <Lobby
        multiplayer={multiplayer}
        onStartGame={handleStartOnlineGame}
        onBack={() => {
          multiplayer.disconnect();
          setMode(null);
        }}
      />
    );
  }

  // Mode selection
  return (
    <div className={styles.root}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <span className={styles.cross}>✛</span>
          <h1 className={styles.title}>CATHEDRAL</h1>
          <span className={styles.cross}>✛</span>
        </div>
        <p className={styles.subtitle}>Stained Glass Territory</p>
      </header>

      <div className={styles.modeCards}>
        <div className={styles.modeCard} onClick={() => setMode("local")} id="mode-local">
          <span className={styles.modeIcon}>⚔</span>
          <div className={styles.modeTitle}>Local Play</div>
          <div className={styles.modeDesc}>
            Play on the same device with 2–4 players, taking turns on a shared screen
          </div>
        </div>

        <div className={styles.modeCard} onClick={() => setMode("online")} id="mode-online">
          <span className={styles.modeIcon}>🌐</span>
          <div className={styles.modeTitle}>Play Online</div>
          <div className={styles.modeDesc}>
            Create a room and share the link — play 1v1 with anyone, anywhere
          </div>
        </div>
      </div>

      <div className={styles.version}>v2.0</div>
    </div>
  );
}
