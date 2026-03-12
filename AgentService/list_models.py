import asyncio
from google import genai
from dotenv import load_dotenv

load_dotenv()
client = genai.Client()

async def list_models():
    models = client.models.list()
    # Note: genai client is sync for list usually, let's just print
    for m in models:
        # Check if it supports bidiGenerateContent
        if m.supported_actions and 'bidiGenerateContent' in m.supported_actions:
            print(f"Supported Live model: {m.name}")

if __name__ == "__main__":
    for m in client.models.list():
        print(f"Model: {m.name}")
