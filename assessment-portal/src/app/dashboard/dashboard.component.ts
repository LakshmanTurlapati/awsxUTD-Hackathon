import { Component, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { DynamoDBService, CandidateData } from '../services/dynamodb.service';
import { HttpClientModule } from '@angular/common/http';
import Chart from 'chart.js/auto';

interface ProfileData {
  id: string;
  name: string;
  role: string;
  image: string;
  skills: string;
  experience: string;
  about: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, HttpClientModule],
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
  currentProfile: ProfileData = {
    id: '',
    name: '',
    role: '',
    image: '',
    skills: '',
    experience: '',
    about: ''
  };
  
  profilesData: { [key: string]: ProfileData } = {
    prasad: {
      id: 'prasad',
      name: 'Prasad D.',
      role: 'Devops Engineer',
      image: 'prasad.jpg',
      skills: 'Jenkins, Docker, Kubernetes, AWS, Terraform',
      experience: '6 years',
      about: 'Experienced DevOps engineer specializing in CI/CD pipelines and infrastructure automation.'
    },
    nijara: {
      id: 'nijara',
      name: 'Nijara Roy',
      role: 'Cloud Developer',
      image: 'nijara.png',
      skills: 'AWS, Azure, GCP, CloudFormation, Serverless',
      experience: '4 years',
      about: 'Cloud developer with expertise in designing and implementing scalable cloud-native applications.'
    },
    akanksha: {
      id: 'akanksha',
      name: 'Akanksha K.',
      role: 'Java Developer',
      image: 'a.jpeg',
      skills: 'Java, Spring Boot, Hibernate, Microservices',
      experience: '5 years',
      about: 'Java developer focused on building robust enterprise applications with modern frameworks.'
    }
  };

  constructor(private dynamoDBService: DynamoDBService) { }

  ngOnInit(): void {
    this.loadCandidates();
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

  // Add a button in dashboard to navigate to assessment
  navigateToAssessment() {
    // This will be handled by the router link in the template
  }

  selectCandidate(candidate: CandidateData): void {
    this.selectedCandidate = candidate;
    this.updateRadarChart();
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
            display: true,
            position: 'top',
            labels: {
              color: "#333",
              font: {
                size: 14,
                family: 'Arial'
              }
            }
          }
        },
        elements: {
          line: {
            tension: 0.4
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
      
      // If we still don't have a chart, exit
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
    this.currentProfile = this.profilesData[profileId];
    this.showProfileDetails = true;
  }
  
  hideUserProfile(): void {
    this.showProfileDetails = false;
  }
}
