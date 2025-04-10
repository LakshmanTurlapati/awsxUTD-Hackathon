#!/usr/bin/env python
import requests
import base64
import json
import os
import sys
import time
from pprint import pprint

"""
Simple script to test the transcription API directly without the frontend.
This allows you to upload audio files and get transcriptions and fluency scores.
"""

# Configuration
API_BASE_URL = "http://localhost:8000/api/transcription"

def encode_audio_file(file_path):
    """Encode an audio file to base64"""
    with open(file_path, "rb") as audio_file:
        return base64.b64encode(audio_file.read()).decode('utf-8')

def stream_transcription(file_path):
    """Stream an audio file for transcription"""
    recording_id = f"test_{int(time.time())}"
    print(f"Created recording ID: {recording_id}")
    
    # Read and encode the audio file
    base64_audio = encode_audio_file(file_path)
    
    # Send the audio for streaming transcription
    response = requests.post(
        f"{API_BASE_URL}/stream/",
        json={
            "audio": base64_audio,
            "user_identifier": recording_id,
            "content_type": "audio/wav",
            "file_extension": ".wav"
        }
    )
    
    if response.status_code == 200:
        print("Successfully sent audio for transcription:")
        pprint(response.json())
        return recording_id
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
        return None

def finalize_transcription(recording_id):
    """Finalize a transcription and get fluency score"""
    print(f"Finalizing transcription for recording: {recording_id}")
    
    response = requests.post(
        f"{API_BASE_URL}/finalize/{recording_id}/"
    )
    
    if response.status_code == 200:
        print("Successfully finalized transcription:")
        pprint(response.json())
        return response.json()
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
        return None

def get_transcription(recording_id):
    """Get a transcription by recording ID"""
    print(f"Getting transcription for recording: {recording_id}")
    
    response = requests.get(
        f"{API_BASE_URL}/get-transcription/{recording_id}/"
    )
    
    if response.status_code == 200:
        print("Successfully retrieved transcription:")
        pprint(response.json())
        return response.json()
    else:
        print(f"Error: {response.status_code}")
        print(response.text)
        return None

def main():
    """Main function to run the transcription test"""
    if len(sys.argv) < 2:
        print("Usage: python test_transcription.py <audio_file_path>")
        sys.exit(1)
    
    audio_file_path = sys.argv[1]
    if not os.path.exists(audio_file_path):
        print(f"Error: File {audio_file_path} does not exist")
        sys.exit(1)
    
    # Stream the audio file
    recording_id = stream_transcription(audio_file_path)
    if not recording_id:
        print("Failed to stream audio file")
        sys.exit(1)
    
    # Give some time for processing
    print("Waiting for processing...")
    time.sleep(2)
    
    # Get the transcription
    transcription = get_transcription(recording_id)
    
    # Finalize the transcription to get fluency score
    final_result = finalize_transcription(recording_id)
    
    if final_result and 'fluency_score' in final_result:
        print("\nFluency Analysis Results:")
        print(f"Overall Score: {final_result['fluency_score']['overall_score']}")
        print(f"Speech Rate: {final_result['fluency_score']['speech_rate']}")
        print(f"Rhythm Score: {final_result['fluency_score']['rhythm_score']}")
        print(f"Accuracy Score: {final_result['fluency_score']['accuracy_score']}")
        
        if 'wpm' in final_result['fluency_score']:
            print(f"Words per minute: {final_result['fluency_score']['wpm']}")
        
        if 'filler_count' in final_result['fluency_score']:
            print(f"Filler word count: {final_result['fluency_score']['filler_count']}")
        
        if 'word_count' in final_result['fluency_score']:
            print(f"Total word count: {final_result['fluency_score']['word_count']}")

if __name__ == "__main__":
    main() 