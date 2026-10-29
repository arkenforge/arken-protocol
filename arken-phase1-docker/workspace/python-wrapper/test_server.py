from fastapi import FastAPI, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from arken_auth import ArkenAuth
import uvicorn

app = FastAPI(title="Arken Protocol Test Server - Python")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["Authorization"],
    expose_headers=["WWW-Authenticate"],
)

arken_auth = ArkenAuth()

@app.get("/")
async def root():
    return {
        "message": "Arken Protocol Test Server - Python/FastAPI",
        "info": "Try accessing /protected to test authentication"
    }

@app.get("/protected")
async def protected(did: str = Depends(arken_auth)):
    return {
        "message": "🎉 Authentication successful!",
        "authenticatedDID": did
    }

@app.exception_handler(401)
async def custom_401_handler(request, exc):
    # Return the challenge as JSON for 401 errors
    if hasattr(exc, 'detail') and isinstance(exc.detail, dict):
        return JSONResponse(
            status_code=401,
            content=exc.detail,
            headers=exc.headers if hasattr(exc, 'headers') else {}
        )
    return JSONResponse(
        status_code=401,
        content={"detail": str(exc.detail)}
    )

if __name__ == "__main__":
    print("✅ Python/FastAPI test server starting...")
    print("📍 Test the protected endpoint: curl http://localhost:8000/protected")
    uvicorn.run(app, host="0.0.0.0", port=8000)
