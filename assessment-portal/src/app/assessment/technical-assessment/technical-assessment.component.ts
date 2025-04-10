import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { QuestionComponent, Question } from '../question/question.component';
import { LlmService } from '../../services/llm.service';
import { HttpClientModule } from '@angular/common/http';
import { catchError, finalize, forkJoin, of } from 'rxjs';

@Component({
  selector: 'app-technical-assessment',
  standalone: true,
  imports: [CommonModule, QuestionComponent, HttpClientModule],
  templateUrl: './technical-assessment.component.html',
  styleUrl: './technical-assessment.component.scss',
  providers: [LlmService]
})
export class TechnicalAssessmentComponent implements OnChanges {
  @Input() experienceValue: number = 0;
  @Input() showAssessment: boolean = false;

  topics: string[] = ['Python', 'Java', 'AWS', 'C++'];
  questions: Record<string, Question> = {};
  loadingQuestions: Record<string, boolean> = {};
  errorMessages: Record<string, string> = {};

  constructor(private llmService: LlmService) { 
    // Initialize loading state for each topic
    this.topics.forEach(topic => {
      this.loadingQuestions[topic] = false;
      this.errorMessages[topic] = '';
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    // If the experienceValue or showAssessment changed and showAssessment is true, load questions
    if ((changes['experienceValue'] || changes['showAssessment']) && this.showAssessment && this.experienceValue > 0) {
      this.loadAllQuestions();
    }
  }

  loadAllQuestions(): void {
    console.log('Loading questions for experience level:', this.experienceValue);
    
    this.topics.forEach(topic => {
      this.loadingQuestions[topic] = true;
      this.errorMessages[topic] = '';
      
      console.log(`Generating ${topic} question...`);
      
      this.llmService.generateQuestion(topic, this.experienceValue)
        .pipe(
          catchError(error => {
            console.error(`Error generating ${topic} question:`, error);
            this.errorMessages[topic] = `HTTP error: ${error instanceof Error ? error.message : 'Unknown error'}`;
            return of({ error: true, errorDetails: error });
          }),
          finalize(() => {
            // Set loading to false after request completes (success or error)
            setTimeout(() => {
              this.loadingQuestions[topic] = false;
            }, 1000); // Add a small delay for the loading effect
          })
        )
        .subscribe(response => {
          console.log(`Received response for ${topic}:`, response);
          
          if (!response.error) {
            try {
              this.questions[topic] = this.llmService.processLlmResponse(response, topic);
              console.log(`Processed ${topic} question:`, this.questions[topic]);
            } catch (error) {
              console.error(`Error processing ${topic} response:`, error);
              this.errorMessages[topic] = `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`;
              
              // Handle error case with a fallback question
              this.questions[topic] = {
                id: `${topic.toLowerCase()}-fallback`,
                text: `Error processing ${topic} question: ${error instanceof Error ? error.message : 'Unknown error'}`,
                options: [
                  { id: 'A', text: 'Option A' },
                  { id: 'B', text: 'Option B' },
                  { id: 'C', text: 'Option C' },
                  { id: 'D', text: 'Option D' }
                ]
              };
            }
          } else {
            // Handle error case with a fallback question
            this.errorMessages[topic] = `API error: ${response.errorDetails?.message || 'Unknown error'}`;
            this.questions[topic] = {
              id: `${topic.toLowerCase()}-fallback`,
              text: `There was an error generating a ${topic} question.`,
              options: [
                { id: 'A', text: 'Option A' },
                { id: 'B', text: 'Option B' },
                { id: 'C', text: 'Option C' },
                { id: 'D', text: 'Option D' }
              ]
            };
          }
        });
    });
  }

  onOptionSelected(topic: string, optionId: string): void {
    if (this.questions[topic]) {
      // Add explicit debug logging
      console.log(`Selected option for ${topic}:`, {
        previous: this.questions[topic].selectedOption,
        new: optionId,
        correctAnswer: this.questions[topic].answer
      });
      
      // Store the selection
      this.questions[topic].selectedOption = optionId;
      
      // Log the current state of all questions for debugging
      console.log('Current questions state:', JSON.parse(JSON.stringify(this.questions)));
    }
  }
} 