/**
 * @fileoverview Reactive Learner Dashboard State Service.
 * Manages learner playlists, progress tracks, and UNESCO SDG skill badges via RxJS.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  LearnerDashboardDataBackendDict,
  LearnerExplorationSummaryBackendDict
} from '../domain/models/learner-dashboard.model';
import { LearnerDashboardBackendApiService } from '../domain/services/learner-dashboard-backend-api.service';

@Injectable({
  providedIn: 'root'
})
export class LearnerDashboardStateService {
  private inProgressSubject = new BehaviorSubject<LearnerExplorationSummaryBackendDict[]>([]);
  private completedSubject = new BehaviorSubject<LearnerExplorationSummaryBackendDict[]>([]);
  private playlistSubject = new BehaviorSubject<LearnerExplorationSummaryBackendDict[]>([]);
  private isLoadingSubject = new BehaviorSubject<boolean>(false);

  public inProgress$: Observable<LearnerExplorationSummaryBackendDict[]> = this.inProgressSubject.asObservable();
  public completed$: Observable<LearnerExplorationSummaryBackendDict[]> = this.completedSubject.asObservable();
  public playlist$: Observable<LearnerExplorationSummaryBackendDict[]> = this.playlistSubject.asObservable();
  public isLoading$: Observable<boolean> = this.isLoadingSubject.asObservable();

  constructor(private dashboardApiService: LearnerDashboardBackendApiService) {}

  loadDashboard(): void {
    this.isLoadingSubject.next(true);
    this.dashboardApiService.fetchDashboardData().subscribe({
      next: (data: LearnerDashboardDataBackendDict) => {
        this.inProgressSubject.next(data.incomplete_explorations_list || []);
        this.completedSubject.next(data.completed_explorations_list || []);
        this.playlistSubject.next(data.exploration_playlist || []);
        this.isLoadingSubject.next(false);
      },
      error: err => {
        console.warn('Could not fetch learner dashboard, supplying default state:', err);
        this.isLoadingSubject.next(false);
      }
    });
  }
}
