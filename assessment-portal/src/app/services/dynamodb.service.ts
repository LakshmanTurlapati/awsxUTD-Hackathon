import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { environment } from '../../environments/environment';

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

export interface ImageUploadResponse {
  success: boolean;
  filename?: string;
  url?: string;
  error?: string;
}

export interface CandidateMatch {
  candidate: CandidateData;
  matchScore: number;
  reasons: string[];
}

export interface LMStudioRequest {
  messages: {
    role: string;
    content: string;
  }[];
  model: string;
  temperature: number;
}

export interface LMStudioResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
}

export interface MessageResponse {
  message: string;
}

@Injectable({
  providedIn: 'root'
})
export class DynamoDBService {
  private apiUrl = environment.apiUrl;

  constructor(private http: HttpClient) { }

  // Save candidate data to DynamoDB
  saveCandidateData(candidateData: CandidateData): Observable<any> {
    console.log('Saving candidate data to:', `${this.apiUrl}/transcription/candidate/save/`);
    console.log('Candidate data:', candidateData);
    return this.http.post(`${this.apiUrl}/transcription/candidate/save/`, candidateData);
  }

  // Get all candidates from DynamoDB
  getAllCandidates(): Observable<CandidateData[]> {
    console.log('Fetching candidates from:', `${this.apiUrl}/transcription/candidate/all/`);
    return this.http.get<CandidateData[]>(`${this.apiUrl}/transcription/candidate/all/`);
  }

  deleteCandidate(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/transcription/candidate/delete/${id}/`);
  }

  // Save referer data to DynamoDB
  saveRefererData(refererData: RefererData): Observable<any> {
    console.log('Saving referer data to:', `${this.apiUrl}/transcription/referer/save/`);
    console.log('Referer data:', refererData);
    return this.http.post(`${this.apiUrl}/transcription/referer/save/`, refererData);
  }

  // Get all referers from DynamoDB
  getAllReferers(): Observable<RefererData[]> {
    console.log('Fetching referers from:', `${this.apiUrl}/transcription/referer/all/`);
    return this.http.get<RefererData[]>(`${this.apiUrl}/transcription/referer/all/`);
  }

  // Get referer by ID
  getRefererById(id: string): Observable<RefererData> {
    return this.http.get<RefererData>(`${this.apiUrl}/transcription/referer/${id}`);
  }

  // Delete referer
  deleteReferer(id: string): Observable<any> {
    return this.http.delete(`${this.apiUrl}/transcription/referer/delete/${id}`);
  }
  
  // Upload a profile image for a referer
  uploadProfileImage(refererId: string, imageFile: File): Observable<ImageUploadResponse> {
    const formData = new FormData();
    formData.append('image', imageFile);
    
    return this.http.post<ImageUploadResponse>(
      `${this.apiUrl}/transcription/referer/upload-image/${refererId}/`,
      formData
    );
  }
  
  // Upload a profile image as base64 data
  uploadProfileImageBase64(refererId: string, imageData: string): Observable<ImageUploadResponse> {
    return this.http.post<ImageUploadResponse>(
      `${this.apiUrl}/transcription/referer/upload-image/${refererId}/`,
      { imageData }
    );
  }

  // Calculate TFIDF scores to find best candidate matches for a referer
  findBestCandidateMatches(referer: RefererData, candidates: CandidateData[]): Observable<CandidateMatch[]> {
    // If we wanted to call a backend service (future implementation)
    // return this.http.post<CandidateMatch[]>(`${this.apiUrl}/transcription/analyze/matches`, {
    //   referer,
    //   candidates
    // });

    // For now, implement the TFIDF matching in the frontend
    return of(this.performTFIDFMatching(referer, candidates));
  }

  // Helper method to perform TFIDF matching between referer requirements and candidates
  private performTFIDFMatching(referer: RefererData, candidates: CandidateData[]): CandidateMatch[] {
    if (!candidates.length) return [];

    // Extract keywords from referer requirements
    const requirementText = referer.requirement.toLowerCase();
    const keywords = this.extractKeywords(requirementText);

    // Check for specific skill requirements
    const requiresPython = requirementText.includes('python');
    const requiresJava = requirementText.includes('java');
    const requiresAWS = requirementText.includes('aws');
    const requiresCpp = requirementText.includes('c++') || requirementText.includes('cpp');

    // Calculate match scores for each candidate
    const matches: CandidateMatch[] = candidates.map(candidate => {
      let matchScore = 0;
      const reasons: string[] = [];

      // Technical skills matching
      if (requiresPython && candidate.pythonScore && candidate.pythonScore > 0) {
        matchScore += candidate.pythonScore * 5;
        reasons.push(`Strong Python skills (${candidate.pythonScore}/1)`);
      }
      
      if (requiresJava && candidate.javaScore && candidate.javaScore > 0) {
        matchScore += candidate.javaScore * 5;
        reasons.push(`Strong Java skills (${candidate.javaScore}/1)`);
      }
      
      if (requiresAWS && candidate.awsScore && candidate.awsScore > 0) {
        matchScore += candidate.awsScore * 5;
        reasons.push(`Strong AWS skills (${candidate.awsScore}/1)`);
      }
      
      if (requiresCpp && candidate.cppScore && candidate.cppScore > 0) {
        matchScore += candidate.cppScore * 5;
        reasons.push(`Strong C++ skills (${candidate.cppScore}/1)`);
      }

      // Overall fluency and interpersonal skills
      if (candidate.fluencyScore) {
        matchScore += (candidate.fluencyScore / 100) * 3;
        if (candidate.fluencyScore > 75) {
          reasons.push(`Excellent communication skills (${candidate.fluencyScore}/100)`);
        }
      }

      // Use interpersonal or derived scores from interests and career goals
      let interpersonalValue = 0;
      if (candidate.interpersonalScore) {
        interpersonalValue = candidate.interpersonalScore / 10;
      } else if (candidate.interestsScore && candidate.careerGoalsScore) {
        interpersonalValue = ((candidate.interestsScore + candidate.careerGoalsScore) / 2) / 10;
      }
      
      if (interpersonalValue > 0) {
        matchScore += interpersonalValue * 2;
        if (interpersonalValue > 0.7) {
          reasons.push('Strong interpersonal skills');
        }
      }

      // Text-based TFIDF for responses
      if (candidate.responses) {
        const textFields = [
          candidate.responses.interests || '',
          candidate.responses.careerGoals || '',
          candidate.responses.transcription || ''
        ].join(' ').toLowerCase();

        // Calculate TFIDF score based on keyword matches
        const tfidfScore = this.calculateTFIDFScore(keywords, textFields);
        matchScore += tfidfScore * 5;
        
        if (tfidfScore > 0.4) {
          reasons.push('Responses align well with job requirements');
        }
      }

      // Experience bonus
      if (candidate.experience) {
        matchScore += Math.min(candidate.experience, 5) / 5; // Cap at 5 years for scoring
        if (candidate.experience >= 5) {
          reasons.push(`${candidate.experience} years of experience`);
        }
      }

      return {
        candidate,
        matchScore,
        reasons
      };
    });

    // Sort by match score (descending)
    return matches.sort((a, b) => b.matchScore - a.matchScore);
  }

  // Helper to extract keywords from text
  private extractKeywords(text: string): string[] {
    // Remove common stop words
    const stopWords = ['the', 'and', 'is', 'in', 'to', 'for', 'with', 'of', 'on', 'a', 'an'];
    
    // Split text into words and filter out stop words
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Remove punctuation
      .split(/\s+/)              // Split on whitespace
      .filter(word => word.length > 2 && !stopWords.includes(word));
    
    // Return unique words
    return [...new Set(words)];
  }

  // Calculate a simple TFIDF score
  private calculateTFIDFScore(keywords: string[], text: string): number {
    if (!keywords.length) return 0;
    
    let matchedCount = 0;
    keywords.forEach(keyword => {
      if (text.includes(keyword)) {
        matchedCount++;
      }
    });
    
    return matchedCount / keywords.length;
  }
} 