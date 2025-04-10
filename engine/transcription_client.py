#!/usr/bin/env python
import requests
import base64
import time
import os
from typing import Dict, Any, Optional

class TranscriptionClient:
    """
    Simple client for the Transcription API.
    This class provides methods to interact with the backend transcription services
    without requiring the frontend application.
    """
    
    def __init__(self, base_url: str = "http://localhost:8000/api/transcription"):
        """Initialize the client with the API base URL"""
        self.base_url = base_url
        
    def encode_audio_file(self, file_path: str) -> str:
        """Encode an audio file to base64"""
        with open(file_path, "rb") as audio_file:
            return base64.b64encode(audio_file.read()).decode('utf-8')
            
    def transcribe_audio_file(self, file_path: str) -> Dict[str, Any]:
        """
        Transcribe an audio file and return the result with fluency analysis.
        
        This is a simplified method that handles the entire process:
        1. Uploads the audio file
        2. Gets the transcription
        3. Finalizes the transcription to get fluency scores
        
        Args:
            file_path: Path to the audio file
            
        Returns:
            Dictionary containing transcription and fluency metrics
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Audio file not found: {file_path}")
            
        # Create a unique recording ID
        recording_id = f"test_{int(time.time())}"
        print(f"Processing audio file: {file_path}")
        print(f"Recording ID: {recording_id}")
        
        # Step 1: Stream the audio
        stream_result = self.stream_audio(file_path, recording_id)
        if not stream_result:
            return {"error": "Failed to stream audio"}
            
        # Step 2: Pause to allow backend processing
        print("Waiting for processing...")
        time.sleep(2)
        
        # Step 3: Finalize the transcription
        final_result = self.finalize_transcription(recording_id)
        if not final_result:
            return {"error": "Failed to finalize transcription"}
            
        return final_result
        
    def stream_audio(self, file_path: str, recording_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Stream an audio file for transcription
        
        Args:
            file_path: Path to the audio file
            recording_id: Optional custom recording ID
            
        Returns:
            API response as dictionary
        """
        if recording_id is None:
            recording_id = f"test_{int(time.time())}"
            
        # Get file extension and content type
        file_ext = os.path.splitext(file_path)[1]
        if not file_ext:
            file_ext = ".wav"
            
        content_type = "audio/wav"
        if file_ext.lower() == '.mp3':
            content_type = "audio/mp3"
        elif file_ext.lower() == '.webm':
            content_type = "audio/webm"
            
        # Encode the audio file
        base64_audio = self.encode_audio_file(file_path)
        
        # Send the request
        try:
            response = requests.post(
                f"{self.base_url}/stream/",
                json={
                    "audio": base64_audio,
                    "user_identifier": recording_id,
                    "content_type": content_type,
                    "file_extension": file_ext
                }
            )
            
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Error streaming audio: {e}")
            return None
            
    def get_transcription(self, recording_id: str) -> Dict[str, Any]:
        """
        Get a transcription by recording ID
        
        Args:
            recording_id: The recording ID
            
        Returns:
            API response as dictionary
        """
        try:
            response = requests.get(
                f"{self.base_url}/get-transcription/{recording_id}/"
            )
            
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Error getting transcription: {e}")
            return None
            
    def finalize_transcription(self, recording_id: str) -> Dict[str, Any]:
        """
        Finalize a transcription and get fluency scores
        
        Args:
            recording_id: The recording ID
            
        Returns:
            API response as dictionary
        """
        try:
            response = requests.post(
                f"{self.base_url}/finalize/{recording_id}/"
            )
            
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            print(f"Error finalizing transcription: {e}")
            return None
            
# Example usage
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python transcription_client.py <audio_file_path>")
        sys.exit(1)
        
    audio_file = sys.argv[1]
    client = TranscriptionClient()
    
    # Transcribe the audio file
    result = client.transcribe_audio_file(audio_file)
    
    # Print the results
    if result:
        print("\n===== Transcription Results =====")
        print(f"Transcript: {result.get('transcript', 'No transcript available')}")
        
        if 'fluency_score' in result:
            print("\n===== Fluency Analysis =====")
            fluency = result['fluency_score']
            print(f"Overall Score: {fluency.get('overall_score', 'N/A')}")
            print(f"Words per minute: {fluency.get('wpm', 'N/A')}")
            print(f"Speech Rate: {fluency.get('speech_rate', 'N/A')}")
            print(f"Rhythm Score: {fluency.get('rhythm_score', 'N/A')}")
            print(f"Accuracy Score: {fluency.get('accuracy_score', 'N/A')}")
            print(f"Filler Words: {fluency.get('filler_count', 'N/A')}")
            print(f"Word Count: {fluency.get('word_count', 'N/A')}")
    else:
        print("Failed to get transcription results") 