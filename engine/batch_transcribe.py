#!/usr/bin/env python
import argparse
import os
import json
import time
from transcription_client import TranscriptionClient

def process_file(client, file_path, output_dir=None):
    """Process a single audio file and save the results"""
    print(f"\nProcessing: {file_path}")
    
    try:
        # Get transcription and fluency scores
        result = client.transcribe_audio_file(file_path)
        
        if not result or 'error' in result:
            print(f"  Failed: {result.get('error', 'Unknown error')}")
            return False
            
        # Create output file name
        base_name = os.path.basename(file_path)
        file_name, _ = os.path.splitext(base_name)
        
        # Default to current directory if none specified
        if not output_dir:
            output_dir = '.'
        os.makedirs(output_dir, exist_ok=True)
        
        # Save the full JSON result
        json_path = os.path.join(output_dir, f"{file_name}_result.json")
        with open(json_path, 'w') as f:
            json.dump(result, f, indent=2)
            
        # Also save just the transcript as a text file
        transcript = result.get('transcript', '')
        text_path = os.path.join(output_dir, f"{file_name}_transcript.txt")
        with open(text_path, 'w') as f:
            f.write(transcript)
            
        print(f"  Success: Results saved to {json_path}")
        
        # Print brief summary
        if 'fluency_score' in result:
            fluency = result['fluency_score']
            print(f"  Fluency Score: {fluency.get('overall_score', 'N/A')}")
            print(f"  Words: {fluency.get('word_count', 0)}")
            
        return True
        
    except Exception as e:
        print(f"  Error processing {file_path}: {str(e)}")
        return False

def process_directory(client, dir_path, output_dir=None, extensions=None):
    """Process all audio files in a directory"""
    if extensions is None:
        extensions = ['.wav', '.mp3', '.m4a', '.webm']
        
    # Ensure extensions start with a dot
    extensions = [ext if ext.startswith('.') else f'.{ext}' for ext in extensions]
    
    # Find all audio files
    audio_files = []
    for root, _, files in os.walk(dir_path):
        for file in files:
            if any(file.lower().endswith(ext) for ext in extensions):
                audio_files.append(os.path.join(root, file))
                
    if not audio_files:
        print(f"No audio files found in {dir_path} with extensions {', '.join(extensions)}")
        return
        
    print(f"Found {len(audio_files)} audio files to process")
    
    # Process each file
    successful = 0
    for i, file_path in enumerate(audio_files):
        print(f"\n[{i+1}/{len(audio_files)}] ", end='')
        if process_file(client, file_path, output_dir):
            successful += 1
        time.sleep(1)  # Small delay between files to not overload the server
        
    print(f"\nProcessed {len(audio_files)} files: {successful} successful, {len(audio_files) - successful} failed")

def main():
    """Parse arguments and run transcription"""
    parser = argparse.ArgumentParser(description='Batch transcribe audio files using the transcription API')
    
    parser.add_argument('input', help='Audio file or directory to process')
    parser.add_argument('-o', '--output-dir', help='Directory to save results (default: current directory)')
    parser.add_argument('-e', '--extensions', nargs='+', default=['wav', 'mp3', 'm4a', 'webm'],
                        help='Audio file extensions to process (default: wav mp3 m4a webm)')
    parser.add_argument('-u', '--api-url', default='http://localhost:8000/api/transcription',
                        help='Base URL for the transcription API (default: http://localhost:8000/api/transcription)')
                        
    args = parser.parse_args()
    
    # Create transcription client
    client = TranscriptionClient(base_url=args.api_url)
    
    # Process input
    if os.path.isfile(args.input):
        process_file(client, args.input, args.output_dir)
    elif os.path.isdir(args.input):
        process_directory(client, args.input, args.output_dir, args.extensions)
    else:
        print(f"Error: {args.input} is not a valid file or directory")
        return 1
        
    return 0

if __name__ == "__main__":
    exit(main()) 