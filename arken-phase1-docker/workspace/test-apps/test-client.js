#!/usr/bin/env node
/**
 * Arken Protocol - Test Client
 * Simulates a client authenticating using the a401 flow.
 * Generates spec-compliant did:key:z... DIDs (multibase encoded secp256k1).
 */

const { ethers } = require('ethers');
const bs58 = require('bs58');

function walletToDidKey(wallet) {
    const signingKey = new ethers.utils.SigningKey(wallet.privateKey);
    // compressedPublicKey is "0x02..." or "0x03..." (33 bytes with 0x prefix)
    const keyBytes = Buffer.from(signingKey.compressedPublicKey.slice(2), 'hex');

    // Prepend secp256k1-pub multicodec [0xe7, 0x01]
    const multicodecKey = Buffer.concat([Buffer.from([0xe7, 0x01]), keyBytes]);

    // Base58btc encode, prepend 'z' (multibase indicator)
    return `did:key:z${bs58.encode(multicodecKey)}`;
}

async function testArkenAuth(serverUrl) {
    console.log(`\nTesting Arken Authentication against: ${serverUrl}`);
    console.log('='.repeat(60));

    // Step 1: Create a wallet and derive a proper did:key
    const wallet = ethers.Wallet.createRandom();
    const did = walletToDidKey(wallet);

    console.log(`\n[1] Generated DID: ${did}`);

    // Step 2: Request the protected resource — expect 401 + challenge
    console.log(`\n[2] Requesting protected resource...`);
    let response = await fetch(serverUrl);

    if (response.status !== 401) {
        console.error(`FAIL: Expected 401, got ${response.status}`);
        return false;
    }

    const challengeData = await response.json();
    const { nonce, statement } = challengeData.challenge;

    console.log(`    Challenge received`);
    console.log(`    Nonce: ${nonce}`);
    console.log(`    Statement: ${statement}`);

    // Step 3: Sign the nonce
    console.log(`\n[3] Signing nonce...`);
    const signature = await wallet.signMessage(ethers.utils.toUtf8Bytes(nonce));
    console.log(`    Signature: ${signature.substring(0, 22)}...`);

    // Step 4: Send signed authentication
    console.log(`\n[4] Sending signed authentication...`);
    const authHeader = `Signature did="${did}",nonce="${nonce}",signature="${signature}"`;

    response = await fetch(serverUrl, {
        headers: { 'Authorization': authHeader }
    });

    if (response.status === 200) {
        const data = await response.json();
        console.log(`\nAUTHENTICATION SUCCESSFUL`);
        console.log(`    Authenticated DID: ${data.authenticatedDID}`);
        return true;
    } else {
        const errorText = await response.text();
        console.error(`\nAUTHENTICATION FAILED (${response.status}): ${errorText}`);
        return false;
    }
}

const serverUrl = process.argv[2] || 'http://localhost:3000/protected';
testArkenAuth(serverUrl)
    .then(ok => {
        console.log('\n' + '='.repeat(60));
        process.exit(ok ? 0 : 1);
    })
    .catch(err => {
        console.error('Error:', err.message);
        process.exit(1);
    });
