/**
 * @fileoverview Reactive Creator Studio State Service.
 * Manages exploration authoring, state tree manipulation, and version commits via RxJS.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  CreatorDashboardStatsBackendDict,
  CreatorExplorationSummaryBackendDict,
  CreatorDashboardDataBackendDict
} from '../domain/models/creator-dashboard.model';
import { CreatorDashboardBackendApiService } from '../domain/services/creator-dashboard-backend-api.service';

@Injectable({
  providedIn: 'root'
})
export class CreatorStudioStateService {
  private statsSubject = new BehaviorSubject<CreatorDashboardStatsBackendDict>({});
  private explorationsSubject = new BehaviorSubject<CreatorExplorationSummaryBackendDict[]>([]);
  private activeExplorationDraftSubject = new BehaviorSubject<any | null>(null);
  private changeListSubject = new BehaviorSubject<any[]>([]);
  private isSavingSubject = new BehaviorSubject<boolean>(false);
  private isLoadingSubject = new BehaviorSubject<boolean>(false);

  public stats$: Observable<CreatorDashboardStatsBackendDict> = this.statsSubject.asObservable();
  public explorations$: Observable<CreatorExplorationSummaryBackendDict[]> = this.explorationsSubject.asObservable();
  public activeDraft$: Observable<any | null> = this.activeExplorationDraftSubject.asObservable();
  public changeList$: Observable<any[]> = this.changeListSubject.asObservable();
  public isSaving$: Observable<boolean> = this.isSavingSubject.asObservable();
  public isLoading$: Observable<boolean> = this.isLoadingSubject.asObservable();

  constructor(private creatorApiService: CreatorDashboardBackendApiService) {}

  loadDashboard(): void {
    this.isLoadingSubject.next(true);
    this.creatorApiService.fetchDashboardData().subscribe({
      next: (data: CreatorDashboardDataBackendDict) => {
        this.statsSubject.next(data.dashboard_stats || {});
        this.explorationsSubject.next(data.explorations_list || []);
        this.isLoadingSubject.next(false);
      },
      error: err => {
        console.warn('Could not fetch creator dashboard data:', err);
        this.isLoadingSubject.next(false);
      }
    });
  }

  loadExplorationForEditing(explorationId: string): void {
    this.isLoadingSubject.next(true);
    this.creatorApiService.fetchEditableExploration(explorationId).subscribe({
      next: exp => {
        this.activeExplorationDraftSubject.next(exp);
        this.changeListSubject.next([]);
        this.isLoadingSubject.next(false);
      },
      error: err => {
        console.error('Failed to load editable exploration:', err);
        this.isLoadingSubject.next(false);
      }
    });
  }

  recordStateChange(cmd: string, stateName: string, propertyName: string, newValue: any): void {
    const changes = this.changeListSubject.getValue();
    const newChange = {
      cmd: cmd,
      state_name: stateName,
      property_name: propertyName,
      new_value: newValue
    };
    this.changeListSubject.next([...changes, newChange]);
  }

  saveDraft(explorationId: string, commitMessage: string, version: number): Observable<any> {
    this.isSavingSubject.next(true);
    const changes = this.changeListSubject.getValue();
    const save$ = this.creatorApiService.saveExploration(explorationId, changes, commitMessage, version);
    save$.subscribe({
      next: updatedExp => {
        this.activeExplorationDraftSubject.next(updatedExp);
        this.changeListSubject.next([]);
        this.isSavingSubject.next(false);
      },
      error: err => {
        console.error('Failed to commit exploration changes:', err);
        this.isSavingSubject.next(false);
      }
    });
    return save$;
  }
}
