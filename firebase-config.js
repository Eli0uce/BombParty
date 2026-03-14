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

// Règles Firebase Realtime Database recommandées (à coller dans la console) :
/*
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
*/

