import { Component, EventEmitter, OnInit, Output } from '@angular/core';
import { Observable } from 'rxjs';
import { LearnerDashboardStateService } from '../../state/learner-dashboard-state.service';
import { LearnerExplorationSummaryBackendDict } from '../../domain/models/learner-dashboard.model';

@Component({
  selector: 'app-learner-dashboard',
  templateUrl: './learner-dashboard.component.html',
  styleUrls: ['./learner-dashboard.component.css']
})
export class LearnerDashboardComponent implements OnInit {
  @Output() playExploration = new EventEmitter<string>();

  inProgress$: Observable<LearnerExplorationSummaryBackendDict[]>;
  completed$: Observable<LearnerExplorationSummaryBackendDict[]>;
  playlist$: Observable<LearnerExplorationSummaryBackendDict[]>;
  isLoading$: Observable<boolean>;

  constructor(public stateService: LearnerDashboardStateService) {
    this.inProgress$ = this.stateService.inProgress$;
    this.completed$ = this.stateService.completed$;
    this.playlist$ = this.stateService.playlist$;
    this.isLoading$ = this.stateService.isLoading$;
  }

  ngOnInit(): void {
    this.stateService.loadDashboard();
  }

  onPlay(id: string): void {
    this.playExploration.emit(id);
  }
}
