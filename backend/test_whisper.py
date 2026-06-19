import asyncio
import os
import sys

# Add the app directory to the python path
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))

from app.services.whisper_service import transcribe_audio
from app.config import settings

async def main():
    print("GROQ API KEY:", repr(settings.GROQ_API_KEY))
    
    # Read the test.wav file from the parent directory
    with open("../test.wav", "rb") as f:
        audio_bytes = f.read()

    print("Audio bytes length:", len(audio_bytes))
    result = await transcribe_audio(audio_bytes, "test.wav")
    print("Result:", result)

if __name__ == "__main__":
    asyncio.run(main())
