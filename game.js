/* ════════════════════════════════════════════════════════
   GAME.JS — BombParty (multijoueur réseau + local)
════════════════════════════════════════════════════════ */

// ─── CONFIG ──────────────────────────────────────────────
// Timer aléatoire par tour : entre TIMER_MIN et TIMER_MAX secondes
const TIMER_MIN  = 5;
const TIMER_MAX  = 15;
const AVATARS    = ['🐱','🐶','🦊','🐻','🐼','🦁','🐯','🐸','🐧','🦄','🤖','👻','💀','🎃','🦖','🐉'];
const RANK_EMOJIS = ['🥇','🥈','🥉','4️⃣','5️⃣','6️⃣','7️⃣','8️⃣'];
const ALPHABET   = 'abcdefghijklmnopqrstuvwxyz';

function pickRandomTime() {
  return Math.floor(Math.random() * (TIMER_MAX - TIMER_MIN + 1)) + TIMER_MIN;
}

// ─── STATE ───────────────────────────────────────────────
let me = {
  id: generatePlayerId(),
  name: 'Joueur',
  avatar: '🐱',
};

let session = {
  mode: 'local',       // 'local' | 'online'
  roomCode: null,
  isHost: false,
  unsubscribers: [],   // Firebase listeners cleanup
};

let state = {
  players: [],
  maxLives: 3,
  currentPlayerIndex: 0,
  currentSyllable: '',
  usedWords: new Set(),
  playerLetters: {},    // playerId → Set des lettres utilisées ce cycle
  timerInterval: null,
  clientTimerInterval: null, // timer local côté client (non-hôte)
  timeLeft: 8,
  totalTime: 8,
  phase: 'setup',
};

let firebaseOk = false;

// ─── DOM ─────────────────────────────────────────────────
const $ = id => document.getElementById(id);
const screens = ['menu','create','join','public','local','lobby','game','end'];

// Menu
const profileAvatarDisplay = $('profile-avatar-display');
const profileNameInput      = $('profile-name');
const avatarGrid            = $('avatar-grid');
const firebaseWarning       = $('firebase-warning');

// Create
const createLives      = $('create-lives');
const createPublic     = $('create-public');
const btnDoCreate      = $('btn-do-create');
const createError      = $('create-error');

// Join
const joinCodeInput = $('join-code-input');
const btnDoJoin     = $('btn-do-join');
const joinError     = $('join-error');

// Public rooms
const publicRoomsList  = $('public-rooms-list');
const btnRefreshRooms  = $('btn-refresh-rooms');

// Local
const localPlayersList    = $('local-players-list');
const localPlayerCount    = $('local-player-count-label');
const btnLocalAddPlayer   = $('btn-local-add-player');
const localLives          = $('local-lives');
const btnLocalStart       = $('btn-local-start');

// Lobby
const lobbyRoomCode     = $('lobby-room-code');
const btnCopyCode       = $('btn-copy-code');
const lobbyPlayerCount  = $('lobby-player-count');
const lobbyPlayersList  = $('lobby-players-list');
const lobbySettingsDisplay = $('lobby-settings-display');
const lobbyChatMessages = $('lobby-chat-messages');
const lobbyChatInput    = $('lobby-chat-input');
const btnLobbySendChat  = $('btn-lobby-send-chat');
const lobbyHostActions  = $('lobby-host-actions');
const lobbyMinPlayersHint = $('lobby-min-players-hint');
const btnLobbyStart     = $('btn-lobby-start');
const lobbyWaitingMsg   = $('lobby-waiting-msg');
const btnLobbyLeave     = $('btn-lobby-leave');

// Game
const currentSyllableEl = $('current-syllable');
const bombEl            = $('bomb');
const bombTimerEl       = $('bomb-timer');
const explosionEl       = $('explosion');
const wordInput         = $('word-input');
const btnValidate       = $('btn-validate');
const feedbackMsg       = $('feedback-msg');
const activePlayerName  = $('active-player-name');
const myTurnBadge       = $('my-turn-badge');
const inputWrapper      = $('input-wrapper');
const panelLeft         = $('panel-left');
const panelRight        = $('panel-right');
const panelMobile       = $('panel-mobile');
const btnQuit           = $('btn-quit');
const gameRoomCodeBadge = $('game-room-code-badge');
const btnGameChatToggle = $('btn-game-chat-toggle');
const gameChatOverlay   = $('game-chat-overlay');
const gameChatMessages  = $('game-chat-messages');
const gameChatInput     = $('game-chat-input');
const btnGameSendChat   = $('btn-game-send-chat');
const btnGameChatClose  = $('btn-game-chat-close');

// End
const winnerEmojiEl  = $('winner-emoji');
const winnerNameEl   = $('winner-name');
const scoreboardEl   = $('scoreboard');
const btnPlayAgain   = $('btn-play-again');
const btnBackMenu    = $('btn-back-menu');
const confettiContainer = $('confetti-container');

// Loading
const loadingOverlay = $('loading-overlay');
const loadingText    = $('loading-text');

// ─── UTILS ───────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function normalize(str) {
  return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '');
}
function generatePlayerId() {
  return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}
function showLoading(msg = 'Chargement…') {
  loadingText.textContent = msg;
  loadingOverlay.classList.remove('hidden');
}
function hideLoading() { loadingOverlay.classList.add('hidden'); }
function showError(elId, msg) {
  const el = $(elId);
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ─── SCREEN NAVIGATION ───────────────────────────────────
function showScreen(name) {
  screens.forEach(s => {
    const el = $(`screen-${s}`);
    if (el) el.classList.toggle('active', s === name);
  });
}

// ─── INIT ────────────────────────────────────────────────
function init() {
  // Vérifier Firebase
  try {
    initFirebase();
    firebaseOk = true;
  } catch (e) {
    firebaseOk = false;
    firebaseWarning.classList.remove('hidden');
    document.querySelectorAll('#btn-online-create, #btn-online-join, #btn-public-rooms').forEach(b => {
      b.disabled = true;
      b.title = 'Firebase non configuré';
    });
  }

  // Charger le profil sauvegardé
  const savedName   = localStorage.getItem('bp_name');
  const savedAvatar = localStorage.getItem('bp_avatar');
  if (savedName)   { me.name = savedName;     profileNameInput.value = savedName; }
  if (savedAvatar) { me.avatar = savedAvatar; profileAvatarDisplay.textContent = savedAvatar; }

  // Avatar picker
  AVATARS.forEach(av => {
    const el = document.createElement('div');
    el.className = 'avatar-option' + (av === me.avatar ? ' selected' : '');
    el.textContent = av;
    el.addEventListener('click', () => {
      me.avatar = av;
      profileAvatarDisplay.textContent = av;
      localStorage.setItem('bp_avatar', av);
      document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
      el.classList.add('selected');
      avatarGrid.classList.add('hidden');
    });
    avatarGrid.appendChild(el);
  });
  profileAvatarDisplay.addEventListener('click', () => avatarGrid.classList.toggle('hidden'));
  profileNameInput.addEventListener('input', () => {
    me.name = profileNameInput.value.trim() || 'Joueur';
    localStorage.setItem('bp_name', me.name);
  });

  // Boutons de navigation
  document.querySelectorAll('.btn-back').forEach(btn => {
    btn.addEventListener('click', () => showScreen(btn.dataset.target || 'menu'));
  });

  // Menu
  $('btn-online-create').addEventListener('click', () => showScreen('create'));
  $('btn-online-join').addEventListener('click',   () => showScreen('join'));
  $('btn-public-rooms').addEventListener('click',  () => { showScreen('public'); loadPublicRooms(); });
  $('btn-local-play').addEventListener('click',    () => { showScreen('local');  initLocalSetup(); });

  // Create
  btnDoCreate.addEventListener('click', handleCreate);

  // Join
  btnDoJoin.addEventListener('click', handleJoin);
  joinCodeInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleJoin(); });
  joinCodeInput.addEventListener('input', e => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  });

  // Public rooms
  btnRefreshRooms.addEventListener('click', loadPublicRooms);

  // Local
  btnLocalAddPlayer.addEventListener('click', () => addLocalPlayerRow());
  btnLocalStart.addEventListener('click', startLocalGame);

  // Lobby
  btnCopyCode.addEventListener('click', () => {
    navigator.clipboard?.writeText(session.roomCode);
    btnCopyCode.textContent = '✅';
    setTimeout(() => { btnCopyCode.textContent = '📋'; }, 1500);
  });
  btnLobbyStart.addEventListener('click', handleLobbyStart);
  btnLobbyLeave.addEventListener('click', handleLobbyLeave);
  btnLobbySendChat.addEventListener('click', sendLobbyChat);
  lobbyChatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendLobbyChat(); });

  // Game
  btnValidate.addEventListener('click', handleWordSubmit);
  wordInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleWordSubmit(); });
  btnQuit.addEventListener('click', handleQuitGame);
  btnGameChatToggle.addEventListener('click', () => gameChatOverlay.classList.toggle('hidden'));
  btnGameChatClose.addEventListener('click',  () => gameChatOverlay.classList.add('hidden'));
  btnGameSendChat.addEventListener('click', sendGameChat);
  gameChatInput.addEventListener('keydown', e => { if (e.key === 'Enter') sendGameChat(); });

  // End
  btnPlayAgain.addEventListener('click', handlePlayAgain);
  btnBackMenu.addEventListener('click',  () => { cleanupSession(); showScreen('menu'); });

  // Nettoyage des vieilles rooms
  if (firebaseOk) cleanOldRooms();

  showScreen('menu');
}

// ════════════════════════════════════════════════════════
//  MODE EN LIGNE — CRÉER
// ════════════════════════════════════════════════════════
async function handleCreate() {
  me.name = profileNameInput.value.trim() || 'Joueur';
  if (!firebaseOk) { showError('create-error', 'Firebase non configuré.'); return; }

  showLoading('Création de la partie…');
  try {
    const settings = {
      maxLives: parseInt(createLives.value),
      isPublic: createPublic.checked,
    };
    const code = await createRoom({ ...me }, settings);
    session.mode     = 'online';
    session.roomCode = code;
    session.isHost   = true;

    setupLobby(code, settings);
    showScreen('lobby');
    hideLoading();
    startLobbyListeners(code);
  } catch (e) {
    hideLoading();
    showError('create-error', e.message || 'Erreur lors de la création.');
  }
}

// ════════════════════════════════════════════════════════
//  MODE EN LIGNE — REJOINDRE
// ════════════════════════════════════════════════════════
async function handleJoin() {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code || code.length < 4) { showError('join-error', 'Code invalide.'); return; }
  if (!firebaseOk) { showError('join-error', 'Firebase non configuré.'); return; }

  me.name = profileNameInput.value.trim() || 'Joueur';
  showLoading('Connexion à la partie…');
  try {
    const room = await joinRoom(code, { ...me });
    session.mode     = 'online';
    session.roomCode = code;
    session.isHost   = false;

    setupLobby(code, room.meta);
    showScreen('lobby');
    hideLoading();
    startLobbyListeners(code);
  } catch (e) {
    hideLoading();
    showError('join-error', e.message || 'Impossible de rejoindre.');
  }
}

// ════════════════════════════════════════════════════════
//  PARTIES PUBLIQUES
// ════════════════════════════════════════════════════════
async function loadPublicRooms() {
  if (!firebaseOk) {
    showError('public-error', 'Firebase non configuré.');
    return;
  }
  publicRoomsList.innerHTML = '<div class="rooms-loading">⏳ Chargement…</div>';
  try {
    const rooms = await listPublicRooms();
    if (!rooms.length) {
      publicRoomsList.innerHTML = '<div class="rooms-empty">😴 Aucune partie publique disponible.<br>Créez-en une !</div>';
      return;
    }
    publicRoomsList.innerHTML = '';
    rooms.forEach(r => {
      const row = document.createElement('div');
      row.className = 'room-row';
      row.innerHTML = `
        <div class="room-row-info">
          <div class="room-row-host">👑 ${escapeHtml(r.hostName)}</div>
          <div class="room-row-meta">❤️×${r.maxLives} · Code : <strong>${escapeHtml(r.code)}</strong></div>
        </div>
        <div class="room-row-players">${r.playerCount}/8</div>
        <div class="room-row-join">
          <button class="btn btn-primary btn-sm">Rejoindre</button>
        </div>
      `;
      row.querySelector('button').addEventListener('click', async () => {
        me.name = profileNameInput.value.trim() || 'Joueur';
        showLoading('Connexion…');
        try {
          await joinRoom(r.code, { ...me });
          session.mode     = 'online';
          session.roomCode = r.code;
          session.isHost   = false;
          setupLobby(r.code, r);
          showScreen('lobby');
          hideLoading();
          startLobbyListeners(r.code);
        } catch (e) {
          hideLoading();
          showError('public-error', e.message || 'Erreur.');
        }
      });
      publicRoomsList.appendChild(row);
    });
  } catch (e) {
    publicRoomsList.innerHTML = '<div class="rooms-empty">❌ Erreur de chargement.</div>';
  }
}

// ════════════════════════════════════════════════════════
//  LOBBY
// ════════════════════════════════════════════════════════
function setupLobby(code, meta) {
  lobbyRoomCode.textContent = code;
  lobbySettingsDisplay.innerHTML = `
    <div class="lobby-settings-row"><span>Vies</span><span class="lobby-settings-val">${meta.maxLives} ❤️</span></div>
    <div class="lobby-settings-row"><span>Timer</span><span class="lobby-settings-val">⏱ ${TIMER_MIN}–${TIMER_MAX}s (aléatoire)</span></div>
    <div class="lobby-settings-row"><span>Visibilité</span><span class="lobby-settings-val">${meta.isPublic ? '🌍 Publique' : '🔒 Privée'}</span></div>
  `;

  if (session.isHost) {
    lobbyHostActions.classList.remove('hidden');
    lobbyWaitingMsg.classList.add('hidden');
  } else {
    lobbyHostActions.classList.add('hidden');
    lobbyWaitingMsg.classList.remove('hidden');
  }
}

function startLobbyListeners(code) {
  // Joueurs
  const unsubPlayers = watchPlayers(code, players => {
    renderLobbyPlayers(players, code);
  });

  // Chat
  const unsubChat = watchChat(code, msgs => renderChat(lobbyChatMessages, msgs));

  // État de la room (lancement de partie)
  const unsubRoom = watchRoom(code, room => {
    if (!room) {
      // Room supprimée (hôte parti)
      alert('La room a été fermée par l\'hôte.');
      cleanupSession();
      showScreen('menu');
      return;
    }
    if (room.meta?.status === 'playing' && state.phase !== 'playing') {
      // Lancement de la partie — tout le monde charge
      const players = Object.values(room.players || {}).map(p => ({
        id: p.id,
        name: p.name,
        avatar: p.avatar,
        lives: room.meta.maxLives,
        alive: true,
      }));
      state.players       = players;
      state.maxLives      = room.meta.maxLives;
      state.usedWords     = new Set();
      state.playerLetters = {};
      state.phase         = 'playing';
      // totalTime est tiré aléatoirement par hostNextTurn à chaque tour

      session.unsubscribers.push(unsubPlayers, unsubChat, unsubRoom);

      startOnlineGame(code);
    }
    if (room.meta?.status === 'gameover') {
      // déjà géré dans startOnlineGame
    }
  });

  session.unsubscribers = [unsubPlayers, unsubChat, unsubRoom];
}

function renderLobbyPlayers(playersObj, code) {
  const players = Object.values(playersObj || {}).sort((a, b) => a.joinedAt - b.joinedAt);
  lobbyPlayerCount.textContent = `(${players.length}/8)`;
  lobbyPlayersList.innerHTML = '';
  players.forEach(p => {
    const isHost = p.isHost;
    const isMe   = p.id === me.id;
    const row = document.createElement('div');
    row.className = 'lobby-player-row' + (isHost ? ' is-host' : '');
    row.innerHTML = `
      <span class="lobby-player-avatar">${escapeHtml(p.avatar)}</span>
      <span class="lobby-player-name">${escapeHtml(p.name)}</span>
      ${isHost ? '<span class="lobby-player-badge badge-host">Hôte</span>' : ''}
      ${isMe   ? '<span class="lobby-player-badge badge-you">Vous</span>'  : ''}
      <span class="lobby-player-online ${p.online ? '' : 'offline'}"></span>
    `;
    lobbyPlayersList.appendChild(row);
  });

  // Activer le bouton Lancer si ≥2 joueurs (hôte seulement)
  if (session.isHost) {
    const alive = players.filter(p => p.online !== false);
    const canStart = alive.length >= 2;
    btnLobbyStart.disabled = !canStart;
    lobbyMinPlayersHint.textContent = canStart
      ? `${alive.length} joueur(s) prêts — GO !`
      : 'Il faut au moins 2 joueurs connectés.';
  }
}

async function handleLobbyStart() {
  if (!session.isHost) return;
  const snap = await ref(`rooms/${session.roomCode}/players`).get();
  const players = Object.values(snap.val() || {});
  if (players.length < 2) return;

  await updateRoomStatus(session.roomCode, 'playing');
}

async function handleLobbyLeave() {
  showLoading('Déconnexion…');
  cleanupSession();
  showScreen('menu');
  hideLoading();
}

function sendLobbyChat() {
  const text = lobbyChatInput.value.trim();
  if (!text || !session.roomCode) return;
  sendChatMessage(session.roomCode, me.name, me.avatar, text);
  lobbyChatInput.value = '';
}
function sendGameChat() {
  const text = gameChatInput.value.trim();
  if (!text || !session.roomCode) return;
  sendChatMessage(session.roomCode, me.name, me.avatar, text);
  gameChatInput.value = '';
}

function renderChat(container, msgs) {
  container.innerHTML = '';
  msgs.slice(-50).forEach(msg => {
    const div = document.createElement('div');
    div.className = 'chat-message';
    div.innerHTML = `<span class="chat-message-author">${escapeHtml(msg.avatar)} ${escapeHtml(msg.author)}</span><span class="chat-message-text">${escapeHtml(msg.text)}</span>`;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

function addChatSystem(container, text) {
  const div = document.createElement('div');
  div.className = 'chat-message system';
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ════════════════════════════════════════════════════════
//  MODE EN LIGNE — JEU
// ════════════════════════════════════════════════════════
function startOnlineGame(code) {
  session.mode     = 'online';
  session.roomCode = code;

  gameRoomCodeBadge.textContent = code;
  gameRoomCodeBadge.classList.remove('hidden');
  btnGameChatToggle.classList.remove('hidden');

  buildPlayersUI();
  showScreen('game');

  if (session.isHost) {
    // L'hôte orchestre le jeu
    hostNextTurn();

    // Écoute les mots soumis par les clients
    const unsubWord = watchPendingWord(code, pending => {
      if (!pending) return;
      if (state.phase !== 'playing') return;
      const cp = state.players[state.currentPlayerIndex];
      if (!cp || pending.playerId !== cp.id) return;
      clearPendingWord(code);
      processWord(pending.word);
    });
    session.unsubscribers.push(unsubWord);
  } else {
    // Les clients observent l'état du jeu
    const unsubGS = watchGameState(code, gs => {
      if (!gs) return;
      applyRemoteGameState(gs);
    });
    const unsubChat2 = watchChat(code, msgs => renderChat(gameChatMessages, msgs));
    session.unsubscribers.push(unsubGS, unsubChat2);
  }
}

function applyRemoteGameState(gs) {
  if (!gs) return;

  const prevPlayerIndex = state.currentPlayerIndex;
  const prevPhase       = state.phase;

  state.currentPlayerIndex = gs.currentPlayerIndex;
  state.currentSyllable    = gs.currentSyllable;
  state.usedWords          = new Set(Object.keys(gs.usedWords || {}));
  state.timeLeft           = gs.timeLeft;
  state.totalTime          = gs.totalTime || state.totalTime;
  state.phase              = gs.phase;

  // ── Vies directement depuis gameState (plus de lecture Firebase séparée) ──
  if (gs.playerLives) {
    state.players.forEach(p => {
      const d = gs.playerLives[p.id];
      if (d) { p.lives = d.lives ?? p.lives; p.alive = d.alive ?? p.alive; }
    });
  }

  // ── Progression alphabet pour affichage ──────────────────────────────────
  if (gs.playerLetterCounts || gs.playerLetterStrs) {
    state.players.forEach(p => {
      p._letterCount = (gs.playerLetterCounts || {})[p.id] || 0;
      p._usedLetters = (gs.playerLetterStrs   || {})[p.id] || '';
    });
  }

  if (gs.phase === 'gameover') {
    clearInterval(state.clientTimerInterval);
    endGame();
    return;
  }

  // ── Nouveau tour détecté → démarrer le timer local client ────────────────
  const isNewTurn = prevPhase !== 'playing' || prevPlayerIndex !== gs.currentPlayerIndex;
  if (gs.phase === 'playing') {
    if (isNewTurn) {
      clearInterval(state.clientTimerInterval);
      state.clientTimerInterval = setInterval(() => {
        state.timeLeft = Math.max(0, state.timeLeft - 1);
        updateTimerDisplay();
      }, 1000);

      currentSyllableEl.textContent = gs.currentSyllable.toUpperCase();
      currentSyllableEl.classList.remove('new-syllable');
      void currentSyllableEl.offsetWidth;
      currentSyllableEl.classList.add('new-syllable');
      bombEl.classList.remove('ticking-fast');
      bombTimerEl.className = 'bomb-timer';
      wordInput.value = '';
      feedbackMsg.textContent = '';
      feedbackMsg.className   = 'feedback-msg';
      inputWrapper.classList.remove('error', 'success');
      explosionEl.classList.add('hidden');
    }
  }

  updateTimerDisplay();

  const cp = state.players[state.currentPlayerIndex];
  if (cp) {
    activePlayerName.textContent = `${cp.avatar} ${cp.name}`;
    const isMyTurn = cp.id === me.id;
    myTurnBadge.classList.toggle('hidden', !isMyTurn);
    wordInput.disabled   = !isMyTurn;
    btnValidate.disabled = !isMyTurn;
    if (isMyTurn && isNewTurn) wordInput.focus();
  }

  refreshPlayersUI();
}

// ─── HOST : logique de tour ───────────────────────────────
function hostNextTurn() {
  clearInterval(state.timerInterval);

  const alive = state.players.filter(p => p.alive);
  if (alive.length <= 1) {
    endGame();
    return;
  }

  do {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
  } while (!state.players[state.currentPlayerIndex].alive);

  state.currentSyllable = pickSyllable();
  state.totalTime       = pickRandomTime();   // ← timer aléatoire
  state.timeLeft        = state.totalTime;
  state.phase           = 'playing';

  syncStateToFirebase();   // une seule écriture Firebase au début du tour
  applyLocalGameState();

  state.timerInterval = setInterval(() => {
    state.timeLeft -= 1;
    updateTimerDisplay();
    if (state.timeLeft <= 0) hostBombExplode();
  }, 1000);

  if (session.mode === 'local') wordInput.focus();
}

function applyLocalGameState() {
  const cp = state.players[state.currentPlayerIndex];

  currentSyllableEl.textContent = state.currentSyllable.toUpperCase();
  currentSyllableEl.classList.remove('new-syllable');
  void currentSyllableEl.offsetWidth;
  currentSyllableEl.classList.add('new-syllable');

  activePlayerName.textContent = `${cp.avatar} ${cp.name}`;

  const isMyTurn = session.mode === 'local' || cp.id === me.id;
  myTurnBadge.classList.toggle('hidden', !isMyTurn || session.mode === 'local');
  wordInput.disabled  = !isMyTurn;
  btnValidate.disabled = !isMyTurn;

  feedbackMsg.textContent = '';
  feedbackMsg.className = 'feedback-msg';
  wordInput.value = '';
  inputWrapper.classList.remove('error','success');

  explosionEl.classList.add('hidden');
  bombEl.classList.remove('ticking-fast');
  bombTimerEl.className = 'bomb-timer';

  refreshPlayersUI();
}

function syncStateToFirebase() {
  if (session.mode !== 'online' || !session.isHost) return;
  // playerLives et playerLetterCounts sont inclus dans pushGameState
  pushGameState(session.roomCode, state).catch(() => {});
}

function syncTimerToFirebase() {
  // Gardé pour compatibilité mais non appelé — le timer est géré localement
}

function hostBombExplode() {
  clearInterval(state.timerInterval);
  bombEl.classList.remove('ticking-fast');
  triggerExplosionAnim();

  if (navigator.vibrate) navigator.vibrate([100, 50, 200]);

  const cp = state.players[state.currentPlayerIndex];
  cp.lives -= 1;
  if (cp.lives <= 0) { cp.lives = 0; cp.alive = false; }

  showFeedback(`💥 ${cp.name} perd une vie !`, 'info');
  syncStateToFirebase();
  refreshPlayersUI();

  if (session.mode === 'online') {
    sendChatMessage(session.roomCode, '🎮 Système', '💣', `💥 ${cp.name} a explosé !`).catch(() => {});
  }

  setTimeout(() => {
    explosionEl.classList.add('hidden');
    const alive = state.players.filter(p => p.alive);
    if (alive.length <= 1) { endGame(); return; }
    hostNextTurn();
  }, 1000);
}

function triggerExplosionAnim() {
  explosionEl.classList.remove('hidden');
  explosionEl.style.animation = 'none';
  void explosionEl.offsetWidth;
  explosionEl.style.animation = '';
}

// ─── DICTIONNAIRE ÉTENDU (hbenbel/French-Dictionary) ────
// WORDS_SET  : Set de 116 000+ mots français — lookup O(1), défini dans words.js
// WORDS      : tableau réduit pour la sélection des syllabes (itération rapide)

const _wordCache    = new Map(); // mot normalisé → true/false
let   _isValidating = false;

/**
 * Vérifie si un mot est valide en français :
 *  1. Cache session (instantané)
 *  2. WORDS_SET — dictionnaire complet 116k mots (instantané, O(1))
 *  3. API Wiktionnaire FR (fallback réseau pour néologismes / mots rares)
 */
async function isValidWord(word) {
  if (_wordCache.has(word)) return _wordCache.get(word);

  // ── Dictionnaire complet embarqué ────────────────────
  if (typeof WORDS_SET !== 'undefined' && WORDS_SET.has(word)) {
    _wordCache.set(word, true);
    return true;
  }

  // ── Fallback : petit tableau WORDS ───────────────────
  if (WORDS.some(w => normalize(w) === word)) {
    _wordCache.set(word, true);
    return true;
  }

  // ── Fallback réseau : API Wiktionnaire FR ─────────────
  try {
    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(
      `https://fr.wiktionary.org/api/rest_v1/page/summary/${encodeURIComponent(word)}`,
      { signal: controller.signal }
    );
    clearTimeout(tid);
    const valid = res.ok;
    _wordCache.set(word, valid);
    return valid;
  } catch {
    // Réseau KO → on accepte (ne pas pénaliser pour une coupure)
    _wordCache.set(word, true);
    return true;
  }
}

// ─── VALIDATION MOT ──────────────────────────────────────
function handleWordSubmit() {
  const raw = wordInput.value.trim();
  if (!raw || _isValidating) return;

  if (session.mode === 'online' && !session.isHost) {
    // Client → envoie le mot à Firebase, l'hôte valide
    const cp = state.players[state.currentPlayerIndex];
    if (!cp || cp.id !== me.id) return;
    submitWord(session.roomCode, me.id, raw).catch(() => {});
    wordInput.value = '';
    return;
  }

  // Local ou hôte : valider directement
  processWord(raw);
}

async function processWord(raw) {
  if (_isValidating) return;
  const word     = normalize(raw);
  const syllable = normalize(state.currentSyllable);

  if (!word.includes(syllable)) {
    showWordError(`❌ "${raw}" ne contient pas "${state.currentSyllable.toUpperCase()}"`);
    return;
  }
  if (state.usedWords.has(word)) {
    showWordError(`🔁 "${raw}" a déjà été utilisé !`);
    return;
  }

  // ── Vérification (potentiellement réseau) ────────────
  _isValidating       = true;
  wordInput.disabled  = true;
  btnValidate.disabled = true;
  showFeedback('🔍 Vérification…', 'checking');

  const valid = await isValidWord(word);

  _isValidating        = false;
  wordInput.disabled   = false;
  btnValidate.disabled = false;

  if (!valid) {
    showWordError(`📖 "${raw}" n'est pas dans le dictionnaire`);
    wordInput.select();
    return;
  }

  // ✅ Valide
  const cp = state.players[state.currentPlayerIndex];
  state.usedWords.add(word);
  clearInterval(state.timerInterval);
  wordInput.value = '';

  // ── Suivi alphabet ────────────────────────────────────
  if (!state.playerLetters[cp.id]) state.playerLetters[cp.id] = new Set();
  for (const ch of word) {
    if (ch >= 'a' && ch <= 'z') state.playerLetters[cp.id].add(ch);
  }
  const letCount = state.playerLetters[cp.id].size;

  // ── Bonus A→Z : toutes les 26 lettres → +1 vie ───────
  if (letCount >= 26) {
    state.playerLetters[cp.id] = new Set(); // réinitialise le cycle
    if (cp.lives < state.maxLives) {
      cp.lives = Math.min(cp.lives + 1, state.maxLives);
      showSuccess(`✅ "${raw}" 🎉 A→Z complet ! +1 vie pour ${cp.name} !`);
      showAlphabetBonus(cp);
      if (session.mode === 'online') {
        sendChatMessage(session.roomCode, '🎮 Système', '🔤',
          `🎉 ${cp.name} a utilisé les 26 lettres et gagne une vie !`).catch(() => {});
      }
    } else {
      showSuccess(`✅ "${raw}" 🔤 A→Z complet ! (vies au maximum)`);
      showAlphabetBonus(cp);
    }
    syncStateToFirebase(); // sync immédiate pour que les clients voient le bonus
  } else {
    showSuccess(`✅ "${raw}" · 🔤 ${letCount}/26`);
  }

  if (session.mode === 'online') {
    sendChatMessage(session.roomCode, '🎮 Système', '💬',
      `✅ ${cp.name} : "${raw}"`).catch(() => {});
  }

  refreshPlayersUI();
  setTimeout(() => { hostNextTurn(); }, 600);
}

function showWordError(msg) {
  feedbackMsg.textContent = msg;
  feedbackMsg.className = 'feedback-msg error';
  inputWrapper.classList.remove('error','success');
  void inputWrapper.offsetWidth;
  inputWrapper.classList.add('error');
  setTimeout(() => inputWrapper.classList.remove('error'), 500);
  wordInput.select();
}
function showSuccess(msg) {
  feedbackMsg.textContent = msg;
  feedbackMsg.className = 'feedback-msg success';
  inputWrapper.classList.add('success');
}
function showFeedback(msg, type) {
  feedbackMsg.textContent = msg;
  feedbackMsg.className = `feedback-msg ${type}`;
}

// ─── BONUS ALPHABET ──────────────────────────────────────
function showAlphabetBonus(player) {
  // Cherche toutes les cartes de ce joueur et joue l'animation
  document.querySelectorAll(`[data-player-id="${player.id}"]`).forEach(card => {
    card.classList.remove('alphabet-bonus');
    void card.offsetWidth;
    card.classList.add('alphabet-bonus');
    setTimeout(() => card.classList.remove('alphabet-bonus'), 1500);
  });
  // Confetti léger
  const colors = ['#ffcc00','#39ff14','#00d4ff','#ff073a'];
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    p.style.cssText = `left:${20+Math.random()*60}%;background:${color};width:8px;height:8px;animation-duration:1.5s;animation-delay:${Math.random()*0.3}s;border-radius:50%;`;
    confettiContainer.appendChild(p);
    setTimeout(() => p.remove(), 2000);
  }
}

// ─── TIMER DISPLAY ───────────────────────────────────────
function updateTimerDisplay() {
  bombTimerEl.textContent = state.timeLeft;
  const ratio = state.timeLeft / state.totalTime;
  bombTimerEl.className = 'bomb-timer';
  if (ratio <= 0.25)     { bombTimerEl.classList.add('danger'); bombEl.classList.add('ticking-fast'); }
  else if (ratio <= 0.5) { bombTimerEl.classList.add('warning'); }
  else bombEl.classList.remove('ticking-fast');
}

// ─── SYLLABE ─────────────────────────────────────────────
function pickSyllable() {
  const used = state.usedWords;
  const valid = SYLLABLES.filter(syl => {
    const sylN = normalize(syl);
    return WORDS.some(w => normalize(w).includes(sylN) && !used.has(normalize(w)));
  });
  const pool = valid.length > 0 ? valid : SYLLABLES;
  let pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick === state.currentSyllable && pool.length > 1) pick = pickSyllable();
  return pick;
}

// ════════════════════════════════════════════════════════
//  PLAYERS UI
// ════════════════════════════════════════════════════════
function buildPlayersUI() {
  panelLeft.innerHTML  = '';
  panelRight.innerHTML = '';
  panelMobile.innerHTML = '';
  const half = Math.ceil(state.players.length / 2);
  state.players.forEach((p, i) => {
    const left  = createPlayerCard(p);
    const right = createPlayerCard(p);
    const mob   = createPlayerCard(p);
    if (i < half) panelLeft.appendChild(left);
    else panelRight.appendChild(right);
    panelMobile.appendChild(mob);
  });
}

function createPlayerCard(player) {
  const card = document.createElement('div');
  const isMe = session.mode === 'online' && player.id === me.id;
  card.className = 'player-card' + (player.alive ? '' : ' eliminated');
  card.id = `player-card-${player.id}-${Math.random().toString(36).slice(2,6)}`;
  card.dataset.playerId = player.id;

  const hearts = Array.from({ length: state.maxLives }, (_, i) =>
    `<span class="heart ${i >= player.lives ? 'lost' : ''}">❤️</span>`
  ).join('');

  // Progression alphabet
  const letCount = session.isHost
    ? (state.playerLetters[player.id]?.size || 0)
    : (player._letterCount || 0);
  const letPct = Math.round((letCount / 26) * 100);

  card.innerHTML = `
    <div class="player-card-header">
      <span class="player-card-avatar">${escapeHtml(player.avatar)}</span>
      <span class="player-card-name">${escapeHtml(player.name)}</span>
      ${isMe ? '<span class="player-card-you">VOUS</span>' : ''}
    </div>
    <div class="player-lives">${hearts}</div>
    <div class="alphabet-track" title="${letCount}/26 lettres utilisées">
      <div class="alphabet-track-fill" style="width:${letPct}%"></div>
      <span class="alphabet-track-label">🔤 ${letCount}/26</span>
    </div>
  `;
  return card;
}

function refreshPlayersUI() {
  const cp = state.players[state.currentPlayerIndex];
  document.querySelectorAll('[data-player-id]').forEach(card => {
    const pid = card.dataset.playerId;
    const p   = state.players.find(pl => pl.id === pid);
    if (!p) return;

    const isActive = cp && p.id === cp.id && p.alive;
    card.className = 'player-card' + (!p.alive ? ' eliminated' : '') + (isActive ? ' active' : '');

    // Badge actif
    card.querySelectorAll('.active-badge').forEach(b => b.remove());
    if (isActive) {
      const badge = document.createElement('div');
      badge.className = 'active-badge';
      badge.textContent = '▶ Tour';
      card.appendChild(badge);
    }

    // Cœurs
    const heartsEl = card.querySelector('.player-lives');
    if (heartsEl) {
      heartsEl.innerHTML = Array.from({ length: state.maxLives }, (_, i) =>
        `<span class="heart ${i >= p.lives ? 'lost' : ''}">❤️</span>`
      ).join('');
    }

    // Progression alphabet
    const trackFill  = card.querySelector('.alphabet-track-fill');
    const trackLabel = card.querySelector('.alphabet-track-label');
    if (trackFill && trackLabel) {
      const letCount = session.isHost
        ? (state.playerLetters[p.id]?.size || 0)
        : (p._letterCount || 0);
      const letPct = Math.round((letCount / 26) * 100);
      trackFill.style.width = letPct + '%';
      trackLabel.textContent = `🔤 ${letCount}/26`;
    }
  });
}

// ════════════════════════════════════════════════════════
//  MODE LOCAL
// ════════════════════════════════════════════════════════
const LOCAL_DEFAULT_NAMES = ['Alice','Bob','Charlie','Diana','Evan','Fiona','Gabriel','Hana'];

function initLocalSetup() {
  localPlayersList.innerHTML = '';
  addLocalPlayerRow('Alice', 0);
  addLocalPlayerRow('Bob', 1);
  updateLocalPlayerCount();
}

function addLocalPlayerRow(name = '', idx = null) {
  const count = localPlayersList.children.length;
  if (count >= 8) return;
  const avatar  = AVATARS[count % AVATARS.length];
  const pName   = name || LOCAL_DEFAULT_NAMES[count] || `Joueur ${count + 1}`;
  const row = document.createElement('div');
  row.className = 'player-row';
  row.innerHTML = `
    <span class="player-avatar">${avatar}</span>
    <input class="player-name-input" type="text" value="${escapeHtml(pName)}" placeholder="Nom" maxlength="18" />
    <button class="btn-remove-player" title="Supprimer">✕</button>
  `;
  row.querySelector('.btn-remove-player').addEventListener('click', () => {
    if (localPlayersList.children.length > 2) { row.remove(); updateLocalPlayerCount(); }
  });
  localPlayersList.appendChild(row);
  updateLocalPlayerCount();
}

function updateLocalPlayerCount() {
  const c = localPlayersList.children.length;
  localPlayerCount.textContent = `(${c})`;
  btnLocalAddPlayer.disabled = c >= 8;
  btnLocalAddPlayer.style.opacity = c >= 8 ? '0.4' : '1';
}

function startLocalGame() {
  const rows = localPlayersList.querySelectorAll('.player-row');
  state.players = Array.from(rows).map((row, i) => ({
    id: `local_${i}`,
    name: row.querySelector('.player-name-input').value.trim() || `Joueur ${i+1}`,
    avatar: row.querySelector('.player-avatar').textContent,
    lives: parseInt(localLives.value),
    alive: true,
  }));
  state.maxLives           = parseInt(localLives.value);
  state.totalTime          = pickRandomTime(); // sera redéfini à chaque tour
  state.timeLeft           = state.totalTime;
  state.usedWords          = new Set();
  state.playerLetters      = {};
  state.currentPlayerIndex = -1;
  state.phase              = 'playing';

  session.mode     = 'local';
  session.isHost   = true;
  session.roomCode = null;

  gameRoomCodeBadge.classList.add('hidden');
  btnGameChatToggle.classList.add('hidden');
  myTurnBadge.classList.add('hidden');

  buildPlayersUI();
  showScreen('game');
  hostNextTurn();
}

// ════════════════════════════════════════════════════════
//  FIN DE PARTIE
// ════════════════════════════════════════════════════════
function endGame() {
  clearInterval(state.timerInterval);
  clearInterval(state.clientTimerInterval);
  state.phase = 'gameover';

  if (session.mode === 'online' && session.isHost) {
    updateRoomStatus(session.roomCode, 'gameover').catch(() => {});
    pushGameState(session.roomCode, state).catch(() => {});
  }

  const alive  = state.players.filter(p => p.alive);
  const winner = alive.length === 1
    ? alive[0]
    : state.players.reduce((a, b) => a.lives >= b.lives ? a : b);

  winnerEmojiEl.textContent = winner.avatar;
  winnerNameEl.textContent  = winner.name;

  const sorted = [...state.players].sort((a, b) => {
    if (a.id === winner.id) return -1;
    if (b.id === winner.id) return 1;
    return b.lives - a.lives;
  });
  scoreboardEl.innerHTML = sorted.map((p, i) => {
    const hearts = Array.from({ length: state.maxLives }, (_, j) =>
      `<span class="heart ${j >= p.lives ? 'lost' : ''}">❤️</span>`
    ).join('');
    return `<div class="score-row">
      <span class="score-rank">${RANK_EMOJIS[i]}</span>
      <span class="score-avatar">${escapeHtml(p.avatar)}</span>
      <span class="score-name">${escapeHtml(p.name)}</span>
      <span class="score-lives">${hearts}</span>
    </div>`;
  }).join('');

  launchConfetti();
  showScreen('end');
}

async function handlePlayAgain() {
  if (session.mode === 'online') {
    if (session.isHost) {
      // Réinitialise la room → retour au lobby
      await updateRoomStatus(session.roomCode, 'lobby').catch(() => {});
      await ref(`rooms/${session.roomCode}/gameState`).remove().catch(() => {});
      state.phase = 'setup';
      setupLobby(session.roomCode, {
        difficulty: state.difficulty,
        maxLives: state.maxLives,
        isPublic: true,
      });
      showScreen('lobby');
      startLobbyListeners(session.roomCode);
    } else {
      // Non-hôte : retour au lobby et attend
      state.phase = 'setup';
      showScreen('lobby');
    }
  } else {
    // Local : relancer directement
    state.players.forEach(p => { p.lives = state.maxLives; p.alive = true; });
    state.currentPlayerIndex = -1;
    state.usedWords     = new Set();
    state.playerLetters = {};
    state.phase         = 'playing';
    buildPlayersUI();
    showScreen('game');
    hostNextTurn();
  }
}

// ─── QUIT ────────────────────────────────────────────────
async function handleQuitGame() {
  clearInterval(state.timerInterval);
  cleanupSession();
  showScreen('menu');
}

function cleanupSession() {
  clearInterval(state.timerInterval);
  clearInterval(state.clientTimerInterval);
  stopAllListeners();
  session.unsubscribers.forEach(fn => { try { fn(); } catch (_) {} });
  session.unsubscribers = [];
  if (session.roomCode) {
    leaveRoom(session.roomCode, me.id, session.isHost).catch(() => {});
    session.roomCode = null;
  }
  state.phase = 'setup';
  gameChatOverlay.classList.add('hidden');
}

// ─── CONFETTI ────────────────────────────────────────────
function launchConfetti() {
  confettiContainer.innerHTML = '';
  const colors = ['#e94560','#f5a623','#39ff14','#00d4ff','#ff073a','#ffffff','#ffcc00','#cc00ff'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    const color = colors[Math.floor(Math.random() * colors.length)];
    const left  = Math.random() * 100;
    const delay = Math.random() * 2;
    const dur   = 2.5 + Math.random() * 2;
    const size  = 6 + Math.random() * 10;
    piece.style.cssText = `left:${left}%;background:${color};width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;border-radius:${Math.random()>.5?'50%':'2px'};`;
    confettiContainer.appendChild(piece);
  }
}

// ─── START ───────────────────────────────────────────────
init();
