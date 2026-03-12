import asyncio
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv

load_dotenv()

# We will use the recommended experimental model for Multimodal Live API
MODEL = "gemini-2.5-flash-native-audio-preview-12-2025"

class GeminiLiveClient:
    def __init__(self):
        # Initialize the GenAI client. It will automatically pick up GEMINI_API_KEY from the environment.
        self.client = genai.Client()
        self.session = None

    async def connect(self):
        """Establishes a connection to the Gemini Multimodal Live API."""
        print(f"Connecting to Gemini Live API ({MODEL})...")
        
        # Configure the connection to enable multimodal IO
        config = types.LiveConnectConfig(
            response_modalities=[types.Modality.AUDIO, types.Modality.TEXT]
        )

        try:
            # client.aio.live.connect returns an async context manager
            self.session = await self.client.aio.live.connect(model=MODEL, config=config)
            print("Successfully connected to Gemini Live API!")
            return self.session
        except Exception as e:
            print(f"Failed to connect to Gemini Live: {e}")
            self.session = None
            return None

    async def send_text(self, text: str):
        """Sends a text message to Gemini."""
        if self.session:
            print(f"Sending text to Gemini: {text}")
            await self.session.send(text)

    async def send_frame(self, base64_jpeg: str):
        """Sends a base64 encoded JPEG frame to Gemini."""
        if self.session:
            # The SDK expects raw bytes or a dictionary matching the Part schema
            # We send it as a Part dictionary with inline_data
            await self.session.send({
                "inline_data": {
                    "mime_type": "image/jpeg",
                    "data": base64_jpeg
                }
            })

    async def receive_loop(self, message_callback):
        """Continuously receives messages from Gemini and passes them to the callback."""
        if not self.session:
            return

        print("Listening for Gemini responses...")
        try:
            async for response in self.session.receive():
                # The response object can contain text, audio, or tool calls
                # For now, we just pass the raw response to the callback to process
                await message_callback(response)
        except asyncio.CancelledError:
            print("Gemini receive loop cancelled.")
        except Exception as e:
            print(f"Error receiving from Gemini: {e}")
            
    async def close(self):
        """Closes the connection to Gemini."""
        print("Closing Gemini Live connection...")
        if self.session:
            # Currently the python SDK doesn't have an explicit close on the session 
            # object, it relies on the context manager bounds or task cancellation. 
            self.session = None
