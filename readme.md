# AWSxUTD Hackathon

## Smart Assessment Portal: Multi-Model, Multi-Agentic Workflow System

### Overview

This project is a comprehensive AI-powered assessment platform developed for the AWSxUTD Hackathon. It combines voice recognition, real-time transcription, language model evaluation, and technical assessment to create a seamless candidate evaluation experience.

The system demonstrates a multi-model, multi-agentic workflow where different AI models and services work together to provide a holistic assessment solution:

- **Speech-to-Text Transcription**: Real-time audio processing using Whisper AI
- **Language Understanding**: Evaluation of responses using large language models (Gemma-3-12B)
- **Technical Assessment**: Dynamically generated technical questions based on candidate experience
- **Fluency Analysis**: Audio signal processing to evaluate speech fluency
- **Data Persistence**: AWS DynamoDB integration with local fallback mechanism
- **Intelligent Matching**: Candidate-to-referrer matching system for job opportunities

### Architecture

The application follows a modern client-server architecture:

#### Frontend (Angular 17)
- Interactive assessment portal with dynamic UI using Angular components
- Real-time audio visualization and processing via Web Audio API and Canvas
- Multi-step assessment workflow with state management
- Technical assessment component with dynamic question generation
- WebRTC for audio capture and streaming
- RxJS Observables for reactive state management and data streaming
- Referral dashboard for managing job opportunities and candidate matches

#### Backend (Django/Python)
- RESTful API services using Django REST Framework
- Audio processing pipeline with FFmpeg for format conversion
- Integration with LLM APIs (modular design supporting multiple providers)
- AWS DynamoDB connectivity with fallback to local storage
- Fluency analysis engine powered by librosa and numpy
- Whisper AI model integration for accurate transcription
- Chunked audio processing for real-time feedback

### Technical Implementation

#### Audio Processing Pipeline
```
Browser Audio Capture → WebM Encoding → Chunked Streaming → 
Backend Processing → Whisper Transcription → Signal Analysis → 
Feature Extraction → Fluency Scoring
```

#### Fluency Analysis System
The system implements a sophisticated audio analysis engine that evaluates:

- **Speech Rate**: Analysis of syllable/word frequency using advanced signal processing
- **Rhythm Assessment**: Measurement of pause patterns and silence distribution
- **Filler Word Detection**: Identification of hesitation markers ("um", "uh", etc.)
- **Prosodic Features**: Evaluation of pitch variations and energy contours

#### Agent Architecture
```
Experience Level Input → Prompt Engineering → LLM API Request →
JSON Response Parsing → Question Object Formation → Dynamic Rendering
```

#### Multi-threaded Processing
- Browser WebWorkers and request parallelization for responsive UI
- Asynchronous Django views with optimized database queries
- Parallel API calls for question generation across different technology domains

### Data Flow Architecture

1. **Audio Capture and Streaming**
   - Browser captures audio via WebRTC APIs at high-quality sample rates
   - Audio chunks encoded with efficient compression for transmission
   - Base64 encoding for HTTP transport
   - Dual-track processing with browser Speech Recognition API for immediate feedback

2. **Transcription Processing**
   - Django view `StreamingTranscriptionView` handles chunked audio
   - Audio format conversion with librosa and FFmpeg fallback
   - Whisper model transcribes each chunk
   - `TranscriptionChunk` model stores sequential pieces
   - `FinalizeTranscriptionView` aggregates and processes complete recording

3. **Technical Assessment Generation**
   - `TechnicalAssessmentComponent` triggers questions via `LLMService`
   - Parallel API calls generate questions for different technology domains
   - Robust error handling with fallback questions
   - Dynamic rendering via `QuestionComponent`

4. **Candidate Data Storage**
   - Data normalized into `CandidateData` interface
   - AWS SDK for DynamoDB operations with transaction support
   - Custom JSON serialization/deserialization in backend
   - Local fallback using in-memory storage

### Database Schema

#### Django Models
```python
class AudioRecording(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='recordings', null=True)
    audio_file = models.FileField(upload_to='recordings/', null=True)
    user_identifier = models.CharField(max_length=255, blank=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    duration = models.FloatField(null=True)
    is_processed = models.BooleanField(default=False)

class Transcription(models.Model):
    recording = models.ForeignKey(AudioRecording, on_delete=models.CASCADE, related_name='transcriptions')
    text = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

class TranscriptionChunk(models.Model):
    recording = models.ForeignKey(AudioRecording, on_delete=models.CASCADE, related_name='chunks')
    text = models.TextField()
    sequence_number = models.IntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    is_final = models.BooleanField(default=False)

class FluencyScore(models.Model):
    recording = models.ForeignKey(AudioRecording, on_delete=models.CASCADE, related_name='fluency_scores')
    overall_score = models.FloatField()
    speech_rate = models.FloatField()
    rhythm_score = models.FloatField()
    accuracy_score = models.FloatField()
    created_at = models.DateTimeField(auto_now_add=True)
```

#### DynamoDB Schema
```typescript
export interface CandidateData {
  id?: string;
  name: string;
  email: string;
  education: string;
  experience: number;
  fluencyScore?: number;
  interpersonalScore?: number;
  interestsScore?: number;
  careerGoalsScore?: number;
  pythonScore?: number;
  javaScore?: number;
  awsScore?: number;
  cppScore?: number;
  responses?: {
    interests?: string;
    careerGoals?: string;
    transcription?: string;
  };
  timestamp?: number;
}

export interface RefererData {
  id: string;
  name: string;
  role: string;
  image: string;
  about: string;
  requirement: string;
}
```

### Key API Endpoints

#### Transcription Services
- `/api/transcription/stream/` - Real-time streaming transcription
- `/api/transcription/upload/` - Complete audio file processing
- `/api/transcription/finalize/<recording_id>/` - Complete transcription processing
- `/api/transcription/get-transcription/<recording_id>/` - Retrieve transcription

#### Candidate Management
- `/api/transcription/candidate/save/` - Store candidate assessment data
- `/api/transcription/candidate/all/` - Retrieve all candidates
- `/api/transcription/candidate/delete/<candidate_id>/` - Remove candidate

#### Referer System
- `/api/transcription/referer/save/` - Store job referer information
- `/api/transcription/referer/all/` - Retrieve all job referers
- `/api/transcription/referer/<referer_id>/` - Get specific referer
- `/api/transcription/referer/upload-image/<referer_id>/` - Upload profile image

### Technical Challenges and Solutions

1. **Real-time Audio Processing**
   - Challenge: Minimizing latency while maintaining quality
   - Solution: Dual-track processing with browser Speech Recognition API for immediate feedback and server-side Whisper AI for accuracy

2. **Browser Compatibility**
   - Challenge: Inconsistent WebRTC implementation across browsers
   - Solution: Multiple audio format support and fallback mechanisms

3. **LLM Response Consistency**
   - Challenge: Ensuring consistent structured responses from language models
   - Solution: Robust error handling and response normalization techniques

4. **Offline Capability**
   - Challenge: Maintaining functionality without network
   - Solution: In-memory storage arrays for local development

### Multi-Model Intelligent System

The platform leverages multiple AI models working in tandem:

1. **Whisper AI**: OpenAI's speech recognition model for accurate transcription
2. **Gemma-3-12B**: LLM for technical question generation and evaluation
3. **Custom Fluency Model**: Signal processing algorithms for speech assessment
4. **TF-IDF Matching Algorithm**: For candidate-referer matching

The language model is trained to respond differently based on different command prefixes, functioning as a versatile agent that can:
- Generate technical assessment questions
- Evaluate candidate responses against multiple criteria
- Create personalized referral messages

### Referral System and Candidate Matching

A key component of the platform is its intelligent referral system:

#### Referral Dashboard
- Allows professionals to register as job referrers
- Enables uploading of profile images and job requirements
- Provides an intuitive interface for managing referrals

#### Intelligent Matching Engine
- Analyzes candidate profiles against job requirements
- Uses a sophisticated matching algorithm to identify suitable candidates
- Factors in technical skills, communication abilities, and career interests
- Generates personalized referral messages tailored to each candidate

The system demonstrates how multiple AI agents can collaborate in a workflow:
- **Audio Processing Agent**: Handles speech-to-text conversion
- **Fluency Analysis Agent**: Evaluates speech patterns and quality
- **Technical Assessment Agent**: Generates and scores technical questions
- **Matching Agent**: Pairs candidates with appropriate job opportunities

Each agent has a specialized role yet works seamlessly with others to produce a unified assessment experience, showcasing the power of Multi-Agent AI systems in practical applications.

