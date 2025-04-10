import { Component, OnInit, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DynamoDBService, CandidateData, RefererData, CandidateMatch, LMStudioRequest, LMStudioResponse, MessageResponse } from '../services/dynamodb.service';
import { HttpClientModule, HttpClient } from '@angular/common/http';
import Chart, { registerables } from 'chart.js/auto';
import { FormsModule } from '@angular/forms';
// @ts-ignore
import * as confetti from 'canvas-confetti';
import { environment } from '../../environments/environment';

Chart.register(...registerables);

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, HttpClientModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, AfterViewInit {
  candidates: CandidateData[] = [];
  loading = true;
  error = '';
  selectedCandidate: CandidateData | null = null;
  radarChart: Chart | null = null;
  
  showProfileDetails = false;
  currentProfile: RefererData = {
    id: '',
    name: '',
    role: '',
    image: '',
    about: '',
    requirement: ''
  };
  
  // Default data as fallback if API fails
  defaultProfilesData: { [key: string]: RefererData } = {
    prasad: {
      id: 'prasad',
      name: 'Prasad D.',
      role: 'Devops Engineer',
      image: 'prasad.jpg',
      about: 'Experienced DevOps engineer specializing in CI/CD pipelines and infrastructure automation.',
      requirement: 'Looking for an experienced DevOps engineer with strong AWS and Kubernetes skills.'
    },
    nijara: {
      id: 'nijara',
      name: 'Nijara Roy',
      role: 'Cloud Developer',
      image: 'nijara.png',
      about: 'Cloud developer with expertise in designing and implementing scalable cloud-native applications.',
      requirement: 'Need a cloud developer with AWS/Azure experience for our new SaaS platform.'
    },
    akanksha: {
      id: 'akanksha',
      name: 'Akanksha K.',
      role: 'Java Developer',
      image: 'a.jpeg',
      about: 'Java developer focused on building robust enterprise applications with modern frameworks.',
      requirement: 'Seeking a Java developer with Spring Boot expertise for our backend team.'
    }
  };
  
  profilesData: { [key: string]: RefererData } = {};
  selectedReferer: string = '';
  referers: RefererData[] = [];
  imageFile: File | null = null;
  imagePreview: string | null = null;
  uploadProgress: number = 0;
  isUploading: boolean = false;

  // New properties for candidate matching
  currentMatches: CandidateMatch[] = [];
  bestMatch: CandidateMatch | null = null;
  showCandidateMatches = false;
  showConfetti = false;
  
  // New properties for message crafting
  showMessagePopup = false;
  isLoadingMessage = false;
  craftedMessage = '';
  isCopied = false;
  
  // Canvas reference for confetti
  @ViewChild('confettiCanvas') confettiCanvas: ElementRef | null = null;

  constructor(
    private dynamoDBService: DynamoDBService,
    private http: HttpClient,
    private elementRef: ElementRef
  ) { }

  ngOnInit(): void {
    this.loadCandidates();
    this.loadReferers();
  }

  ngAfterViewInit(): void {
    // Give the DOM time to render before initializing the chart
    setTimeout(() => {
      this.initializeRadarChart();
      
      // If there's already a selected candidate (e.g. after a page refresh),
      // update the chart with their data
      if (this.selectedCandidate) {
        this.updateRadarChart();
      }
    }, 200);
  }

  loadCandidates(): void {
    this.loading = true;
    this.dynamoDBService.getAllCandidates().subscribe({
      next: (data) => {
        this.candidates = data;
        this.loading = false;
        
        // If we have a selected candidate, find and update it with the latest data
        if (this.selectedCandidate && this.selectedCandidate.id) {
          const updatedCandidate = this.candidates.find(c => c.id === this.selectedCandidate?.id);
          if (updatedCandidate) {
            this.selectedCandidate = updatedCandidate;
            setTimeout(() => this.updateRadarChart(), 50);
          }
        }
        
        // If we have a best match, update its data too
        if (this.bestMatch && this.bestMatch.candidate && this.bestMatch.candidate.id) {
          const updatedBestMatch = this.candidates.find(c => c.id === this.bestMatch?.candidate?.id);
          if (updatedBestMatch) {
            this.bestMatch.candidate = updatedBestMatch;
          }
        }
      },
      error: (err) => {
        console.error('Error fetching candidates:', err);
        this.error = 'Failed to load candidate data. Please try again later.';
        this.loading = false;
      }
    });
  }

  loadReferers(): void {
    this.dynamoDBService.getAllReferers().subscribe({
      next: (data) => {
        this.referers = data;
        // Convert array to map for easy lookup
        const refererMap: { [key: string]: RefererData } = {};
        
        // If we have referers from the database, update our profilesData
        if (data && data.length > 0) {
          data.forEach(referer => {
            refererMap[referer.id] = referer;
          });
          this.profilesData = refererMap;
        } else {
          // If no data, use default data
          this.profilesData = {...this.defaultProfilesData};
          
          // Save default data to backend
          Object.values(this.defaultProfilesData).forEach(profile => {
            this.dynamoDBService.saveRefererData(profile).subscribe({
              next: (response) => {
                console.log('Default profile saved:', response);
              },
              error: (err) => {
                console.error('Error saving default profile:', err);
              }
            });
          });
        }
      },
      error: (err) => {
        console.error('Error fetching referers:', err);
        // If API error occurs, we'll use our default data
        this.profilesData = {...this.defaultProfilesData};
      }
    });
  }

  // Format date for display
  formatDate(timestamp: number): string {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  // Calculate total score
  getTotalScore(candidate: CandidateData): number {
    const fluency = (candidate.fluencyScore || 0) / 10; // Scale down to 0-10
    const interests = candidate.interestsScore || 0;
    const careerGoals = candidate.careerGoalsScore || 0;
    const python = candidate.pythonScore || 0;
    const java = candidate.javaScore || 0;
    const aws = candidate.awsScore || 0;
    const cpp = candidate.cppScore || 0;
    
    // Maximum possible score is 10 + 10 + 10 + 4 = 34
    if (interests > 0 || careerGoals > 0) {
      return Math.round(fluency + interests + careerGoals + python + java + aws + cpp);
    } else {
      // Otherwise fall back to the old format with just interpersonal
      const interpersonal = candidate.interpersonalScore || 0;
      return Math.round(fluency + interpersonal + interpersonal + python + java + aws + cpp);
    }
  }

  // Handle image file selection
  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.imageFile = input.files[0];
      
      // Create a preview of the selected image
      const reader = new FileReader();
      reader.onload = () => {
        this.imagePreview = reader.result as string;
      };
      reader.readAsDataURL(this.imageFile);
    }
  }
  
  // Upload the selected image
  uploadImage(): void {
    if (!this.imageFile || !this.currentProfile.id) return;
    
    this.isUploading = true;
    this.uploadProgress = 0;
    
    // Start progress animation
    const interval = setInterval(() => {
      this.uploadProgress += 5;
      if (this.uploadProgress >= 90) {
        clearInterval(interval);
      }
    }, 100);
    
    // Upload the image to the server
    this.dynamoDBService.uploadProfileImage(this.currentProfile.id, this.imageFile).subscribe({
      next: (response) => {
        // Complete progress bar
        this.uploadProgress = 100;
        clearInterval(interval);
        
        if (response.success && response.filename) {
          // Update the profile with the new image filename
          this.currentProfile.image = response.filename;
          
          setTimeout(() => {
            this.isUploading = false;
            // Save the updated profile
            this.saveProfile();
          }, 500);
        } else {
          console.error('Image upload failed:', response.error);
          this.isUploading = false;
        }
      },
      error: (err) => {
        console.error('Error uploading image:', err);
        clearInterval(interval);
        this.isUploading = false;
        this.uploadProgress = 0;
        
        // Try base64 upload as fallback
        if (this.imagePreview) {
          this.uploadImageAsBase64();
        }
      }
    });
  }

  // Fallback method to upload image as base64 data
  uploadImageAsBase64(): void {
    if (!this.imagePreview || !this.currentProfile.id) return;
    
    this.isUploading = true;
    this.uploadProgress = 0;
    
    // Start progress animation
    const interval = setInterval(() => {
      this.uploadProgress += 5;
      if (this.uploadProgress >= 90) {
        clearInterval(interval);
      }
    }, 100);
    
    // Upload the image as base64 data
    this.dynamoDBService.uploadProfileImageBase64(this.currentProfile.id, this.imagePreview).subscribe({
      next: (response) => {
        // Complete progress bar
        this.uploadProgress = 100;
        clearInterval(interval);
        
        if (response.success && response.filename) {
          // Update the profile with the new image filename
          this.currentProfile.image = response.filename;
          
          setTimeout(() => {
            this.isUploading = false;
            // Save the updated profile
            this.saveProfile();
          }, 500);
        } else {
          console.error('Image upload failed:', response.error);
          this.isUploading = false;
        }
      },
      error: (err) => {
        console.error('Error uploading image as base64:', err);
        clearInterval(interval);
        this.isUploading = false;
        this.uploadProgress = 0;
        
        // If both methods fail, just update the filename locally
        const newImageName = `${this.currentProfile.id}_${Date.now()}.png`;
        this.currentProfile.image = newImageName;
        this.saveProfile();
      }
    });
  }

  // Add a button in dashboard to navigate to assessment
  navigateToAssessment() {
    // This will be handled by the router link in the template
  }

  selectCandidate(candidate: CandidateData): void {
    // Update selected candidate
    this.selectedCandidate = candidate;
    
    // Check if this is the best match and update UI
    const isBestMatch = this.bestMatch && candidate.id === this.bestMatch.candidate.id;
    
    // Force chart update with setTimeout to ensure DOM is ready
    setTimeout(() => {
      this.updateRadarChart();
      
      // Smooth scroll to the radar chart if on mobile or smaller screens
      const chart = document.getElementById('radarChart');
      if (chart && window.innerWidth < 768) {
        chart.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 50);
  }

  deleteCandidate(id: string | undefined): void {
    if (!id) return;

    // Proceed with deletion directly without confirmation
    this.dynamoDBService.deleteCandidate(id).subscribe({
      next: () => {
        this.candidates = this.candidates.filter(candidate => candidate.id !== id);
        // Reset selected candidate if we deleted the selected one
        if (this.selectedCandidate?.id === id) {
          this.selectedCandidate = null;
          this.updateRadarChart();
        }
      },
      error: (err) => {
        console.error('Error deleting candidate:', err);
        alert('Failed to delete candidate. Please try again.');
      }
    });
  }

  initializeRadarChart(): void {
    const ctx = document.getElementById('radarChart') as HTMLCanvasElement;
    if (!ctx) return;

    // Destroy existing chart if it exists
    if (this.radarChart) {
      this.radarChart.destroy();
    }

    this.radarChart = new Chart(ctx, {
      type: 'radar',
      data: {
        labels: ['Python', 'Java', 'AWS', 'C++', 'Fluency', 'Interpersonal'],
        datasets: [{
          label: 'Candidate Skills',
          data: [0, 0, 0, 0, 0, 0],
          backgroundColor: 'rgba(255, 153, 0, 0.2)',
          borderColor: 'rgba(255, 153, 0, 1)',
          borderWidth: 2,
          pointRadius: 5,
          pointBackgroundColor: 'rgba(255, 153, 0, 1)',
          pointBorderColor: '#fff',
          pointHoverRadius: 7,
          pointHoverBackgroundColor: 'rgba(255, 153, 0, 1)',
          pointHoverBorderColor: '#fff'
        }]
      },
      options: {
        scales: {
          r: {
            beginAtZero: true,
            max: 1,
            angleLines: {
              color: 'rgba(128, 128, 128, 0.2)'
            },
            grid: {
              color: 'rgba(128, 128, 128, 0.2)'
            },
            ticks: {
              backdropColor: 'rgba(255, 255, 255, 0)',
              color: '#6c757d',
              stepSize: 0.2
            },
            pointLabels: {
              color: '#333',
              font: {
                size: 12,
                weight: 'bold'
              }
            }
          }
        },
        plugins: {
          legend: {
            display: false
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.7)',
            titleFont: {
              size: 14
            },
            bodyFont: {
              size: 13
            },
            padding: 10
          }
        },
        elements: {
          line: {
            tension: 0.1
          }
        },
        maintainAspectRatio: false,
        responsive: true
      }
    });
  }

  updateRadarChart(): void {
    // Get radar chart canvas
    const canvas = document.getElementById('radarChart') as HTMLCanvasElement;
    if (!canvas) {
      console.log('Canvas element not found, will try again later');
      setTimeout(() => this.updateRadarChart(), 100);
      return;
    }

    if (!this.radarChart) {
      // Initialize chart first if it doesn't exist
      this.initializeRadarChart();
      if (!this.radarChart) return;
    }

    if (!this.selectedCandidate) {
      // Reset chart data if no candidate is selected
      this.radarChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0];
      this.radarChart.data.datasets[0].label = 'No Candidate Selected';
      
      // Reset colors to default orange
      this.radarChart.data.datasets[0].backgroundColor = 'rgba(255, 153, 0, 0.2)';
      this.radarChart.data.datasets[0].borderColor = 'rgba(255, 153, 0, 1)';
      
      // Access all point styling properties
      const dataset = this.radarChart.data.datasets[0] as any;
      dataset.pointBackgroundColor = 'rgba(255, 153, 0, 1)';
      dataset.pointHoverBackgroundColor = 'rgba(255, 153, 0, 1)';
    } else {
      // Update chart with selected candidate data
      const candidate = this.selectedCandidate;
      const pythonScore = candidate.pythonScore || 0;
      const javaScore = candidate.javaScore || 0;
      const awsScore = candidate.awsScore || 0;
      const cppScore = candidate.cppScore || 0;
      const fluencyScore = (candidate.fluencyScore || 0) / 100; // Normalize to 0-1
      
      // Use either interpersonal or the average of interests and career goals
      let interpersonalScore = 0;
      if (candidate.interestsScore && candidate.careerGoalsScore) {
        interpersonalScore = ((candidate.interestsScore || 0) + (candidate.careerGoalsScore || 0)) / 20; // Average and normalize to 0-1
      } else {
        interpersonalScore = (candidate.interpersonalScore || 0) / 10; // Normalize to 0-1
      }

      this.radarChart.data.datasets[0].data = [
        pythonScore, javaScore, awsScore, cppScore, fluencyScore, interpersonalScore
      ];
      this.radarChart.data.datasets[0].label = `${candidate.name}'s Skills`;
      
      // Check if selected candidate is the best match
      const isBestMatch = this.bestMatch && this.selectedCandidate.id === this.bestMatch.candidate.id;
      
      // Access dataset for type safety
      const dataset = this.radarChart.data.datasets[0] as any;
      
      if (isBestMatch) {
        // Olive green color for best match candidate
        dataset.backgroundColor = 'rgba(128, 128, 0, 0.2)';
        dataset.borderColor = 'rgba(128, 128, 0, 1)';
        dataset.pointBackgroundColor = 'rgba(128, 128, 0, 1)';
        dataset.pointHoverBackgroundColor = 'rgba(128, 128, 0, 1)';
        
        // Add a signifier that this is the best match
        this.radarChart.data.datasets[0].label = `${candidate.name}'s Skills (Best Match)`;
      } else {
        // Default orange color for other candidates
        dataset.backgroundColor = 'rgba(255, 153, 0, 0.2)';
        dataset.borderColor = 'rgba(255, 153, 0, 1)';
        dataset.pointBackgroundColor = 'rgba(255, 153, 0, 1)';
        dataset.pointHoverBackgroundColor = 'rgba(255, 153, 0, 1)';
      }
    }

    try {
      // Ensure to update the chart
      this.radarChart.update();
    } catch (error) {
      console.error('Error updating radar chart:', error);
      // If update fails, recreate the chart
      this.initializeRadarChart();
    }
  }

  showUserProfile(profileId: string): void {
    // Reset image data
    this.imageFile = null;
    this.imagePreview = null;
    
    // Set selected referer
    this.selectedReferer = profileId;
    
    // Check if profile exists in our data
    if (this.profilesData[profileId]) {
      this.currentProfile = {...this.profilesData[profileId]};
      // Set view state before finding matches
      this.showProfileDetails = true;
      // Find matches for this referer
      this.findCandidateMatches(this.currentProfile);
    } else {
      // Fallback to default if not found
      this.currentProfile = {...this.defaultProfilesData[profileId]};
      // Set view state before finding matches
      this.showProfileDetails = true;
      // Find matches for this referer
      this.findCandidateMatches(this.currentProfile);
    }
  }
  
  hideUserProfile(): void {
    // First update view state
    this.showProfileDetails = false;
    this.imageFile = null;
    this.imagePreview = null;
    
    // Don't reset the selected candidate when going back to table view
    // This allows the radar chart to persist
    
    // If we have a best match and the selected candidate is different,
    // update it to show the best match instead
    if (this.bestMatch && (!this.selectedCandidate || this.selectedCandidate.id !== this.bestMatch.candidate.id)) {
      this.selectedCandidate = this.bestMatch.candidate;
      // Update the chart after a short delay to ensure DOM has updated
      setTimeout(() => {
        this.updateRadarChart();
      }, 50);
    } else if (this.selectedCandidate) {
      // Just refresh the chart if we already have a candidate selected
      setTimeout(() => {
        this.updateRadarChart();
      }, 50);
    }
  }
  
  saveProfile(): void {
    if (this.currentProfile.id) {
      // Update local data
      this.profilesData[this.currentProfile.id] = {...this.currentProfile};
      
      // Call backend service to save the profile data
      this.saveProfileToDatabase(this.currentProfile);
    }
  }
  
  saveProfileToDatabase(profile: RefererData): void {
    this.dynamoDBService.saveRefererData(profile).subscribe({
      next: (response) => {
        console.log('Profile saved successfully:', response);
      },
      error: (err) => {
        console.error('Error saving profile:', err);
      }
    });
  }

  // Function to trigger confetti animation
  triggerConfetti(): void {
    const canvas = this.elementRef.nativeElement.querySelector('#confetti-canvas');
    if (!canvas) return;
    
    const myConfetti = confetti.create(canvas, {
      resize: true,
      useWorker: true
    });
    
    const randomInRange = (min: number, max: number) => {
      return Math.random() * (max - min) + min;
    };
    
    myConfetti({
      angle: randomInRange(55, 125),
      spread: randomInRange(50, 70),
      particleCount: randomInRange(50, 100),
      origin: { y: 0.6 }
    });
  }
  
  // Create message draft
  craftMessage(): void {
    if (!this.bestMatch || !this.currentProfile) return;
    
    this.showMessagePopup = true;
    this.isLoadingMessage = true;
    this.craftedMessage = '';
    
    const candidate = this.bestMatch.candidate;
    const referer = this.currentProfile;
    
    // Prepare the prompt
    const prompt = `Craft a message for ${candidate.name}, for a role based on ${referer.requirement} by ${referer.name}`;
    
    // Prepare the request
    const request: LMStudioRequest = {
      messages: [{ role: 'user', content: prompt }],
      model: 'lmstudio',
      temperature: 0.7
    };
    
    // Call the LMStudio API
    this.http.post<LMStudioResponse>(environment.llmApiUrl, request)
      .subscribe({
        next: (response: LMStudioResponse) => {
          try {
            // Parse the JSON response, handling backticks if present
            const content = response.choices[0].message.content;
            // If response is in code block format with backticks, extract just the JSON
            const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
            const jsonStr = jsonMatch ? jsonMatch[1] : content;
            
            const jsonResponse = JSON.parse(jsonStr) as MessageResponse;
            this.craftedMessage = jsonResponse.message;
          } catch (error) {
            console.error('Error parsing response:', error);
            this.craftedMessage = 'Sorry, there was an error generating a message. Please try again.';
          }
          this.isLoadingMessage = false;
        },
        error: (err) => {
          console.error('Error calling LMStudio API:', err);
          this.craftedMessage = 'Sorry, there was an error connecting to the message service. Please try again.';
          this.isLoadingMessage = false;
        }
      });
  }
  
  // Close the message popup
  closeMessagePopup(): void {
    this.showMessagePopup = false;
  }
  
  // Copy message to clipboard
  copyMessage(): void {
    if (!this.craftedMessage) return;
    
    navigator.clipboard.writeText(this.craftedMessage).then(() => {
      this.isCopied = true;
      setTimeout(() => {
        this.isCopied = false;
      }, 2000);
    });
  }
  
  // Find candidate matches for a referer
  findCandidateMatches(referer: RefererData): void {
    this.dynamoDBService.findBestCandidateMatches(referer, this.candidates)
      .subscribe({
        next: (matches) => {
          this.currentMatches = matches;
          this.bestMatch = matches.length > 0 ? matches[0] : null;
          
          // Show the matches panel
          this.showCandidateMatches = true;
          
          // Automatically select the best match candidate for the radar chart
          if (this.bestMatch) {
            this.selectedCandidate = this.bestMatch.candidate;
          }
          
          // Update the radar chart to reflect the new best match status
          if (this.selectedCandidate) {
            setTimeout(() => {
              this.updateRadarChart();
            }, 50);
          }
          
          // Show confetti for best match if we have one
          if (this.bestMatch && this.bestMatch.matchScore > 5) {
            setTimeout(() => {
              this.triggerConfetti();
            }, 500);
          }
        },
        error: (err) => {
          console.error('Error finding matches:', err);
          this.showCandidateMatches = false;
        }
      });
  }
  
  // Hide the candidate matches panel
  hideMatches(): void {
    this.showCandidateMatches = false;
  }
}
