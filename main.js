const { app, BrowserWindow, ipcMain, dialog, shell, Tray, Menu, Notification } = require('electron');
const path   = require('path');
const fs     = require('fs');
const os     = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

// ─── Fenêtre principale ───────────────────────────────────────────────────────
let mainWindow;
let tray;
app.isQuitting = false;

// Lancé automatiquement au démarrage de Windows avec l'argument "--hidden" :
// dans ce cas, la fenêtre ne s'affiche pas tout de suite, l'app reste juste
// active en arrière-plan (icône dans la zone de notification).
const startHidden = process.argv.includes('--hidden');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: !startHidden,
    icon: path.join(__dirname, 'build-resources', 'icon.png'),
    title: 'Gestionnaire de Projets',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));
  mainWindow.setMenuBarVisibility(false);

  // Fermer la fenêtre (croix) ne quitte pas l'application : elle est juste
  // masquée, pour que le logiciel continue de tourner en arrière-plan et
  // puisse continuer à surveiller les échéances / envoyer des notifications.
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── Icône dans la zone de notification (system tray) ─────────────────────────
function createTray() {
  tray = new Tray(path.join(__dirname, 'build-resources', 'icon.png'));
  tray.setToolTip('Gestionnaire de Projets');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Ouvrir', click: () => {
        if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
      }
    },
    { type: 'separator' },
    {
      label: 'Quitter', click: () => {
        app.isQuitting = true;
        app.quit();
      }
    },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) { mainWindow.hide(); }
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
});

// L'application ne se quitte pas quand toutes les fenêtres sont fermées :
// elle continue de tourner en arrière-plan (icône dans la zone de
// notification), pour pouvoir surveiller les échéances des pièces même
// fenêtre fermée. Seul le menu "Quitter" du tray (ou Gestionnaire des
// tâches) arrête vraiment le logiciel.
app.on('window-all-closed', () => { /* ne rien faire : on reste actif via le tray */ });
app.on('before-quit', () => { app.isQuitting = true; });
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
  else { mainWindow.show(); mainWindow.focus(); }
});

// ══════════════════════════════════════════════════════════════════════════
// LANCEMENT AUTOMATIQUE AU DÉMARRAGE DE WINDOWS
// ══════════════════════════════════════════════════════════════════════════

ipcMain.handle('get-auto-launch', () => {
  try {
    return !!app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return false;
  }
});

ipcMain.handle('set-auto-launch', (_, enabled) => {
  try {
    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      // Au démarrage automatique, on relance en arrière-plan (icône dans la
      // zone de notification) plutôt que d'ouvrir la fenêtre directement.
      args: enabled ? ['--hidden'] : [],
    });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════════
// NOTIFICATIONS D'EXPIRATION DES PIÈCES
// ══════════════════════════════════════════════════════════════════════════

ipcMain.on('show-notification', (_, { title, body } = {}) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: title || 'Gestionnaire de Projets',
    body: body || '',
    icon: path.join(__dirname, 'build-resources', 'icon.png'),
  });
  n.on('click', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); }
  });
  n.show();
});

// ══════════════════════════════════════════════════════════════════════════
// SYSTÈME D'ACTIVATION — clé liée à l'identifiant machine
// ══════════════════════════════════════════════════════════════════════════
//
// ⚠️ IMPORTANT : changez cette phrase secrète avant de distribuer l'application.
// Elle doit rester identique entre l'app et l'outil "keygen/generate-key.js"
// utilisé par vous (l'éditeur) pour générer les clés d'activation des clients.
const LICENSE_SECRET = 'GP-BTP-2026-CHANGE-MOI';

const LICENSE_FILE = path.join(app.getPath('userData'), 'license.json');

// Identifiant machine : dérivé d'éléments matériels stables (pas d'accès réseau requis).
function getMachineId() {
  const cpuModel = (os.cpus()[0] || {}).model || '';
  const raw = [
    os.hostname(),
    os.platform(),
    os.arch(),
    cpuModel,
    os.totalmem().toString(),
  ].join('|');
  const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
  const short = hash.slice(0, 16);
  return short.match(/.{1,4}/g).join('-');
}

// Calcule la clé d'activation attendue pour un identifiant machine donné.
// (Le même calcul est utilisé dans keygen/generate-key.js pour générer les clés à donner aux clients.)
function computeExpectedKey(machineId) {
  const h = crypto.createHmac('sha256', LICENSE_SECRET).update(machineId).digest('hex').toUpperCase();
  const short = h.slice(0, 20);
  return short.match(/.{1,5}/g).join('-');
}

function normalizeKey(key) {
  return (key || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidKeyForMachine(machineId, key) {
  const expected = computeExpectedKey(machineId).replace(/-/g, '');
  return normalizeKey(key) === expected;
}

function readLicenseFile() {
  try {
    if (!fs.existsSync(LICENSE_FILE)) return null;
    return JSON.parse(fs.readFileSync(LICENSE_FILE, 'utf8'));
  } catch (e) {
    return null;
  }
}

ipcMain.handle('get-machine-id', () => getMachineId());

ipcMain.handle('check-license', () => {
  const machineId = getMachineId();
  const stored = readLicenseFile();
  const licensed = !!(
    stored &&
    stored.machineId === machineId &&
    stored.key &&
    isValidKeyForMachine(machineId, stored.key)
  );
  return { licensed, machineId };
});

ipcMain.handle('activate-license', async (_, rawKey) => {
  const machineId = getMachineId();
  if (!rawKey || !isValidKeyForMachine(machineId, rawKey)) {
    return { ok: false, error: 'Clé invalide pour cet ordinateur.' };
  }
  try {
    fs.writeFileSync(LICENSE_FILE, JSON.stringify({
      machineId,
      key: normalizeKey(rawKey),
      activatedAt: new Date().toISOString(),
    }, null, 2));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════════
// DOSSIERS PROJET
// ══════════════════════════════════════════════════════════════════════════

// Sous-dossiers standard créés pour chaque projet, et table de correspondance
// entre le type de document (DOC_TYPES côté interface) et son sous-dossier.
const PROJECT_SUBFOLDERS = [
  '01_SOUMISSION',
  '02_CONTRAT',
  '03_SITUATIONS',
  '04_FACTURES',
  '05_BONS_LIVRAISON',
  '06_BORDEREAUX_ENVOI',
  '07_PLANS',
  '08_DIVERS',
];

const DOC_FOLDER_MAP = {
  soumission:   '01_SOUMISSION',
  contrat:      '02_CONTRAT',
  caution:      '02_CONTRAT',
  os_commencer: '02_CONTRAT',
  pv_reception: '03_SITUATIONS',
  pv:           '03_SITUATIONS',
  decompte:     '03_SITUATIONS',
  facture:      '04_FACTURES',
  proforma:     '04_FACTURES',
  bl:           '05_BONS_LIVRAISON',
  bc:           '05_BONS_LIVRAISON',
  bordereau:    '06_BORDEREAUX_ENVOI',
  plan:         '07_PLANS',
  lettre:       '08_DIVERS',
};

function folderForDoc(docKey) {
  return DOC_FOLDER_MAP[docKey] || '08_DIVERS';
}

// ─── Archivage des documents générés SANS projet (courrier libre) ───────────
// Nom du sous-dossier (sous le dossier de l'année) où ranger chaque type de
// document généré lorsqu'il n'est rattaché à aucun projet.
const ARCHIVE_TYPE_FOLDER = {
  facture:   'Facture',
  proforma:  'Facture Proforma',
  bl:        'Bon de Livraison',
  bc:        'Bon de Commande',
  lettre:    'Lettre',
  pv:        'PV de Réception',
  bordereau: 'Bordereau',
};

function archiveFolderForDoc(docKey) {
  return ARCHIVE_TYPE_FOLDER[docKey] || 'Divers';
}

ipcMain.handle('choose-root-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choisir le dossier racine des projets',
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('create-project-folders', async (_, { rootPath, coFolder, year, wilaya, folderName }) => {
  try {
    if (!rootPath) return { success: false, error: 'Dossier racine non défini' };
    const fullPath = path.join(rootPath, coFolder, String(year), wilaya, folderName);
    for (const sub of PROJECT_SUBFOLDERS) {
      const full = path.join(fullPath, sub);
      if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
    }
    return { success: true, path: fullPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('open-folder', async (_, folderPath) => {
  if (!folderPath || !fs.existsSync(folderPath)) return false;
  const err = await shell.openPath(folderPath);
  return !err;
});

// Ouvre un fichier stocké en base64 (pièce jointe) avec l'application par
// défaut du système d'exploitation, en dehors du logiciel : le fichier est
// d'abord écrit dans un dossier temporaire, puis ouvert via shell.openPath.
ipcMain.handle('open-base64-file', async (_, { base64Data, fileName }) => {
  try {
    if (!base64Data) return { success: false, error: 'Fichier vide' };
    const tmpDir = path.join(os.tmpdir(), 'gestionnaire-electron-fichiers');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    const ext = path.extname(fileName || '') || '';
    const safeBase = path.basename(fileName || 'document', ext).replace(/[^a-zA-Z0-9_\-]/g, '_') || 'document';
    const destPath = path.join(tmpDir, `${safeBase}_${Date.now()}${ext}`);

    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    fs.writeFileSync(destPath, Buffer.from(cleanBase64, 'base64'));

    const err = await shell.openPath(destPath);
    if (err) return { success: false, error: err };
    return { success: true, path: destPath };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('choose-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    title: 'Choisir un fichier',
    filters: [
      { name: 'Documents', extensions: ['pdf', 'jpg', 'jpeg', 'png', 'bmp', 'tiff', 'webp', 'doc', 'docx', 'xls', 'xlsx'] },
      { name: 'Tous les fichiers', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const filePath = result.filePaths[0];
  return { path: filePath, name: path.basename(filePath) };
});

// Importe le fichier d'une facture d'achat fournisseur : il est déplacé
// ("coupé-collé") depuis son emplacement d'origine vers un sous-dossier
// nommé par année, ex : "Facture d'achat 2026", situé sous le dossier de
// l'entreprise (rootPath/coFolder/Facture d'achat <année>/), puis renommé.
ipcMain.handle('import-invoice-file', async (_, { rootPath, coFolder, year, sourcePath }) => {
  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { success: false, error: 'Fichier source introuvable' };
    }
    if (!rootPath) {
      return { success: false, error: 'Dossier racine non défini' };
    }
    const destDir = path.join(rootPath, coFolder || 'ENTREPRISE', `Facture d'achat ${year}`);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const ext = path.extname(sourcePath) || '';
    const safeBase = path.basename(sourcePath, ext).replace(/[^a-zA-Z0-9_\-]/g, '_') || 'facture';
    const finalName = `${safeBase}_${Date.now()}${ext}`;
    const destPath = path.join(destDir, finalName);

    try {
      fs.renameSync(sourcePath, destPath);
    } catch (moveErr) {
      fs.copyFileSync(sourcePath, destPath);
      fs.unlinkSync(sourcePath);
    }

    return { success: true, path: destPath, folder: destDir, name: finalName };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// Importe un fichier choisi par l'utilisateur : il est déplacé ("coupé-collé")
// depuis son emplacement d'origine vers le sous-dossier du projet correspondant
// au type de document (ex: "soumission" → 01_SOUMISSION), puis renommé.
ipcMain.handle('import-doc-file', async (_, { projectFolderPath, docKey, sourcePath }) => {
  try {
    if (!sourcePath || !fs.existsSync(sourcePath)) {
      return { success: false, error: 'Fichier source introuvable' };
    }
    if (!projectFolderPath) {
      return { success: false, error: "Dossier du projet introuvable sur le disque (créez-le d'abord)." };
    }
    const subFolder = folderForDoc(docKey);
    const destDir = path.join(projectFolderPath, subFolder);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const ext = path.extname(sourcePath) || '';
    const safeBase = path.basename(sourcePath, ext).replace(/[^a-zA-Z0-9_\-]/g, '_') || docKey;
    const finalName = `${safeBase}_${Date.now()}${ext}`;
    const destPath = path.join(destDir, finalName);

    try {
      // Déplacement (couper-coller) : rapide, mais échoue entre deux disques différents.
      fs.renameSync(sourcePath, destPath);
    } catch (moveErr) {
      // Repli : copier puis supprimer l'original pour simuler un couper-coller.
      fs.copyFileSync(sourcePath, destPath);
      fs.unlinkSync(sourcePath);
    }

    return { success: true, path: destPath, folder: subFolder, name: finalName };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ARCHIVAGE AUTOMATIQUE DES DOCUMENTS GÉNÉRÉS (facture, lettre, PV, bordereau…)
// ══════════════════════════════════════════════════════════════════════════
//
// Règle d'archivage :
// - Si le document généré est rattaché à un projet   → il est classé directement
//   dans le sous-dossier correspondant du dossier de CE projet
//   (ex : une facture va dans 04_FACTURES du dossier du projet).
// - Si le document n'est rattaché à aucun projet     → il est archivé dans un
//   sous-dossier du dossier de l'année, nommé selon son type
//   (Facture, Lettre, PV de Réception, Bordereau…), sous le dossier de
//   l'entreprise.

// Convertit un contenu HTML en PDF via une fenêtre Electron invisible.
async function htmlToPdfBuffer(html) {
  const tmpDir = path.join(os.tmpdir(), 'gestionnaire-electron-pdf');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `doc_${Date.now()}_${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmpFile, html, 'utf8');

  let pdfWin;
  try {
    pdfWin = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    await pdfWin.loadFile(tmpFile);
    const buffer = await pdfWin.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
    });
    return buffer;
  } finally {
    if (pdfWin) pdfWin.destroy();
    try { fs.unlinkSync(tmpFile); } catch (e) { /* fichier temporaire déjà nettoyé */ }
  }
}

ipcMain.handle('generate-and-archive-document', async (_, params) => {
  try {
    const { html, docKey, projectFolderPath, rootPath, coFolder, year, fileName } = params || {};
    if (!html) return { success: false, error: 'Contenu du document manquant' };

    let destDir;
    const viaProjet = !!projectFolderPath;

    if (viaProjet) {
      destDir = path.join(projectFolderPath, folderForDoc(docKey));
    } else {
      if (!rootPath) return { success: false, error: 'Dossier racine non défini' };
      const yr = year || new Date().getFullYear();
      destDir = path.join(rootPath, coFolder || 'ENTREPRISE', String(yr), archiveFolderForDoc(docKey));
    }
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const safeName = (String(fileName || docKey || 'document'))
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim() || 'document';

    let destPath = path.join(destDir, `${safeName}.pdf`);
    let counter = 1;
    while (fs.existsSync(destPath)) {
      destPath = path.join(destDir, `${safeName}_${counter}.pdf`);
      counter++;
    }

    const pdfBuffer = await htmlToPdfBuffer(html);
    fs.writeFileSync(destPath, pdfBuffer);

    return { success: true, path: destPath, folder: destDir, viaProjet };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════════
// SCANNER (Windows — WIA via PowerShell, aucune dépendance native à compiler)
// ══════════════════════════════════════════════════════════════════════════
//
// - list-scanners  : liste les scanners installés (pilotes WIA)
// - scan-document  : numérise depuis le scanner choisi (ou affiche l'interface
//                    du pilote) et renvoie le chemin d'un fichier temporaire,
//                    ensuite classé par les fonctions d'import existantes.

function runPowerShell(script, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      return reject(new Error('Le scan direct est disponible uniquement sous Windows.'));
    }
    const full = "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$ErrorActionPreference='Stop';\n" + script;
    const encoded = Buffer.from(full, 'utf16le').toString('base64');
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { timeout: timeoutMs || 180000, windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (stderr || '').trim() || err.message;
          return reject(new Error(msg));
        }
        resolve((stdout || '').trim());
      }
    );
  });
}

ipcMain.handle('list-scanners', async () => {
  try {
    const script = `
$dm = New-Object -ComObject WIA.DeviceManager
$list = @()
foreach ($info in $dm.DeviceInfos) {
  if ($info.Type -eq 1) {
    $list += [pscustomobject]@{ id = [string]$info.DeviceID; name = [string]$info.Properties.Item('Name').Value }
  }
}
if ($list.Count -eq 0) { '[]' } else { ConvertTo-Json -InputObject @($list) -Compress }
`;
    const out = await runPowerShell(script, 30000);
    let scanners = [];
    try { scanners = JSON.parse(out || '[]'); } catch (e) { scanners = []; }
    return { success: true, scanners };
  } catch (e) {
    return { success: false, error: e.message, scanners: [] };
  }
});

ipcMain.handle('scan-document', async (_, opts = {}) => {
  try {
    const dpi    = [100, 150, 200, 300, 400, 600].includes(Number(opts.dpi)) ? Number(opts.dpi) : 200;
    const mode   = ['color', 'gray', 'bw'].includes(opts.mode) ? opts.mode : 'color';
    const format = ['pdf', 'jpg', 'png'].includes(opts.format) ? opts.format : 'pdf';
    const useUI  = !!opts.useDriverUI;
    const intent = mode === 'color' ? 1 : mode === 'gray' ? 2 : 4;

    // Les PDF sont produits à partir d'une image JPEG/PNG numérisée.
    const imgExt  = format === 'png' ? 'png' : 'jpg';
    const formatId = format === 'png' ? '{B96B3CAF-0728-11D3-9D7B-0000F81EF32E}' : '{B96B3CAE-0728-11D3-9D7B-0000F81EF32E}';

    const tmpDir = path.join(os.tmpdir(), 'gestionnaire-electron-scans');
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const stamp = Date.now();
    const imgPath = path.join(tmpDir, `scan_${stamp}.${imgExt}`);

    // Les valeurs sont injectées après validation stricte (pas de saisie libre).
    const deviceId = String(opts.deviceId || '').replace(/'/g, "''");
    const psImg = imgPath.replace(/'/g, "''");

    let script;
    if (useUI || !deviceId) {
      // Interface native Windows / pilote du scanner (choix du scanner inclus)
      script = `
$cd = New-Object -ComObject WIA.CommonDialog
$img = $cd.ShowAcquireImage(1, ${intent}, 0x10000, '${formatId}', $true, $true, $false)
if ($img -eq $null) { 'CANCELED' } else { $img.SaveFile('${psImg}'); 'OK' }
`;
    } else {
      script = `
$dm = New-Object -ComObject WIA.DeviceManager
$dev = $null
foreach ($info in $dm.DeviceInfos) { if ([string]$info.DeviceID -eq '${deviceId}') { $dev = $info.Connect() } }
if ($dev -eq $null) { throw 'Scanner introuvable (débranché ou éteint ?).' }
$item = $dev.Items.Item(1)
function Set-WiaProp($it, $id, $val) {
  foreach ($p in $it.Properties) { if ($p.PropertyID -eq $id) { try { $p.Value = $val } catch {} } }
}
Set-WiaProp $item 6146 ${intent}
Set-WiaProp $item 6147 ${dpi}
Set-WiaProp $item 6148 ${dpi}
$cd = New-Object -ComObject WIA.CommonDialog
$img = $cd.ShowTransfer($item, '${formatId}', $false)
$img.SaveFile('${psImg}')
'OK'
`;
    }

    const out = await runPowerShell(script, 240000);
    if (out.includes('CANCELED') || !fs.existsSync(imgPath)) {
      return { success: false, canceled: true, error: 'Numérisation annulée' };
    }

    if (format !== 'pdf') {
      return { success: true, path: imgPath, name: path.basename(imgPath) };
    }

    // PDF : on place l'image sur une page A4 via le moteur d'impression d'Electron.
    const mime = 'image/jpeg';
    const b64 = fs.readFileSync(imgPath).toString('base64');
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      @page { size: A4; margin: 0 }
      html,body { margin:0; padding:0 }
      img { display:block; width:210mm; height:297mm; object-fit:contain }
    </style></head><body><img src="data:${mime};base64,${b64}"></body></html>`;
    const pdfBuffer = await htmlToPdfBuffer(html);
    const pdfPath = path.join(tmpDir, `scan_${stamp}.pdf`);
    fs.writeFileSync(pdfPath, pdfBuffer);
    try { fs.unlinkSync(imgPath); } catch (e) { /* ignoré */ }
    return { success: true, path: pdfPath, name: path.basename(pdfPath) };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

// ══════════════════════════════════════════════════════════════════════════
// ARCHIVAGE DES PIÈCES ADMINISTRATIVES EXPIRÉES
// ══════════════════════════════════════════════════════════════════════════
//
// Quand une pièce du Dossier Administratif (registre de commerce, extrait de
// rôle, casier judiciaire…) expire, une copie de son fichier joint est
// automatiquement rangée sur le disque dans :
//   <rootPath>/<coFolder>/ADMINISTRATIF/archive/<Type de pièce>/
// c'est-à-dire un sous-dossier "archive" dans le dossier ADMINISTRATIF de
// l'entreprise, avec un sous-dossier par type de pièce (un par nom de
// document administratif).
ipcMain.handle('archive-expired-admin-doc', async (_, params) => {
  try {
    const { rootPath, coFolder, docName, base64Data, fileName } = params || {};
    if (!base64Data) return { success: false, error: 'Fichier vide' };
    if (!rootPath) return { success: false, error: 'Dossier racine non défini' };

    const safeType = String(docName || 'Divers')
      .replace(/[\\/:*?"<>|]/g, '_')
      .trim() || 'Divers';

    const destDir = path.join(rootPath, coFolder || 'ENTREPRISE', 'ADMINISTRATIF', 'archive', safeType);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    const ext = path.extname(fileName || '') || '';
    const safeBase = path.basename(fileName || docName || 'document', ext).replace(/[^a-zA-Z0-9_\-]/g, '_') || 'document';
    let destPath = path.join(destDir, `${safeBase}${ext}`);
    let counter = 1;
    while (fs.existsSync(destPath)) {
      destPath = path.join(destDir, `${safeBase}_${counter}${ext}`);
      counter++;
    }

    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    fs.writeFileSync(destPath, Buffer.from(cleanBase64, 'base64'));

    return { success: true, path: destPath, folder: destDir };
  } catch (e) {
    return { success: false, error: e.message };
  }
});
