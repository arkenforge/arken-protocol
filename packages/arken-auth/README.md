# arken-auth

Zero-storage authentication middleware for Express. No passwords. No sessions. Nothing to breach.

## Install

Requires [Rust](https://rustup.rs) — used once to compile the native crypto core.

```bash
npm install @arkenforge/arken-auth
```

## Usage

```javascript
const express = require('express');
const { arkenAuth } = require('@arkenforge/arken-auth');

const app = express();

app.get('/protected', arkenAuth(), (req, res) => {
  res.json({ user: req.user.did });
});
```

That's it. The middleware handles the full a401 challenge-response flow.

## How it works

1. First request hits your route with no `Authorization` header
2. Middleware returns `401` with a JSON challenge: `{ "challenge": { "nonce": "..." } }`
3. Client signs the nonce with their private key and resends with `Authorization: Signature did="...",nonce="...",signature="..."`
4. Middleware verifies the signature cryptographically — no database lookup needed
5. `req.user.did` is set to the authenticated DID

## Options

```javascript
arkenAuth({
  statement: 'Sign to access the API.' // shown to the user during signing
})
```

## Security model

- The server never sees a private key
- Nonces are single-use and expire after 60 seconds
- Signature verification runs in Rust (ethers/k256, audited)
- A stolen database of DID strings reveals nothing exploitable

## License

MIT
