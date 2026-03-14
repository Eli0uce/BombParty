/**
 * build-dictionary.js
 * Télécharge les CSV depuis hbenbel/French-Dictionary et génère words.js
 * Usage : node build-dictionary.js
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// Fichiers à télécharger (on exclut verb.csv car 22 MB)
const CSV_URLS = [
  'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/noun.csv',
  'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/adj.csv',
  'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/adv.csv',
  'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/prep.csv',
  'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/pron.csv',
  'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/conj.csv',
  'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/det.csv',
];

// Regex : uniquement des lettres françaises (pas de chiffres, pas d'espaces, pas de tirets)
const WORD_REGEX = /^[a-zA-ZÀ-ÿ]{2,}$/;

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} pour ${url}`));
        return;
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end',  () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    }).on('error', reject);
  });
}

function parseWords(csvText) {
  const words = new Set();
  const lines = csvText.split('\n');
  // Sauter l'en-tête (première ligne "form,tags")
  for (let i = 1; i < lines.length; i++) {
    const line  = lines[i].trim();
    if (!line) continue;
    // Première colonne = le mot
    const word  = line.split(',')[0].trim().toLowerCase();
    if (WORD_REGEX.test(word)) {
      words.add(word);
    }
  }
  return words;
}

// ── Petit dictionnaire de base pour la sélection des syllabes ──────────────
const BASE_WORDS = [
  "abaisser","abandonner","abattre","abdiquer","abîmer","abolir","abonder","aborder","aboutir","abréger",
  "abriter","absenter","absorber","abstraire","abuser","accéder","accepter","acclamer","accompagner","accorder",
  "accrocher","accumuler","accuser","acheter","achever","acquérir","actionner","admettre","adopter","adorer",
  "adresser","afficher","affirmer","agir","ajouter","alerter","aligner","allonger","altérer","analyser",
  "annoncer","apercevoir","apparaître","appeler","apporter","apprendre","approcher","approuver","argumenter","arrêter",
  "arriver","assembler","assurer","atteindre","attendre","attraper","avancer","aventure","avion","avoir",
  "baigner","balancer","bâtir","battre","boire","bouger","briller","brosser","bruler","calculer",
  "calmer","capturer","caresser","cesser","changer","chanter","charger","chercher","choisir","circuler",
  "classer","coller","commencer","communiquer","comparer","compter","conduire","connaitre","construire","continuer",
  "contrôler","copier","couper","courir","couvrir","créer","crier","critiquer","cultiver","danser",
  "décider","déclarer","découvrir","décrire","défendre","dégager","demander","dépenser","déposer","déranger",
  "descendre","dessiner","détruire","devenir","deviner","diminuer","diriger","discuter","diviser","dominer",
  "donner","dresser","écouter","écrire","effacer","élever","empêcher","employer","emporter","encourager",
  "engager","enlever","enseigner","entendre","entreprendre","envoyer","espérer","établir","éteindre","étudier",
  "évaluer","évoluer","exiger","expliquer","exprimer","fabriquer","fermer","finir","fonctionner","fonder",
  "former","franchir","gagner","garder","glisser","gouverner","grandir","grouper","habiter","ignorer",
  "imaginer","imposer","inclure","indiquer","informer","installer","inventer","joindre","jouer","laisser",
  "lancer","lier","limiter","lire","livrer","maintenir","marcher","marquer","mesurer","mettre",
  "modifier","montrer","mourir","nommer","obtenir","occuper","offrir","organiser","oublier","ouvrir",
  "parler","partir","passer","perdre","permettre","placer","porter","poser","pousser","prendre",
  "préparer","présenter","produire","projeter","proposer","protéger","publier","quitter","réaliser","recevoir",
  "reconnaître","réduire","remplir","rendre","rentrer","réparer","répéter","répondre","rester","retourner",
  "réunir","réussir","revenir","risquer","saisir","sembler","servir","sortir","souffrir","subir",
  "suivre","supporter","tenir","terminer","tirer","tomber","tourner","traduire","travailler","traverser",
  "trouver","utiliser","vaincre","valider","vendre","venir","vivre","voir","voler","voter",
  "beau","bizarre","blanc","bleu","brillant","calme","capable","certain","chaud","clair",
  "doux","dynamique","efficace","élégant","énorme","étrange","excellent","facile","fort","grand",
  "heureux","intelligent","jeune","joyeux","libre","long","magnifique","mauvais","mystérieux","naturel",
  "nouveau","parfait","petit","puissant","rapide","rare","riche","rouge","sérieux","simple",
  "spécial","terrible","tranquille","utile","vieux","violent","vivant",
  "arbre","avion","bateau","cheval","chien","chat","dragon","étoile","fleur","forêt",
  "jardin","lumière","maison","montagne","nuage","océan","oiseau","pierre","soleil","terre",
  "tigre","tour","voiture","château","chemin","rivière","village","monde","pays","ville",
];

// ── Syllabes ────────────────────────────────────────────────────────────────
const SYLLABLES_JS = `
// Syllabes/bigrammes utilisés dans le jeu
const SYLLABLES = [
  "an","en","on","in","un","ou","ai","au","eu","oi",
  "ar","er","ir","or","ur","al","el","il","ol","ul",
  "at","et","it","ot","ut","ac","ec","ic","oc","uc",
  "ab","eb","ib","ob","ub","ad","ed","id","od","ud",
  "af","ef","if","of","uf","ag","eg","ig","og","ug",
  "am","em","im","om","um","ap","ep","ip","op","up",
  "as","es","is","os","us","av","ev","iv","ov","uv",
  "ba","be","bi","bo","bu","ca","ce","ci","co","cu",
  "da","de","di","do","du","fa","fe","fi","fo","fu",
  "ga","ge","gi","go","gu","ha","he","hi","ho","hu",
  "ja","je","ji","jo","ju","la","le","li","lo","lu",
  "ma","me","mi","mo","mu","na","ne","ni","no","nu",
  "pa","pe","pi","po","pu","ra","re","ri","ro","ru",
  "sa","se","si","so","su","ta","te","ti","to","tu",
  "va","ve","vi","vo","vu","za","ze","zi","zo","zu",
  "ble","bri","bro","bru","cla","cli","clo","clu","cra","cre",
  "cri","cro","dra","dre","dri","dro","fla","fle","fli","flo",
  "fra","fre","fri","fro","gla","gle","gli","glo","gra","gre",
  "gri","gro","pla","ple","pli","plo","pra","pre","pri","pro",
  "tra","tre","tri","tro","bla","ble","bli","blo","bru","cha",
  "che","chi","cho","chu","gua","gue","gui","guo","qui","que",
  "lon","tion","ment","eur","ous","ant","ent","est","ion","eau",
  "ain","oin","ein","ien","yen","eur","our","oir","air","ier",
];
`;

async function main() {
  console.log('=== Build French Dictionary for BombParty ===\n');

  const allWords = new Set();

  for (const url of CSV_URLS) {
    const name = path.basename(url);
    process.stdout.write(`⬇  Téléchargement ${name}...`);
    try {
      const text  = await fetchText(url);
      const words = parseWords(text);
      process.stdout.write(` ${words.size.toLocaleString()} mots valides\n`);
      for (const w of words) allWords.add(w);
    } catch (e) {
      process.stdout.write(` ERREUR: ${e.message}\n`);
    }
  }

  console.log(`\n✅ Total mots uniques : ${allWords.size.toLocaleString()}`);

  // Trier pour un diff git stable
  const sorted = [...allWords].sort();

  const js = `// ════════════════════════════════════════════════════════
//  WORDS.JS — Dictionnaire français BombParty
//  Source   : https://github.com/hbenbel/French-Dictionary
//  Mots     : ${allWords.size.toLocaleString()} (noms, adjectifs, adverbes, prépositions…)
//  Généré   : ${new Date().toISOString().split('T')[0]}
// ════════════════════════════════════════════════════════

// Petit tableau de base utilisé pour la sélection des syllabes (itération rapide)
const WORDS = ${JSON.stringify(BASE_WORDS)};

// Dictionnaire complet en Set pour validation O(1)
const WORDS_SET = new Set(${JSON.stringify(sorted)});
${SYLLABLES_JS}`;

  const outPath = path.join(__dirname, 'words.js');
  fs.writeFileSync(outPath, js, 'utf8');

  const sizeKB = (fs.statSync(outPath).size / 1024).toFixed(1);
  console.log(`📄 words.js écrit (${sizeKB} KB)`);
  console.log('\nTerminé ! 🎉');
}

main().catch(err => { console.error(err); process.exit(1); });

