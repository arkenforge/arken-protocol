# Arken Auth

**Passwordless authentication for web servers. No passwords. No sessions. Nothing to breach.**

[**Live Demo →**](https://arken-auth.fly.dev) · [npm](https://npmjs.com/package/arken-auth) · [PyPI](https://pypi.org/project/arken-auth)

---

## The problem

Every auth system today asks your server to hold a secret — a password hash, a session token, an API key. That secret is a liability. It gets breached. It gets phished. It gets rotated on a schedule that nobody follows.

Arken Auth flips the model: **the user holds the secret, the server holds nothing.**

---

## How it works

```
Client                              Server
  │                                   │
  ├── GET /protected ────────────────▶│
  │                                   │ (no auth header)
  │◀── 401 { challenge: { nonce } } ──┤
  │                                   │
  │   sign(nonce, privateKey)         │
  │                                   │
  ├── GET /protected ────────────────▶│
  │   Authorization: Signature        │
  │     did="did:key:z...",           │
  │     nonce="...",                  │
  │     signature="0x..."             │
  │                                   │ recover signer from sig
  │                                   │ compare to DID pubkey
  │◀── 200 { did: "did:key:z..." } ───┤
```

1. Client requests a protected resource — server issues a one-time nonce
2. Client signs the nonce with their private key (never leaves their device)
3. Client sends the signature + their DID back to the server
4. Server recovers the signer address from the signature and checks it matches the DID
5. No password ever transmitted. No session stored. No database touched.

The cryptographic core is written in Rust and called via FFI from Node.js or Python.

---

## Quickstart — Node.js

```bash
npm install arken-auth
```

```js
const express = require('express');
const { arkenAuth } = require('arken-auth');

const app = express();

app.get('/protected', arkenAuth(), (req, res) => {
  res.json({ message: 'hello', did: req.user.did });
});
```

That's it. `arkenAuth()` handles the entire challenge-response cycle.

---

## Quickstart — Python

```bash
pip install arken-auth
```

```python
from fastapi import FastAPI, Depends
from arken_auth import ArkenAuth

app = FastAPI()
arken = ArkenAuth()

@app.get("/protected")
async def protected(did: str = Depends(arken)):
    return {"message": "hello", "did": did}
```

---

## Client-side (browser or CLI)

Any client that can sign an Ethereum message works. In the browser with ethers.js:

```js
// Generate a DID from a wallet
const wallet = ethers.Wallet.createRandom();
const did = walletToDid(wallet); // did:key:z...

// Step 1: get a challenge
const r1 = await fetch('/protected');
const { challenge: { nonce } } = await r1.json(); // 401

// Step 2: sign the nonce
const signature = await wallet.signMessage(ethers.utils.toUtf8Bytes(nonce));

// Step 3: authenticate
const r2 = await fetch('/protected', {
  headers: {
    Authorization: `Signature did="${did}",nonce="${nonce}",signature="${signature}"`
  }
});
```

---

## What makes it different

|                        | Username/Password | JWT / OAuth | WebAuthn | **Arken Auth** |
|------------------------|:-----------------:|:-----------:|:--------:|:--------------:|
| Server stores secrets  | ✗ (hash)         | ✗ (secret)  | ✓        | **✓**          |
| Works without accounts | ✗                | ✗           | ✗        | **✓**          |
| Portable identity      | ✗                | ✗           | ✗        | **✓**          |
| No JS SDK required     | ✓                | ✓           | ✗        | **✓**          |
| Language agnostic      | ✓                | ✓           | ✓        | **✓**          |
| Phishing resistant     | ✗                | ✗           | ✓        | **✓**          |

The key difference from WebAuthn: your identity (`did:key:z...`) is **portable**. It travels with you across servers, apps, and devices. A WebAuthn credential is bound to a single origin. A DID is bound to nothing but your key.

---

## Architecture

```
packages/
  arken-auth/          Node.js middleware (Express)
  arken-auth-py/       Python middleware (FastAPI)

arken-phase1-docker/workspace/
  rust-core/           Cryptographic engine (Rust)
    src/lib.rs         Challenge generation + signature verification
  node-wrapper/        Node.js FFI bindings (koffi)
  python-wrapper/      Python FFI bindings (ctypes)
  public/              Interactive demo UI
```

The Rust core exposes two functions over FFI:
- `generate_challenge_into` — generates a random nonce, stores it server-side with a 60s TTL, returns JSON
- `verify_request_into` — parses the auth header, validates the nonce, recovers the signer, checks against the DID

---

## DID format

Arken uses `did:key` with secp256k1 keys (multicodec `0xe7 0x01`), encoded as multibase base58btc (`z` prefix):

```
did:key:z[base58btc(0xe7 0x01 || compressed_pubkey)]
```

This is the [W3C DID Key Method](https://w3c-ccg.github.io/did-method-key/) spec.

---

## Requirements

- **Rust** (for building the native library): `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- Node.js ≥ 18 (for the npm package)
- Python ≥ 3.10 (for the pip package)

---

## Status

Phase 1 — working middleware for Express and FastAPI. The cryptographic core is complete and tested.

**What's next:**
- Prebuilt binaries (no Rust required to install)
- Session/token layer (optional, for stateful apps)
- `did:web` and `did:pkh` support
- Browser extension wallet

---

## License

MIT
