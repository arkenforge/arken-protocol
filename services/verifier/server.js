/**
 * Arken hosted verifier
 *
 * POST /challenge  → { challenge: { nonce, statement } }
 * POST /verify     → { valid: true, did: "did:key:zQ3s…" }
 *
 * Teams that don't want to run the Rust binary call these endpoints instead.
 * Metered at $0.001/verification.
 *
 * Multi-instance: set REDIS_URL to share nonce state across instances.
 * Single instance: omit REDIS_URL — uses in-memory store.
 *
 * Deploy:
 *   fly deploy   (see fly.toml)
 */

'use strict';

const crypto = require('crypto');
const express = require('express');
const { ArkenCore, MemoryNonceStore, RedisNonceStore } = require('arken-auth');

const app = express();
app.use(express.json());

const core = new ArkenCore();

// ---------------------------------------------------------------------------
// Nonce store — Redis if REDIS_URL is set, otherwise in-memory.
// In-memory does not work correctly behind a load balancer.
// ---------------------------------------------------------------------------

async function buildStore() {
    if (process.env.REDIS_URL) {
        const { createClient } = require('redis');
        const client = createClient({ url: process.env.REDIS_URL });
        client.on('error', err => console.error('[verifier] Redis error:', err.message));
        await client.connect();
        console.log('[verifier] Using Redis nonce store');
        return new RedisNonceStore(client);
    }
    console.warn('[verifier] WARNING: Using in-memory nonce store. Set REDIS_URL for multi-instance deployments.');
    return new MemoryNonceStore();
}

// ---------------------------------------------------------------------------
// POST /challenge
//
// Issues a nonce the client must sign before calling /verify.
// Body: { statement?: "..." }
// Response: { challenge: { nonce: "...", statement: "..." } }
// ---------------------------------------------------------------------------

app.post('/challenge', async (req, res) => {
    const { statement = 'Sign this message to prove you control this DID.' } = req.body ?? {};
    const nonce = crypto.randomBytes(16).toString('hex');
    await app.locals.store.set(nonce);
    return res.json({ challenge: { nonce, statement } });
});

// ---------------------------------------------------------------------------
// POST /verify
//
// Body: { header: "Signature did=\"...\",nonce=\"...\",signature=\"...\"" }
// Response: { valid: true, did: "did:key:zQ3s…" }
//        or { valid: false, error: "..." }
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

        const valid = await app.locals.store.consume(result.nonce);
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
// GET /health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const PORT = process.env.PORT || 8080;

buildStore().then(store => {
    app.locals.store = store;
    app.listen(PORT, () => {
        console.log(`arken-verifier listening on port ${PORT}`);
    });
}).catch(err => {
    console.error('[verifier] startup failed:', err.message);
    process.exit(1);
});
