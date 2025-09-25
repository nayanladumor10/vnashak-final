// test_imap.js - A better script for testing the connection

// Use dotenv to load your credentials from the .env file
require('dotenv').config({ path: './env' });
const ImapClient = require('imap-simple');

const imapTls = (process.env.IMAP_TLS || 'true') === 'true';
const imapInsecure = (process.env.IMAP_INSECURE === '1');

console.log('DEBUG: IMAP config from env:');
console.log('  EMAIL_USER=', process.env.EMAIL_USER ? 'SET' : 'MISSING');
console.log('  IMAP_HOST=', process.env.IMAP_HOST || 'imap.gmail.com');
console.log('  IMAP_PORT=', process.env.IMAP_PORT || '993');
console.log('  IMAP_TLS=', imapTls);
console.log('  IMAP_INSECURE=', imapInsecure);
console.log('  Node args:', process.execArgv);
console.log('  process.version:', process.version);

const imapConfig = {
  imap: {
    user: process.env.EMAIL_USER,
    password: process.env.EMAIL_PASS,
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT || 993),
    tls: imapTls,
    authTimeout: 15000,
    tlsOptions: imapInsecure ? { rejectUnauthorized: false } : undefined
  },
};

(async () => {
  try {
    console.log(`Attempting to connect to ${imapConfig.imap.host} for user ${imapConfig.imap.user}...`);
    console.log('Using tlsOptions:', imapConfig.imap.tlsOptions ? imapConfig.imap.tlsOptions : 'default');
    const client = await ImapClient.connect(imapConfig);
    await client.openBox('INBOX');
    const results = await client.search(['UNSEEN'], { bodies: [''], struct: true });
    console.log('UNSEEN messages count:', results.length);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ FAILURE: Could not connect to IMAP server.');
    console.error('Error Details:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();