// ════════════════════════════════════════════════════════
//  FIREBASE CONFIG — BombParty
//  ⚠️  Remplacez ces valeurs par celles de votre projet Firebase !
//  Guide : https://console.firebase.google.com
//    1. Créer un projet → Ajouter une app Web
//    2. Copier le firebaseConfig ci-dessous
//    3. Activer "Realtime Database" en mode test (règles ouvertes)
// ════════════════════════════════════════════════════════

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAMINDkINvZezyYosZXnob91a17sI4vkqA",
  authDomain: "bombparty-22300.firebaseapp.com",
  databaseURL: "https://bombparty-22300-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bombparty-22300",
  storageBucket: "bombparty-22300.firebasestorage.app",
  messagingSenderId: "881480247345",
  appId: "1:881480247345:web:d56e1551ed35d651068d10",
  measurementId: "G-6KCF61CVSH"
};

// ─── DISCORD OAUTH (optionnel) ────────────────────────────────────────────────
// Pour activer la connexion Discord :
//   1. Créez une app sur https://discord.com/developers/applications
//   2. Onglet "OAuth2" → "Redirects" : ajoutez  https://VOTRE_SITE/callback.html
//      (ex: https://eli0uce.github.io/BombParty/callback.html)
//   3. Copiez le "Client ID" (PAS le secret — ne jamais mettre le secret côté client !)
const DISCORD_CLIENT_ID = '';   // ← Votre Client ID Discord (ex: '1234567890123456789')

// URL de redirection — doit correspondre EXACTEMENT à ce qui est renseigné dans Discord
const DISCORD_REDIRECT_URI = window.location.href.replace(/[^/]*(\?.*)?$/, '') + 'callback.html';

// Sel de dérivation du mot de passe Firebase pour les comptes Discord
// ⚠️  NE JAMAIS CHANGER après le premier déploiement (les comptes existants seraient perdus)
// ⚠️  Ce sel est visible dans le code source — n'utilisez pas ce système pour des données sensibles
const DISCORD_AUTH_PEPPER = 'bombparty_salt_v1_2024';

// ─── RÈGLES FIREBASE RTDB recommandées (à coller dans la console) ─────────────
/*
{
  "rules": {
    "rooms":      { "$c": { ".read": true, ".write": true } },
    "publicRooms":{ ".read": true, ".write": true },
    "userProfiles":{
      ".read": true,
      "$uid": { ".write": "auth !== null && auth.uid === $uid" }
    },
    "leaderboard": {
      ".read": true,
      ".indexOn": ["gamesWon"],
      "$uid": { ".write": "auth !== null && auth.uid === $uid" }
    }
  }
}
*/
