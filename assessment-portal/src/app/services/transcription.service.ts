import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class TranscriptionService {
  private apiUrl = environment.apiUrl;
  private recordingSubject = new BehaviorSubject<boolean>(false);
  public recording$ = this.recordingSubject.asObservable();
  
  private transcriptionSubject = new BehaviorSubject<string>('');
  public transcription$ = this.transcriptionSubject.asObservable();
  
  private fluencyScoreSubject = new BehaviorSubject<any>(null);
  public fluencyScore$ = this.fluencyScoreSubject.asObservable();
  
  private countdownSubject = new BehaviorSubject<number>(60);
  public countdown$ = this.countdownSubject.asObservable();
  
  private loadingFluencyScoreSubject = new BehaviorSubject<boolean>(false);
  public loadingFluencyScore$ = this.loadingFluencyScoreSubject.asObservable();
  
  private fluencyScoreErrorSubject = new BehaviorSubject<boolean>(false);
  public fluencyScoreError$ = this.fluencyScoreErrorSubject.asObservable();
  
  private completeTranscription: string = '';
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private countdownInterval: any;
  private recordingId: string | null = null;
  private sequenceNumber = 0;
  private speechRecognition: any;
  private recognitionActive = false;
  private consolidatedBlob: Blob | null = null;
  private audioContext: AudioContext | null = null;

  constructor(private http: HttpClient) {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (error) {
      console.error('Failed to create AudioContext:', error);
    }
    this.setupSpeechRecognition();
  }

  // Set up browser Speech Recognition API if available
  private setupSpeechRecognition(): void {
    try {
      // Initialize browser's Speech Recognition API
      const SpeechRecognition = (window as any).SpeechRecognition || 
                                (window as any).webkitSpeechRecognition;
      
      if (SpeechRecognition) {
        this.speechRecognition = new SpeechRecognition();
        this.speechRecognition.continuous = true;
        this.speechRecognition.interimResults = true;
        this.speechRecognition.lang = 'en-US';
        
        // Handle speech recognition results
        this.speechRecognition.onresult = (event: any) => {
          let interimTranscript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              this.completeTranscription += event.results[i][0].transcript + ' ';
            } else {
              interimTranscript += event.results[i][0].transcript;
            }
          }
          const combinedTranscript = this.completeTranscription + interimTranscript;
          console.log('Browser speech recognition interim result:', combinedTranscript);
          this.transcriptionSubject.next(combinedTranscript);
        };
        
        this.speechRecognition.onerror = (event: any) => {
          console.error('Speech recognition error:', event.error);
        };
        
        this.speechRecognition.onend = () => {
          console.log('Speech recognition ended, restarting...');
          if (this.recognitionActive) {
            try {
              this.speechRecognition.start();
              console.log('Speech recognition restarted');
            } catch (error) {
              console.error('Error restarting speech recognition:', error);
            }
          }
        };
        
        console.log('Speech Recognition API initialized successfully');
      } else {
        console.warn('Speech Recognition API not supported in this browser');
      }
    } catch (error) {
      console.error('Error setting up speech recognition:', error);
    }
  }

  // Start recording with both browser recognition and audio capture
  public startRecording(): void {
    console.log('Starting recording...');
    
    // Reset the recording state
    this.recordingId = this.generateId();
    this.sequenceNumber = 0;
    this.completeTranscription = '';
    this.transcriptionSubject.next('');
    this.fluencyScoreSubject.next(null);
    this.loadingFluencyScoreSubject.next(false);
    this.fluencyScoreErrorSubject.next(false);
    this.audioChunks = []; // Clear existing chunks
    this.consolidatedBlob = null;
    
    // Start the browser's speech recognition if available
    if (this.speechRecognition) {
      try {
        this.speechRecognition.start();
        this.recognitionActive = true;
        console.log('Browser speech recognition started');
      } catch (error) {
        console.error('Error starting speech recognition:', error);
      }
    }
    
    // Request microphone access
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        // Configure MediaRecorder for WebM format (more widely supported)
        const options = { 
          mimeType: 'audio/webm'
        };
        
        try {
          this.mediaRecorder = new MediaRecorder(stream, options);
        } catch (e) {
          console.warn('WebM format not supported, falling back to default format');
          this.mediaRecorder = new MediaRecorder(stream);
        }
        
        // Collect all chunks for complete recording processing
        const completeAudioChunks: Blob[] = [];
        
        // Start the mediaRecorder
        this.mediaRecorder.start(1000);  // Collect data every second
        console.log('MediaRecorder started with mimeType:', this.mediaRecorder.mimeType);
        
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            // Save to both arrays
            this.audioChunks.push(event.data);
            completeAudioChunks.push(event.data);
            this.sequenceNumber++;
            
            // Send audio data to backend for real-time transcription
            this.processAudioChunk(event.data);
          }
        };
        
        this.mediaRecorder.onstop = () => {
          console.log('MediaRecorder stopped');
          
          // Release microphone
          stream.getTracks().forEach(track => track.stop());
          
          // Store the complete recording chunks for later processing
          this.audioChunks = completeAudioChunks;
          console.log(`Collected ${this.audioChunks.length} chunks for complete processing`);
          
          // Process the complete recording for better transcription and fluency analysis
          this.processCompleteRecording();
        };
        
        // Start countdown timer
        this.startCountdown();
        this.recordingSubject.next(true);
      })
      .catch((error) => {
        console.error('Error accessing microphone:', error);
        this.recordingSubject.next(false);
      });
  }
  
  private processAudioChunk(audioBlob: Blob): void {
    if (!audioBlob || audioBlob.size === 0) return;
    
    const fileExtension = '.webm';  // Always use .webm extension for consistency
    
    // Read as base64
    const reader = new FileReader();
    
    reader.onloadend = () => {
      try {
        const base64Audio = reader.result as string;
        // Remove the data URL prefix
        const base64Data = base64Audio.split(',')[1];
        
        if (!base64Data) {
          console.error('Failed to convert audio to base64');
          return;
        }
        
        // Send to server for streaming transcription
        this.http.post(`${this.apiUrl}/transcription/stream/`, {
          audio: base64Data,
          recording_id: this.recordingId,
          sequence_number: this.sequenceNumber,
          content_type: 'audio/webm',
          file_extension: fileExtension
        }).subscribe({
          next: (response: any) => {
            // Only update transcription if there's actual text and speech recognition isn't active
            if (response.transcript && !this.recognitionActive) {
              console.log(`Received transcription: ${response.transcript}`);
              // Set the text directly rather than appending to prevent duplications
              this.transcriptionSubject.next(response.transcript);
            }
          },
          error: (error) => {
            console.error('Error sending audio chunk:', error);
          }
        });
      } catch (error) {
        console.error('Error processing audio chunk:', error);
      }
    };
    
    reader.onerror = (error) => {
      console.error('Error reading audio data:', error);
    };
    
    reader.readAsDataURL(audioBlob);
  }

  private processCompleteRecording(): void {
    console.log('Processing complete recording...');
    
    // Create a consolidated blob from all chunks - use stored audioChunks not already processed ones
    if (this.audioChunks.length === 0) {
      console.log('No audio chunks available for processing');
      this.loadingFluencyScoreSubject.next(false);
      // Fallback to finalizing with the segments
      this.finalizeRecording();
      return;
    }
    
    // Use a better compatible audio format
    this.consolidatedBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
    
    // Show loading state for fluency score
    this.loadingFluencyScoreSubject.next(true);
    this.fluencyScoreErrorSubject.next(false);
    
    // Send the complete audio file for better processing
    const formData = new FormData();
    formData.append('audio_file', this.consolidatedBlob, `${this.recordingId}.webm`);
    formData.append('recording_id', this.recordingId || '');
    
    // Send to the upload endpoint that will process the entire file
    this.http.post(`${this.apiUrl}/transcription/upload-complete/`, formData).subscribe({
      next: (response: any) => {
        console.log('Complete recording processed:', response);
        
        // Update with the more accurate transcription
        if (response.transcript) {
          this.transcriptionSubject.next(response.transcript);
        }
        
        // Update with the accurate fluency score
        if (response.fluency_score !== undefined) {
          this.fluencyScoreSubject.next(response);
        }
        
        // Hide loading state
        this.loadingFluencyScoreSubject.next(false);
      },
      error: (error) => {
        console.error('Error processing complete recording:', error);
        this.loadingFluencyScoreSubject.next(false);
        this.fluencyScoreErrorSubject.next(true);
        
        // Fallback to finalizing with the segments if upload fails
        this.finalizeRecording();
      }
    });
  }
  
  private finalizeRecording(): void {
    console.log('Finalizing recording...');
    
    if (!this.recordingId) {
      console.error('Missing recording ID for finalization');
      this.loadingFluencyScoreSubject.next(false);
      this.fluencyScoreErrorSubject.next(true);
      return;
    }
    
    this.http.post(`${this.apiUrl}/transcription/finalize/${this.recordingId}/`, {}).subscribe({
      next: (response: any) => {
        console.log('Recording finalized:', response);
        
        // Update transcription with final text if available
        if (response.transcript) {
          this.transcriptionSubject.next(response.transcript);
        }
        
        // Check if fluency score is included in the response
        if (response.fluency_score) {
          this.fluencyScoreSubject.next(response.fluency_score);
          this.loadingFluencyScoreSubject.next(false);
          return;
        }
        
        // If not included, fetch the updated fluency score from backend
        this.http.get(`${this.apiUrl}/transcription/get-transcription/${this.recordingId}/`).subscribe({
          next: (scoreResponse: any) => {
            if (scoreResponse.fluency_score) {
              this.fluencyScoreSubject.next(scoreResponse.fluency_score);
              this.fluencyScoreErrorSubject.next(false);
            } else {
              console.warn('No fluency score in response');
              this.fluencyScoreErrorSubject.next(true);
            }
            this.loadingFluencyScoreSubject.next(false);
          },
          error: (error) => {
            console.error('Error fetching fluency score:', error);
            this.loadingFluencyScoreSubject.next(false);
            this.fluencyScoreErrorSubject.next(true);
          }
        });
      },
      error: (error) => {
        console.error('Error finalizing recording:', error);
        this.loadingFluencyScoreSubject.next(false);
        this.fluencyScoreErrorSubject.next(true);
      }
    });
  }
  
  public stopRecording(): void {
    console.log('Stopping recording...');
    
    // Stop the speech recognition if active
    if (this.speechRecognition && this.recognitionActive) {
      try {
        this.speechRecognition.stop();
        this.recognitionActive = false;
        console.log('Browser speech recognition stopped');
      } catch (error) {
        console.error('Error stopping speech recognition:', error);
      }
    }
    
    // Stop the media recorder if active
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
      console.log('MediaRecorder stopping...');
    }
    
    // Stop the countdown timer
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }
    
    this.recordingSubject.next(false);
  }
  
  private startCountdown(): void {
    // Start with 2 minutes (120 seconds)
    let remainingTime = 120;
    this.countdownSubject.next(remainingTime);
    
    this.countdownInterval = setInterval(() => {
      remainingTime--;
      this.countdownSubject.next(remainingTime);
      
      if (remainingTime <= 0) {
        this.stopRecording();
      }
    }, 1000);
  }
  
  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }
  
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }
} 