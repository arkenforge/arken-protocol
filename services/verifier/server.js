/**
 * Arken hosted verifier
 *
 * POST /verify   { header: "Signature did=...,nonce=...,signature=..." }
 *              → { valid: true, did: "did:key:zQ3s…" }
 *
 * Teams that don't want to run the Rust binary call this endpoint instead.
 * Metered at $0.001/verification.
 *
 * Deploy:
 *   fly deploy   (see fly.toml)
 */

'use strict';

const express = require('express');
const { ArkenCore, MemoryNonceStore } = require('arken-auth');

const app = express();
app.use(express.json());

const core = new ArkenCore();
const store = new MemoryNonceStore();

// ---------------------------------------------------------------------------
// POST /verify
//
// Body: { header: "Signature did=\"...\",nonce=\"...\",signature=\"...\"" }
// Response: { valid: true, did: "did:key:zQ3s…" }
//        or { valid: false, error: "Invalid or expired nonce" }
// ---------------------------------------------------------------------------

app.post('/verify', async (req, res) => {
    const { header } = req.body ?? {};

    if (!header || typeof header !== 'string') {
        return res.status(400).json({ error: 'Missing required field: header' });
    }

    try {
        const result = core.verifySignatureOnly(header);

        if (result.status !== 'success') {
            return res.json({ valid: false, error: result.message });
        }

        // Consume the nonce — single-use enforcement
        const valid = await store.consume(result.nonce);
        if (!valid) {
            return res.json({ valid: false, error: 'Invalid or expired nonce' });
        }

        return res.json({ valid: true, did: result.did });
    } catch (err) {
        console.error('[verifier] error:', err.message);
        return res.status(500).json({ error: 'Verification failed' });
    }
});

// ---------------------------------------------------------------------------
// POST /challenge
//
// Issues a nonce. Clients call this before signing.
// Body: { statement?: "..." }
// Response: { challenge: { nonce: "...", statement: "..." } }
// ---------------------------------------------------------------------------

app.post('/challenge', async (req, res) => {
    const { statement = 'Sign this message to prove you control this DID.' } = req.body ?? {};
    const crypto = require('crypto');
    const nonce = crypto.randomBytes(16).toString('hex');
    await store.set(nonce);
    return res.json({ challenge: { nonce, statement } });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
    console.log(`arken-verifier listening on port ${PORT}`);
});
