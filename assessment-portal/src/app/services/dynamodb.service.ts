import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
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
    return this.http.delete(`${this.apiUrl}/transcription/candidate/delete/${id}`);
  }
} 