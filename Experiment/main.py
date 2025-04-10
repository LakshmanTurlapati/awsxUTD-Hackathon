import argparse
import whisper
import librosa
import numpy as np
import re
import time # To measure processing time

# Define common filler words (can be expanded)
FILLER_WORDS = {"um", "uh", "hmm", "like", "you know", "so", "actually", "basically", "literally"}

def calculate_wpm(transcript, duration_seconds):
    """Calculates words per minute."""
    words = transcript.split()
    num_words = len(words)
    if duration_seconds <= 0:
        return 0
    return (num_words / duration_seconds) * 60

def count_filler_words(transcript):
    """Counts occurrences of predefined filler words."""
    # Use regex to find whole words, case-insensitive
    words = re.findall(r'\b\w+\b', transcript.lower())
    count = 0
    for word in words:
        if word in FILLER_WORDS:
            count += 1
    return count, len(words) # Return count and total words

def calculate_speech_ratio(audio_path, non_silence_threshold_db=-40):
    """
    Calculates the ratio of speech to total duration using librosa.
    Returns speech_ratio (0-1) and duration_seconds.
    Returns 0.0, 0.0 if an error occurs or duration is zero.
    """
    try:
        # Load audio file
        y, sr = librosa.load(audio_path, sr=None) # sr=None preserves original sample rate
        duration_seconds = librosa.get_duration(y=y, sr=sr)

        if duration_seconds <= 0:
            print("Warning: Audio duration is zero or negative.")
            return 0.0, 0.0

        # Find non-silent intervals. top_db is the threshold in dB below the peak amplitude
        # A lower top_db means more sensitivity (detects quieter sounds as non-silence)
        # Adjust non_silence_threshold_db if needed based on audio characteristics
        non_silent_intervals = librosa.effects.split(y, top_db=abs(non_silence_threshold_db))

        # Calculate total non-silent duration in seconds
        non_silent_duration = sum(librosa.samples_to_time(end - start, sr=sr)
                                for start, end in non_silent_intervals)

        speech_ratio = non_silent_duration / duration_seconds if duration_seconds > 0 else 0
        return speech_ratio, duration_seconds

    except Exception as e:
        print(f"Error processing audio for silence detection with librosa: {e}")
        print("Ensure ffmpeg is installed and accessible in your system PATH.")
        return 0.0, 0.0 # Indicate error


def calculate_fluency_score(wpm, filler_count, speech_ratio, num_words):
    """
    Calculates a fluency score from 1 to 5 based on metrics.
    This involves subjective thresholds and weighting - adjust as needed.
    """
    # --- Define scoring parameters (these are examples and need tuning) ---

    # WPM Score (Example thresholds - adjust based on expected speech type)
    # Target range: ~120-160 WPM often considered conversational
    if wpm < 80: wpm_score = 1       # Very slow
    elif wpm < 110: wpm_score = 2    # Slow
    elif wpm < 145: wpm_score = 4    # Good conversational pace lower end
    elif wpm < 175: wpm_score = 5    # Good conversational pace upper end
    elif wpm < 210: wpm_score = 3    # Fast, potentially less clear
    else: wpm_score = 2              # Very fast, likely rushed

    # Filler Word Score (Example thresholds - based on count per 100 words)
    # Lower is better. Adjust thresholds based on tolerance for fillers.
    fillers_per_100_words = (filler_count / num_words) * 100 if num_words > 0 else 0
    if fillers_per_100_words > 10: filler_score = 1 # Very high frequency
    elif fillers_per_100_words > 7: filler_score = 2
    elif fillers_per_100_words > 4: filler_score = 3
    elif fillers_per_100_words > 1.5: filler_score = 4
    else: filler_score = 5                          # Very few fillers

    # Speech Ratio Score (Example thresholds)
    # Higher generally means less dead air, but too high might mean unnatural lack of pauses.
    # Target: ~0.7 - 0.9 might be reasonable for conversation/presentation.
    if speech_ratio < 0.5: ratio_score = 1       # Significant silence/pauses
    elif speech_ratio < 0.65: ratio_score = 2
    elif speech_ratio < 0.80: ratio_score = 4
    elif speech_ratio < 0.95: ratio_score = 5    # Healthy amount of speech vs silence
    else: ratio_score = 3                       # Potentially unnatural lack of pauses

    # --- Combine scores (Example: weighted average) ---
    # Adjust weights based on perceived importance of each metric for 'fluency'
    wpm_weight = 0.40
    filler_weight = 0.35
    ratio_weight = 0.25

    # Ensure weights sum roughly to 1 (or normalize if needed)
    total_weight = wpm_weight + filler_weight + ratio_weight
    if total_weight == 0: return 1 # Avoid division by zero

    # Calculate weighted average score (ranges from 1 to 5)
    final_score = (wpm_score * wpm_weight +
                   filler_score * filler_weight +
                   ratio_score * ratio_weight) / total_weight

    # Clamp the score between 1 and 5 and round to nearest integer
    final_score_rounded = max(1, min(5, round(final_score)))

    return final_score_rounded


def main(audio_path, model_name="base"):
    """Main function to transcribe and calculate fluency."""
    print(f"Loading Whisper model '{model_name}'...")
    # Try loading the model, handle potential errors
    try:
        # Specify download_root=None to use default cache path
        model = whisper.load_model(model_name, download_root=None)
        print("Whisper model loaded.")
    except Exception as e:
        print(f"Error loading Whisper model '{model_name}': {e}")
        print("Please ensure the model name is correct and it can be downloaded.")
        print("Models available: tiny, base, small, medium, large")
        print("Whisper might need to download the model on first use (~70MB for 'base').")
        return

    print(f"Transcribing audio file: {audio_path}...")
    start_time = time.time()
    transcript = ""
    try:
        # Transcribe audio file
        result = model.transcribe(audio_path, fp16=False) # fp16=False for CPU compatibility if needed
        transcript = result["text"].strip() # Get transcript text and remove leading/trailing whitespace
        transcription_time = time.time() - start_time
        print(f"Transcription completed in {transcription_time:.2f} seconds.")
        print("\n--- Transcript ---")
        print(transcript if transcript else "[No speech detected or transcription empty]")
        print("------------------\n")

        if not transcript:
            print("Transcription is empty. Cannot calculate fluency.")
            return

    except FileNotFoundError:
        print(f"Error: Audio file not found at '{audio_path}'")
        return
    except Exception as e:
        print(f"Error during transcription: {e}")
        # Check for common issues like unsupported audio format by ffmpeg
        if "ffmpeg" in str(e).lower():
             print("Hint: Ensure ffmpeg is installed and accessible in your system PATH.")
        return

    print("Analyzing audio for fluency metrics...")
    analysis_start_time = time.time()

    # Get audio duration and calculate speech ratio using librosa
    # Provide a default threshold for silence detection
    speech_ratio, duration_seconds = calculate_speech_ratio(audio_path, non_silence_threshold_db=-40)

    if duration_seconds <= 0:
         print("Could not determine audio duration or analyze silence (duration <= 0).")
         print("Skipping fluency calculation.")
         # Optionally, try getting duration from transcription result if librosa failed?
         # Whisper's result object might contain segment timings, but let's rely on librosa for now.
         return

    # Calculate WPM
    wpm = calculate_wpm(transcript, duration_seconds)

    # Count filler words and total words
    filler_count, num_words = count_filler_words(transcript)

    analysis_time = time.time() - analysis_start_time
    print(f"Fluency analysis completed in {analysis_time:.2f} seconds.")

    # Calculate final score
    fluency_score = calculate_fluency_score(wpm, filler_count, speech_ratio, num_words)

    print("\n--- Fluency Metrics ---")
    print(f"Audio Duration: {duration_seconds:.2f} seconds")
    print(f"Word Count: {num_words}")
    print(f"Words Per Minute (WPM): {wpm:.2f}")
    print(f"Filler Word Count: {filler_count}")
    print(f"Speech Ratio (Speech vs Silence): {speech_ratio:.2f}")
    print("----------------------\n")

    print(f"*** Estimated Fluency Score (1-5): {fluency_score} ***")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Transcribe audio and estimate fluency score locally using Whisper and Librosa.")
    parser.add_argument("audio_file", help="Path to the input audio file (e.g., wav, mp3, m4a, ogg, flac)")
    parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium", "large"],
                        help="Whisper model to use (default: base). Larger models are more accurate but slower and require more resources.")
    args = parser.parse_args()

    main(args.audio_file, args.model)
