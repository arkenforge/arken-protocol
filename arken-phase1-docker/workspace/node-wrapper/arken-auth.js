'use strict';

const koffi = require('koffi');
const path = require('path');
const os = require('os');

const BUF_SIZE = 65536; // 64 KB — plenty for any auth JSON response

function getLibPath() {
    const ext = { win32: '.dll', darwin: '.dylib' }[os.platform()] ?? '.so';
    return path.join(__dirname, '../rust-core/target/release', `libarken_core${ext}`);
}

class ArkenCore {
    constructor() {
        const libPath = getLibPath();
        try {
            const lib = koffi.load(libPath);
            this._generate = lib.func('int generate_challenge_into(const char *statement, char *out, int cap)');
            this._verify   = lib.func('int verify_request_into(const char *header, char *out, int cap)');
        } catch (err) {
            throw new Error(
                `arken-auth: could not load native library at ${libPath}.\n` +
                `Run 'cargo build --release' in the rust-core directory.\n` +
                `Requires Rust: https://rustup.rs\n\nOriginal error: ${err.message}`
            );
        }
    }

    _call(fn, ...args) {
        const buf = Buffer.alloc(BUF_SIZE);
        const len = fn(...args, buf, BUF_SIZE);
        if (len < 0) throw new Error('arken-auth: output buffer too small');
        return JSON.parse(buf.slice(0, len).toString('utf8'));
    }

    generateChallenge(statement = 'Sign this message to prove you control this DID.') {
        return this._call(this._generate, statement);
    }

    verifyRequest(authHeader) {
        return this._call(this._verify, authHeader);
    }
}

let _core = null;
function getCore() {
    if (!_core) _core = new ArkenCore();
    return _core;
}

function arkenAuth(options = {}) {
    const { statement } = options;

    return (req, res, next) => {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Signature ')) {
            try {
                const challenge = getCore().generateChallenge(statement);
                return res.status(401).json(challenge);
            } catch (err) {
                console.error('[arken-auth] challenge error:', err.message);
                return res.status(500).json({ error: 'Could not generate challenge' });
            }
        }

        try {
            const result = getCore().verifyRequest(authHeader);
            if (result.status === 'success') {
                req.user = { did: result.did };
                return next();
            }
            return res.status(401).json({ error: result.message });
        } catch (err) {
            console.error('[arken-auth] verify error:', err.message);
            return res.status(500).json({ error: 'Verification failed' });
        }
    };
}

module.exports = { arkenAuth, ArkenCore };
