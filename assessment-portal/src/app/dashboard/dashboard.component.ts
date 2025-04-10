import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DynamoDBService, CandidateData, RefererData, CandidateMatch } from '../services/dynamodb.service';
import { HttpClientModule } from '@angular/common/http';
import Chart, { registerables } from 'chart.js/auto';
import { FormsModule } from '@angular/forms';

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

  constructor(private dynamoDBService: DynamoDBService) { }

  ngOnInit(): void {
    this.loadCandidates();
    this.loadReferers();
  }

  ngAfterViewInit(): void {
    this.initializeRadarChart();
  }

  loadCandidates(): void {
    this.loading = true;
    this.dynamoDBService.getAllCandidates().subscribe({
      next: (data) => {
        this.candidates = data;
        this.loading = false;
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
    this.showProfileDetails = false;
    this.selectedCandidate = candidate;
    
    // Force chart update with setTimeout to ensure DOM is ready
    setTimeout(() => {
      // If chart already exists, destroy it to prevent duplicate charts
      if (this.radarChart) {
        this.radarChart.destroy();
        this.radarChart = null;
      }
      this.initializeRadarChart();
      this.updateRadarChart();
    }, 0);
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
          pointRadius: 4,
          pointBackgroundColor: 'rgba(255, 153, 0, 1)'
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
            }
          }
        },
        plugins: {
          legend: {
            display: false
          }
        },
        elements: {
          line: {
            tension: 0.1
          }
        }
      }
    });
  }

  updateRadarChart(): void {
    if (!this.radarChart) {
      // Initialize chart first if it doesn't exist
      this.initializeRadarChart();
      if (!this.radarChart) return;
    }

    if (!this.selectedCandidate) {
      // Reset chart data if no candidate is selected
      this.radarChart.data.datasets[0].data = [0, 0, 0, 0, 0, 0];
      this.radarChart.data.datasets[0].label = 'No Candidate Selected';
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
    }

    // Ensure to update the chart
    this.radarChart.update();
  }

  showUserProfile(profileId: string): void {
    // Reset image data
    this.imageFile = null;
    this.imagePreview = null;
    
    // Check if profile exists in our data
    if (this.profilesData[profileId]) {
      this.currentProfile = {...this.profilesData[profileId]};
      // Find matches for this referer
      this.findCandidateMatches(this.currentProfile);
    } else {
      // Fallback to default if not found
      this.currentProfile = {...this.defaultProfilesData[profileId]};
      // Find matches for this referer
      this.findCandidateMatches(this.currentProfile);
    }
    
    this.showProfileDetails = true;
  }
  
  hideUserProfile(): void {
    this.showProfileDetails = false;
    this.imageFile = null;
    this.imagePreview = null;
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

  // Find candidate matches for a referer
  findCandidateMatches(referer: RefererData): void {
    this.dynamoDBService.findBestCandidateMatches(referer, this.candidates)
      .subscribe({
        next: (matches) => {
          this.currentMatches = matches;
          this.bestMatch = matches.length > 0 ? matches[0] : null;
          
          // Show the matches panel
          this.showCandidateMatches = true;
          
          // Show confetti for best match if we have one
          if (this.bestMatch && this.bestMatch.matchScore > 5) {
            this.showConfetti = true;
            setTimeout(() => {
              this.showConfetti = false;
            }, 3000); // Hide confetti after 3 seconds
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
  
  // Create message draft (placeholder for later implementation)
  craftMessage(): void {
    alert('This feature will be implemented in a future update.');
  }
}
