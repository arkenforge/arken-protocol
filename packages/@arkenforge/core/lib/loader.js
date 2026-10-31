'use strict';

const koffi = require('koffi');
const path = require('path');
const os = require('os');

const BUF_SIZE = 65536;

// ---------------------------------------------------------------------------
// Native library loader
// ---------------------------------------------------------------------------

function getLibPath() {
    const pkgName = `@arkenforge/core-${os.platform()}-${os.arch()}`;
    try {
        return require(pkgName);
    } catch (_) {}

    const ext = { win32: '.dll', darwin: '.dylib' }[os.platform()] ?? '.so';
    const prefix = os.platform() === 'win32' ? '' : 'lib';
    return path.join(__dirname, '..', 'bin', `${prefix}arken_core${ext}`);
}

class ArkenCore {
    constructor() {
        const libPath = getLibPath();
        try {
            const lib = koffi.load(libPath);
            this._generate      = lib.func('int generate_challenge_into(const char *statement, char *out, int cap)');
            this._verify        = lib.func('int verify_request_into(const char *header, char *out, int cap)');
            this._verifySigOnly = lib.func('int verify_signature_only_into(const char *header, char *out, int cap)');
        } catch (err) {
            throw new Error(
                `@arkenforge/core: could not load native library at ${libPath}.\n` +
                `Run 'cargo build --release' in the rust/ directory.\n` +
                `Requires Rust: https://rustup.rs\n\nOriginal error: ${err.message}`
            );
        }
    }

    _call(fn, ...args) {
        const buf = Buffer.alloc(BUF_SIZE);
        const len = fn(...args, buf, BUF_SIZE);
        if (len < 0) throw new Error('@arkenforge/core: output buffer too small');
        return JSON.parse(buf.slice(0, len).toString('utf8'));
    }

    generateChallenge(statement = 'Sign this message to prove you control this DID.') {
        return this._call(this._generate, statement);
    }

    verifyRequest(authHeader) {
        return this._call(this._verify, authHeader);
    }

    // Crypto-only verification — nonce not checked against internal store.
    // Caller manages nonce lifecycle (MemoryNonceStore or RedisNonceStore).
    verifySignatureOnly(authHeader) {
        return this._call(this._verifySigOnly, authHeader);
    }
}

let _core = null;
function getCore() {
    if (!_core) _core = new ArkenCore();
    return _core;
}

// ---------------------------------------------------------------------------
// Nonce stores
// ---------------------------------------------------------------------------

const NONCE_TTL_MS = 60_000;

class MemoryNonceStore {
    constructor() {
        this._store = new Map();
        // Sweep expired nonces every 30 seconds
        this._sweep = setInterval(() => {
            const now = Date.now();
            for (const [nonce, exp] of this._store) {
                if (exp < now) this._store.delete(nonce);
            }
        }, 30_000).unref();
    }

    async set(nonce) {
        this._store.set(nonce, Date.now() + NONCE_TTL_MS);
    }

    async consume(nonce) {
        const exp = this._store.get(nonce);
        if (!exp) return false;
        this._store.delete(nonce);
        return exp > Date.now();
    }
}

class RedisNonceStore {
    constructor(client, ttlSeconds = 60) {
        this._client = client;
        this._ttl = ttlSeconds;
    }

    async set(nonce) {
        await this._client.set(`arken:nonce:${nonce}`, '1', { EX: this._ttl });
    }

    async consume(nonce) {
        const key = `arken:nonce:${nonce}`;
        // getDel is atomic — get and delete in one round trip (Redis 6.2+).
        const val = await this._client.getDel(key);
        return val !== null;
    }
}

module.exports = { ArkenCore, MemoryNonceStore, RedisNonceStore, getCore };
