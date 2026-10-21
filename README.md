# 📁 Gestionnaire de Projets BTP

Application de bureau Windows pour la gestion de projets de construction — MELLAH Abd Errahmane.

## Télécharger le .exe (sans rien installer)

👉 Aller dans l'onglet **Releases** de ce dépôt GitHub → télécharger `Gestionnaire-Projets-Setup-<version>.exe`

---

## Mettre en ligne sur GitHub (première fois)

```bash
git init
git add .
git commit -m "Premier commit"
git branch -M main
git remote add origin https://github.com/VOTRE_NOM/gestionnaire-projets.git
git push -u origin main
```

GitHub Actions compile automatiquement le `.exe` → onglet **Actions** pour suivre.

## Publier une nouvelle version

```bash
git add .
git commit -m "Nouvelle fonctionnalité"
git tag v1.0.1
git push && git push --tags
```

→ Le `.exe` est automatiquement créé dans **Releases**.

---

## Compiler avec GitHub Actions (méthode complète)

1. **Pousser le code** sur la branche `main` → le workflow *Build Windows EXE* compile
   automatiquement (test). Onglet **Actions** → ouvrir l'exécution → *Artifacts*
   (installeur conservé 1 jour).
2. **Publier une version téléchargeable** (recommandé, sans limite de quota) :
   ```bash
   # 1) mettre à jour "version" dans package.json (ex: 1.1.0)
   git add .
   git commit -m "Scanner : choix du scanner et numérisation"
   git tag v1.1.0
   git push && git push --tags
   ```
   Le workflow *Release* compile puis crée la Release avec le setup et le portable.
3. Dans GitHub : **Settings → Actions → General → Workflow permissions** →
   cocher *Read and write permissions* (si la création de la Release échoue).
4. Relancer un build sans nouveau commit : **Actions → Build Windows EXE → Run workflow**.

## Scanner (Windows)

Boutons **🖨️ Scanner** dans les documents de projet et les factures fournisseur :
choix du scanner (liste WIA, mémorisé), résolution, couleur, format PDF/JPG/PNG,
ou option « Utiliser l'interface du pilote ». Le fichier scanné est classé comme
un fichier importé. Nécessite le pilote WIA du scanner installé.

## Développement local

```bash
npm install
npm start        # tester
npm run build    # créer le .exe localement dans dist/
```

---

