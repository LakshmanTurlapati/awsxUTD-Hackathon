import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface QuestionOption {
  id: string;
  text: string;
}

export interface Question {
  id: string;
  text: string;
  options: QuestionOption[];
  selectedOption?: string;
  answer?: string; // For validation
}

@Component({
  selector: 'app-question',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './question.component.html',
  styleUrl: './question.component.scss'
})
export class QuestionComponent {
  @Input() question!: Question;
  @Input() loading: boolean = false;
  @Output() optionSelected = new EventEmitter<string>();

  onOptionChange(optionId: string): void {
    this.question.selectedOption = optionId;
    this.optionSelected.emit(optionId);
  }
} 