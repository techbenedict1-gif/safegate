#!/usr/bin/env node
/* Sends one plain test email so you know feedback emails will arrive. Usage: set -a; . ~/.sg_mail; set +a; node tools/mail-test.js */
const Mail = require('../mail.js');
if (!Mail.configured()) { console.log('Email is not set up yet. Run: bash ~/safegate-live/deploy/termux-email-setup.sh'); process.exit(1); }
Mail.send({ to: Mail.cfg().to, subject: 'SafeGate test email', text: 'If you can read this, SafeGate feedback will reach you as a normal email.\n\nSent ' + new Date().toISOString() })
  .then(() => console.log('Sent to ' + Mail.cfg().to + '. Check your inbox (and Spam, once).'), (e) => { console.log('Could not send: ' + e.message + '\nCheck the Gmail address and the 16-letter App password.'); process.exit(1); });
