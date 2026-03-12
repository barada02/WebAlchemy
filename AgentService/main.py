import asyncio
import websockets
import json
import base64
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

MODEL = "models/gemini-2.5-flash-native-audio-preview-12-2025"

async def handle_gemini_message(response, websocket):
    """Callback to handle incoming messages from Gemini and relay to Electron."""
    try:
        # Check what kind of data came back. It could be text or audio.
        if response.server_content and response.server_content.model_turn:
            for part in response.server_content.model_turn.parts:
                if part.text:
                    print(f"🤖 Gemini: {part.text}")
                    # Forward text to Electron
                    await websocket.send(json.dumps({
                        "type": "agent_text",
                        "data": part.text
                    }))
                elif part.inline_data:
                    # In Phase 4, this is where we will handle the audio bytes (pcm)
                    # print("Audio data received.")
                    pass
    except Exception as e:
        print(f"Error handling Gemini response: {e}")

async def echo_handler(websocket):
    print("New client connected from Electron.")
    
    # Initialize the GenAI Client
    client = genai.Client()
    
    # Configure the connection to enable multimodal IO
    config = {"response_modalities": ["AUDIO", "TEXT"]}

    print(f"Connecting to Gemini Live API ({MODEL})...")
    
    try:
        # We MUST use async with because it's an async context manager
        async with client.aio.live.connect(model=MODEL, config=config) as session:
            print("Successfully connected to Gemini Live API!")
            
            # Start the receive loop task in the background
            receive_task = asyncio.create_task(
                receive_from_gemini(session, websocket)
            )
            
            try:
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        
                        # Handle Text Message (Chat from user)
                        if data.get("type") == "text":
                            print(f"User text: {data['data']}")
                            await session.send_realtime_input(text=data["data"])
                        
                        # Handle Video Frames (Phase 2 & 3)
                        elif data.get("type") == "video_frame":
                            frame_data = data.get("data")
                            if frame_data:
                                # Forward frame to Gemini as JPEG bytes
                                image_bytes = base64.b64decode(frame_data)
                                await session.send_realtime_input(
                                    video=types.Blob(
                                        data=image_bytes,
                                        mime_type="image/jpeg"
                                    )
                                )
                                
                    except json.JSONDecodeError:
                        print("Received non-JSON message.")
                        
            except websockets.exceptions.ConnectionClosed as e:
                print(f"\nElectron client disconnected: {e}")
            except Exception as e:
                print(f"\nError handling message: {e}")
            finally:
                # Cleanup the background listener task
                receive_task.cancel()

    except Exception as e:
        print(f"Failed to connect to Gemini Live: {e}")
        await websocket.send(json.dumps({"type": "error", "message": f"Failed to connect to Gemini API: {e}"}))

async def receive_from_gemini(session, websocket):
    """Continuously receives messages from Gemini and passes them to the callback."""
    print("Listening for Gemini responses...")
    try:
        async for response in session.receive():
            await handle_gemini_message(response, websocket)
    except asyncio.CancelledError:
        print("Gemini receive loop cancelled.")
    except Exception as e:
        print(f"Error receiving from Gemini: {e}")

async def main():
    print("Starting Phase 3 WebSocket Bridge on ws://localhost:8000...")
    print("Waiting for Electron client. Requires GEMINI_API_KEY in environment or .env file.")
    async with websockets.serve(echo_handler, "localhost", 8000):
        await asyncio.Future()  # run forever

if __name__ == "__main__":
    asyncio.run(main())
