import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Question } from '../assessment/question/question.component';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class LlmService {
  private apiUrl = environment.llmApiUrl || 'http://localhost:1234/v1/chat/completions';
  private modelId = 'gemma-3-12b-it';

  constructor(private http: HttpClient) { }

  generateQuestion(topic: string, yearsExperience: number): Observable<any> {
    const prompt = `Ask a ${topic} technical question for a candidate with ${yearsExperience} years of work experience. 
    
Return your response in the following JSON format:
{
  "question": "Your technical question here",
  "options": {
    "A": "First option",
    "B": "Second option",
    "C": "Third option",
    "D": "Fourth option"
  },
  "answer": "B" // Should be one of A, B, C, or D and match the correct option
}

Ensure the "answer" field contains only a single letter (A, B, C, or D) corresponding to the correct option.`;
    
    const payload = {
      model: this.modelId,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.9,
      max_tokens: 1000
    };

    return this.http.post(this.apiUrl, payload);
  }

  // New method to evaluate interpersonal responses
  evaluateResponse(response: string): Observable<number> {
    const prompt = `Evaluate this response ${response}`;
    
    const payload = {
      model: this.modelId,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      max_tokens: 50
    };

    return this.http.post(this.apiUrl, payload).pipe(
      map((result: any) => {
        const content = result.choices?.[0]?.message?.content || '';
        // Extract the score number from patterns like "score: 7" or "7/10"
        const scoreMatch = content.match(/score\s*[:=]\s*(\d+)/i) || 
                          content.match(/(\d+)\s*\/\s*10/i) ||
                          content.match(/(\d+)/);
        
        if (scoreMatch && scoreMatch[1]) {
          const score = parseInt(scoreMatch[1], 10);
          return Math.min(Math.max(score, 0), 10); // Ensure between 0-10
        }
        return 5; // Default score if parsing fails
      })
    );
  }

  processLlmResponse(response: any, topic: string): Question {
    try {
      // Parse the JSON from the content of the response
      const content = response.choices[0].message.content;
      console.log(`Raw LLM response for ${topic}:`, content);
      
      // Handle content wrapped in markdown code blocks (```json ... ```)
      let jsonContent = content;
      
      // Check if content is wrapped in code blocks and extract
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
      if (codeBlockMatch && codeBlockMatch[1]) {
        jsonContent = codeBlockMatch[1];
        console.log(`Extracted JSON content for ${topic}:`, jsonContent);
      }
      
      let parsedContent;
      try {
        parsedContent = JSON.parse(jsonContent);
        console.log(`Parsed JSON for ${topic}:`, parsedContent);
      } catch (parseError) {
        console.error(`JSON parse error for ${topic}:`, parseError);
        // If JSON parse fails, try to extract a JSON-like structure
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsedContent = JSON.parse(jsonMatch[0]);
            console.log(`Parsed JSON from regex match for ${topic}:`, parsedContent);
          } catch (e) {
            console.error(`Failed to parse JSON from regex match for ${topic}:`, e);
            throw e;
          }
        } else {
          throw new Error('Failed to extract JSON from response');
        }
      }
      
      // Validate the parsed content has the required fields
      if (!parsedContent.question || !parsedContent.options || !parsedContent.answer) {
        console.error('Missing required fields in response', parsedContent);
        throw new Error(`Response missing required fields for ${topic} question`);
      }
      
      // Debug answer field specifically
      console.log(`ANSWER DEBUG for ${topic}:`, {
        rawAnswer: parsedContent.answer,
        type: typeof parsedContent.answer,
        length: String(parsedContent.answer).length,
        charCodes: Array.from(String(parsedContent.answer)).map(c => c.charCodeAt(0))
      });
      
      // Ensure the answer exists in the options
      const answerKey = String(parsedContent.answer).trim().toUpperCase();
      const optionKeys = Object.keys(parsedContent.options).map(k => k.trim().toUpperCase());
      console.log(`Answer validation for ${topic}:`, {
        answerKey,
        optionKeys,
        isValid: optionKeys.includes(answerKey)
      });
      
      if (!optionKeys.includes(answerKey)) {
        console.error(`Answer key "${answerKey}" not found in options`, parsedContent.options);
        throw new Error(`Invalid answer key for ${topic} question`);
      }
      
      // Create options array for the question component
      const options = Object.entries(parsedContent.options).map(([key, value]) => ({
        id: key,
        text: value as string
      }));
      
      // Final debug log of the processed question
      const finalQuestion = {
        id: `${topic.toLowerCase()}-question`,
        text: parsedContent.question,
        options: options,
        answer: parsedContent.answer
      };
      console.log(`Final processed question for ${topic}:`, finalQuestion);
      
      return finalQuestion;
    } catch (error) {
      console.error('Error processing LLM response:', error);
      console.error('Response content:', response?.choices?.[0]?.message?.content);
      // Return a fallback question in case of parsing error
      return {
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
  }
} 