# 🖥️ Gestionnaire de Projets — Guide d'installation Electron

## Ce que vous obtenez
Une vraie application Windows `.exe` avec :
- ✅ Accès direct aux scanners USB/réseau via WIA (Windows Image Acquisition)
- ✅ Création automatique des dossiers sur le disque
- ✅ Ouverture des dossiers dans l'Explorateur Windows
- ✅ Toutes les fonctionnalités déjà présentes dans la version HTML

---

## Étape 1 — Installer Node.js

1. Aller sur https://nodejs.org
2. Télécharger la version **LTS** (ex : 20.x)
3. Installer (tout par défaut, cocher "Add to PATH")
4. Vérifier dans cmd : `node --version`

---

## Étape 2 — Préparer le projet

Ouvrir **cmd** ou **PowerShell** dans le dossier `gestionnaire-electron` :

```cmd
cd chemin\vers\gestionnaire-electron
npm install
```

Cela télécharge Electron (~200 Mo) et les dépendances.

---

## Étape 3 — Tester en mode développement

```cmd
npm start
```

L'application s'ouvre comme un vrai logiciel Windows.

---

## Étape 4 — Créer l'installeur .exe final

```cmd
npm run build
```

Les fichiers de sortie seront dans le dossier `dist\` :
- `Gestionnaire Projets Setup 1.0.0.exe` → installeur complet
- `Gestionnaire Projets 1.0.0.exe` → version portable (aucune installation requise)

---

## Utilisation du scanner

Une fois l'app lancée :

1. Ouvrir un projet → onglet **Documents**
2. Cliquer sur **📷 Marquer scanné** sur n'importe quel document
3. Le modal s'ouvre avec **3 options** :
   - 🖨️ **Scanner / Imprimante** → liste tous les scanners WIA connectés au PC (USB ou réseau)
   - 📷 **Caméra / Webcam** → utiliser la caméra
   - 📁 **Fichier existant** → importer un fichier déjà scanné

### Pour que le scanner apparaisse :
- Le scanner doit être **allumé** et **connecté** au PC
- Les drivers doivent être installés (vérifier dans "Appareils et imprimantes" de Windows)
- Les scanners compatibles WIA : la grande majorité des scanners HP, Canon, Epson, Brother, Xerox, Ricoh

---

## Structure des fichiers

```
gestionnaire-electron/
├── main.js          ← Processus principal Electron (accès système, WIA)
├── preload.js       ← Pont sécurisé entre le système et la page HTML
├── package.json     ← Configuration du projet et de l'installeur
├── src/
│   └── index.html   ← Votre application (identique à la version web)
└── build-resources/
    ├── icon.ico     ← Icône Windows (à remplacer par la vôtre)
    └── icon.png     ← Icône macOS/Linux
```

---

## Icône personnalisée (optionnel)

Remplacer les fichiers dans `build-resources/` :
- `icon.ico` : format Windows, taille 256×256 minimum
- Outil gratuit pour convertir PNG → ICO : https://convertio.co/png-ico/

---

## Problèmes courants

| Problème | Solution |
|---|---|
| `npm install` échoue | Vérifier la connexion internet / proxy |
| Scanner non détecté | Vérifier "Appareils et imprimantes" dans Windows |
| Erreur WIA | Relancer l'app en tant qu'administrateur |
| App ne démarre pas | Relancer `npm install` puis `npm start` |

---

## Activation du logiciel (licence liée à la machine)

Chaque poste sur lequel l'application est installée doit être activé une seule fois :

1. Au premier lancement, l'app affiche un écran d'activation avec un **identifiant machine** unique (ex : `A1B2-C3D4-E5F6-0102`).
2. Le client vous communique cet identifiant (copie via le bouton 📋 Copier).
3. Sur votre propre ordinateur (celui de l'éditeur), ouvrez un terminal dans le dossier `keygen/` et lancez :
   ```cmd
   node generate-key.js A1B2-C3D4-E5F6-0102
   ```
4. Le programme affiche la **clé d'activation** correspondante — donnez-la au client.
5. Le client la saisit dans l'écran d'activation → le logiciel se débloque définitivement sur cette machine.

⚠️ **Avant de distribuer l'application**, ouvrez `main.js` et changez la valeur de `LICENSE_SECRET` (phrase secrète). Reportez le **même changement** dans `keygen/generate-key.js`, sinon les clés générées ne fonctionneront plus. Le dossier `keygen/` ne doit jamais être livré au client — il reste uniquement chez vous.

Une clé n'active le logiciel que sur la machine pour laquelle elle a été générée (elle est liée à l'identifiant matériel). Si le client change d'ordinateur, il faudra générer une nouvelle clé pour le nouvel identifiant.

---

## Classement automatique des factures d'achat fournisseurs

Quand un dossier racine a été choisi (bouton 📁 en haut), le document joint à une
**facture d'achat fournisseur** (🧾 Factures Fournisseurs) est désormais **coupé-collé
automatiquement** dès l'enregistrement dans un sous-dossier nommé par année, sous le
dossier de l'entreprise :

```
<dossier racine>/<ENTREPRISE>/Facture d'achat 2026/
```

L'année utilisée est celle du champ **Date** de la facture (année en cours par défaut).
Si aucun dossier racine n'a été choisi, le fichier reste à son emplacement d'origine et
un message d'avertissement s'affiche.

## Enregistrement automatique des documents scannés

Quand un dossier racine a été choisi (bouton 📁 en haut) et que le dossier du projet a été créé sur le disque (bouton "Créer / Recréer les dossiers"), chaque scan est désormais enregistré **directement dans le sous-dossier correspondant du projet** :

| Type de document | Sous-dossier |
|---|---|
| Copie Soumission | `01_SOUMISSION` |
| Contrat / Caution / OS de Commencer | `02_CONTRAT` |
| PV de Réception / Décompte Final | `03_SITUATIONS` |
| Factures | `04_FACTURES` |
| Bons de Livraison | `05_BONS_LIVRAISON` |
| Bordereaux d'Envoi | `06_BORDEREAUX_ENVOI` |
| Plans / Schémas | `07_PLANS` |
| Autres | `08_DIVERS` |

Un bouton "🗂️ Dossier" apparaît à côté du document pour rouvrir le fichier enregistré sur le disque.

---

