/**
 * Outil pour VOUS (l'éditeur du logiciel) — PAS pour vos clients.
 *
 * Utilisation :
 *   node generate-key.js XXXX-XXXX-XXXX-XXXX
 *
 * Où "XXXX-XXXX-XXXX-XXXX" est l'identifiant machine affiché par l'application
 * chez le client (écran d'activation). Le programme affiche la clé
 * d'activation correspondante à donner au client.
 *
 * ⚠️ La constante LICENSE_SECRET ci-dessous DOIT être strictement identique
 * à celle définie dans main.js, sinon les clés générées ne fonctionneront pas.
 */

const crypto = require('crypto');

const LICENSE_SECRET = 'GP-BTP-2026-CHANGE-MOI';

function computeExpectedKey(machineId) {
  const h = crypto.createHmac('sha256', LICENSE_SECRET).update(machineId).digest('hex').toUpperCase();
  const short = h.slice(0, 20);
  return short.match(/.{1,5}/g).join('-');
}

const machineId = (process.argv[2] || '').trim().toUpperCase();

if (!machineId) {
  console.log('Usage : node generate-key.js <IDENTIFIANT_MACHINE>');
  process.exit(1);
}

console.log('Identifiant machine : ' + machineId);
console.log('Clé d\'activation   : ' + computeExpectedKey(machineId));
