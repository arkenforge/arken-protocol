const express = require('express');
const path = require('path');
const { arkenAuth } = require('./arken-auth');

const app = express();
const PORT = process.env.PORT || 3001;

// Serve the demo UI
app.use(express.static(path.join(__dirname, '../public')));

// Protected route — requires a valid a401 signature
app.get('/protected', arkenAuth(), (req, res) => {
    res.json({
        status: 'success',
        message: 'Authentication successful',
        did: req.user.did,
        timestamp: new Date().toISOString(),
    });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Demo:      http://localhost:${PORT}/`);
    console.log(`Protected: http://localhost:${PORT}/protected`);
});
