// ════════════════════════════════════════════════════════
//  NETWORK.JS — Couche Firebase pour BombParty
// ════════════════════════════════════════════════════════

let _db = null;
let _activeListeners = [];

// ─── INIT ────────────────────────────────────────────────
function initFirebase() {
  if (_db) return _db;
  try {
    firebase.initializeApp(FIREBASE_CONFIG);
    _db = firebase.database();
    return _db;
  } catch (e) {
    if (e.code === 'app/duplicate-app') {
      _db = firebase.database();
      return _db;
    }
    throw e;
  }
}

function db() {
  return _db || initFirebase();
}

// ─── UTILS ───────────────────────────────────────────────
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code + '-' + Math.floor(1000 + Math.random() * 9000);
}

function generatePlayerId() {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function ref(path) {
  return db().ref(path);
}

// ─── ROOM MANAGEMENT ─────────────────────────────────────
async function createRoom(hostPlayer, settings) {
  const code = generateRoomCode();
  const roomData = {
    meta: {
      host: hostPlayer.id,
      hostName: hostPlayer.name,
      status: 'lobby',
      maxLives: settings.maxLives,
      isPublic: settings.isPublic,
      createdAt: firebase.database.ServerValue.TIMESTAMP,
    },
    players: {
      [hostPlayer.id]: {
        ...hostPlayer,
        isHost: true,
        online: true,
        joinedAt: firebase.database.ServerValue.TIMESTAMP,
      }
    }
  };
  await ref(`rooms/${code}`).set(roomData);

  // Présence : supprimer le joueur si déconnecté
  const presenceRef = ref(`rooms/${code}/players/${hostPlayer.id}/online`);
  presenceRef.onDisconnect().set(false);

  return code;
}

async function joinRoom(code, player) {
  const snap = await ref(`rooms/${code}`).get();
  if (!snap.exists()) throw new Error('Room introuvable');
  const room = snap.val();
  if (room.meta.status !== 'lobby') throw new Error('Partie déjà en cours ou terminée');
  const playerCount = Object.keys(room.players || {}).length;
  if (playerCount >= 8) throw new Error('Room pleine (8 joueurs max)');

  await ref(`rooms/${code}/players/${player.id}`).set({
    ...player,
    isHost: false,
    online: true,
    joinedAt: firebase.database.ServerValue.TIMESTAMP,
  });

  ref(`rooms/${code}/players/${player.id}/online`).onDisconnect().set(false);

  return room;
}

async function leaveRoom(code, playerId, isHost) {
  if (isHost) {
    // L'hôte quitte → on cherche un autre joueur ou on ferme la room
    const snap = await ref(`rooms/${code}/players`).get();
    const players = snap.val() || {};
    const others = Object.entries(players).filter(([id]) => id !== playerId);
    if (others.length > 0) {
      const [newHostId, newHostData] = others[0];
      await ref(`rooms/${code}/meta/host`).set(newHostId);
      await ref(`rooms/${code}/meta/hostName`).set(newHostData.name);
      await ref(`rooms/${code}/players/${newHostId}/isHost`).set(true);
    } else {
      // Personne → supprimer la room
      await ref(`rooms/${code}`).remove();
      return;
    }
  }
  await ref(`rooms/${code}/players/${playerId}`).remove();
}

async function listPublicRooms() {
  // On récupère toutes les rooms et on filtre côté client
  // (orderByChild sur chemin imbriqué nécessite un index Firebase)
  const snap = await ref('rooms').get();
  if (!snap.exists()) return [];
  const rooms = [];
  snap.forEach(child => {
    const r = child.val();
    if (r.meta && r.meta.isPublic === true && r.meta.status === 'lobby') {
      rooms.push({
        code: child.key,
        hostName: r.meta.hostName,
        maxLives: r.meta.maxLives,
        playerCount: Object.keys(r.players || {}).length,
        createdAt: r.meta.createdAt || 0,
      });
    }
  });
  return rooms.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
}

// ─── GAME STATE (hôte seulement) ─────────────────────────
async function pushGameState(code, gameState) {
  const usedWordsObj = {};
  (gameState.usedWords instanceof Set ? [...gameState.usedWords] : gameState.usedWords)
    .forEach(w => { usedWordsObj[w] = true; });

  // Vies et statut de chaque joueur (inclus dans gameState pour éviter une lecture séparée)
  const playerLives = {};
  (gameState.players || []).forEach(p => {
    playerLives[p.id] = { lives: p.lives, alive: p.alive };
  });

  // Progression alphabet de chaque joueur (pour l'affichage côté clients)
  const playerLetterCounts = {};
  const playerLetterStrs   = {};
  if (gameState.playerLetters) {
    Object.entries(gameState.playerLetters).forEach(([pid, letSet]) => {
      const arr = [...(letSet instanceof Set ? letSet : new Set(letSet))];
      playerLetterCounts[pid] = arr.length;
      playerLetterStrs[pid]   = arr.sort().join('');
    });
  }

  await ref(`rooms/${code}/gameState`).set({
    currentPlayerIndex: gameState.currentPlayerIndex,
    currentSyllable:    gameState.currentSyllable,
    usedWords:          usedWordsObj,
    timeLeft:           gameState.timeLeft,
    totalTime:          gameState.totalTime || 8,
    phase:              gameState.phase,
    playerLives,
    playerLetterCounts,
    playerLetterStrs,
    lastUpdate: firebase.database.ServerValue.TIMESTAMP,
  });
}

async function updateRoomStatus(code, status) {
  await ref(`rooms/${code}/meta/status`).set(status);
}

async function updatePlayerState(code, playerId, data) {
  await ref(`rooms/${code}/players/${playerId}`).update(data);
}

// ─── SUBMIT WORD (client non-hôte) ───────────────────────
async function submitWord(code, playerId, word) {
  await ref(`rooms/${code}/pendingWord`).set({
    playerId,
    word,
    ts: firebase.database.ServerValue.TIMESTAMP,
  });
}

async function clearPendingWord(code) {
  await ref(`rooms/${code}/pendingWord`).remove();
}

// ─── CHAT ────────────────────────────────────────────────
async function sendChatMessage(code, author, avatar, text) {
  const msgRef = ref(`rooms/${code}/chat`).push();
  await msgRef.set({ author, avatar, text, ts: firebase.database.ServerValue.TIMESTAMP });
}

// ─── WATCHERS ────────────────────────────────────────────
function watchRoom(code, cb) {
  const r = ref(`rooms/${code}`);
  const handler = snap => cb(snap.val());
  r.on('value', handler);
  _activeListeners.push({ ref: r, event: 'value', handler });
  return () => r.off('value', handler);
}

function watchPlayers(code, cb) {
  const r = ref(`rooms/${code}/players`);
  const handler = snap => cb(snap.val() || {});
  r.on('value', handler);
  _activeListeners.push({ ref: r, event: 'value', handler });
  return () => r.off('value', handler);
}

function watchGameState(code, cb) {
  const r = ref(`rooms/${code}/gameState`);
  const handler = snap => cb(snap.val());
  r.on('value', handler);
  _activeListeners.push({ ref: r, event: 'value', handler });
  return () => r.off('value', handler);
}

function watchPendingWord(code, cb) {
  const r = ref(`rooms/${code}/pendingWord`);
  const handler = snap => cb(snap.val());
  r.on('value', handler);
  _activeListeners.push({ ref: r, event: 'value', handler });
  return () => r.off('value', handler);
}

function watchChat(code, cb) {
  const r = ref(`rooms/${code}/chat`);
  const handler = snap => {
    const msgs = [];
    snap.forEach(c => msgs.push({ id: c.key, ...c.val() }));
    cb(msgs);
  };
  r.on('value', handler);
  _activeListeners.push({ ref: r, event: 'value', handler });
  return () => r.off('value', handler);
}

function stopAllListeners() {
  _activeListeners.forEach(({ ref, event, handler }) => ref.off(event, handler));
  _activeListeners = [];
}

// ─── CLEANUP OLD ROOMS ───────────────────────────────────
async function cleanOldRooms() {
  try {
    const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
    const snap = await ref('rooms').get();
    if (!snap.exists()) return;
    const toDelete = [];
    snap.forEach(child => {
      const r = child.val();
      if (r.meta?.createdAt && r.meta.createdAt < twoHoursAgo) toDelete.push(child.key);
    });
    await Promise.all(toDelete.map(k => ref(`rooms/${k}`).remove()));
  } catch (_) {}
}

