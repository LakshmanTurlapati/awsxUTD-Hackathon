# Generated by Django 5.2 on 2025-04-09 21:26

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AudioRecording',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('audio_file', models.FileField(upload_to='recordings/')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('duration', models.FloatField(blank=True, null=True)),
                ('is_processed', models.BooleanField(default=False)),
                ('user', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='recordings', to=settings.AUTH_USER_MODEL)),
            ],
        ),
        migrations.CreateModel(
            name='FluencyScore',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('overall_score', models.FloatField()),
                ('speech_rate', models.FloatField()),
                ('rhythm_score', models.FloatField()),
                ('accuracy_score', models.FloatField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('recording', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='fluency_scores', to='transcription.audiorecording')),
            ],
        ),
        migrations.CreateModel(
            name='Transcription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.TextField()),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('recording', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='transcriptions', to='transcription.audiorecording')),
            ],
        ),
        migrations.CreateModel(
            name='TranscriptionChunk',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.TextField()),
                ('sequence_number', models.IntegerField(default=0)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('is_final', models.BooleanField(default=False)),
                ('recording', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='chunks', to='transcription.audiorecording')),
            ],
            options={
                'ordering': ['sequence_number'],
            },
        ),
    ]
