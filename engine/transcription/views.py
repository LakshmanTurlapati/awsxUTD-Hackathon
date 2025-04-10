from django.shortcuts import render
import os
import base64
import json
import tempfile
import numpy as np
import librosa
from django.conf import settings
from django.http import StreamingHttpResponse, JsonResponse
from rest_framework import status, viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from .models import AudioRecording, Transcription, FluencyScore, TranscriptionChunk
from .serializers import (
    AudioRecordingSerializer, TranscriptionSerializer, 
    FluencyScoreSerializer, AudioUploadSerializer,
    TranscriptionChunkSerializer
)
from .fluency_analyzer import analyze_audio, analyze_audio_chunk, get_model, FluencyAnalyzer
from .utils import transcribe_audio, analyze_fluency
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from django.core.files.storage import default_storage
from django.core.files.base import ContentFile
import logging
import subprocess
import whisper
import random
from .dynamodb_utils import save_candidate, get_all_candidates, delete_candidate
from django.views.decorators.csrf import csrf_exempt

# Initialize logger for this module
logger = logging.getLogger('transcription')

class AudioRecordingViewSet(viewsets.ModelViewSet):
    queryset = AudioRecording.objects.all()
    serializer_class = AudioRecordingSerializer
    permission_classes = [IsAuthenticated]

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['post'])
    def process(self, request):
        recording_id = request.data.get('recording_id')
        sequence_number = request.data.get('sequence_number')
        content_type = request.data.get('content_type', 'audio/wav')
        file_extension = request.data.get('file_extension', '.wav')
        base64_audio = request.data.get('audio')
        
        if not all([recording_id, sequence_number, base64_audio]):
            return Response(
                {"error": "Missing required fields"},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        try:
            # Decode base64 audio
            audio_data = base64.b64decode(base64_audio)
            
            # Create temp directory if it doesn't exist
            os.makedirs(settings.TEMP_DIR, exist_ok=True)
            
            # Create unique filenames for audio files
            audio_filename = f"{recording_id}_{sequence_number}{file_extension}"
            audio_filepath = os.path.join(settings.TEMP_DIR, audio_filename)
            
            # Write audio data to file
            with open(audio_filepath, 'wb') as f:
                f.write(audio_data)
                
            # For testing, use mock transcription
            if settings.USE_MOCK_TRANSCRIPTION:
                logger.info("Using mock transcription")
                if sequence_number == 1:
                    mock_text = "Hello, this is a test."
                else:
                    mock_text = f"This is sequence number {sequence_number}."
                
                return Response({
                    "recording_id": recording_id,
                    "sequence_number": sequence_number,
                    "transcription": {
                        "text": mock_text,
                        "is_partial": True
                    }
                })
            
            # Actual audio processing for WAV files is simpler
            try:
                # Direct load for WAV files is more reliable
                if content_type.startswith('audio/wav'):
                    audio_array, sample_rate = librosa.load(audio_filepath, sr=16000)
                else:
                    # For other formats, try direct conversion with librosa first
                    try:
                        audio_array, sample_rate = librosa.load(audio_filepath, sr=16000)
                    except Exception as e:
                        logger.error(f"Librosa load failed: {str(e)}")
                        
                        # Fall back to FFMPEG conversion if librosa fails
                        wav_filepath = os.path.join(settings.TEMP_DIR, f"{recording_id}_{sequence_number}_converted.wav")
                        try:
                            ffmpeg_cmd = [
                                'ffmpeg', '-i', audio_filepath, 
                                '-c:a', 'pcm_s16le',  # Linear PCM format
                                '-ar', '16000',       # 16kHz sample rate for Whisper
                                '-ac', '1',           # Mono audio
                                '-y',                 # Overwrite output file
                                wav_filepath
                            ]
                            subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
                            audio_array, sample_rate = librosa.load(wav_filepath, sr=16000)
                            os.remove(wav_filepath)  # Clean up temporary file
                        except subprocess.CalledProcessError as e:
                            logger.error(f"FFMPEG conversion failed: {e}")
                            # Try one more approach - pydub
                            try:
                                from pydub import AudioSegment
                                audio = AudioSegment.from_file(audio_filepath)
                                audio = audio.set_frame_rate(16000).set_channels(1)
                                audio.export(wav_filepath, format="wav")
                                audio_array, sample_rate = librosa.load(wav_filepath, sr=16000)
                                os.remove(wav_filepath)
                            except Exception as e:
                                logger.error(f"All audio conversion methods failed: {str(e)}")
                                raise
                
                # Load the Whisper model once
                model = whisper.load_model("tiny", download_root=settings.MODEL_DIR)
                
                # Transcribe the audio
                result = model.transcribe(audio_array, language="en", fp16=False)
                transcription_text = result["text"].strip()
                
                # Save the transcription in the database
                transcription = Transcription.objects.create(
                    recording_id=recording_id,
                    sequence_number=sequence_number,
                    text=transcription_text,
                    is_partial=True
                )
                
                # Return the transcription
                return Response({
                    "recording_id": recording_id,
                    "sequence_number": sequence_number,
                    "transcription": TranscriptionSerializer(transcription).data
                })
                
            except Exception as e:
                logger.error(f"Audio processing error: {str(e)}")
                return Response(
                    {"error": f"Audio processing failed: {str(e)}"},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR
                )
            
        except Exception as e:
            logger.error(f"Recording error: {str(e)}")
            return Response(
                {"error": f"Recording process failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        finally:
            # Clean up the audio file
            if 'audio_filepath' in locals() and os.path.exists(audio_filepath):
                try:
                    os.remove(audio_filepath)
                except Exception as e:
                    logger.error(f"Failed to remove temp file {audio_filepath}: {str(e)}")

    @action(detail=False, methods=['post'])
    def finalize(self, request):
        recording_id = request.data.get('recording_id')
        
        if not recording_id:
            return Response(
                {"error": "Missing recording_id"},
                status=status.HTTP_400_BAD_REQUEST
            )
            
        try:
            # Get all transcription segments for this recording
            transcriptions = Transcription.objects.filter(recording_id=recording_id).order_by('sequence_number')
            
            if not transcriptions.exists():
                return Response(
                    {"error": "No transcriptions found for this recording"},
                    status=status.HTTP_404_NOT_FOUND
                )
                
            # Combine all transcription segments
            full_text = " ".join([t.text for t in transcriptions])
            
            # Create a final transcription entry
            final_transcription = Transcription.objects.create(
                recording_id=recording_id,
                sequence_number=0,  # 0 indicates the final combined transcription
                text=full_text,
                is_partial=False
            )
            
            # Generate mock fluency score if needed
            if settings.USE_MOCK_TRANSCRIPTION:
                fluency_score = FluencyScore.objects.create(
                    recording_id=recording_id,
                    overall_score=random.uniform(70, 95),
                    speech_rate=random.uniform(120, 180),
                    rhythm_score=random.uniform(65, 90),
                    accuracy_score=random.uniform(70, 95)
                )
            else:
                # Analyze fluency based on final transcription
                try:
                    # Create a temporary audio file concatenating all chunks if needed
                    # This is a simplified approach - ideally we'd use the full audio
                    # If we don't have all audio chunks, we can still score based on text
                    analyzer = FluencyAnalyzer()
                    fluency_metrics = analyzer.analyze_text(full_text)
                    
                    fluency_score = FluencyScore.objects.create(
                        recording_id=recording_id,
                        overall_score=fluency_metrics["overall_score"],
                        speech_rate=fluency_metrics["speech_rate"],
                        rhythm_score=fluency_metrics["rhythm_score"],
                        accuracy_score=fluency_metrics["accuracy_score"]
                    )
                except Exception as e:
                    logger.error(f"Fluency analysis failed: {str(e)}")
                    # Create a fallback fluency score if analysis fails
                    fluency_score = FluencyScore.objects.create(
                        recording_id=recording_id,
                        overall_score=75,  # Default values
                        speech_rate=150,
                        rhythm_score=75,
                        accuracy_score=75
                    )
            
            # Update all partial transcriptions to indicate they're part of a finalized recording
            transcriptions.update(is_final=True)
            
            return Response({
                "recording_id": recording_id,
                "transcription": TranscriptionSerializer(final_transcription).data,
                "fluency_score": FluencyScoreSerializer(fluency_score).data
            })
            
        except Exception as e:
            logger.error(f"Finalization error: {str(e)}")
            return Response(
                {"error": f"Recording finalization failed: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )

class TranscriptionViewSet(viewsets.ModelViewSet):
    queryset = Transcription.objects.all()
    serializer_class = TranscriptionSerializer
    permission_classes = [IsAuthenticated]

class FluencyScoreViewSet(viewsets.ModelViewSet):
    queryset = FluencyScore.objects.all()
    serializer_class = FluencyScoreSerializer
    permission_classes = [IsAuthenticated]

class AudioUploadView(APIView):
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request, format=None):
        serializer = AudioUploadSerializer(data=request.data)
        
        if serializer.is_valid():
            audio_file = serializer.validated_data['audio_file']
            user_identifier = serializer.validated_data.get('user_identifier', '')
            
            # Save the audio file to temporary location
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
                for chunk in audio_file.chunks():
                    temp_file.write(chunk)
                temp_file_path = temp_file.name
            
            # Analyze the audio file
            result = analyze_audio(temp_file_path)
            
            if result and not result.get('error'):
                # Create audio recording
                recording = AudioRecording.objects.create(
                    file_path=temp_file_path,
                    user_identifier=user_identifier,
                    duration_seconds=result['duration_seconds']
                )
                
                # Create transcription
                transcription = Transcription.objects.create(
                    recording=recording,
                    text=result['transcript']
                )
                
                # Create fluency score
                metrics = result['metrics']
                FluencyScore.objects.create(
                    transcription=transcription,
                    overall_score=result['fluency_score'],
                    wpm=metrics['wpm'],
                    wpm_score=metrics['wpm_score'],
                    filler_count=metrics['filler_count'],
                    filler_score=metrics['filler_score'],
                    speech_ratio=metrics['speech_ratio'],
                    ratio_score=metrics['ratio_score'],
                    word_count=metrics['word_count']
                )
                
                return Response({
                    'id': recording.id,
                    'transcript': result['transcript'],
                    'fluency_score': result['fluency_score'],
                    'metrics': metrics
                }, status=status.HTTP_201_CREATED)
            else:
                error_message = result.get('error', 'Unknown error during analysis')
                return Response({'error': error_message}, status=status.HTTP_400_BAD_REQUEST)
        
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class StreamingTranscriptionView(APIView):
    """
    API view for streaming transcription from audio chunks using Whisper.
    """
    
    def post(self, request, format=None):
        try:
            logger.info("Received streaming request")
            
            # Get the audio data from the request
            data = json.loads(request.body)
            audio_base64 = data.get('audio')
            user_identifier = data.get('user_identifier', '')
            recording_id = data.get('recording_id')
            sequence_number = data.get('sequence_number', 0)
            content_type = data.get('content_type', 'audio/webm')
            file_extension = data.get('file_extension', '.webm')  # Get explicit file extension
            
            logger.info(f"Received data - recording_id: {recording_id}, sequence: {sequence_number}, type: {content_type}, ext: {file_extension}")
            
            if not audio_base64:
                return Response({'error': 'No audio data provided'}, status=status.HTTP_400_BAD_REQUEST)
            
            try:
                # Decode base64 audio
                audio_bytes = base64.b64decode(audio_base64)
                logger.debug(f"Decoded audio: {len(audio_bytes)} bytes")
            except Exception as e:
                logger.error(f"Base64 decode error: {str(e)}")
                return Response({'error': f'Invalid audio data: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
            
            # Get or create recording
            try:
                if recording_id:
                    # Look up by user_identifier
                    recordings = AudioRecording.objects.filter(user_identifier=recording_id)
                    if recordings.exists():
                        recording = recordings.first() 
                    else:
                        # Create new recording with client ID as user_identifier
                        recording = AudioRecording.objects.create(
                            user=request.user if request.user.is_authenticated else None,
                            user_identifier=recording_id
                        )
                        logger.info(f"Created new recording for user_id: {recording_id}")
                else:
                    # Create new recording
                    recording = AudioRecording.objects.create(
                        user=request.user if request.user.is_authenticated else None,
                        user_identifier=user_identifier or f"temp_{np.random.randint(10000, 99999)}"
                    )
                
                logger.info(f"Using recording DB ID: {recording.id}, user_identifier: {recording.user_identifier}")
            except Exception as e:
                logger.error(f"Recording error: {str(e)}")
                return Response({'error': f'Recording error: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            # Skip audio processing for very small chunks or initial chunks
            # Just create an empty chunk to maintain sequence
            if len(audio_bytes) < 1000 or sequence_number < 2:
                logger.info(f"Skipping processing for small/initial chunk: {len(audio_bytes)} bytes, seq: {sequence_number}")
                chunk = TranscriptionChunk.objects.create(
                    recording=recording,
                    text="",
                    sequence_number=sequence_number
                )
                return Response({
                    'recording_id': recording_id or recording.user_identifier,
                    'chunk_id': str(chunk.id),
                    'transcript': "",
                    'is_final': True
                })
            
            # Mock transcription for testing without Whisper
            USE_MOCK_TRANSCRIPTION = False
            
            if USE_MOCK_TRANSCRIPTION:
                # Use mock data
                transcript = "This is a test transcription."
                
                # Save chunk
                chunk = TranscriptionChunk.objects.create(
                    recording=recording,
                    text=transcript,
                    sequence_number=sequence_number
                )
                
                return Response({
                    'recording_id': recording_id or recording.user_identifier,
                    'chunk_id': str(chunk.id),
                    'transcript': transcript,
                    'is_final': True
                })
            
            # Real transcription process
            try:
                # Save the audio using the correct file extension
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=file_extension)
                temp_file.write(audio_bytes)
                temp_file.close()
                temp_file_path = temp_file.name
                
                logger.info(f"Saved audio to temp file: {temp_file_path}, size: {len(audio_bytes)} bytes, ext: {file_extension}")
                
                # Skip transcription attempts for WebM files (known to be problematic)
                if file_extension == '.webm':
                    logger.info("WebM files are problematic with Whisper, skipping transcription")
                    transcript = ""
                else:
                    # Load Whisper model and transcribe
                    model = get_model("tiny")
                    if not model:
                        logger.error("Failed to load Whisper model")
                        raise Exception("Failed to load Whisper model")
                    
                    # Verify file exists
                    if not os.path.exists(temp_file_path) or os.path.getsize(temp_file_path) == 0:
                        logger.error(f"File missing or empty: {temp_file_path}")
                        raise Exception("Audio file is empty or missing")
                    
                    # Transcribe directly without any conversion attempts
                    logger.info(f"Starting transcription of {temp_file_path}")
                    try:
                        result = model.transcribe(temp_file_path, fp16=False)
                        transcript = result.get("text", "").strip()
                        logger.info(f"Transcription result: '{transcript}'")
                    except Exception as e:
                        logger.error(f"Whisper transcription failed: {str(e)}")
                        transcript = ""
            except Exception as e:
                logger.error(f"Transcription process error: {str(e)}")
                transcript = ""
            finally:
                # Always clean up the temporary file
                try:
                    if 'temp_file_path' in locals() and os.path.exists(temp_file_path):
                        os.unlink(temp_file_path)
                        logger.info(f"Cleaned up temp file: {temp_file_path}")
                except Exception as e:
                    logger.error(f"Cleanup error: {str(e)}")
            
            # Save the transcription chunk
            try:
                chunk = TranscriptionChunk.objects.create(
                    recording=recording,
                    text=transcript,
                    sequence_number=sequence_number
                )
                logger.info(f"Saved chunk {chunk.id}")
            except Exception as e:
                logger.error(f"Chunk save error: {str(e)}")
                return Response({'error': f'Failed to save chunk: {str(e)}'}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
            
            return Response({
                'recording_id': recording_id or recording.user_identifier,
                'chunk_id': str(chunk.id),
                'transcript': transcript,
                'is_final': True
            })
                
        except json.JSONDecodeError as e:
            logger.error(f"JSON decode error: {str(e)}")
            return Response({'error': f'Invalid JSON data: {str(e)}'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            logger.error(f"Unexpected error: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class GetTranscriptionView(APIView):
    """
    API view to get the complete transcription for a recording.
    """
    
    def get(self, request, recording_id, format=None):
        try:
            logger.info(f"Getting transcription for recording: {recording_id}")
            
            # Find by user_identifier - simpler approach
            recordings = AudioRecording.objects.filter(user_identifier=recording_id)
            if not recordings.exists():
                logger.info(f"No recording found with user_identifier: {recording_id}")
                return Response({'error': 'Recording not found'}, status=status.HTTP_404_NOT_FOUND)
            
            recording = recordings.first()
            logger.info(f"Found recording with DB ID: {recording.id}")
            
            # Get all chunks for this recording, ordered by sequence number
            chunks = TranscriptionChunk.objects.filter(recording=recording).order_by('sequence_number')
            
            # Get or create a full transcription object
            transcription = None
            try:
                # Look for a finalized transcription
                transcription = Transcription.objects.get(recording=recording)
                full_transcript = transcription.text
                logger.info(f"Using finalized transcription: {transcription.id}")
            except Transcription.DoesNotExist:
                # If no finalized transcription exists, combine chunks
                if chunks.exists():
                    full_transcript = ' '.join(chunk.text for chunk in chunks if chunk.text)
                    logger.info(f"Combined {chunks.count()} chunks into transcription")
                else:
                    # No chunks yet, return empty text
                    logger.info("No transcription chunks found")
                    return Response({'transcript': '', 'recording_id': recording_id})
            
            # Get fluency score if it exists
            fluency_data = None
            try:
                fluency_score = FluencyScore.objects.get(recording=recording)
                logger.info(f"Found fluency score: {fluency_score.id}")
                
                # Calculate some additional metrics to match what the frontend expects
                words = full_transcript.split()
                word_count = len(words)
                filler_words = ["um", "uh", "hmm", "like", "you know", "so", "actually", "basically", "literally"]
                filler_count = sum(1 for word in words if word.lower() in filler_words)
                
                fluency_data = {
                    'overall_score': round(fluency_score.overall_score, 2),
                    'speech_rate': round(fluency_score.speech_rate, 2),
                    'rhythm_score': round(fluency_score.rhythm_score, 2),
                    'accuracy_score': round(fluency_score.accuracy_score, 2),
                    
                    # Additional fields expected by frontend
                    'wpm': word_count * 2,  # Assuming 30 second recording
                    'filler_count': filler_count,
                    'speech_ratio': 0.7,  # Mock value
                    'word_count': word_count
                }
            except FluencyScore.DoesNotExist:
                logger.info("No fluency score found")
                pass
            
            # Build the response
            response_data = {
                'transcript': full_transcript,
                'recording_id': recording_id,  # Return the original ID
                'is_processed': recording.is_processed,
                'chunk_count': chunks.count() if chunks.exists() else 0
            }
            
            # Add fluency data if available
            if fluency_data:
                response_data['fluency_score'] = fluency_data
            
            return Response(response_data)
        except Exception as e:
            logger.error(f"Error getting transcription: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class FinalizeTranscriptionView(APIView):
    """
    API view to finalize a transcription and generate fluency scores.
    """
    
    def post(self, request, recording_id, format=None):
        try:
            logger.info(f"Finalizing transcription for recording: {recording_id}")
            
            # Find by user_identifier - simpler approach
            recordings = AudioRecording.objects.filter(user_identifier=recording_id)
            if not recordings.exists():
                logger.info(f"No recording found with user_identifier: {recording_id}")
                return Response({'error': 'Recording not found'}, status=status.HTTP_404_NOT_FOUND)
            
            recording = recordings.first()
            logger.info(f"Found recording with DB ID: {recording.id}")
            
            # Mark chunks as final
            chunks = TranscriptionChunk.objects.filter(recording=recording).order_by('sequence_number')
            if not chunks.exists():
                return Response({'error': 'No transcription chunks found'}, status=status.HTTP_404_NOT_FOUND)
            
            chunks.update(is_final=True)
            
            # Combine all chunk texts
            full_transcript = ' '.join(chunk.text for chunk in chunks if chunk.text)
            
            # Create a final transcription
            transcription, created = Transcription.objects.get_or_create(
                recording=recording,
                defaults={'text': full_transcript}
            )
            
            if not created:
                transcription.text = full_transcript
                transcription.save()
            
            # Calculate basic metrics for fluency score
            words = full_transcript.split()
            word_count = len(words)
            
            # Calculate filler words 
            filler_words = ["um", "uh", "hmm", "like", "you know", "so", "actually", "basically", "literally"]
            filler_count = sum(1 for word in words if word.lower() in filler_words)
            
            # Generate fluency scores with all required metrics
            try:
                # Calculate speech rate (words per minute) - assuming average recording length of 30 seconds
                wpm = word_count * 2  # Multiply by 2 to convert to per minute
                
                # Calculate metrics
                speech_rate = min(1.0, wpm / 150.0)  # Normalize to 0-1 range (150 wpm is good)
                rhythm_score = 0.8  # Mock value
                accuracy_score = 0.9  # Mock value
                
                # Calculate overall score - weighted average
                overall_score = (speech_rate + rhythm_score + accuracy_score) / 3
                
                # Create or update fluency score
                fluency_score, _ = FluencyScore.objects.get_or_create(
                    recording=recording,
                    defaults={
                        'overall_score': overall_score,
                        'speech_rate': speech_rate,
                        'rhythm_score': rhythm_score,
                        'accuracy_score': accuracy_score
                    }
                )
                
                # The frontend expects these specific fields
                fluency_data = {
                    'overall_score': round(fluency_score.overall_score, 2),
                    'speech_rate': round(fluency_score.speech_rate, 2),
                    'rhythm_score': round(fluency_score.rhythm_score, 2),
                    'accuracy_score': round(fluency_score.accuracy_score, 2),
                    
                    # Additional fields expected by frontend
                    'wpm': wpm,
                    'filler_count': filler_count,
                    'speech_ratio': 0.7,  # Mock value
                    'word_count': word_count
                }
            except Exception as e:
                logger.error(f"Error generating fluency score: {str(e)}")
                fluency_data = None
            
            # Mark recording as processed
            recording.is_processed = True
            recording.save()
            
            response_data = {
                'recording_id': recording_id,  # Return the original ID
                'transcript': transcription.text,
                'is_processed': True
            }
            
            if fluency_data:
                response_data['fluency_score'] = fluency_data
            
            return Response(response_data)
            
        except Exception as e:
            logger.error(f"Error finalizing transcription: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@csrf_exempt
def save_candidate_view(request):
    """Save candidate data to DynamoDB"""
    if request.method == 'POST':
        try:
            # Parse the JSON body
            data = json.loads(request.body)
            
            # Save the candidate data
            candidate_id = save_candidate(data)
            
            return JsonResponse({
                'success': True,
                'id': candidate_id
            })
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=400)
    
    return JsonResponse({
        'success': False,
        'error': 'Only POST method is allowed'
    }, status=405)

def get_all_candidates_view(request):
    """Get all candidates from DynamoDB"""
    if request.method == 'GET':
        try:
            # Get all candidates
            candidates = get_all_candidates()
            
            return JsonResponse(candidates, safe=False)
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only GET method is allowed'
    }, status=405)

@csrf_exempt
def delete_candidate_view(request, candidate_id):
    """Delete a candidate from DynamoDB by ID"""
    if request.method == 'DELETE':
        try:
            # Import the delete_candidate function
            from .dynamodb_utils import delete_candidate
            
            # Delete the candidate
            success = delete_candidate(candidate_id)
            
            if success:
                return JsonResponse({
                    'success': True,
                    'message': f'Candidate with ID {candidate_id} deleted successfully'
                })
            else:
                return JsonResponse({
                    'success': False,
                    'error': f'Failed to delete candidate with ID {candidate_id}'
                }, status=500)
        except Exception as e:
            return JsonResponse({
                'success': False,
                'error': str(e)
            }, status=500)
    
    return JsonResponse({
        'success': False,
        'error': 'Only DELETE method is allowed'
    }, status=405)

class CompleteAudioUploadView(APIView):
    """
    API view for processing a complete audio recording at once for better fluency analysis.
    This gives better results than processing chunks separately.
    """
    parser_classes = [MultiPartParser, FormParser]
    
    def post(self, request, format=None):
        try:
            # Get the audio file and recording ID from the request
            audio_file = request.FILES.get('audio_file')
            recording_id = request.POST.get('recording_id')
            
            if not audio_file:
                return Response({'error': 'No audio file provided'}, status=status.HTTP_400_BAD_REQUEST)
                
            logger.info(f"Received complete audio file for recording {recording_id}, file type: {audio_file.content_type}, size: {audio_file.size}")
            
            # Save the audio file to a temporary location
            with tempfile.NamedTemporaryFile(delete=False, suffix='.webm') as temp_file:
                for chunk in audio_file.chunks():
                    temp_file.write(chunk)
                temp_file_path = temp_file.name
                
            logger.info(f"Saved audio to temporary file: {temp_file_path}")
            
            try:
                # Get or create the recording by user_identifier instead of ID
                try:
                    if recording_id:
                        recordings = AudioRecording.objects.filter(user_identifier=recording_id)
                        if recordings.exists():
                            recording = recordings.first()
                            logger.info(f"Found existing recording with user_identifier: {recording_id}")
                        else:
                            # Create new recording with user_identifier
                            recording = AudioRecording.objects.create(user_identifier=recording_id)
                            logger.info(f"Created new recording with user_identifier: {recording_id}")
                    else:
                        # Generate a random identifier if none provided
                        new_id = f"recording_{random.randint(10000, 99999)}"
                        recording = AudioRecording.objects.create(user_identifier=new_id)
                        recording_id = new_id
                        logger.info(f"Created new recording with generated ID: {recording_id}")
                except Exception as e:
                    logger.error(f"Error getting/creating recording: {str(e)}")
                    return Response({'error': f"Error with recording ID: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
                # Convert audio to WAV format if needed for better Whisper compatibility
                wav_file_path = None
                try:
                    # Check if file needs conversion based on size and type
                    if audio_file.size < 1000:
                        logger.warning(f"Audio file too small ({audio_file.size} bytes), may be empty or corrupted")
                    
                    # Try to convert using ffmpeg if not already WAV
                    if not temp_file_path.lower().endswith('.wav'):
                        wav_file_path = os.path.join(settings.TEMP_DIR, f"{recording_id}_converted.wav")
                        logger.info(f"Converting audio to WAV format: {wav_file_path}")
                        
                        try:
                            ffmpeg_cmd = [
                                'ffmpeg', '-i', temp_file_path, 
                                '-c:a', 'pcm_s16le',  # Linear PCM format
                                '-ar', '16000',       # 16kHz sample rate for Whisper
                                '-ac', '1',           # Mono audio
                                '-y',                 # Overwrite output file
                                wav_file_path
                            ]
                            result = subprocess.run(ffmpeg_cmd, check=True, capture_output=True)
                            logger.info(f"Audio conversion successful: {wav_file_path}")
                            
                            # Use the converted file for processing
                            analysis_path = wav_file_path
                        except subprocess.CalledProcessError as e:
                            logger.error(f"FFMPEG conversion failed: {e}")
                            logger.error(f"FFMPEG stderr: {e.stderr.decode() if e.stderr else 'No error output'}")
                            
                            # Fall back to original file
                            analysis_path = temp_file_path
                    else:
                        # Already WAV format
                        analysis_path = temp_file_path
                        
                except Exception as e:
                    logger.error(f"Error in audio conversion: {str(e)}")
                    # Fall back to original file
                    analysis_path = temp_file_path
                
                # Process the audio file to get transcript and fluency scores
                logger.info(f"Analyzing audio file: {analysis_path}")
                
                # Use whisper to transcribe the complete audio
                from .fluency_analyzer import analyze_audio
                result = analyze_audio(analysis_path)
                
                if result and not result.get('error'):
                    # Extract transcript and metrics
                    transcript = result.get('transcript', '')
                    fluency_score = result.get('fluency_score', 0)
                    metrics = result.get('metrics', {})
                    
                    logger.info(f"Analysis successful. Transcript: {transcript[:50]}... (truncated)")
                    
                    # Update or create a final transcription
                    transcription, created = Transcription.objects.update_or_create(
                        recording=recording,
                        defaults={
                            'text': transcript
                        }
                    )
                    
                    # Update or create fluency score
                    fluency_obj, created = FluencyScore.objects.update_or_create(
                        recording=recording,
                        defaults={
                            'overall_score': fluency_score,
                            'speech_rate': metrics.get('wpm_score', 0),
                            'rhythm_score': metrics.get('ratio_score', 0),
                            'accuracy_score': metrics.get('filler_score', 0)
                        }
                    )
                    
                    # Return the complete analysis result
                    response_data = {
                        'recording_id': recording_id,
                        'transcript': transcript,
                        'fluency_score': fluency_score,
                        'overall_score': round(fluency_score * 100),  # Scale to 0-100
                        'speech_rate': round(metrics.get('wpm_score', 0) * 100),
                        'rhythm_score': round(metrics.get('ratio_score', 0) * 100),
                        'accuracy_score': round(metrics.get('filler_score', 0) * 100),
                        'wpm': metrics.get('wpm', 0),
                        'filler_count': metrics.get('filler_count', 0),
                        'speech_ratio': metrics.get('speech_ratio', 0),
                        'word_count': metrics.get('word_count', 0)
                    }
                    
                    logger.info(f"Returning successful analysis for recording {recording_id}")
                    return Response(response_data, status=status.HTTP_200_OK)
                else:
                    error_message = result.get('error', 'Unknown error during analysis')
                    logger.error(f"Error analyzing complete audio: {error_message}")
                    
                    # Return a more useful error response
                    return Response({
                        'error': error_message, 
                        'file_size': audio_file.size,
                        'file_type': audio_file.content_type,
                        'recording_id': recording_id
                    }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                    
            except Exception as e:
                logger.error(f"Error processing complete audio file: {str(e)}")
                return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
                
            finally:
                # Clean up temporary files
                for path in [temp_file_path, wav_file_path]:
                    if path and os.path.exists(path):
                        try:
                            os.remove(path)
                            logger.info(f"Cleaned up temp file: {path}")
                        except Exception as e:
                            logger.error(f"Failed to remove temp file {path}: {str(e)}")
                        
        except Exception as e:
            logger.error(f"Error in complete audio upload: {str(e)}")
            return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
