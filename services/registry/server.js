/**
 * Arken discovery registry
 *
 * Lists APIs and MCP servers that accept arken-auth.
 * Agents use this to discover what they can connect to.
 *
 * GET  /api/registry           — list all entries
 * GET  /api/registry/:id       — get one entry by id
 * POST /api/registry/submit    — submit a new server for review
 */

'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(express.json());

// DATA_DIR defaults to the service directory.
// In production (Fly.io), mount a persistent volume and set DATA_DIR to its path
// so pending.json survives container restarts.
// e.g. fly volumes create arken_registry_data --size 1 --region iad
//      [mounts] source = "arken_registry_data", destination = "/data"
//      DATA_DIR=/data
const DATA_DIR = process.env.DATA_DIR ?? __dirname;

const REGISTRY_FILE = path.join(__dirname, 'registry.json');   // shipped with code — read-only
const PENDING_FILE  = path.join(DATA_DIR, 'pending.json');     // written at runtime — needs persistence

if (!process.env.DATA_DIR) {
    console.warn('[registry] WARNING: DATA_DIR not set. pending.json will be lost on container restart. Set DATA_DIR to a persistent volume path.');
}

function loadRegistry() {
    return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8'));
}

function loadPending() {
    if (!fs.existsSync(PENDING_FILE)) return [];
    return JSON.parse(fs.readFileSync(PENDING_FILE, 'utf8'));
}

function savePending(entries) {
    fs.writeFileSync(PENDING_FILE, JSON.stringify(entries, null, 2));
}

// ---------------------------------------------------------------------------
// GET /api/registry
// Returns all approved entries. Supports ?type=mcp|api filter.
// ---------------------------------------------------------------------------

app.get('/api/registry', (req, res) => {
    const entries = loadRegistry();
    const { type } = req.query;
    const filtered = type ? entries.filter(e => e.type === type) : entries;
    res.json({ count: filtered.length, entries: filtered });
});

// ---------------------------------------------------------------------------
// GET /api/registry/:id
// ---------------------------------------------------------------------------

app.get('/api/registry/:id', (req, res) => {
    const entries = loadRegistry();
    const entry = entries.find(e => e.id === req.params.id);
    if (!entry) return res.status(404).json({ error: 'Not found' });
    res.json(entry);
});

// ---------------------------------------------------------------------------
// POST /api/registry/submit
// Adds to pending queue for manual review before going live.
// Body: { name, description, url, type, tools? }
// ---------------------------------------------------------------------------

app.post('/api/registry/submit', (req, res) => {
    const { name, description, url, type } = req.body ?? {};

    if (!name || !url || !type) {
        return res.status(400).json({ error: 'Required: name, url, type' });
    }

    if (!['mcp', 'api'].includes(type)) {
        return res.status(400).json({ error: 'type must be "mcp" or "api"' });
    }

    const submission = {
        id: crypto.randomBytes(6).toString('hex'),
        name,
        description: description ?? '',
        url,
        type,
        auth: 'arken-auth',
        tools: req.body.tools ?? [],
        submitted: new Date().toISOString(),
        status: 'pending',
    };

    const pending = loadPending();
    pending.push(submission);
    savePending(pending);

    res.status(202).json({
        message: 'Submitted for review. We\'ll be in touch.',
        id: submission.id,
    });
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
    console.log(`arken-registry listening on port ${PORT}`);
});
