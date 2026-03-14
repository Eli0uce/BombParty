/**
 * build-dictionary.js
 * Télécharge TOUS les CSV depuis hbenbel/French-Dictionary et génère words.js
 * Usage : node build-dictionary.js
 *
 * Mots stockés en forme NORMALISÉE (sans accents, minuscules) pour que
 * les lookups en jeu soient corrects (normalize() déjà appliqué côté client).
 */

const https = require('https');
const fs    = require('fs');
const path  = require('path');

// ── Tous les fichiers du repo ────────────────────────────────────────────────
const CSV_URLS = [
  { url: 'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/noun.csv',  label: 'noun.csv' },
  { url: 'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/adj.csv',   label: 'adj.csv'  },
  { url: 'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/adv.csv',   label: 'adv.csv'  },
  { url: 'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/verb.csv',  label: 'verb.csv' },
  { url: 'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/prep.csv',  label: 'prep.csv' },
  { url: 'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/pron.csv',  label: 'pron.csv' },
  { url: 'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/conj.csv',  label: 'conj.csv' },
  { url: 'https://raw.githubusercontent.com/hbenbel/French-Dictionary/master/dictionary/det.csv',   label: 'det.csv'  },
];

// Regex sur la forme brute (avant normalisation)
const RAW_WORD_REGEX = /^[a-zA-Z\u00C0-\u00FF]{2,}$/;

// Même normalisation que game.js
function normalizeWord(str) {
  return str.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

// Téléchargement en streaming ligne par ligne (économise la RAM pour verb.csv 22MB)
function fetchAndParse(url, allWords) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) { reject(new Error('HTTP ' + res.statusCode)); return; }

      let buffer  = '';
      let isFirst = true;
      let added   = 0;

      res.on('data', chunk => {
        buffer += chunk.toString('utf8');
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (isFirst) { isFirst = false; continue; }
          const raw = line.split(',')[0].trim();
          if (!RAW_WORD_REGEX.test(raw)) continue;
          const norm = normalizeWord(raw);
          if (norm.length >= 2 && !allWords.has(norm)) { allWords.add(norm); added++; }
        }
      });

      res.on('end', () => {
        if (buffer) {
          const raw = buffer.split(',')[0].trim();
          if (RAW_WORD_REGEX.test(raw)) {
            const norm = normalizeWord(raw);
            if (norm.length >= 2 && !allWords.has(norm)) { allWords.add(norm); added++; }
          }
        }
        resolve(added);
      });

      res.on('error', reject);
    }).on('error', reject);
  });
}

// Petit tableau normalisé pour la sélection des syllabes (itération rapide)
const BASE_WORDS = [
  "abaisser","abandonner","abattre","abimer","abolir","aborder","aboutir","abreger",
  "abriter","absorber","abuser","acceder","accepter","accompagner","accorder","accuser",
  "acheter","achever","actionner","admettre","adopter","adorer","agir","ajouter",
  "alerter","analyser","annoncer","appeler","apporter","apprendre","approcher","arreter",
  "arriver","assurer","atteindre","attendre","attraper","avancer","avoir",
  "baigner","batir","battre","boire","bouger","briller","bruler","calculer",
  "calmer","capturer","cesser","changer","chanter","chercher","choisir","circuler",
  "commencer","communiquer","compter","conduire","construire","continuer","couper","courir",
  "couvrir","creer","crier","cultiver","danser","decider","decouvrir","defendre",
  "demander","descendre","dessiner","detruire","devenir","diriger","discuter","diviser",
  "donner","ecouter","ecrire","elever","empecher","envoyer","esperer","etudier",
  "evaluer","expliquer","exprimer","fermer","finir","fonctionner","former","franchir",
  "gagner","garder","glisser","gouverner","grandir","habiter","imaginer","indiquer",
  "informer","installer","inventer","jouer","laisser","lancer","lire","livrer",
  "maintenir","marcher","marquer","mesurer","mettre","modifier","montrer","mourir",
  "obtenir","occuper","offrir","organiser","oublier","ouvrir","parler","partir",
  "passer","perdre","permettre","placer","porter","poser","pousser","prendre",
  "preparer","presenter","produire","proposer","proteger","publier","quitter","realiser",
  "recevoir","reduire","remplir","rendre","reparer","repondre","rester","retourner",
  "reussir","revenir","risquer","saisir","servir","sortir","suivre","tenir",
  "terminer","tirer","tomber","tourner","travailler","traverser","trouver","utiliser",
  "vaincre","vendre","venir","vivre","voir","voler","voter",
  "beau","blanc","bleu","brillant","calme","capable","certain","chaud","clair",
  "doux","dynamique","efficace","elegant","enorme","excellent","facile","fort","grand",
  "heureux","intelligent","jeune","joyeux","libre","long","magnifique","mauvais",
  "nouveau","parfait","petit","puissant","rapide","rare","riche","rouge","simple",
  "special","terrible","tranquille","utile","vieux","violent","vivant",
  "arbre","avion","bateau","cheval","chien","chat","dragon","etoile","fleur","foret",
  "jardin","lumiere","maison","montagne","nuage","ocean","oiseau","pierre","soleil",
  "tigre","tour","voiture","chateau","chemin","riviere","village","monde","pays","ville",
];

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
  console.log('=== Build French Dictionary for BombParty ===');
  console.log('Source : https://github.com/hbenbel/French-Dictionary\n');

  const allWords = new Set();

  for (const { url, label } of CSV_URLS) {
    process.stdout.write('Telechargement ' + label + '...');
    try {
      const added = await fetchAndParse(url, allWords);
      console.log('  +' + added.toLocaleString() + ' mots  total: ' + allWords.size.toLocaleString());
    } catch (e) {
      console.log('  ERREUR: ' + e.message);
    }
  }

  console.log('\nTotal mots uniques normalises : ' + allWords.size.toLocaleString());

  const sorted = [...allWords].sort();

  const date = new Date().toISOString().split('T')[0];
  const output = '// Dictionnaire francais BombParty\n'
    + '// Source   : https://github.com/hbenbel/French-Dictionary\n'
    + '// Mots     : ' + allWords.size.toLocaleString() + ' (noms, adj, adv, verbes conjugues...)\n'
    + '// Stockage : formes NORMALISEES (sans accents) = lookup O(1) correct\n'
    + '// Genere   : ' + date + '\n\n'
    + '// Petit tableau pour la selection des syllabes (iteration rapide)\n'
    + 'const WORDS = ' + JSON.stringify(BASE_WORDS) + ';\n\n'
    + '// Dictionnaire complet - formes normalisees - validation O(1)\n'
    + 'const WORDS_SET = new Set(' + JSON.stringify(sorted) + ');\n'
    + SYLLABLES_JS;

  const outPath = path.join(__dirname, 'words.js');
  fs.writeFileSync(outPath, output, 'utf8');

  const bytes = fs.statSync(outPath).size;
  console.log('words.js ecrit : ' + (bytes / 1024).toFixed(0) + ' KB (' + (bytes / 1024 / 1024).toFixed(2) + ' MB)');
  console.log('GitHub Pages compresse automatiquement avec gzip (~30% de la taille brute).');
  console.log('\nTermine !');
}

main().catch(function(err) { console.error(err); process.exit(1); });

