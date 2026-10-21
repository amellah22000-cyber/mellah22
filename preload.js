const { contextBridge, ipcRenderer } = require('electron');

// Expose des API sécurisées au renderer (la page HTML)
contextBridge.exposeInMainWorld('electronAPI', {
  // Dossiers
  chooseRootFolder:    ()                              => ipcRenderer.invoke('choose-root-folder'),
  createProjectFolders:(params)                         => ipcRenderer.invoke('create-project-folders', params),
  openFolder:          (folderPath)                     => ipcRenderer.invoke('open-folder', folderPath),
  chooseFile:          ()                               => ipcRenderer.invoke('choose-file'),
  openBase64File:      (params)                          => ipcRenderer.invoke('open-base64-file', params),

  // Import de fichier (couper-coller automatique dans le dossier du projet)
  importDocFile:  (params)              => ipcRenderer.invoke('import-doc-file', params),

  // Import du fichier d'une facture d'achat (couper-coller automatique dans
  // le sous-dossier "Facture d'achat <année>")
  importInvoiceFile: (params)           => ipcRenderer.invoke('import-invoice-file', params),

  // Archivage automatique d'un document généré (facture, lettre, PV, bordereau…) :
  // rangé dans le dossier du projet s'il y en a un, sinon dans le dossier de
  // l'année (par type de document) sous le dossier de l'entreprise.
  generateAndArchiveDocument: (params)  => ipcRenderer.invoke('generate-and-archive-document', params),

  // Archivage automatique d'une pièce du Dossier Administratif dès qu'elle
  // expire : copie rangée dans ADMINISTRATIF/archive/<type de pièce>/
  // sous le dossier de l'entreprise.
  archiveExpiredAdminDoc: (params)      => ipcRenderer.invoke('archive-expired-admin-doc', params),

  // Activation / licence
  getMachineId:    ()      => ipcRenderer.invoke('get-machine-id'),
  checkLicense:    ()      => ipcRenderer.invoke('check-license'),
  activateLicense: (key)   => ipcRenderer.invoke('activate-license', key),

  // Lancement automatique au démarrage de Windows
  getAutoLaunch: ()          => ipcRenderer.invoke('get-auto-launch'),
  setAutoLaunch: (enabled)   => ipcRenderer.invoke('set-auto-launch', enabled),

  // Scanner (WIA, Windows) : lister les scanners et numériser
  listScanners: ()       => ipcRenderer.invoke('list-scanners'),
  scanDocument: (params) => ipcRenderer.invoke('scan-document', params),

  // Notifications natives (échéances de pièces qui expirent)
  showNotification: (params) => ipcRenderer.send('show-notification', params),
});
