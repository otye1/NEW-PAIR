const { makeid } = require('./gen-id');
const express = require('express');
const fs = require('fs');
let router = express.Router();
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    Browsers,
    makeCacheableSignalKeyStore
} = require('@whiskeysockets/baileys');
const { upload } = require('./mega');

// ===== Delete Temp Folder =====
function removeFile(path) {
    try {
        if (fs.existsSync(path)) {
            fs.rmSync(path, { recursive: true, force: true });
        }
    } catch {}
}

router.get('/', async (req, res) => {

    const id = makeid();
    let number = req.query.number;

    async function CYPHER() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/' + id);

        try {
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(
                        state.keys,
                        pino({ level: "fatal" })
                    )
                },
                printQRInTerminal: false,
                generateHighQualityLinkPreview: true,
                logger: pino({ level: "fatal" }),
                syncFullHistory: false,
                browser: Browsers.macOS("Safari")
            });

            sock.ev.on("creds.update", saveCreds);

            // ===== Send Pairing Code =====
            if (!sock.authState.creds.registered) {
                await delay(1200);

                number = number.replace(/[^0-9]/g, '');

                const code = await sock.requestPairingCode(number);

                if (!res.headersSent) {
                    res.send({ code });
                }
            }

            // ===== Connection Updates =====
            sock.ev.on("connection.update", async (update) => {
                const { connection, lastDisconnect } = update;

                if (connection === "open") {

                    await delay(3000);

                    const sessionPath = `./temp/${id}/creds.json`;
                    if (!fs.existsSync(sessionPath)) return;

                    try {
                        const uploadedURL = await upload(
                            fs.createReadStream(sessionPath),
                            `${sock.user.id}.json`
                        );

                        const stringSession = uploadedURL.replace("https://mega.nz/file/", "");
                        const finalSession = "cypher~" + stringSession;

                        // Send session
                        const msg = await sock.sendMessage(sock.user.id, { text: finalSession });

                        // Send info text
                        await sock.sendMessage(sock.user.id, {
                            text: `*Hey there, CYPHER SESSION User!* 👋🏻

Your session has been successfully created and is sent above.  

🔐 *Important:*  
Keep this Session ID safe — do NOT share it.

———————
© Powered by CYPHER`,
                            contextInfo: {
                                externalAdReply: {
                                    title: "CYPHER SESSION",
                                    thumbnailUrl: "https://files.catbox.moe/1i3gi4.jpg",
                                    mediaType: 1,
                                    renderLargerThumbnail: true
                                }
                            }
                        }, { quoted: msg });

                    } catch (err) {
                        await sock.sendMessage(sock.user.id, {
                            text: "❌ Error: " + err
                        });
                    }

                    await delay(100);
                    await sock.ws.close();

                    removeFile('./temp/' + id);

                    console.log("✔ Session created for:", sock.user.id);
                    process.exit();
                }

                // Auto retry (but not on invalid session)
                if (connection === "close" &&
                    lastDisconnect?.error?.output?.statusCode !== 401) {
                    CYPHER();
                }
            });

        } catch (e) {
            console.log("⚠ Service restarted due to error.");
            removeFile('./temp/' + id);
            if (!res.headersSent) res.send({ code: "❗ Service Unavailable" });
        }
    }

    return await CYPHER();
});

module.exports = router;