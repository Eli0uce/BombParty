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

  // ── Index des rooms publiques ────────────────────────────────────────────
  if (settings.isPublic) {
    try {
      await ref(`publicRooms/${code}`).set({
        hostName: hostPlayer.name,
        maxLives: settings.maxLives,
        createdAt: firebase.database.ServerValue.TIMESTAMP,
      });
      console.log('[BombParty] publicRooms entry written for', code);
      // ⚠️ PAS de onDisconnect().remove() ici — Firebase peut le déclencher
      //    lors d'un reconnect initial, supprimant l'entrée immédiatement.
      //    La suppression se fait via updateRoomStatus() et cleanOldRooms().
    } catch (e) {
      // L'index public a échoué (règles Firebase ?) mais la room est créée
      console.warn('[BombParty] publicRooms write failed:', e.message,
        '→ vérifiez les règles Firebase (publicRooms doit avoir .write: true)');
    }
  }

  // Présence : marquer hors-ligne et retirer l'entrée si déconnecté
  ref(`rooms/${code}/players/${hostPlayer.id}/online`).onDisconnect().set(false);
  ref(`rooms/${code}/players/${hostPlayer.id}`).onDisconnect().remove();

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
  ref(`rooms/${code}/players/${player.id}`).onDisconnect().remove();

  return room;
}

async function leaveRoom(code, playerId, isHost) {
  if (isHost) {
    const snap = await ref(`rooms/${code}/players`).get();
    const players = snap.val() || {};
    const others = Object.entries(players).filter(([id]) => id !== playerId);
    if (others.length > 0) {
      const [newHostId, newHostData] = others[0];
      await ref(`rooms/${code}/meta/host`).set(newHostId);
      await ref(`rooms/${code}/meta/hostName`).set(newHostData.name);
      await ref(`rooms/${code}/players/${newHostId}/isHost`).set(true);
    } else {
      // Personne → supprimer la room et l'index public
      await ref(`publicRooms/${code}`).remove().catch(() => {});
      await ref(`rooms/${code}`).remove();
      return;
    }
  }
  await ref(`rooms/${code}/players/${playerId}`).remove();

  // Vérifier si la room est maintenant vide → la supprimer
  const remainSnap = await ref(`rooms/${code}/players`).get();
  const remain = remainSnap.val() || {};
  if (Object.keys(remain).length === 0) {
    await ref(`publicRooms/${code}`).remove().catch(() => {});
    await ref(`rooms/${code}`).remove();
  }
}

async function listPublicRooms() {
  console.log('[BombParty] listPublicRooms: lecture de publicRooms...');
  const indexSnap = await ref('publicRooms').get();

  if (!indexSnap.exists()) {
    console.log('[BombParty] publicRooms vide ou introuvable');
    return [];
  }

  console.log('[BombParty] publicRooms entries:', Object.keys(indexSnap.val()));

  const rooms = [];
  const checks = [];

  indexSnap.forEach(child => {
    const idx = child.val();
    checks.push(
      ref(`rooms/${child.key}/meta`).get().then(metaSnap => {
        if (!metaSnap.exists()) {
          // Room supprimée → nettoyer l'entrée orpheline
          console.log('[BombParty] room', child.key, '→ meta introuvable, nettoyage orphelin');
          ref(`publicRooms/${child.key}`).remove().catch(() => {});
          return;
        }
        const meta = metaSnap.val();
        console.log('[BombParty] room', child.key, '→ status:', meta.status);
        if (meta.status !== 'lobby') return;
        return ref(`rooms/${child.key}/players`).get().then(pSnap => {
          const playerCount = pSnap.exists() ? Object.keys(pSnap.val()).length : 0;
          if (playerCount === 0) {
            // Room vide → nettoyer
            ref(`publicRooms/${child.key}`).remove().catch(() => {});
            ref(`rooms/${child.key}`).remove().catch(() => {});
            return;
          }
          rooms.push({
            code:        child.key,
            hostName:    meta.hostName || idx.hostName,
            maxLives:    meta.maxLives || idx.maxLives,
            playerCount,
            createdAt:   meta.createdAt || idx.createdAt || 0,
          });
        });
      }).catch(e => console.warn('[BombParty] room check error', child.key, e.message))
    );
  });

  await Promise.all(checks);
  console.log('[BombParty] rooms found:', rooms.length);
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
  // Retirer de l'index public dès que la partie n'est plus en lobby
  if (status !== 'lobby') {
    ref(`publicRooms/${code}`).remove().catch(() => {});
  }
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
  // child_added : se déclenche une fois par message existant au démarrage,
  // puis une fois à chaque nouveau message — évite le problème d'interférence
  // entre le listener 'value' parent (watchRoom) et le listener 'value' enfant.
  const handler = snap => cb({ id: snap.key, ...snap.val() });
  r.on('child_added', handler);
  _activeListeners.push({ ref: r, event: 'child_added', handler });
  return () => r.off('child_added', handler);
}

function stopAllListeners() {
  _activeListeners.forEach(({ ref, event, handler }) => ref.off(event, handler));
  _activeListeners = [];
}

// ─── CLEANUP OLD ROOMS ───────────────────────────────────
async function cleanOldRooms() {
  try {
    const twoHoursAgo  = Date.now() - 2 * 60 * 60 * 1000;
    const thirtyMinAgo = Date.now() - 30 * 60 * 1000;

    const snap = await ref('rooms').get();
    const toDelete = [];

    if (snap.exists()) {
      snap.forEach(child => {
        const r = child.val();
        const createdAt  = r.meta?.createdAt || 0;
        const tooOld     = createdAt < twoHoursAgo;
        const noPlayers  = !r.players || Object.keys(r.players).length === 0;
        // Room abandonnée : tous les joueurs sont hors-ligne depuis >30 min
        const allOffline = r.players
          && Object.keys(r.players).length > 0
          && Object.values(r.players).every(p => !p.online)
          && createdAt < thirtyMinAgo;

        if (tooOld || noPlayers || allOffline) toDelete.push(child.key);
      });

      await Promise.all(toDelete.map(async k => {
        await ref(`publicRooms/${k}`).remove().catch(() => {});
        await ref(`rooms/${k}`).remove().catch(() => {});
      }));
    }

    // Nettoyer les entrées orphelines dans publicRooms
    // (room supprimée mais son entrée publicRooms reste)
    const pubSnap = await ref('publicRooms').get();
    if (pubSnap.exists()) {
      const orphans = [];
      pubSnap.forEach(child => {
        if (!snap.exists() || !snap.child(child.key).exists()) {
          orphans.push(child.key);
        }
      });
      await Promise.all(orphans.map(k => ref(`publicRooms/${k}`).remove().catch(() => {})));
      if (orphans.length) console.log('[BombParty] cleanOldRooms: orphelins supprimés:', orphans);
    }

    if (toDelete.length) console.log('[BombParty] cleanOldRooms: rooms supprimées:', toDelete);
  } catch (e) {
    console.warn('[BombParty] cleanOldRooms error:', e.message);
  }
}

