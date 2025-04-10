# Local Speech-to-Text and Fluency Scorer

This Python script uses the `openai-whisper` library for local speech-to-text transcription and `librosa` for audio analysis to provide an *estimated* fluency score for an input audio file.

## Features

*   **Local Transcription:** Performs speech recognition locally using OpenAI's Whisper models (various sizes available).
*   **Fluency Metrics:** Calculates:
    *   Words Per Minute (WPM)
    *   Filler Word Count (e.g., "um", "uh", "like")
    *   Speech Ratio (percentage of time spent speaking vs. silent)
*   **Fluency Score:** Combines the metrics into a single score from 1 (least fluent) to 5 (most fluent) based on customizable thresholds and weights.

## Dependencies

*   Python 3.7+
*   **FFmpeg:** Whisper and Librosa rely on FFmpeg to process various audio formats. You MUST install it separately.
    *   **macOS:** `brew install ffmpeg`
    *   **Ubuntu/Debian:** `sudo apt update && sudo apt install ffmpeg`
    *   **Windows:** Download from the [official FFmpeg website](https://ffmpeg.org/download.html) and add it to your system's PATH.
*   Python packages (see `requirements.txt`)

## Installation

1.  **Clone the repository or download the files.**
2.  **Install FFmpeg** (see "Dependencies" above). Verify it's installed and in your PATH by running `ffmpeg -version` in your terminal.
3.  **Create a virtual environment (recommended):**
    ```bash
    python -m venv venv
    source venv/bin/activate  # On Windows use `venv\Scripts\activate`
    ```
4.  **Install Python packages:**
    ```bash
    pip install -r requirements.txt
    ```
    *Note:* Depending on your system (CPU/GPU) and CUDA version, you might need a specific `torch` build. The `requirements.txt` includes basic `torch`. If you encounter issues, refer to [PyTorch installation instructions](https://pytorch.org/get-started/locally/). For CPU-only, you might use: `pip install torch --index-url https://download.pytorch.org/whl/cpu` before installing the rest.

## Usage

Run the script from your terminal:

```bash
python main.py <path_to_your_audio_file> [--model <model_name>]
```

**Arguments:**

*   `<path_to_your_audio_file>`: (Required) The path to the audio file you want to analyze (e.g., `my_speech.wav`, `recording.mp3`). Supports formats compatible with FFmpeg (wav, mp3, m4a, ogg, flac, etc.).
*   `--model <model_name>`: (Optional) The Whisper model to use. Defaults to `base`.
    *   Available models: `tiny`, `base`, `small`, `medium`, `large`.
    *   Larger models are generally more accurate but require more RAM/VRAM and are slower.
    *   The model will be downloaded automatically on first use for each size (e.g., `base` is ~74MB, `large` is ~1.5GB).

**Example:**

```bash
python main.py audio/sample_speech.mp3 --model small
```

## Output

The script will print:

1.  The loaded Whisper model.
2.  Transcription progress/completion time.
3.  The full transcript.
4.  Fluency analysis completion time.
5.  Calculated fluency metrics (Duration, Word Count, WPM, Filler Count, Speech Ratio).
6.  The final estimated Fluency Score (1-5).

## Customization

*   **Filler Words:** Modify the `FILLER_WORDS` set in `main.py` to add or remove words specific to your needs.
*   **Fluency Scoring:** The core logic for the score is in the `calculate_fluency_score` function. You can adjust:
    *   **Thresholds:** Change the ranges for WPM, filler word frequency, and speech ratio that determine the individual scores (1-5) for each metric.
    *   **Weights:** Modify `wpm_weight`, `filler_weight`, and `ratio_weight` to change the importance of each metric in the final combined score. *Remember that "fluency" is subjective, and these parameters likely need tuning based on the type of speech you are analyzing (e.g., presentations vs. casual conversation) and your specific definition of fluency.*
*   **Silence Detection:** The `calculate_speech_ratio` function uses `librosa.effects.split` with a `top_db` parameter (set via `non_silence_threshold_db` argument, defaulting to -40dB). You might need to adjust this threshold based on the noise level and dynamics of your audio recordings. A lower absolute value (e.g., -30) is less sensitive (requires louder sounds to be considered non-silent), while a higher absolute value (e.g., -50) is more sensitive. 