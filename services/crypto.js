/* ========================================
   AES-256 Encrypt/Decrypt for Google passwords
   ======================================== */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const KEY = crypto.scryptSync(process.env.SESSION_SECRET || 'credit-flow-default-secret', 'salt', 32);

function encrypt(text) {
    if (!text) return '';
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(encryptedText) {
    if (!encryptedText) return '';
    try {
        const [ivHex, tagHex, dataHex] = encryptedText.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const tag = Buffer.from(tagHex, 'hex');
        const encrypted = Buffer.from(dataHex, 'hex');
        const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
        decipher.setAuthTag(tag);
        return decipher.update(encrypted, null, 'utf8') + decipher.final('utf8');
    } catch {
        return '';
    }
}

module.exports = { encrypt, decrypt };
