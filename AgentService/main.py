import asyncio
import websockets
from gemini_client import start_gemini_session

async def connection_handler(websocket):
    print("New client connected from Electron.")
    
    # Hand off the websocket connection entirely to the Gemini Client module
    await start_gemini_session(websocket)

async def main():
    print("Starting Phase 3 WebSocket Bridge on ws://localhost:8000...")
    print("Waiting for Electron client. Requires GEMINI_API_KEY in environment or .env file.")
    
    async with websockets.serve(connection_handler, "localhost", 8000):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
