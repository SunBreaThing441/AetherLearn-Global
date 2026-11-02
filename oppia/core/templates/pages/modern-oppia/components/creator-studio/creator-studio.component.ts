import { Component, OnInit } from '@angular/core';
import { Observable } from 'rxjs';
import { CreatorStudioStateService } from '../../state/creator-studio-state.service';
import {
  CreatorDashboardStatsBackendDict,
  CreatorExplorationSummaryBackendDict
} from '../../domain/models/creator-dashboard.model';

export interface StateGraphNode {
  name: string;
  isInitial: boolean;
  isTerminal: boolean;
  interactionId: string;
  destinations: string[];
}

@Component({
  selector: 'app-creator-studio',
  templateUrl: './creator-studio.component.html',
  styleUrls: ['./creator-studio.component.css']
})
export class CreatorStudioComponent implements OnInit {
  stats$: Observable<CreatorDashboardStatsBackendDict>;
  explorations$: Observable<CreatorExplorationSummaryBackendDict[]>;
  activeDraft$: Observable<any | null>;
  changeList$: Observable<any[]>;
  isSaving$: Observable<boolean>;
  isLoading$: Observable<boolean>;

  selectedExplorationId: string = '';
  selectedStateName: string = '';
  editingStateContent: string = '';
  commitMessage: string = 'Update state graph flow';

  // State Graph Representation
  graphNodes: StateGraphNode[] = [];

  // Sandbox Live Test Play Mode
  isTestPlaying: boolean = false;
  testPlayFeedback: string | null = null;

  constructor(public creatorState: CreatorStudioStateService) {
    this.stats$ = this.creatorState.stats$;
    this.explorations$ = this.creatorState.explorations$;
    this.activeDraft$ = this.creatorState.activeDraft$;
    this.changeList$ = this.creatorState.changeList$;
    this.isSaving$ = this.creatorState.isSaving$;
    this.isLoading$ = this.creatorState.isLoading$;
  }

  ngOnInit(): void {
    this.creatorState.loadDashboard();
  }

  selectExplorationToEdit(id: string): void {
    this.selectedExplorationId = id;
    this.creatorState.loadExplorationForEditing(id);

    // Build node graph upon loading draft
    this.creatorState.activeDraft$.subscribe(draft => {
      if (draft && draft.exploration) {
        this.buildStateGraph(draft.exploration);
      }
    });
  }

  buildStateGraph(exp: any): void {
    const states = exp.states || {};
    const initName = exp.init_state_name;
    const nodes: StateGraphNode[] = [];

    for (const [name, stateObj] of Object.entries<any>(states)) {
      const interaction = stateObj.interaction || {};
      const destinations: string[] = [];

      // Collect outcomes
      if (interaction.answer_groups) {
        interaction.answer_groups.forEach((ag: any) => {
          if (ag.outcome?.dest && !destinations.includes(ag.outcome.dest)) {
            destinations.push(ag.outcome.dest);
          }
        });
      }
      if (interaction.default_outcome?.dest && !destinations.includes(interaction.default_outcome.dest)) {
        destinations.push(interaction.default_outcome.dest);
      }

      nodes.push({
        name: name,
        isInitial: name === initName,
        isTerminal: interaction.id === 'EndExploration',
        interactionId: interaction.id || 'Continue',
        destinations: destinations
      });
    }

    this.graphNodes = nodes;
    if (nodes.length > 0 && !this.selectedStateName) {
      this.selectState(nodes[0].name, exp);
    }
  }

  selectState(name: string, exp?: any): void {
    this.selectedStateName = name;
    const activeExp = exp || this.creatorState.activeDraft$;
    // In Angular, read state from current draft
    this.creatorState.activeDraft$.subscribe(draft => {
      if (draft?.exploration?.states[name]) {
        this.editingStateContent = draft.exploration.states[name].content?.html || '';
      }
    });
  }

  onSaveContentChange(draft: any): void {
    if (!draft || !this.selectedStateName) return;
    this.creatorState.recordStateChange(
      'EDIT_STATE_PROPERTY',
      this.selectedStateName,
      'content',
      { content_id: 'content', html: this.editingStateContent }
    );
  }

  saveDraft(version: number): void {
    if (!this.selectedExplorationId) {
      return;
    }
    this.creatorState.saveDraft(this.selectedExplorationId, this.commitMessage, version);
  }

  toggleTestPlay(): void {
    this.isTestPlaying = !this.isTestPlaying;
    this.testPlayFeedback = null;
  }
}
