const express = require('express');
const app = express();
const path = require('path');
const bodyParser = require("body-parser");

const PORT = process.env.PORT || 8000;

// Modules
const server = require('./qr');
const code = require('./pair');

// Fix Global Path
const __path = process.cwd();

// Body Parser (Correct position: BEFORE routes)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Safe limit for EventEmitter
require('events').EventEmitter.defaultMaxListeners = 50;

// Serve static assets (HTML, CSS, JS)
app.use(express.static(__path));

// API Routers
app.use('/server', server);
app.use('/code', code);

// HTML Page Routes
app.get('/pair', (req, res) => {
    res.sendFile(path.join(__path, 'pair.html'));
});
app.get('/qr', (req, res) => {
    res.sendFile(path.join(__path, 'qr.html'));
});
app.get('/', (req, res) => {
    res.sendFile(path.join(__path, 'main.html'));
});

// Start Server
app.listen(PORT, () => {
    console.log(`
===================================
 MALVIN-XD Server Running Successfully
-----------------------------------
 Localhost: http://localhost:${PORT}
 Don't forget to ⭐ the GitHub Repo!
===================================`);
});

module.exports = app;