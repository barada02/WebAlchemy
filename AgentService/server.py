import asyncio
import websockets
import json
import base64
import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

# Load environment variables
load_dotenv()

API_KEY = os.environ.get("GEMINI_API_KEY")
if not API_KEY:
    raise ValueError("GEMINI_API_KEY is missing from .env")

# The model must match what is supported for Live API. We read from .env.
MODEL = os.environ.get("MODEL", "gemini-2.5-flash-native-audio-preview-12-2025")

client = genai.Client(api_key=API_KEY)

async def gemini_session_handler(websocket):
    # Configure Gemini Live API to respond with Audio
    config = {"response_modalities": ["AUDIO"]}
    
    # Establish connection with Gemini Live API
    async with client.aio.live.connect(model=MODEL, config=config) as session:
        print("Connected to Gemini Live API session")
        
        async def receive_from_client():
            """Listen for binary streams from Electron client and forward to Gemini."""
            try:
                async for message in websocket:
                    if isinstance(message, bytes):
                        marker = message[0]
                        data = message[1:]
                        if marker == 0:
                            # Marker 0: Video frame string (JPEG) sent from canvas
                            await session.send_realtime_input(
                                video=types.Blob(
                                    data=data,
                                    mime_type="image/jpeg"
                                )
                            )
                        elif marker == 1:
                            # Marker 1: Audio PCM block from microphone
                            await session.send_realtime_input(
                                audio=types.Blob(
                                    data=data,
                                    mime_type="audio/pcm;rate=16000"
                                )
                            )
                    elif isinstance(message, str):
                        # Catch-all for text messages (if any)
                        try:
                            msg_json = json.loads(message)
                            if msg_json.get("type") == "text":
                                await session.send_realtime_input(text=msg_json["data"])
                        except json.JSONDecodeError:
                            pass
                            
            except websockets.exceptions.ConnectionClosed:
                print("Client disconnected from WebSocket.")
            except Exception as e:
                print(f"Error receiving from client: {e}")

        async def receive_from_gemini():
            """Listen to Gemini responses and stringify to send to Electron client."""
            try:
                async for response in session.receive():
                    server_content = response.server_content
                    if server_content is not None:
                        # Forward audio chunks 
                        if server_content.model_turn:
                            for part in server_content.model_turn.parts:
                                if part.inline_data:
                                    # Gemini audio is raw PCM 24kHz
                                    audio_data = part.inline_data.data
                                    b64_audio = base64.b64encode(audio_data).decode("utf-8")
                                    await websocket.send(json.dumps({
                                        "type": "agent_audio",
                                        "data": b64_audio
                                    }))
                        
                        # Forward user transcription (What Gemini heard)
                        if server_content.input_transcription:
                            await websocket.send(json.dumps({
                                "type": "transcription",
                                "role": "user",
                                "data": server_content.input_transcription.text
                            }))
                            
                        # Forward assistant transcription (What Gemini said)
                        if server_content.output_transcription:
                            await websocket.send(json.dumps({
                                "type": "transcription",
                                "role": "model",
                                "data": server_content.output_transcription.text
                            }))
                            
            except Exception as e:
                print(f"Error receiving from Gemini: {e}")
                # Send error to UI
                try:
                    await websocket.send(json.dumps({"type": "error", "message": str(e)}))
                except:
                    pass

        # Concurrently route client data to Gemini, and Gemini data to client
        client_task = asyncio.create_task(receive_from_client())
        gemini_task = asyncio.create_task(receive_from_gemini())
        
        done, pending = await asyncio.wait(
            [client_task, gemini_task],
            return_when=asyncio.FIRST_COMPLETED
        )
        
        # Cleanup
        for t in pending:
            t.cancel()
        print("Live Session loop terminated.")

async def ws_handler(websocket):
    print("New websocket connection from Browser Client.")
    try:
        await gemini_session_handler(websocket)
    except Exception as e:
        print(f"Failed to handle gemini session: {e}")

async def main():
    print("Starting WebSocket Server on ws://localhost:8000...")
    async with websockets.serve(ws_handler, "localhost", 8000):
        await asyncio.Future()  # keep the server running forever

if __name__ == "__main__":
    asyncio.run(main())
