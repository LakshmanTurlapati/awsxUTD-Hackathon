import { Routes } from '@angular/router';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AssessmentComponent } from './assessment/assessment.component';

export const routes: Routes = [
  { path: 'dashboard', component: DashboardComponent },
  { path: 'assessment', component: AssessmentComponent },
  { path: '', redirectTo: '/dashboard', pathMatch: 'full' },
  { path: '**', redirectTo: '/dashboard' }
];
