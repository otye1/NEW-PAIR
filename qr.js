// optimized-malvin-xd.js
const { makeid } = require('./gen-id');
const express = require('express');
const QRCode = require('qrcode');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  delay,
  makeCacheableSignalKeyStore,
  Browsers
} = require("@whiskeysockets/baileys");
const { upload } = require('./mega');

// safe remove
function removeFile(FilePath) {
  try {
    if (fs.existsSync(FilePath)) fs.rmSync(FilePath, { recursive: true, force: true });
  } catch (e) { /* ignore */ }
}

// single route
router.get('/', async (req, res) => {
  const id = makeid();
  const tempDir = `./temp/${id}`;
  let qrSent = false;          // prevent duplicate QR responses
  let attempt = 0;
  const MAX_RETRIES = 3;

  async function startPairing() {
    attempt++;
    // ensure temp dir exists (useMultiFileAuthState creates files)
    try {
      const { state, saveCreds } = await useMultiFileAuthState(tempDir);

      const sock = makeWASocket({
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }))
        },
        printQRInTerminal: false,
        logger: pino({ level: "fatal" }),
        generateHighQualityLinkPreview: true,
        syncFullHistory: false,
        browser: Browsers.macOS("Desktop")
      });

      // persist creds
      sock.ev.on('creds.update', saveCreds);

      // connection update handler
      sock.ev.on("connection.update", async (update) => {
        const { connection, lastDisconnect, qr } = update;

        // 1) QR handling: send only once and only if response not yet sent
        if (qr && !qrSent && !res.headersSent) {
          try {
            const buf = await QRCode.toBuffer(qr, { type: 'png', margin: 1, width: 300 });
            res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
            res.end(buf);
            qrSent = true;
          } catch (e) {
            // fallback JSON error
            if (!res.headersSent) res.status(500).send({ error: 'QR generation error' });
            qrSent = true;
          }
        }

        // 2) On open: upload session and send messages
        if (connection === "open") {
          try {
            await delay(1200);

            const credsPath = `${tempDir}/creds.json`;
            if (!fs.existsSync(credsPath)) {
              console.warn('creds.json not found after open');
            } else {
              // upload to mega
              const megaUrl = await upload(fs.createReadStream(credsPath), `${sock.user.id}.json`);
              const string_session = megaUrl.replace('https://mega.nz/file/', '');
              const md = "malvin~" + string_session;

              // send session id then description (quote session message)
              const sessionMsg = await sock.sendMessage(sock.user.id, { text: md }).catch(() => null);

              const desc = `*Hey there, MALVIN-XD User!* 👋🏻

Thanks for using *MALVIN-XD* — your session has been successfully created!

🔐 *Session ID:* Sent above  
⚠️ *Keep it safe!* Do NOT share this ID with anyone.

——————

*✅ Stay Updated:*  
Join our official WhatsApp Channel:  
https://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A

*💻 Source Code:*  
Fork & explore the project on GitHub:  
https://github.com/XdKing2/MALVIN-XD

——————

> *© Powered by Malvin King*
Stay cool and hack smart. ✌🏻`;

              await sock.sendMessage(sock.user.id, {
                text: desc,
                contextInfo: {
                  externalAdReply: {
                    title: "ᴍᴀʟᴠɪɴ-xᴅ 𝕮𝖔𝖓𝖓𝖊𝖈𝖙𝖊𝖉",
                    thumbnailUrl: "https://files.catbox.moe/bqs70b.jpg",
                    sourceUrl: "https://whatsapp.com/channel/0029VbA6MSYJUM2TVOzCSb2A",
                    mediaType: 1,
                    renderLargerThumbnail: true
                  }
                }
              }, sessionMsg ? { quoted: sessionMsg } : {});

            }
          } catch (err) {
            console.error('upload/send error:', err);
            // try to inform via socket user if possible
            try { await sock.sendMessage(sock.user?.id || sock.user, { text: `❌ Error: ${err.message || err}` }); } catch {}
            // if HTTP response not yet sent, send generic fallback
            if (!res.headersSent && !qrSent) {
              res.status(500).json({ error: 'Session upload failed' });
              qrSent = true;
            }
          } finally {
            // cleanup & close
            await delay(100);
            try { await sock.ws.close(); } catch {}
            removeFile(tempDir);
            console.log(`✔ ${sock.user?.id || 'unknown'} connected — exiting process`);
            // allow process manager to restart if desired
            process.exit(0);
          }
        }

        // 3) Reconnect logic on unexpected close (not unauthorized)
        if (connection === "close") {
          const statusCode = lastDisconnect?.error?.output?.statusCode;
          if (statusCode && statusCode === 401) {
            console.warn('Unauthorized (401) — will not auto-retry');
            if (!res.headersSent && !qrSent) res.status(400).json({ error: 'Unauthorized (invalid credentials)' });
            removeFile(tempDir);
            try { await sock.ws.close(); } catch {}
            return;
          }

          // allow a few retries
          if (attempt < MAX_RETRIES) {
            console.log(`Connection closed — retrying (${attempt}/${MAX_RETRIES})`);
            // small delay then restart pairing
            await delay(800);
            try { await sock.ws.close(); } catch {}
            startPairing();
          } else {
            console.error('Max retries reached — aborting');
            if (!res.headersSent && !qrSent) res.status(503).json({ error: 'Service Unavailable (retries exhausted)' });
            removeFile(tempDir);
            try { await sock.ws.close(); } catch {}
          }
        }
      });

    } catch (err) {
      console.error('Pairing failed:', err);
      removeFile(tempDir);
      if (!res.headersSent) res.status(503).json({ code: "❗ Service Unavailable" });
    }
  }

  // fire it
  startPairing();
});

// Optional: keepalive restart removed from hot loop. If you still want auto-restart every 30m,
// run the process under PM2 with max memory/time restarts instead of an in-app setInterval.

module.exports = router;