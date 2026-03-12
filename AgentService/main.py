import asyncio
import websockets
import json
import base64
import os

async def echo_handler(websocket):
    print("New client connected!")
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                
                # Handle Text Echo
                if data.get("type") == "text":
                    print(f"Received text message: {data['data']}")
                    response = {"type": "echo", "message": f"Server received: {data['data']}"}
                    await websocket.send(json.dumps(response))
                
                # Handle Video Frames (Phase 2)
                elif data.get("type") == "video_frame":
                    frame_data = data.get("data")
                    if frame_data:
                        # Decode and save to disk for validation
                        image_bytes = base64.b64decode(frame_data)
                        with open("latest_frame.jpg", "wb") as f:
                            f.write(image_bytes)
                        # Print only occasionally to avoid spamming the terminal
                        print("📸 Received and saved latest_frame.jpg", end="\r")
                        
            except json.JSONDecodeError:
                print("Received non-JSON message.")
                
    except websockets.exceptions.ConnectionClosed as e:
        print(f"\nClient disconnected: {e}")
    except Exception as e:
        print(f"\nError handling message: {e}")

async def main():
    print("Starting Phase 2 WebSocket Server on ws://localhost:8000...")
    print("Waiting for Electron client to connect and stream frames...")
    async with websockets.serve(echo_handler, "localhost", 8000):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
