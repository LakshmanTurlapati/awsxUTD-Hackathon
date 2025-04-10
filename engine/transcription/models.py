from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()

class AudioRecording(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recordings', null=True, blank=True)
    audio_file = models.FileField(upload_to='recordings/', null=True, blank=True)
    user_identifier = models.CharField(max_length=255, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    duration = models.FloatField(null=True, blank=True)
    is_processed = models.BooleanField(default=False)

    def __str__(self):
        user_name = self.user.username if self.user else self.user_identifier or "Unknown"
        return f"Recording {self.id} by {user_name}"

class Transcription(models.Model):
    recording = models.ForeignKey(AudioRecording, on_delete=models.CASCADE, related_name='transcriptions')
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Transcription for Recording {self.recording.id}"

class TranscriptionChunk(models.Model):
    recording = models.ForeignKey(AudioRecording, on_delete=models.CASCADE, related_name='chunks')
    text = models.TextField()
    sequence_number = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    is_final = models.BooleanField(default=False)

    class Meta:
        ordering = ['sequence_number']

    def __str__(self):
        return f"Chunk {self.sequence_number} for Recording {self.recording.id}"

class FluencyScore(models.Model):
    recording = models.ForeignKey(AudioRecording, on_delete=models.CASCADE, related_name='fluency_scores')
    overall_score = models.FloatField()
    speech_rate = models.FloatField()
    rhythm_score = models.FloatField()
    accuracy_score = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Fluency Score for Recording {self.recording.id}"
