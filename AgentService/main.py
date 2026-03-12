import asyncio
import websockets
import json

async def echo_handler(websocket):
    print("New client connected!")
    try:
        async for message in websocket:
            print(f"Received message from client: {message}")
            
            # Simple Echo Response
            response = {"type": "echo", "message": f"Server received: {message}"}
            await websocket.send(json.dumps(response))
            print(f"Sent echo back to client: {response}")
            
    except websockets.exceptions.ConnectionClosed as e:
        print(f"Client disconnected: {e}")
    except Exception as e:
        print(f"Error handling message: {e}")

async def main():
    print("Starting Phase 1 WebSocket Echo Server on ws://localhost:8000...")
    async with websockets.serve(echo_handler, "localhost", 8000):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
