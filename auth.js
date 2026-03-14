/* ════════════════════════════════════════════════════════
   AUTH.JS — Authentification Google & Discord pour BombParty

   ⚠️  NOTE SÉCURITÉ — Discord :
   L'auth Discord utilise email/password dérivé du Discord ID + pepper.
   Suffisant pour un classement de jeu, mais pas pour des données sensibles.
   Pour une sécurité renforcée, utilisez un backend (ex: Firebase Cloud Functions).
════════════════════════════════════════════════════════ */

let _currentUser   = null;   // { uid, displayName, photoURL, avatar, provider, stats, … }
const _authCbs     = [];     // callbacks onAuthStateChange
let _pendingDiscord = null;  // infos Discord temporaires avant création du profil Firebase

// ════════════════════════════════════════════════════════
//  INITIALISATION
// ════════════════════════════════════════════════════════
function initAuth(onStateChange) {
  if (typeof firebase === 'undefined' || !firebase.auth) return;
  if (onStateChange) _authCbs.push(onStateChange);

  firebase.auth().onAuthStateChanged(async firebaseUser => {
    if (firebaseUser) {
      try { _currentUser = await _loadOrCreateProfile(firebaseUser); }
      catch (e) { console.warn('[Auth] profil:', e.message); _currentUser = null; }
    } else {
      _currentUser = null;
    }
    _authCbs.forEach(cb => { try { cb(_currentUser); } catch (_) {} });
  });

  // Fallback : token Discord stocké après redirection sans popup
  const saved = sessionStorage.getItem('bp_discord_token');
  if (saved) {
    sessionStorage.removeItem('bp_discord_token');
    _firebaseSignInWithDiscordToken(saved)
      .catch(e => console.warn('[Auth] Discord fallback:', e.message));
  }
}

// ════════════════════════════════════════════════════════
//  MESSAGES D'ERREUR FIREBASE → LISIBLES
// ════════════════════════════════════════════════════════
function _friendlyAuthError(e) {
  switch (e.code) {
    case 'auth/unauthorized-domain':
      return '🔒 Domaine non autorisé.\n'
        + 'Dans la console Firebase → Authentication → Settings → Authorized domains,\n'
        + `ajoutez : ${window.location.hostname}`;
    case 'auth/popup-blocked':
      return '🚫 Popup bloquée. Autorisez les popups pour ce site.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return null; // annulé volontairement, pas d'erreur à afficher
    case 'auth/network-request-failed':
      return '📶 Erreur réseau. Vérifiez votre connexion.';
    case 'auth/too-many-requests':
      return '⏳ Trop de tentatives. Réessayez dans quelques minutes.';
    default:
      return e.message || 'Erreur d\'authentification.';
  }
}
async function authSignInGoogle() {
  const provider = new firebase.auth.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await firebase.auth().signInWithPopup(provider);
  } catch (e) {
    const msg = _friendlyAuthError(e);
    if (msg) throw new Error(msg);
    // si msg === null (annulé volontairement) → on ne throw pas
  }
}

// ════════════════════════════════════════════════════════
//  CONNEXION DISCORD
// ════════════════════════════════════════════════════════
function authSignInDiscord() {
  return new Promise((resolve, reject) => {
    const clientId = (typeof DISCORD_CLIENT_ID !== 'undefined') ? DISCORD_CLIENT_ID : '';
    if (!clientId) {
      return reject(new Error(
        'Discord non configuré.\n' +
        'Renseignez DISCORD_CLIENT_ID dans firebase-config.js\n' +
        'et ajoutez l\'URL de callback à vos Redirects Discord.'
      ));
    }

    const redirectUri = encodeURIComponent(
      (typeof DISCORD_REDIRECT_URI !== 'undefined')
        ? DISCORD_REDIRECT_URI
        : window.location.href.replace(/[^/]*$/, '') + 'callback.html'
    );
    const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=token&scope=identify`;

    const W = 520, H = 720;
    const left = Math.round(screen.width  / 2 - W / 2);
    const top  = Math.round(screen.height / 2 - H / 2);
    const popup = window.open(oauthUrl, 'discord-oauth',
      `width=${W},height=${H},left=${left},top=${top},resizable=yes,scrollbars=yes`);

    if (!popup || popup.closed) {
      return reject(new Error('Popup bloquée. Autorisez les popups pour ce site puis réessayez.'));
    }

    let resolved = false;
    const finish = (err, val) => {
      if (resolved) return;
      resolved = true;
      clearInterval(poll);
      window.removeEventListener('message', msgHandler);
      err ? reject(err) : resolve(val);
    };

    const msgHandler = async event => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type !== 'DISCORD_AUTH') return;
      const token = event.data.accessToken;
      if (!token) return finish(new Error('Authentification Discord annulée.'));
      try {
        await _firebaseSignInWithDiscordToken(token);
        finish(null);
      } catch (e) { finish(e); }
    };

    window.addEventListener('message', msgHandler);
    const poll = setInterval(() => {
      if (popup.closed && !resolved) finish(new Error('Fenêtre Discord fermée.'));
    }, 600);
  });
}

async function _firebaseSignInWithDiscordToken(accessToken) {
  // 1. Vérifier le token Discord et récupérer les infos utilisateur
  const res = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error('Profil Discord inaccessible. Le token est peut-être expiré.');
  const d = await res.json();

  // 2. Dériver des credentials Firebase stables à partir du Discord ID
  const pepper = (typeof DISCORD_AUTH_PEPPER !== 'undefined') ? DISCORD_AUTH_PEPPER : 'bp_salt_v1';
  const email  = `discord_${d.id}@bp.auth`;
  const pass   = `bp_d_${d.id}_${pepper}`;

  // 3. Stocker temporairement les infos Discord pour la création du profil
  _pendingDiscord = {
    displayName:     d.global_name || d.username,
    photoURL:        d.avatar
      ? `https://cdn.discordapp.com/avatars/${d.id}/${d.avatar}.png?size=128`
      : null,
    provider:        'discord',
    discordId:       d.id,
    discordUsername: d.username,
  };

  // 4. Connecter ou créer le compte Firebase
  try {
    await firebase.auth().signInWithEmailAndPassword(email, pass);
  } catch (e) {
    const notFound = ['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'];
    if (notFound.includes(e.code)) {
      await firebase.auth().createUserWithEmailAndPassword(email, pass);
    } else {
      _pendingDiscord = null;
      throw e;
    }
  }
}

// ════════════════════════════════════════════════════════
//  DÉCONNEXION
// ════════════════════════════════════════════════════════
async function authSignOut() {
  await firebase.auth().signOut();
}

// ════════════════════════════════════════════════════════
//  UTILISATEUR COURANT
// ════════════════════════════════════════════════════════
function authGetCurrentUser() {
  return _currentUser;
}

// ════════════════════════════════════════════════════════
//  PROFIL FIREBASE
// ════════════════════════════════════════════════════════
async function _loadOrCreateProfile(firebaseUser) {
  const uid = firebaseUser.uid;
  const ref  = firebase.database().ref(`userProfiles/${uid}`);
  const snap = await ref.get();
  let profile;

  if (snap.exists()) {
    profile = snap.val();
    // Mettre à jour avec les nouvelles infos Discord si reconnexion
    if (_pendingDiscord) {
      const upd = {
        displayName:     _pendingDiscord.displayName,
        discordId:       _pendingDiscord.discordId,
        discordUsername: _pendingDiscord.discordUsername,
      };
      if (_pendingDiscord.photoURL) upd.photoURL = _pendingDiscord.photoURL;
      await ref.update(upd);
      profile = { ...profile, ...upd };
      _pendingDiscord = null;
    }
  } else {
    // Première connexion → créer le profil
    const disc     = _pendingDiscord;
    const isGoogle = firebaseUser.providerData?.some(p => p.providerId === 'google.com');
    profile = {
      displayName:     disc?.displayName || firebaseUser.displayName || 'Joueur',
      photoURL:        disc?.photoURL    || firebaseUser.photoURL    || null,
      avatar:          '🎮',
      provider:        disc ? 'discord' : (isGoogle ? 'google' : 'email'),
      discordId:       disc?.discordId       || null,
      discordUsername: disc?.discordUsername || null,
      createdAt:       firebase.database.ServerValue.TIMESTAMP,
      stats:           { gamesPlayed: 0, gamesWon: 0, wordsFound: 0 },
    };
    await ref.set(profile);
    _pendingDiscord = null;
  }
  return { uid, ...profile };
}

// ════════════════════════════════════════════════════════
//  SAUVEGARDE D'UNE PARTIE
// ════════════════════════════════════════════════════════
async function authSaveGameResult({ won, position, wordsFound, playerCount }) {
  const user = _currentUser;
  if (!user) return;

  const statsRef = firebase.database().ref(`userProfiles/${user.uid}/stats`);
  const histRef  = firebase.database().ref(`userProfiles/${user.uid}/history`).push();

  const snap  = await statsRef.get();
  const stats = snap.val() || { gamesPlayed: 0, gamesWon: 0, wordsFound: 0 };
  stats.gamesPlayed = (stats.gamesPlayed || 0) + 1;
  if (won) stats.gamesWon = (stats.gamesWon || 0) + 1;
  stats.wordsFound  = (stats.wordsFound  || 0) + (wordsFound || 0);

  await statsRef.set(stats);

  await histRef.set({
    date:        firebase.database.ServerValue.TIMESTAMP,
    won:         !!won,
    position:    position    || 0,
    wordsFound:  wordsFound  || 0,
    playerCount: playerCount || 2,
  });

  // Mise à jour du classement public
  await firebase.database().ref(`leaderboard/${user.uid}`).set({
    displayName: String(user.displayName || 'Joueur').slice(0, 18),
    photoURL:    user.photoURL    || null,
    avatar:      user.avatar      || '🎮',
    provider:    user.provider    || 'email',
    gamesWon:    stats.gamesWon,
    gamesPlayed: stats.gamesPlayed,
    wordsFound:  stats.wordsFound,
    updatedAt:   firebase.database.ServerValue.TIMESTAMP,
  });

  // Mettre à jour les stats en mémoire + notifier les listeners
  _currentUser = { ..._currentUser, stats };
  _authCbs.forEach(cb => { try { cb(_currentUser); } catch (_) {} });
}

// ════════════════════════════════════════════════════════
//  CLASSEMENT
// ════════════════════════════════════════════════════════
async function authLoadLeaderboard(limit = 15) {
  const snap = await firebase.database()
    .ref('leaderboard')
    .orderByChild('gamesWon')
    .limitToLast(limit)
    .get();
  if (!snap.exists()) return [];
  const entries = [];
  snap.forEach(c => entries.push({ uid: c.key, ...c.val() }));
  return entries.sort((a, b) => (b.gamesWon - a.gamesWon) || (b.wordsFound - a.wordsFound));
}

// ════════════════════════════════════════════════════════
//  HISTORIQUE
// ════════════════════════════════════════════════════════
async function authLoadHistory(limit = 15) {
  const user = _currentUser;
  if (!user) return [];
  const snap = await firebase.database()
    .ref(`userProfiles/${user.uid}/history`)
    .orderByChild('date')
    .limitToLast(limit)
    .get();
  if (!snap.exists()) return [];
  const entries = [];
  snap.forEach(c => entries.push({ id: c.key, ...c.val() }));
  return entries.sort((a, b) => b.date - a.date);
}

