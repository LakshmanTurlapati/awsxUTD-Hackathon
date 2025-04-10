import numpy as np
import librosa
import whisper
import re
from typing import Dict, Any, Optional

_model = None

def get_model(model_name: str = "base") -> Optional[whisper.Whisper]:
    """Get or load the Whisper model."""
    global _model
    if _model is None:
        try:
            _model = whisper.load_model(model_name)
        except Exception as e:
            print(f"Error loading Whisper model: {e}")
            return None
    return _model

class FluencyAnalyzer:
    def __init__(self):
        self.model = get_model()
        self.filler_words = ["um", "uh", "hmm", "like", "you know", "so", "actually", "basically", "literally"]
    
    def analyze(self, audio: np.ndarray, sr: int) -> Dict[str, float]:
        """
        Analyze audio for fluency metrics.
        
        Args:
            audio: Audio signal as numpy array
            sr: Sample rate
            
        Returns:
            Dictionary containing fluency metrics
        """
        try:
            # Calculate speech rate (syllables per second)
            duration = len(audio) / sr
            speech_rate = self._calculate_speech_rate(audio, sr)
            
            # Calculate rhythm score based on pause patterns
            rhythm_score = self._calculate_rhythm_score(audio, sr)
            
            # Calculate accuracy score (placeholder - would need ASR for real implementation)
            accuracy_score = 0.8  # Placeholder value
            
            # Calculate overall score (weighted average)
            overall_score = (0.4 * speech_rate + 0.3 * rhythm_score + 0.3 * accuracy_score)
            
            return {
                "overall_score": float(overall_score),
                "speech_rate": float(speech_rate),
                "rhythm_score": float(rhythm_score),
                "accuracy_score": float(accuracy_score)
            }
            
        except Exception as e:
            print(f"Error analyzing audio: {e}")
            return {
                "overall_score": 0.0,
                "speech_rate": 0.0,
                "rhythm_score": 0.0,
                "accuracy_score": 0.0
            }
    
    def analyze_text(self, text: str, estimated_duration: float = 30.0) -> Dict[str, float]:
        """
        Analyze transcription text for fluency metrics.
        
        Args:
            text: Transcription text
            estimated_duration: Estimated audio duration in seconds
            
        Returns:
            Dictionary containing fluency metrics
        """
        try:
            # Clean the text
            clean_text = text.strip()
            
            # Count words and filler words
            words = re.findall(r'\b\w+\b', clean_text.lower())
            word_count = len(words)
            filler_count = sum(1 for word in words if word in self.filler_words)
            
            # Calculate speech rate (words per minute)
            if estimated_duration > 0:
                wpm = (word_count / estimated_duration) * 60
            else:
                wpm = 0
                
            # Normalize speech rate to 0-1 range (150 wpm is good speaking pace)
            speech_rate = min(max(wpm / 150.0, 0), 1)
            
            # Calculate filler word ratio (lower is better)
            filler_ratio = filler_count / word_count if word_count > 0 else 0
            # Convert to a score (0-1, where 1 is better)
            accuracy_score = 1.0 - min(filler_ratio * 10, 1.0)  # Penalize heavily for filler words
            
            # Use a default rhythm score since we can't analyze pauses from text alone
            rhythm_score = 0.75  # Reasonable default
            
            # Calculate overall score (weighted average)
            overall_score = (0.4 * speech_rate + 0.3 * rhythm_score + 0.3 * accuracy_score)
            
            return {
                "overall_score": float(overall_score),
                "speech_rate": float(speech_rate),
                "rhythm_score": float(rhythm_score),
                "accuracy_score": float(accuracy_score),
                "wpm": float(wpm),
                "filler_count": filler_count,
                "word_count": word_count
            }
            
        except Exception as e:
            print(f"Error analyzing text: {e}")
            return {
                "overall_score": 0.0,
                "speech_rate": 0.0,
                "rhythm_score": 0.0,
                "accuracy_score": 0.0
            }
    
    def _calculate_speech_rate(self, audio: np.ndarray, sr: int) -> float:
        """Calculate speech rate based on onset detection."""
        try:
            # Detect onsets in the audio
            onset_env = librosa.onset.onset_strength(y=audio, sr=sr)
            onsets = librosa.onset.onset_detect(onset_envelope=onset_env, sr=sr)
            
            # Calculate speech rate (onsets per second)
            duration = len(audio) / sr
            speech_rate = len(onsets) / duration if duration > 0 else 0
            
            # Normalize to a 0-1 scale (assuming typical speech is 2-5 syllables/sec)
            normalized_rate = min(max(speech_rate / 5.0, 0), 1)
            
            return normalized_rate
            
        except Exception as e:
            print(f"Error calculating speech rate: {e}")
            return 0.0
    
    def _calculate_rhythm_score(self, audio: np.ndarray, sr: int) -> float:
        """Calculate rhythm score based on pause patterns."""
        try:
            # Calculate RMS energy
            rms = librosa.feature.rms(y=audio)[0]
            
            # Define silence threshold
            silence_threshold = np.mean(rms) * 0.5
            
            # Find silence regions
            is_silence = rms < silence_threshold
            
            # Calculate pause ratio
            pause_ratio = np.mean(is_silence)
            
            # Convert to score (optimal pause ratio around 0.2-0.3)
            score = 1.0 - abs(pause_ratio - 0.25) * 2
            score = max(min(score, 1.0), 0.0)
            
            return float(score)
            
        except Exception as e:
            print(f"Error calculating rhythm score: {e}")
            return 0.0

def analyze_audio(file_path: str) -> Dict[str, Any]:
    """
    Analyze an audio file for transcription and fluency metrics.
    
    Args:
        file_path: Path to the audio file
        
    Returns:
        Dictionary containing transcription and fluency metrics
    """
    try:
        # Load audio file
        audio, sr = librosa.load(file_path)
        
        # Get transcription
        model = get_model()
        if model is None:
            raise Exception("Failed to load Whisper model")
            
        result = model.transcribe(file_path)
        transcript = result["text"]
        
        # Analyze fluency
        analyzer = FluencyAnalyzer()
        metrics = analyzer.analyze(audio, sr)
        
        return {
            "transcript": transcript,
            "fluency_score": metrics["overall_score"],
            "metrics": {
                "wpm": len(transcript.split()) / (len(audio) / sr / 60),
                "wpm_score": metrics["speech_rate"],
                "filler_count": sum(1 for word in transcript.lower().split() if word in analyzer.filler_words),
                "filler_score": metrics["accuracy_score"],
                "speech_ratio": 1.0 - metrics["rhythm_score"],
                "ratio_score": metrics["rhythm_score"],
                "word_count": len(transcript.split())
            }
        }
        
    except Exception as e:
        return {"error": str(e)}

def analyze_audio_chunk(audio_chunk: bytes) -> Dict[str, Any]:
    """
    Analyze a chunk of audio data for streaming transcription.
    
    Args:
        audio_chunk: Raw audio data
        
    Returns:
        Dictionary containing transcription and intermediate metrics
    """
    try:
        # Convert audio chunk to numpy array
        audio = np.frombuffer(audio_chunk, dtype=np.float32)
        sr = 16000  # Assuming 16kHz sample rate
        
        # Get transcription
        model = get_model()
        if model is None:
            raise Exception("Failed to load Whisper model")
            
        result = model.transcribe(audio)
        transcript = result["text"]
        
        # For streaming, we only return the transcription
        return {
            "transcript": transcript,
            "is_final": True
        }
        
    except Exception as e:
        return {"error": str(e)} 