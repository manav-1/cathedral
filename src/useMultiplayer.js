// ═══════════════════════════════════════════════════════════════════════════════
// CATHEDRAL — Online Multiplayer Hook (PeerJS / WebRTC)
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
  // Remove hash if any
  url.hash = "";
  return url.toString();
}

// Connection states
export const STATUS = {
  IDLE: "idle",
  CREATING: "creating",
  WAITING: "waiting",       // host waiting for peer
  CONNECTING: "connecting", // joiner connecting to host
  CONNECTED: "connected",
  DISCONNECTED: "disconnected",
  ERROR: "error",
};

// Message types
const MSG = {
  JOIN: "join",           // joiner → host: { name }
  WELCOME: "welcome",     // host → joiner: { hostName, seed }
  MOVE: "move",           // joiner → host: { regionId }
  STATE: "state",         // host → joiner: { claimed, currentPlayer, scores, eliminated, lastClaimed, gameOver }
  RESTART: "restart",     // either → either: request restart
  NEW_BOARD: "new_board", // host → joiner: { seed, state }
};

export function useMultiplayer() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [roomId, setRoomId] = useState(null);
  const [isHost, setIsHost] = useState(false);
  const [myName, setMyName] = useState("");
  const [peerName, setPeerName] = useState("");
  const [error, setError] = useState(null);

  const peerRef = useRef(null);
  const connRef = useRef(null);
  const onMessageRef = useRef(null);

  // Set message handler
  const setOnMessage = useCallback((handler) => {
    onMessageRef.current = handler;
  }, []);

  // Send data to peer
  const send = useCallback((data) => {
    const conn = connRef.current;
    if (conn && conn.open) {
      conn.send(data);
    }
  }, []);

  // Setup connection event handlers
  const setupConnection = useCallback((conn, hosting) => {
    connRef.current = conn;

    conn.on("open", () => {
      setStatus(STATUS.CONNECTED);
      if (!hosting) {
        // Joiner sends their name
        conn.send({ type: MSG.JOIN, name: myName || "Player 2" });
      }
    });

    conn.on("data", (data) => {
      if (data.type === MSG.JOIN && hosting) {
        setPeerName(data.name || "Player 2");
        // Host sends welcome with their name
        conn.send({ type: MSG.WELCOME, hostName: myName || "Player 1" });
      } else if (data.type === MSG.WELCOME && !hosting) {
        setPeerName(data.hostName || "Player 1");
      }
      // Forward all messages to the game handler
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
  }, [myName]);

  // Create a room (host)
  const createRoom = useCallback((name) => {
    setMyName(name || "Player 1");
    setIsHost(true);
    setStatus(STATUS.CREATING);
    setError(null);

    const id = generateRoomId();
    setRoomId(id);

    const peer = new Peer(PEER_PREFIX + id, {
      debug: 0,
    });
    peerRef.current = peer;

    peer.on("open", () => {
      setStatus(STATUS.WAITING);
    });

    peer.on("connection", (conn) => {
      setupConnection(conn, true);
    });

    peer.on("error", (err) => {
      console.error("Peer error:", err);
      if (err.type === "unavailable-id") {
        // Room ID collision, try again
        peer.destroy();
        const newId = generateRoomId();
        setRoomId(newId);
        const newPeer = new Peer(PEER_PREFIX + newId, { debug: 0 });
        peerRef.current = newPeer;
        newPeer.on("open", () => setStatus(STATUS.WAITING));
        newPeer.on("connection", (c) => setupConnection(c, true));
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
  }, [setupConnection]);

  // Join an existing room
  const joinRoom = useCallback((targetRoomId, name) => {
    setMyName(name || "Player 2");
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
      setupConnection(conn, false);
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
  }, [setupConnection]);

  // Disconnect and cleanup
  const disconnect = useCallback(() => {
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
    setPeerName("");
    setError(null);
    // Clear room param from URL
    const url = new URL(window.location.href);
    url.searchParams.delete("room");
    window.history.replaceState({}, "", url.toString());
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (connRef.current) connRef.current.close();
      if (peerRef.current) peerRef.current.destroy();
    };
  }, []);

  return {
    status,
    roomId,
    isHost,
    myName,
    peerName,
    error,
    createRoom,
    joinRoom,
    disconnect,
    send,
    setOnMessage,
    MSG,
  };
}

export { MSG };
