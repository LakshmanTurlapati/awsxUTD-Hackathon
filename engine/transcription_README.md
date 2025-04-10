# Transcription and Fluency Analysis Backend

This directory contains tools for using the transcription and fluency analysis backend directly, without requiring the frontend application.

## Overview

The transcription service provides the following capabilities:
- Speech-to-text transcription using OpenAI's Whisper model
- Fluency analysis of speech, including:
  - Speech rate (words per minute)
  - Rhythm analysis
  - Filler word detection
  - Overall fluency scoring

## Available Tools

We provide several ways to use the transcription service:

1. **TranscriptionClient**: A Python class for programmatically interacting with the API
2. **test_transcription.py**: A simple script to test transcription with a single audio file
3. **batch_transcribe.py**: A command-line tool for processing multiple audio files

## Prerequisites

- Python 3.7+
- Django backend running on `http://localhost:8000`
- Required Python packages: `requests`

Install dependencies:
```bash
pip install requests
```

## Getting Started

### 1. Start the Django Backend

Make sure the Django server is running:

```bash
cd engine
python manage.py runserver
```

### 2. Testing a Single Audio File

```bash
python test_transcription.py /path/to/audio/file.wav
```

### 3. Batch Processing Multiple Files

Process all audio files in a directory:

```bash
python batch_transcribe.py /path/to/audio/directory -o /path/for/results
```

Options:
- `-o, --output-dir`: Directory to save results (default: current directory)
- `-e, --extensions`: Audio file extensions to process (default: wav mp3 m4a webm)
- `-u, --api-url`: Base URL for the API (default: http://localhost:8000/api/transcription)

## Using the TranscriptionClient in Your Code

```python
from transcription_client import TranscriptionClient

# Create client
client = TranscriptionClient()

# Transcribe an audio file
result = client.transcribe_audio_file("audio.wav")

# Access results
transcript = result.get("transcript", "")
print(f"Transcription: {transcript}")

if "fluency_score" in result:
    fluency = result["fluency_score"]
    print(f"Fluency score: {fluency.get('overall_score')}")
    print(f"Words per minute: {fluency.get('wpm')}")
```

## API Endpoints

The backend exposes these main endpoints:

- `POST /api/transcription/stream/`: Upload audio chunks for streaming transcription
- `POST /api/transcription/finalize/{recording_id}/`: Finalize a recording and get fluency scores
- `GET /api/transcription/get-transcription/{recording_id}/`: Get transcription for a recording

## Troubleshooting

1. **Connection errors**: Make sure the Django server is running on port 8000

2. **Authentication errors**: The API might require authentication. You may need to modify the authentication settings in the Django backend during development.

3. **Processing errors**: Check the Django server logs for detailed error information if transcription fails.

## Notes

- For development and testing, the backend can work with mock data if Whisper isn't available
- The text-only fluency analysis is less accurate than audio-based analysis 