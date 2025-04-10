import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, NgForm } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { TechnicalAssessmentComponent } from './technical-assessment/technical-assessment.component';
import { HttpClientModule } from '@angular/common/http';
import { TranscriptionService } from '../services/transcription.service';
import { LlmService } from '../services/llm.service';
import { DynamoDBService, CandidateData } from '../services/dynamodb.service';
import { Subscription, forkJoin, of } from 'rxjs';
import { Router } from '@angular/router';
import { VantaService } from '../app.component';
import { distinctUntilChanged } from 'rxjs/operators';

interface FormData {
  name: string;
  email: string;
  education: string;
  interests: string;
  careerGoals: string;
}

@Component({
  selector: 'app-assessment',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, TechnicalAssessmentComponent, HttpClientModule],
  templateUrl: './assessment.component.html',
  styleUrl: './assessment.component.scss'
})
export class AssessmentComponent implements OnInit, OnDestroy {
  isRecording = false;
  recordingTime = 120; // Start at 120 seconds (2 minutes)
  timerInterval: any;
  experienceValue = 0;
  showTechnicalAssessment = false;
  isLoading = false;
  isLoadingFluencyScore = false; // Loading state for fluency score
  fluencyScoreError = false; // Error state for fluency score
  
  // Form data
  formData: FormData = {
    name: '',
    email: '',
    education: '',
    interests: '',
    careerGoals: ''
  };
  
  // Form validation
  formErrors: Record<string, string> = {};
  formSubmitted = false;
  formValid = false;
  
  // Popup related
  showScorePopup = false;
  candidateScores: any = null;
  isScoreLoading = false;
  
  // Transcription data
  currentTranscription = '';
  fluencyScore: any = null;
  private transcriptionSubscription: Subscription | null = null;
  private fluencyScoreSubscription: Subscription | null = null;
  private loadingFluencyScoreSubscription: Subscription | null = null;
  private fluencyScoreErrorSubscription: Subscription | null = null;
  
  // Technical assessment data
  technicalResponses: Record<string, string> = {};
  
  // Audio processing properties
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private microphone: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;
  private animationFrameId: number | null = null;
  
  @ViewChild(TechnicalAssessmentComponent) technicalAssessmentComponent!: TechnicalAssessmentComponent;
  
  constructor(
    private transcriptionService: TranscriptionService,
    private llmService: LlmService,
    private dynamoDBService: DynamoDBService,
    private router: Router,
    private vantaService: VantaService
  ) {}
  
  ngOnInit() {
    // Initialize the experience slider event listener
    const experienceSlider = document.getElementById('experience') as HTMLInputElement;
    const experienceValueElement = document.querySelector('.experience-value') as HTMLElement;
    
    if (experienceSlider && experienceValueElement) {
      experienceSlider.addEventListener('input', () => {
        this.experienceValue = parseInt(experienceSlider.value);
        experienceValueElement.textContent = this.experienceValue === 8 ? '8+' : this.experienceValue.toString();
        
        // NEW: update slider background fill so that the track before the thumb is orange
        const percentage = (this.experienceValue / 8) * 100;
        experienceSlider.style.background = `linear-gradient(to right, #FF9900 ${percentage}%, #e0e0e0 ${percentage}%)`;
        
        // Show technical assessment when experience is selected
        if (this.experienceValue > 0 && !this.isLoading) {
          // Set loading state to true
          this.isLoading = true;
          this.vantaService.setLoaderState('technicalAssessment', true);
          
          this.showTechnicalAssessment = true;
          
          // Keep animation running until questions are fully loaded
          // Check every 500ms if the technical assessment component is ready
          const loadingCheckInterval = setInterval(() => {
            if (this.technicalAssessmentComponent && 
                this.technicalAssessmentComponent.questions && 
                Object.keys(this.technicalAssessmentComponent.questions).length > 0) {
              
              // Questions are loaded, stop the animation after a short delay
              setTimeout(() => {
                this.isLoading = false;
                this.vantaService.setLoaderState('technicalAssessment', false);
                clearInterval(loadingCheckInterval);
              }, 1000);
            }
          }, 500);
          
          // Failsafe - stop loading after 10 seconds if questions don't load
          setTimeout(() => {
            if (this.isLoading) {
              this.isLoading = false;
              this.vantaService.setLoaderState('technicalAssessment', false);
              clearInterval(loadingCheckInterval);
            }
          }, 10000);
        }
      });
    }
    
    // Setup record button event listener
    const recordButton = document.querySelector('.record-btn') as HTMLButtonElement;
    
    if (recordButton) {
      recordButton.addEventListener('click', () => {
        if (this.isRecording) {
          this.stopRecording();
        } else {
          this.startRecording();
        }
      });
    }

    // Initialize audio processing and start listening to microphone
    this.initAudio();
    
    // Subscribe to transcription updates
    this.transcriptionSubscription = this.transcriptionService.transcription$.subscribe(
      text => {
        this.currentTranscription = text;
      }
    );
    
    // Subscribe to fluency score updates
    this.fluencyScoreSubscription = this.transcriptionService.fluencyScore$.subscribe(
      score => {
        this.fluencyScore = score;
        // Reset error state when we get a valid score
        if (score) {
          this.fluencyScoreError = false;
        }
      }
    );
    
    // Subscribe to loading state for fluency score
    this.loadingFluencyScoreSubscription = this.transcriptionService.loadingFluencyScore$
      .pipe(distinctUntilChanged())
      .subscribe(
        isLoading => {
          this.isLoadingFluencyScore = isLoading;
          this.vantaService.setLoaderState('fluencyAnalyzer', isLoading);
        }
      );
    
    // Subscribe to error state for fluency score
    this.fluencyScoreErrorSubscription = this.transcriptionService.fluencyScoreError$.subscribe(
      hasError => {
        this.fluencyScoreError = hasError;
      }
    );
    
    // Setup the submit button event listener
    const submitButton = document.querySelector('.submit-btn') as HTMLButtonElement;
    if (submitButton) {
      submitButton.addEventListener('click', (event) => {
        event.preventDefault();
        this.submitForm();
      });
    }
  }
  
  ngOnDestroy() {
    // Clean up audio resources when component is destroyed
    this.cleanupAudio();
    
    // Clean up subscriptions
    if (this.transcriptionSubscription) {
      this.transcriptionSubscription.unsubscribe();
      this.transcriptionSubscription = null;
    }
    
    if (this.fluencyScoreSubscription) {
      this.fluencyScoreSubscription.unsubscribe();
      this.fluencyScoreSubscription = null;
    }
    
    if (this.loadingFluencyScoreSubscription) {
      this.loadingFluencyScoreSubscription.unsubscribe();
      this.loadingFluencyScoreSubscription = null;
    }
    
    if (this.fluencyScoreErrorSubscription) {
      this.fluencyScoreErrorSubscription.unsubscribe();
      this.fluencyScoreErrorSubscription = null;
    }
  }
  
  async initAudio() {
    try {
      // Set up audio context
      window.AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContext();
      
      // Due to browser autoplay policies, we need to resume the context on user interaction
      if (this.audioContext && this.audioContext.state === 'suspended') {
        const resumeAudio = async () => {
          if (this.audioContext) {
            await this.audioContext.resume();
          }
          document.removeEventListener('click', resumeAudio);
          document.removeEventListener('touchstart', resumeAudio);
        };
        document.addEventListener('click', resumeAudio);
        document.addEventListener('touchstart', resumeAudio);
      }
      
      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } 
      });
      
      // Create audio source from microphone
      this.microphone = this.audioContext.createMediaStreamSource(this.mediaStream);
      
      // Create analyser node
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // Smaller FFT size for better performance
      this.analyser.smoothingTimeConstant = 0.8; // Smoother transitions between frames
      
      // Connect microphone to analyser
      this.microphone.connect(this.analyser);
      
      // Start the original-style waveform animation with real-time audio data
      this.animateWaveform();
      
      console.log('Real-time audio processing initialized');
      
      // Update UI to show microphone is active
      const statusElement = document.querySelector('.microphone-status .status-text');
      if (statusElement) {
        statusElement.textContent = 'Microphone active: Real-time audio visualization';
      }
    } catch (error) {
      console.error('Error initializing audio:', error);
      
      // Update UI to show error
      const statusElement = document.querySelector('.microphone-status .status-text');
      if (statusElement) {
        statusElement.textContent = 'Error: Could not access microphone. Please check permissions.';
        (statusElement as HTMLElement).style.color = '#d9534f';
      }
    }
  }
  
  animateWaveform() {
    if (!this.analyser) return;

    const fps = 30; // Higher frame rate for better responsiveness
    const interval = 1000 / fps; // Time between frames in milliseconds
    let lastTime = 0;
    
    // Number of data points to display (same as original)
    const dataPoints = 70;
    
    // Store the current and target waveform data for interpolation
    let currentData = Array.from({ length: dataPoints }, () => 0);
    let targetData = Array.from({ length: dataPoints }, () => 0);
    
    // Create an array for the analyzer data
    const analyzerBuffer = new Uint8Array(this.analyser.frequencyBinCount);
    
    const animate = (currentTime: number) => {
      this.animationFrameId = requestAnimationFrame(animate);
      
      // Calculate the time elapsed since the last frame
      const deltaTime = currentTime - lastTime;
      
      // Only update the waveform if enough time has passed
      if (deltaTime >= interval) {
        // Get real-time audio data from microphone
        this.analyser!.getByteFrequencyData(analyzerBuffer);
        
        // Convert analyzer data to target data format
        // Sample frequency data to get our target points
        const blockSize = Math.floor(analyzerBuffer.length / dataPoints);
        for (let i = 0; i < dataPoints; i++) {
          let sum = 0;
          for (let j = 0; j < blockSize; j++) {
            const index = blockSize * i + j;
            if (index < analyzerBuffer.length) {
              sum += analyzerBuffer[index];
            }
          }
          // Normalize to 0-1 with enhanced sensitivity
          targetData[i] = (sum / (blockSize * 255)) * 1.5; // Amplify the values for better visibility
        }
        
        // Update the last time the waveform was drawn
        lastTime = currentTime;
      }
      
      // Interpolate between current and target data for smoother transitions
      const interpolationFactor = 0.25; // Increased for faster response to sound
      for (let i = 0; i < currentData.length; i++) {
        currentData[i] = currentData[i] + (targetData[i] - currentData[i]) * interpolationFactor;
      }
      
      // Draw the interpolated waveform
      this.draw(this.normalizeData(currentData));
    };
    
    // Start the animation
    requestAnimationFrame(animate);
  }
  
  normalizeData(filteredData: number[]): number[] {
    const multiplier = Math.pow(Math.max(...filteredData, 0.01), -1);
    return filteredData.map(n => n * multiplier);
  }
  
  draw(normalizedData: number[]) {
    const canvas = document.querySelector(".waveform") as HTMLCanvasElement;
    const dpr = window.devicePixelRatio || 1;
    const padding = 20;
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = (canvas.offsetHeight + padding * 2) * dpr;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    
    // Clear the canvas before drawing the new waveform
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.scale(dpr, dpr);
    ctx.translate(0, canvas.offsetHeight / 2 + padding);
    
    const width = canvas.offsetWidth / normalizedData.length;
    for (let i = 0; i < normalizedData.length; i++) {
      const x = width * i;
      let height = normalizedData[i] * canvas.offsetHeight - padding;
      if (height < 0) {
        height = 0;
      } else if (height > canvas.offsetHeight / 2) {
        height = canvas.offsetHeight / 2;
      }
      this.drawLineSegment(ctx, x, height, width, (i + 1) % 2);
    }
  }
  
  drawLineSegment(ctx: CanvasRenderingContext2D, x: number, height: number, width: number, isEven: number) {
    ctx.lineWidth = 1;
    ctx.strokeStyle = "#FF9900"; // Use the orange color from the theme
    ctx.beginPath();
    height = isEven ? height : -height;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.arc(x + width / 2, height, width / 2, Math.PI, 0, Boolean(isEven));
    ctx.lineTo(x + width, 0);
    ctx.stroke();
  }
  
  cleanupAudio() {
    // Cancel animation frame if it's running
    if (this.animationFrameId) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
    
    // Disconnect the audio nodes
    if (this.microphone) {
      this.microphone.disconnect();
      this.microphone = null;
    }
    
    // Stop the media stream tracks
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    
    // Close the audio context
    if (this.audioContext) {
      if (this.audioContext.state !== 'closed') {
        this.audioContext.close();
      }
      this.audioContext = null;
    }
    
    console.log('Audio resources cleaned up');
  }
  
  startRecording() {
    // Start transcription service
    this.transcriptionService.startRecording();
    this.isRecording = true;
    this.recordingTime = 120; // Reset to 2 minutes (120 seconds)
    
    const recordButton = document.querySelector('.record-btn') as HTMLButtonElement;
    if (recordButton) {
      recordButton.classList.add('recording');
      recordButton.innerHTML = '<i class="fa fa-stop"></i>';
    }
    
    // Update timer display
    const timerElement = document.querySelector('.timer') as HTMLElement;
    if (timerElement) {
      timerElement.textContent = this.formatTime(this.recordingTime);
    }
    
    // Start countdown timer
    this.timerInterval = setInterval(() => {
      this.recordingTime -= 1;
      
      if (timerElement) {
        timerElement.textContent = this.formatTime(this.recordingTime);
      }
      
      // Auto-stop when timer reaches 0
      if (this.recordingTime <= 0) {
        this.stopRecording();
      }
    }, 1000);
    
    console.log('Recording started');
  }
  
  stopRecording() {
    // Stop the transcription service
    this.transcriptionService.stopRecording();
    this.isRecording = false;
    clearInterval(this.timerInterval);
    
    const recordButton = document.querySelector('.record-btn') as HTMLButtonElement;
    if (recordButton) {
      recordButton.classList.remove('recording');
      recordButton.innerHTML = '<i class="fa fa-microphone"></i>';
    }
    
    console.log('Recording stopped');
  }
  
  formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  
  // Form validation method
  validateForm(): boolean {
    this.formErrors = {};
    let isValid = true;
    
    // Required fields validation
    if (!this.formData.name) {
      this.formErrors['name'] = 'Name is required';
      isValid = false;
    }
    
    if (!this.formData.email) {
      this.formErrors['email'] = 'Email is required';
      isValid = false;
    } else {
      // Email format validation
      const emailPattern = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,4}$/;
      if (!emailPattern.test(this.formData.email)) {
        this.formErrors['email'] = 'Please enter a valid email address';
        isValid = false;
      }
    }
    
    if (!this.formData.education) {
      this.formErrors['education'] = 'Education is required';
      isValid = false;
    }
    
    return isValid;
  }
  
  // Gather form data from DOM
  gatherFormData(): void {
    this.formData.name = (document.getElementById('name') as HTMLInputElement)?.value || '';
    this.formData.email = (document.getElementById('email') as HTMLInputElement)?.value || '';
    this.formData.education = (document.getElementById('education') as HTMLInputElement)?.value || '';
    this.formData.interests = (document.getElementById('interests') as HTMLTextAreaElement)?.value || '';
    this.formData.careerGoals = (document.getElementById('career-goals') as HTMLTextAreaElement)?.value || '';
  }
  
  // Get technical assessment responses
  getTechnicalResponses(): void {
    this.technicalResponses = {};
    
    // Get the selected options for each question
    for (const topic of this.technicalAssessmentComponent.topics) {
      const question = this.technicalAssessmentComponent.questions[topic];
      if (question && question.selectedOption) {
        this.technicalResponses[topic.toLowerCase()] = question.selectedOption;
      }
    }
  }
  
  // Calculate scores
  calculateScores(): Record<string, number> {
    const scores: Record<string, number> = {};
    
    // Fluency score (already normalized to 0-100)
    scores['fluency'] = Math.round(this.fluencyScore?.overall_score || 0);
    
    console.log('Starting technical assessment scoring...');
    
    // Technical scores (0 or 1 based on correctness)
    const techAssessment = this.technicalAssessmentComponent;
    if (techAssessment) {
      console.log('Technical assessment component found', techAssessment);
      
      // Check each topic for correctness
      for (const topic of techAssessment.topics) {
        const question = techAssessment.questions[topic];
        console.log(`Processing ${topic} question:`, question);
        
        if (question && question.selectedOption && question.answer) {
          try {
            // Ensure both values are strings
            const selected = String(question.selectedOption);
            const answer = String(question.answer);
            
            // Log raw values 
            console.log(`Raw values for ${topic}:`, {
              selectedRaw: selected,
              selectedType: typeof question.selectedOption,
              answerRaw: answer,
              answerType: typeof question.answer
            });
            
            // Normalize both values for comparison - trim whitespace and convert to uppercase
            const selectedOption = selected.trim().toUpperCase();
            const correctAnswer = answer.trim().toUpperCase();
            
            console.log(`Checking answer for ${topic}:`, { 
              selected: selectedOption, 
              correct: correctAnswer,
              selectedRaw: selected,
              correctRaw: answer,
              isMatch: selectedOption === correctAnswer,
              exactMatch: selected === answer
            });
            
            const key = topic.toLowerCase() === 'c++' ? 'cpp' : topic.toLowerCase();
            scores[key] = Math.round(selectedOption === correctAnswer ? 1 : 0);
            console.log(`Score for ${topic}: ${scores[key]}`);
          } catch (error) {
            console.error(`Error validating answer for ${topic}:`, error);
            const key = topic.toLowerCase() === 'c++' ? 'cpp' : topic.toLowerCase();
            scores[key] = 0;
          }
        } else {
          console.log(`Missing data for ${topic}:`, { 
            hasQuestion: !!question, 
            selectedOption: question?.selectedOption,
            answer: question?.answer 
          });
          const key = topic.toLowerCase() === 'c++' ? 'cpp' : topic.toLowerCase();
          scores[key] = 0;
        }
      }
    } else {
      console.warn('Technical assessment component not found or not initialized');
    }
    
    console.log('Final technical scores:', scores);
    return scores;
  }
  
  // Submit form to save candidate data
  submitForm(): void {
    this.formSubmitted = true;
    
    console.log('Starting form submission process...');
    
    // Gather form data
    this.gatherFormData();
    console.log('Form data gathered:', this.formData);
    
    // Validate form
    this.formValid = this.validateForm();
    if (!this.formValid) {
      console.error('Form validation failed', this.formErrors);
      return;
    }
    
    // Get technical responses
    this.getTechnicalResponses();
    console.log('Technical responses:', this.technicalResponses);
    
    // Calculate scores based on correctness
    const scores = this.calculateScores();
    console.log('Calculated scores:', scores);
    
    // Evaluate interpersonal responses using LLM
    const interestEvaluation$ = this.formData.interests 
      ? this.llmService.evaluateResponse(this.formData.interests)
      : of(0);
      
    const careerEvaluation$ = this.formData.careerGoals
      ? this.llmService.evaluateResponse(this.formData.careerGoals)
      : of(0);
    
    console.log('Starting LLM evaluation of interpersonal responses...');
    this.showScorePopup = true;
    // Set score loading state before evaluations
    this.isScoreLoading = true;

    forkJoin([interestEvaluation$, careerEvaluation$]).subscribe({
      next: ([interestsScore, careerScore]) => {
        console.log('LLM evaluation complete:', { interestsScore, careerScore });
        
        // Average interpersonal score
        const interpersonalScore = (interestsScore + careerScore) / 2;
        
        // Prepare candidate data for DynamoDB
        const candidateData: CandidateData = {
          name: this.formData.name,
          email: this.formData.email,
          education: this.formData.education,
          experience: this.experienceValue,
          fluencyScore: Math.round(scores['fluency']),
          interpersonalScore: Math.round(interpersonalScore),
          interestsScore: Math.round(interestsScore),
          careerGoalsScore: Math.round(careerScore),
          pythonScore: scores['python'] || 0,
          javaScore: scores['java'] || 0,
          awsScore: scores['aws'] || 0,
          cppScore: scores['cpp'] || 0,
          responses: {
            interests: this.formData.interests,
            careerGoals: this.formData.careerGoals,
            transcription: this.currentTranscription
          },
          timestamp: Date.now()
        };
        
        // Store scores for popup
        this.candidateScores = {
          fluency: scores['fluency'],
          interpersonal: Math.round(interpersonalScore),
          interests: Math.round(interestsScore),
          careerGoals: Math.round(careerScore),
          python: scores['python'] || 0,
          java: scores['java'] || 0,
          aws: scores['aws'] || 0,
          cpp: scores['cpp'] || 0,
          total: Math.round(
            scores['fluency']/10 + 
            Math.round(interestsScore) + 
            Math.round(careerScore) + 
            (scores['python'] || 0) + 
            (scores['java'] || 0) + 
            (scores['aws'] || 0) + 
            (scores['cpp'] || 0)
          )
        };

        // Stop score loading state before showing popup
        this.isScoreLoading = false;
        console.log('Displaying score popup with data:', this.candidateScores);
        
        // Show the score popup
        this.showScorePopup = true;
        
        // Save candidate data to DynamoDB
        console.log('Saving candidate data to DynamoDB...');
        this.dynamoDBService.saveCandidateData(candidateData).subscribe({
          next: (response) => {
            console.log('Candidate data saved successfully', response);
          },
          error: (error) => {
            console.error('Error saving candidate data:', error);
            alert('Warning: There was an issue saving your data, but your assessment results are still available. Please contact support.');
          }
        });
      },
      error: (error) => {
        console.error('Error during LLM evaluation:', error);
        this.showScorePopup = true;
      }
    });
  }
  
  // Submit scores and navigate to dashboard
  submitScores(): void {
    this.showScorePopup = false;
    this.router.navigate(['/dashboard']);
  }
  
  // Retake the assessment
  retakeAssessment(): void {
    this.showScorePopup = false;
    window.location.reload();
  }
}
