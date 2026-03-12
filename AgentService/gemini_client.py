import asyncio
import base64
import json
import websockets
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# We will use gemini-2.0-flash-exp for multimodal capabilities
MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"
client = genai.Client()

async def handle_gemini_message(response, websocket):
    """Callback to handle incoming messages from Gemini and relay to Electron."""
    try:
        # Check what kind of data came back from Gemini
        if response.server_content and response.server_content.model_turn:
            for part in response.server_content.model_turn.parts:
                if part.text:
                    print(f"🤖 Gemini: {part.text}")
                    # Forward text to Electron frontend
                    await websocket.send(json.dumps({
                        "type": "agent_text",
                        "data": part.text
                    }))
                elif part.inline_data:
                    # Audio data will be processed here in Phase 4
                    pass
    except Exception as e:
        print(f"Error handling Gemini response: {e}")

async def receive_from_gemini(session, websocket):
    """Continuously receives messages from Gemini and passes them to the handler."""
    print("Listening for Gemini responses...")
    try:
        async for response in session.receive():
            await handle_gemini_message(response, websocket)
    except asyncio.CancelledError:
        print("Gemini receive loop cancelled.")
    except Exception as e:
        print(f"Error receiving from Gemini: {e}")

async def start_gemini_session(websocket):
    """Starts the Gemini Session and handles the bi-directional communication with Electron."""
    print(f"Connecting to Gemini Live API ({MODEL})...")
    
    # Configure the connection to enable multimodal IO
    # The native audio models strictly require "AUDIO" to be in the requested response modalities
    config = {"response_modalities": ["AUDIO"]}
    
    try:
        # Open the Gemini Live Session
        async with client.aio.live.connect(model=MODEL, config=config) as session:
            print("Successfully connected to Gemini Live API!")
            
            # 1. Start a background task to constantly listen to Gemini
            receive_task = asyncio.create_task(
                receive_from_gemini(session, websocket)
            )
            
            # 2. Start listening to messages arriving from Electron
            try:
                async for message in websocket:
                    try:
                        data = json.loads(message)
                        
                        # Handle Text Message (Chat from user)
                        if data.get("type") == "text":
                            print(f"User text: {data['data']}")
                            await session.send_realtime_input(text=data["data"])
                        
                        # Handle Video Frames (Screen capture from Electron)
                        elif data.get("type") == "video_frame":
                            frame_data = data.get("data")
                            if frame_data:
                                # Send the JPEG frame to Gemini
                                image_bytes = base64.b64decode(frame_data)
                                await session.send_realtime_input(
                                    video=types.Blob(
                                        data=image_bytes,
                                        mime_type="image/jpeg"
                                    )
                                )
                                
                    except json.JSONDecodeError:
                        print("Received non-JSON message from Electron.")
                        
            except websockets.exceptions.ConnectionClosed as e:
                print(f"\nElectron client disconnected: {e}")
            except Exception as e:
                print(f"\nError handling Electron message: {e}")
            finally:
                # Cleanup the background listener task when Electron disconnects
                receive_task.cancel()

    except Exception as e:
        print(f"Failed to connect to Gemini Live: {e}")
        await websocket.send(json.dumps({"type": "error", "message": f"Gemini connection failed: {e}"}))
