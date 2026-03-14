# 💣 BombParty — Multijoueur en ligne

Un jeu de mots multijoueur **en ligne et en local**, inspiré de BombParty. Hébergeable gratuitement sur GitHub Pages, propulsé par Firebase Realtime Database.

![version](https://img.shields.io/badge/version-2.0.0-blue) ![license](https://img.shields.io/badge/license-MIT-green)

## 🎮 Modes de jeu

| Mode | Description |
|---|---|
| 🚀 **Créer une partie** | Créez une room, obtenez un code, invitez vos amis |
| 🔑 **Rejoindre avec un code** | Entrez le code reçu par un ami |
| 🌍 **Parties publiques** | Rejoignez une partie ouverte à tous |
| 🎮 **Jeu local** | Plusieurs joueurs sur le même écran |

## 🚀 Configuration Firebase (multijoueur en ligne)

> Sans cette étape, seul le **jeu local** sera disponible.

### 1. Créer un projet Firebase
1. Allez sur [console.firebase.google.com](https://console.firebase.google.com)
2. **Créer un projet** → donnez-lui un nom
3. Dans **Build → Realtime Database** → Créer une base de données → Mode **Test** (règles ouvertes)
4. Dans **Project Overview → Ajouter une application Web** → Copiez le `firebaseConfig`

### 2. Configurer les règles Firebase
Dans **Realtime Database → Règles**, collez :
```json
{
  "rules": {
    "rooms": {
      "$roomCode": {
        ".read": true,
        ".write": true
      }
    }
  }
}
```

### 3. Remplir `firebase-config.js`
```javascript
const FIREBASE_CONFIG = {
  apiKey:            "AIza...",
  authDomain:        "mon-projet.firebaseapp.com",
  databaseURL:       "https://mon-projet-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:         "mon-projet",
  storageBucket:     "mon-projet.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123:web:abc",
};
```

## 🌐 Déploiement sur GitHub Pages
1. Pushez le dossier sur un repo GitHub
2. **Settings → Pages → Branch: main** → Sauvegarder
3. Votre jeu est en ligne à `https://votre-pseudo.github.io/BombParty/`

## ⚙️ Architecture technique

```
BombParty/
├── index.html          # 8 écrans : menu, create, join, public, local, lobby, game, end
├── style.css           # Design sombre/néon, responsive
├── game.js             # Logique du jeu (local + online), machine à états
├── network.js          # Couche Firebase : rooms, sync, chat, présence
├── firebase-config.js  # ⚠️ À configurer avec vos clés Firebase
└── words.js            # ~2000 mots français + 200+ syllabes
```

### Fonctionnement réseau
- **Firebase Realtime Database** = source de vérité
- **L'hôte** = maître du jeu (gère le timer, valide les mots, écrit l'état)
- **Les clients** = observent Firebase en temps réel, soumettent leurs mots
- **Transfert d'hôte** automatique si l'hôte se déconnecte
- **Nettoyage automatique** des rooms de +2h au démarrage

## ✨ Fonctionnalités

- 🌐 Multijoueur en ligne avec rooms et codes d'invitation
- 🌍 Lobby public avec liste des parties disponibles
- 💬 Chat dans le lobby et pendant la partie
- 👑 Transfert automatique de l'hôte
- 🎨 Interface sombre/néon moderne, 100% responsive
- 💣 Animations bombe (pulsation, mèche, explosion)
- 🎉 Confettis + trophée à la fin
- 📳 Vibration sur mobile
- 🔤 Normalisation des accents

## 📄 Licence
MIT
