import ctypes
import json
import os
import platform
import threading
from fastapi import Request, HTTPException

BUF_SIZE = 65536  # 64 KB


class ArkenCore:
    def __init__(self, lib_path=None):
        if lib_path is None:
            lib_path = self._find_lib()

        try:
            self._lib = ctypes.CDLL(lib_path)
        except OSError as e:
            raise RuntimeError(
                f"Could not load shared library at '{lib_path}'. "
                f"Compile it with 'cargo build --release'.\n"
                f"Requires Rust: https://rustup.rs\n"
                f"Original error: {e}"
            ) from e

        # Buffer-based API — caller owns the output buffer, no free_string needed
        self._lib.generate_challenge_into.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
        self._lib.generate_challenge_into.restype  = ctypes.c_int

        self._lib.verify_request_into.argtypes = [ctypes.c_char_p, ctypes.c_char_p, ctypes.c_int]
        self._lib.verify_request_into.restype  = ctypes.c_int

        self._lock = threading.Lock()

    def _find_lib(self) -> str:
        base = os.path.join(os.path.dirname(__file__), '../rust-core/target/release')
        system = platform.system()
        if system == "Windows":
            return os.path.join(base, 'arken_core.dll')
        elif system == "Darwin":
            return os.path.join(base, 'libarken_core.dylib')
        else:
            return os.path.join(base, 'libarken_core.so')

    def _call(self, func, *args) -> dict:
        encoded = [a.encode('utf-8') for a in args]
        buf = ctypes.create_string_buffer(BUF_SIZE)
        with self._lock:
            length = func(*encoded, buf, BUF_SIZE)
        if length < 0:
            raise RuntimeError(f"arken-auth: output buffer too small (need >{BUF_SIZE} bytes)")
        return json.loads(buf.raw[:length].decode('utf-8'))

    def generate_challenge(self, statement: str = "Sign this message to prove you control this DID.") -> dict:
        return self._call(self._lib.generate_challenge_into, statement)

    def verify_request(self, auth_header: str) -> dict:
        return self._call(self._lib.verify_request_into, auth_header)


# Singleton
_core: ArkenCore | None = None
_core_lock = threading.Lock()


def get_core() -> ArkenCore:
    global _core
    if _core is None:
        with _core_lock:
            if _core is None:
                _core = ArkenCore()
    return _core


class ArkenAuth:
    def __init__(self, statement: str = "Sign this message to prove you control this DID."):
        self.statement = statement

    async def __call__(self, request: Request) -> str:
        auth_header = request.headers.get("authorization", "")

        if not auth_header.lower().startswith("signature "):
            challenge = get_core().generate_challenge(self.statement)
            raise HTTPException(
                status_code=401,
                detail=challenge,
                headers={"WWW-Authenticate": "Arken"},
            )

        result = get_core().verify_request(auth_header)
        if result.get("status") == "success":
            return result["did"]

        raise HTTPException(
            status_code=401,
            detail={"error": result.get("message", "Authentication failed")},
        )
