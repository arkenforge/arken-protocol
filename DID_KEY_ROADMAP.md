# DID Key Type Support - Architecture & Roadmap

## Phase 1: Current Implementation (secp256k1 only)

### What's Supported
- **Key Type**: secp256k1 (Ethereum/Bitcoin ECDSA)
- **DID Format**: `did:key:z...` where z-prefix indicates multibase encoding
- **Multicodec**: `0xe7` (secp256k1-pub compressed)
- **Signature Algorithm**: ECDSA with recoverable signatures

### Technical Implementation
```
did:key:zQ3shZc2QzApp2oymGvQbzP8eKheVshBHbU4ZYjeXqwSKEn6N
        ↓
1. Strip "did:key:" prefix
2. Decode multibase (base58btc, starts with 'z')
3. Extract multicodec prefix (0xe7 for secp256k1)
4. Verify multicodec matches expected type
5. Extract 33-byte compressed public key
6. Verify ECDSA signature using ethers
```

### Why This Scope?
- ✅ Covers 90%+ of Web3 use cases (Ethereum, Bitcoin, Polygon, etc.)
- ✅ Simple, single dependency (ethers)
- ✅ No dependency conflicts
- ✅ Production-ready for target audience

### Limitations
- ❌ Does not support ed25519 (Solana, Cardano)
- ❌ Does not support RSA
- ❌ Does not support other curves (P-256, P-384, etc.)

---

## Phase 2+: Multi-Key-Type Support

### Additional Key Types to Support

#### 1. **ed25519** (Priority: HIGH)
- **Multicodec**: `0xed` (ed25519-pub)
- **Use Cases**: Solana, Cardano, Polkadot, Tezos
- **Why**: Second most common in Web3
- **Library**: `ed25519-dalek` or `ring`
- **Signature Format**: Ed25519 (different from ECDSA)

#### 2. **secp256k1 Uncompressed** (Priority: MEDIUM)
- **Multicodec**: `0xe8` (secp256k1-pub uncompressed)
- **Use Cases**: Some older Bitcoin implementations
- **Why**: Compatibility
- **Library**: Already supported by ethers (just handle 65-byte keys)

#### 3. **P-256 (secp256r1)** (Priority: LOW)
- **Multicodec**: `0x1200` (P-256 pub)
- **Use Cases**: WebAuthn, some enterprise systems
- **Library**: `p256` crate

#### 4. **RSA** (Priority: LOW)
- **Multicodec**: `0x1205` (RSA pub)
- **Use Cases**: Legacy systems, some enterprise
- **Library**: `rsa` crate

---

## Implementation Strategy for Phase 2+

### Step 1: Refactor to Key Abstraction
```rust
pub trait KeyVerifier {
    fn verify_signature(&self, message: &[u8], signature: &[u8]) -> Result<bool, Error>;
    fn multicodec(&self) -> u16;
}

pub struct Secp256k1Verifier {
    public_key: Address,
}

pub struct Ed25519Verifier {
    public_key: ed25519_dalek::PublicKey,
}

// Factory pattern
pub fn verifier_from_did(did: &str) -> Result<Box<dyn KeyVerifier>, Error> {
    let (codec, key_bytes) = parse_did_key(did)?;
    
    match codec {
        0xe7 => Ok(Box::new(Secp256k1Verifier::new(key_bytes)?)),
        0xed => Ok(Box::new(Ed25519Verifier::new(key_bytes)?)),
        _ => Err(Error::UnsupportedKeyType(codec)),
    }
}
```

### Step 2: Update Dependencies
```toml
[dependencies]
ethers = { version = "2.0", features = ["rustls"] }
ed25519-dalek = "2.0"  # For ed25519
p256 = "0.13"          # For P-256 if needed
rsa = "0.9"            # For RSA if needed
```

### Step 3: Signature Format Handling
Different key types have different signature formats:

| Key Type | Signature Format | Length | Notes |
|----------|------------------|--------|-------|
| secp256k1 | ECDSA recoverable | 65 bytes | Current implementation |
| ed25519 | Ed25519 | 64 bytes | No recovery needed |
| P-256 | ECDSA DER | Variable | Need to parse DER |
| RSA | PKCS#1 | Variable | Multiple schemes |

### Step 4: Update FFI Interface
The current FFI interface is agnostic:
```rust
pub extern "C" fn verify_request(auth_header_ptr: *const c_char) -> *mut c_char
```

It accepts a DID string, so no FFI changes needed. The abstraction happens internally.

### Step 5: Update Test Suite
Add test vectors for each key type:
```rust
#[test]
fn test_secp256k1_verification() { ... }

#[test]
fn test_ed25519_verification() { ... }

#[test]
fn test_p256_verification() { ... }
```

---

## Migration Path (No Breaking Changes)

### Current (Phase 1)
```rust
// Hardcoded to secp256k1
let public_key = parse_did_key_secp256k1(did)?;
verify_ecdsa_signature(public_key, nonce, signature)?;
```

### Future (Phase 2+)
```rust
// Factory pattern, zero breaking changes
let verifier = verifier_from_did(did)?;
verifier.verify_signature(nonce.as_bytes(), &signature)?;
```

**External API stays identical:**
- Node.js wrapper: No changes needed
- Python wrapper: No changes needed
- Test client: No changes needed
- Server code: No changes needed

---

## Testing Strategy

### Phase 1 Tests
- ✅ Valid secp256k1 did:key verification
- ✅ Invalid signature rejection
- ✅ Expired nonce rejection
- ✅ Malformed DID rejection

### Phase 2+ Tests (Per Key Type)
- Valid signature verification
- Invalid signature rejection
- Malformed key rejection
- Cross-key-type isolation (ed25519 sig doesn't verify on secp256k1 key)
- Multicodec validation

### Integration Tests
- Test client creates wallet for each key type
- Full authentication flow for each type
- Mixed key types in same server instance

---

## Performance Considerations

### Phase 1 (Single Key Type)
- **Fast**: Single dependency, optimized path
- **Small**: ~2MB compiled library

### Phase 2+ (Multi Key Type)
- **Slightly Slower**: Factory pattern overhead (negligible)
- **Larger**: +5-10MB for additional crypto libraries
- **Optimizable**: Can use feature flags to compile only needed types

### Optimization Strategy
```toml
[features]
default = ["secp256k1"]
secp256k1 = ["ethers"]
ed25519 = ["ed25519-dalek"]
p256 = ["p256"]
all-key-types = ["secp256k1", "ed25519", "p256"]
```

Users can choose which key types to compile.

---

## Security Considerations

### Phase 1
- ✅ Single, well-audited crypto library (ethers/k256)
- ✅ Smaller attack surface
- ✅ Easier to audit

### Phase 2+
- ⚠️ Multiple crypto libraries to audit
- ⚠️ More complex key handling logic
- ⚠️ Cross-library compatibility testing needed
- ✅ Each library independently audited
- ✅ Factory pattern isolates implementations

### Mitigation
1. Only add widely-used, audited crypto libraries
2. Comprehensive test suite for each key type
3. Fuzzing tests for multicodec parsing
4. Regular dependency updates
5. Professional security audit after Phase 2 implementation

---

## Timeline Recommendation

**Phase 1** (Current): ✅ Complete
- secp256k1 support
- Production-ready for Ethereum ecosystem

**Phase 1.5** (Optional - Before Phase 2): 3-5 days
- Add ed25519 support
- Covers 95%+ of crypto use cases
- Low risk, high value

**Phase 2** (After wallet MVP): 1-2 weeks
- Full multi-key-type refactor
- Support for P-256, RSA if needed
- Comprehensive test suite
- Security audit

**Phase 3+**: As needed
- Add new key types based on user demand
- Optimize with feature flags
- Advanced DID methods (did:ethr, did:web, etc.)

---

## Decision Log

### Why Start with secp256k1 Only?

**Pros:**
- ✅ Simplest implementation (single dependency)
- ✅ Covers primary use case (Ethereum/Web3)
- ✅ No dependency conflicts
- ✅ Faster to market with Phase 1
- ✅ Can add more key types without breaking changes

**Cons:**
- ❌ Doesn't support Solana users (ed25519)
- ❌ Requires refactor for multi-key support

**Decision:** Start with secp256k1, add ed25519 early in Phase 2.

### Why Not Use Full `ssi` Library?

**Pros of `ssi`:**
- ✅ Full DID resolution
- ✅ Multiple key types built-in
- ✅ Specification-compliant

**Cons of `ssi`:**
- ❌ Dependency conflicts with ethers
- ❌ Large dependency tree
- ❌ Overkill for Phase 1 (we only need did:key)
- ❌ Not production-ready (v0.6.0 has breaking bugs)

**Decision:** Manual did:key parsing for Phase 1, evaluate `ssi` later when it's more mature.

---

## References

- [DID Key Specification](https://w3c-ccg.github.io/did-method-key/)
- [Multicodec Table](https://github.com/multiformats/multicodec/blob/master/table.csv)
- [Multibase Specification](https://github.com/multiformats/multibase)
- [secp256k1 Curve](https://en.bitcoin.it/wiki/Secp256k1)
- [Ed25519 Specification](https://ed25519.cr.yp.to/)

---

**Status**: Phase 1 (secp256k1 only) - In Development  
**Next Review**: After Phase 1 validation, before Phase 2 wallet development  
**Owner**: Arken Protocol Team  
**Last Updated**: 2026-01-04
