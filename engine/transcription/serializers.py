from rest_framework import serializers
from .models import AudioRecording, Transcription, FluencyScore, TranscriptionChunk

class AudioRecordingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AudioRecording
        fields = ['id', 'user', 'audio_file', 'created_at', 'duration', 'is_processed']
        read_only_fields = ['user', 'created_at', 'is_processed']

class TranscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Transcription
        fields = ['id', 'recording', 'text', 'created_at', 'updated_at']
        read_only_fields = ['created_at', 'updated_at']

class TranscriptionChunkSerializer(serializers.ModelSerializer):
    class Meta:
        model = TranscriptionChunk
        fields = ['id', 'recording', 'text', 'sequence_number', 'created_at', 'is_final']
        read_only_fields = ['created_at']

class FluencyScoreSerializer(serializers.ModelSerializer):
    class Meta:
        model = FluencyScore
        fields = ['id', 'recording', 'overall_score', 'speech_rate', 
                 'rhythm_score', 'accuracy_score', 'created_at']
        read_only_fields = ['created_at']

class AudioUploadSerializer(serializers.Serializer):
    audio_file = serializers.FileField()
    user_identifier = serializers.CharField(required=False, allow_blank=True) 