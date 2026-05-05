// ═══════════════════════════════════════════════════════════════════════════════
// CATHEDRAL — Online Multiplayer Hook (PeerJS / WebRTC)
// Supports 2-4 players: host manages star topology connections
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useRef, useCallback, useEffect } from "react";
import Peer from "peerjs";

const PEER_PREFIX = "cathedral-game-";

function generateRoomId() {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  let id = "";
  for (let i = 0; i < 6; i++) id += chars[Math.floor(Math.random() * chars.length)];
  return id;
}

export function getRoomFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("room") || null;
}

export function buildRoomUrl(roomId) {
  const url = new URL(window.location.href);
  url.searchParams.set("room", roomId);
  url.hash = "";
  return url.toString();
}

// Connection states
export const STATUS = {
  IDLE: "idle",
  CREATING: "creating",
  WAITING: "waiting",       // host waiting for peers
  CONNECTING: "connecting", // joiner connecting to host
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  ERROR: "error",
};

// Message types
const MSG = {
  JOIN: "join",           // joiner → host: { name }
  WELCOME: "welcome",     // host → joiner: { hostName, playerIndex, playerNames, maxPlayers }
  PLAYER_UPDATE: "player_update", // host → all: { playerNames }
  MOVE: "move",           // joiner → host: { regionId }
  STATE: "state",         // host → all joiners: { claimed, currentPlayer, scores, eliminated, lastClaimed, gameOver }
  RESTART: "restart",     // host → all: request restart
  NEW_BOARD: "new_board", // host → all: { seed }
};

export function useMultiplayer() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [roomId, setRoomId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myName, setMyName] = useState("");
  const [myPlayerIndex, setMyPlayerIndex] = useState(0); // host=0, joiners get assigned
  const [maxPlayers, setMaxPlayers] = useState(2);
  // Map of playerIndex → name for all players
  const [playerNames, setPlayerNames] = useState({});
  const [connectedCount, setConnectedCount] = useState(0);
  const [error, setError] = useState(null);

  const peerRef = useRef(null);
  // For host: array of connections (indexed by playerIndex - 1, since host is 0)
  const connsRef = useRef([]);
  // For joiner: single connection to host
  const connRef = useRef(null);
  const onMessageRef = useRef(null);
  const playerNamesRef = useRef({});
  const nextPlayerIndexRef = useRef(1); // next index to assign to joining player

  // Set message handler
  const setOnMessage = useCallback((handler) => {
    onMessageRef.current = handler;
  }, []);

  // Host: broadcast data to all connected joiners
  const broadcast = useCallback((data) => {
    for (const entry of connsRef.current) {
      if (entry && entry.conn && entry.conn.open) {
        entry.conn.send(data);
      }
    }
  }, []);

  // Send data — host broadcasts to all, joiner sends to host
  const send = useCallback((data) => {
    if (connsRef.current.length > 0) {
      // Host: broadcast to all
      broadcast(data);
    } else if (connRef.current && connRef.current.open) {
      // Joiner: send to host
      connRef.current.send(data);
    }
  }, [broadcast]);

  // Host: handle a new joiner connection
  const handleHostConnection = useCallback((conn, hostName, maxP) => {
    const playerIndex = nextPlayerIndexRef.current;

    if (playerIndex >= maxP) {
      // Room is full — reject by closing
      conn.on("open", () => {
        conn.send({ type: "room_full" });
        setTimeout(() => conn.close(), 200);
      });
      return;
    }

    nextPlayerIndexRef.current = playerIndex + 1;

    const entry = { conn, playerIndex, name: null };
    connsRef.current.push(entry);

    conn.on("open", () => {
      // Wait for JOIN message
    });

    conn.on("data", (data) => {
      if (data.type === MSG.JOIN) {
        entry.name = data.name || `Player ${playerIndex + 1}`;

        // Update player names
        const names = { ...playerNamesRef.current, [playerIndex]: entry.name };
        playerNamesRef.current = names;
        setPlayerNames({ ...names });
        setConnectedCount(connsRef.current.filter(e => e.name !== null).length);

        // Send welcome to this joiner
        conn.send({
          type: MSG.WELCOME,
          hostName: hostName,
          playerIndex: playerIndex,
          playerNames: names,
          maxPlayers: maxP,
        });

        // Broadcast updated player list to ALL joiners
        for (const e of connsRef.current) {
          if (e.conn.open && e !== entry) {
            e.conn.send({ type: MSG.PLAYER_UPDATE, playerNames: names });
          }
        }
      }

      // Forward all messages to the game handler, tagged with source player index
      if (onMessageRef.current) {
        onMessageRef.current({ ...data, _fromPlayer: playerIndex });
      }
    });

    conn.on("close", () => {
      // Remove this connection
      connsRef.current = connsRef.current.filter(e => e !== entry);
      setConnectedCount(connsRef.current.filter(e => e.name !== null).length);

      // Broadcast disconnection to all remaining joiners
      for (const e of connsRef.current) {
        if (e.conn && e.conn.open) {
          e.conn.send({ type: "player_disconnected", playerIndex });
        }
      }

      // Notify host's own game handler
      if (onMessageRef.current) {
        onMessageRef.current({ type: "player_disconnected", playerIndex });
      }
    });

    conn.on("error", (err) => {
      console.error(`Connection error (player ${playerIndex}):`, err);
    });
  }, []);

  // Create a room (host)
  const createRoom = useCallback((name, numPlayers) => {
    const hostName = name || "Player 1";
    setMyName(hostName);
    setIsHost(true);
    setMyPlayerIndex(0);
    setMaxPlayers(numPlayers || 2);
    setStatus(STATUS.CREATING);
    setError(null);

    const names = { 0: hostName };
    playerNamesRef.current = names;
    setPlayerNames(names);
    nextPlayerIndexRef.current = 1;
    connsRef.current = [];

    const id = generateRoomId();
    setRoomId(id);

    const peer = new Peer(PEER_PREFIX + id, { debug: 0 });
    peerRef.current = peer;

    peer.on("open", () => {
      setStatus(STATUS.WAITING);
    });

    peer.on("connection", (conn) => {
      handleHostConnection(conn, hostName, numPlayers || 2);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "unavailable-id") {
        peer.destroy();
        const newId = generateRoomId();
        setRoomId(newId);
        const newPeer = new Peer(PEER_PREFIX + newId, { debug: 0 });
        peerRef.current = newPeer;
        newPeer.on("open", () => setStatus(STATUS.WAITING));
        newPeer.on("connection", (c) => handleHostConnection(c, hostName, numPlayers || 2));
        newPeer.on("error", (e) => {
          setError(`Failed to create room: ${e.message}`);
          setStatus(STATUS.ERROR);
        });
      } else {
        setError(`Connection error: ${err.message}`);
        setStatus(STATUS.ERROR);
      }
    });

    return id;
  }, [handleHostConnection]);

  // Join an existing room
  const joinRoom = useCallback((targetRoomId, name) => {
    const joinerName = name || "Player";
    setMyName(joinerName);
    setIsHost(false);
    setRoomId(targetRoomId);
    setStatus(STATUS.CONNECTING);
    setError(null);

    const peer = new Peer(undefined, { debug: 0 });
    peerRef.current = peer;

    peer.on("open", () => {
      const conn = peer.connect(PEER_PREFIX + targetRoomId, {
        reliable: true,
      });
      connRef.current = conn;

      conn.on("open", () => {
        setStatus(STATUS.CONNECTED);
        conn.send({ type: MSG.JOIN, name: joinerName });
      });

      conn.on("data", (data) => {
        if (data.type === MSG.WELCOME) {
          setMyPlayerIndex(data.playerIndex);
          setMaxPlayers(data.maxPlayers);
          setPlayerNames(data.playerNames);
        } else if (data.type === MSG.PLAYER_UPDATE) {
          setPlayerNames(data.playerNames);
        } else if (data.type === "room_full") {
          setError("Room is full.");
          setStatus(STATUS.ERROR);
          return;
        }

        // Forward to game handler
        if (onMessageRef.current) {
          onMessageRef.current(data);
        }
      });

      conn.on("close", () => {
        setStatus(STATUS.DISCONNECTED);
      });

      conn.on("error", (err) => {
        console.error("Connection error:", err);
        setError("Connection lost");
        setStatus(STATUS.ERROR);
      });
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "peer-unavailable") {
        setError("Room not found. It may have expired or the host left.");
      } else {
        setError(`Connection error: ${err.message}`);
      }
      setStatus(STATUS.ERROR);
    });
  }, []);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
    // Close all host connections
    for (const entry of connsRef.current) {
      if (entry.conn) entry.conn.close();
    }
    connsRef.current = [];

    // Close joiner connection
    if (connRef.current) {
      connRef.current.close();
      connRef.current = null;
    }
    if (peerRef.current) {
      peerRef.current.destroy();
      peerRef.current = null;
    }
    setStatus(STATUS.IDLE);
    setRoomId(null);
    setPlayerNames({});
    setConnectedCount(0);
    setError(null);
    playerNamesRef.current = {};
    nextPlayerIndexRef.current = 1;
    // Clear room param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      for (const entry of connsRef.current) {
        if (entry.conn) entry.conn.close();
      }
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  return {
    status,
    roomId,
    isHost,
    myName,
    myPlayerIndex,
    maxPlayers,
    playerNames,
    connectedCount,
    error,
    createRoom,
    joinRoom,
    disconnect,
    send,
    broadcast,
    setOnMessage,
    MSG,
  };
}

export { MSG };
