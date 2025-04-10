import librosa
import numpy as np
from typing import Dict, Any, Optional
from .fluency_analyzer import get_model, FluencyAnalyzer
import os
import tempfile
import subprocess

def transcribe_audio(file_path: str) -> Dict[str, Any]:
    """
    Transcribe an audio file using Whisper.
    
    Args:
        file_path: Path to the audio file
        
    Returns:
        Dictionary containing transcription result
    """
    try:
        # Check file existence and size
        if not os.path.exists(file_path):
            return {
                "text": "",
                "success": False,
                "error": f"File not found: {file_path}"
            }
        
        if os.path.getsize(file_path) == 0:
            return {
                "text": "",
                "success": False,
                "error": "Audio file is empty"
            }
        
        # Check file extension and convert if necessary
        file_ext = os.path.splitext(file_path)[1].lower()
        needs_conversion = file_ext not in ['.wav', '.mp3']
        
        if needs_conversion:
            print(f"Converting {file_ext} file to WAV for better compatibility")
            
            # Create temporary WAV file
            wav_temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
            wav_file_path = wav_temp_file.name
            wav_temp_file.close()
            
            # Try to convert using ffmpeg
            conversion_success = False
            try:
                command = ['ffmpeg', '-i', file_path, '-c:a', 'pcm_s16le', '-ar', '16000', '-ac', '1', '-y', wav_file_path]
                subprocess.run(command, check=True, capture_output=True)
                if os.path.exists(wav_file_path) and os.path.getsize(wav_file_path) > 0:
                    conversion_success = True
                    print(f"Successfully converted to WAV using ffmpeg")
            except Exception as e:
                print(f"FFMPEG conversion failed: {e}")
            
            # If ffmpeg fails, try librosa
            if not conversion_success:
                try:
                    import librosa
                    import soundfile as sf
                    y, sr = librosa.load(file_path, sr=16000, mono=True)
                    sf.write(wav_file_path, y, sr, format='WAV', subtype='PCM_16')
                    if os.path.exists(wav_file_path) and os.path.getsize(wav_file_path) > 0:
                        conversion_success = True
                        print(f"Successfully converted to WAV using librosa")
                except Exception as e:
                    print(f"Librosa conversion failed: {e}")
            
            # Use converted file if successful
            if conversion_success:
                transcription_file = wav_file_path
            else:
                os.unlink(wav_file_path)
                return {
                    "text": "",
                    "success": False,
                    "error": "Failed to convert audio format"
                }
        else:
            transcription_file = file_path
        
        # Get Whisper model and transcribe
        model = get_model("tiny")  # Use tiny model for faster processing
        if model is None:
            if needs_conversion and os.path.exists(wav_file_path):
                os.unlink(wav_file_path)
            return {
                "text": "",
                "success": False,
                "error": "Failed to load Whisper model"
            }
        
        # Perform transcription
        result = model.transcribe(transcription_file, fp16=False)
        
        # Clean up temporary file if we created one
        if needs_conversion and os.path.exists(wav_file_path):
            os.unlink(wav_file_path)
        
        return {
            "text": result["text"],
            "success": True
        }
    
    except Exception as e:
        # Clean up temporary file if we created one
        if 'needs_conversion' in locals() and needs_conversion and 'wav_file_path' in locals() and os.path.exists(wav_file_path):
            os.unlink(wav_file_path)
        
        return {
            "text": "",
            "success": False,
            "error": str(e)
        }

def analyze_fluency(audio: np.ndarray, sr: int) -> Dict[str, float]:
    """
    Analyze audio for fluency metrics.
    
    Args:
        audio: Audio signal as numpy array
        sr: Sample rate
        
    Returns:
        Dictionary containing fluency metrics
    """
    try:
        analyzer = FluencyAnalyzer()
        return analyzer.analyze(audio, sr)
    except Exception as e:
        return {
            "overall_score": 0.0,
            "speech_rate": 0.0,
            "rhythm_score": 0.0,
            "accuracy_score": 0.0,
            "error": str(e)
        } 