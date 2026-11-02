/**
 * @fileoverview Reactive Exploration Player State Service.
 * Manages the interactive exploration runtime lifecycle using RxJS unidirectional data flow.
 * Implements client-side answer evaluation, feedback calculation, and async telemetry dispatch.
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import {
  FetchExplorationBackendResponse,
  ReadOnlyExplorationBackendDict,
  StateBackendDict,
  AnswerGroupBackendDict,
  OutcomeBackendDict,
  HintBackendDict,
  SolutionBackendDict
} from '../domain/models/exploration.model';
import { ExplorationBackendApiService } from '../domain/services/exploration-backend-api.service';

export interface TranscriptCard {
  stateName: string;
  contentHtml: string;
  learnerAnswer?: any;
  feedbackHtml?: string;
  isCorrect?: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class ExplorationPlayerStateService {
  private exploration: ReadOnlyExplorationBackendDict | null = null;
  private explorationId: string = '';
  private sessionId: string = '';
  private version: number = 1;
  private stateStartTime: number = Date.now();

  // Reactive state subjects
  private explorationTitleSubject = new BehaviorSubject<string>('Loading Exploration...');
  private currentStateSubject = new BehaviorSubject<StateBackendDict | null>(null);
  private currentStateNameSubject = new BehaviorSubject<string>('');
  private transcriptSubject = new BehaviorSubject<TranscriptCard[]>([]);
  private feedbackSubject = new BehaviorSubject<{ html: string; isCorrect: boolean } | null>(null);
  private hintsSubject = new BehaviorSubject<HintBackendDict[]>([]);
  private solutionSubject = new BehaviorSubject<SolutionBackendDict | null>(null);
  private progressPercentageSubject = new BehaviorSubject<number>(0);
  private isProcessingSubject = new BehaviorSubject<boolean>(false);
  private isCompletedSubject = new BehaviorSubject<boolean>(false);

  // Public observable streams
  public explorationTitle$: Observable<string> = this.explorationTitleSubject.asObservable();
  public currentState$: Observable<StateBackendDict | null> = this.currentStateSubject.asObservable();
  public currentStateName$: Observable<string> = this.currentStateNameSubject.asObservable();
  public transcript$: Observable<TranscriptCard[]> = this.transcriptSubject.asObservable();
  public feedback$: Observable<{ html: string; isCorrect: boolean } | null> = this.feedbackSubject.asObservable();
  public hints$: Observable<HintBackendDict[]> = this.hintsSubject.asObservable();
  public solution$: Observable<SolutionBackendDict | null> = this.solutionSubject.asObservable();
  public progressPercentage$: Observable<number> = this.progressPercentageSubject.asObservable();
  public isProcessing$: Observable<boolean> = this.isProcessingSubject.asObservable();
  public isCompleted$: Observable<boolean> = this.isCompletedSubject.asObservable();

  constructor(private explorationApiService: ExplorationBackendApiService) {}

  /**
   * Initializes exploration playback with data fetched from /explorehandler/init/<id>.
   */
  initExploration(response: FetchExplorationBackendResponse): void {
    this.exploration = response.exploration;
    this.explorationId = response.exploration_id;
    this.sessionId = response.session_id || 'session_' + Math.random().toString(36).substring(2);
    this.version = response.version || 1;

    this.explorationTitleSubject.next(this.exploration.title);
    this.transcriptSubject.next([]);
    this.isCompletedSubject.next(false);
    this.feedbackSubject.next(null);

    // Record start telemetry
    this.explorationApiService.recordExplorationStart(this.explorationId, {
      session_id: this.sessionId,
      version: this.version
    }).subscribe({
      error: () => {} // Non-blocking telemetry
    });

    const initState = this.exploration.init_state_name;
    this.transitionToState(initState);
  }

  /**
   * Transitions the player to a target state card.
   */
  private transitionToState(stateName: string): void {
    if (!this.exploration || !this.exploration.states[stateName]) {
      console.warn(`State "${stateName}" not found in exploration.`);
      return;
    }

    const state = this.exploration.states[stateName];
    const timeSpentInSecs = (Date.now() - this.stateStartTime) / 1000;
    this.stateStartTime = Date.now();

    this.currentStateNameSubject.next(stateName);
    this.currentStateSubject.next(state);
    this.feedbackSubject.next(null);
    this.hintsSubject.next(state.interaction?.hints || []);
    this.solutionSubject.next(state.interaction?.solution || null);

    // Calculate progress
    const totalStates = Object.keys(this.exploration.states).length;
    const visitedCount = this.transcriptSubject.getValue().length + 1;
    const progress = Math.min(100, Math.round((visitedCount / totalStates) * 100));
    this.progressPercentageSubject.next(progress);

    // Record state hit telemetry
    this.explorationApiService.recordStateHit(this.explorationId, {
      new_state_name: stateName,
      session_id: this.sessionId,
      client_time_spent_in_secs: timeSpentInSecs,
      exploration_version: this.version
    }).subscribe({ error: () => {} });

    // Record checkpoint if applicable
    if (state.card_is_checkpoint) {
      this.explorationApiService.recordCheckpoint(this.explorationId, {
        checkpoint_state_name: stateName,
        exp_version: this.version,
        session_id: this.sessionId
      }).subscribe({ error: () => {} });
    }

    // Append to transcript
    const currentTranscript = this.transcriptSubject.getValue();
    this.transcriptSubject.next([
      ...currentTranscript,
      {
        stateName: stateName,
        contentHtml: state.content?.html || ''
      }
    ]);
  }

  /**
   * Evaluates learner answer against state interaction rules.
   */
  submitAnswer(answer: any): void {
    const currentState = this.currentStateSubject.getValue();
    const currentStateName = this.currentStateNameSubject.getValue();
    if (!currentState || !currentState.interaction || this.isProcessingSubject.getValue()) {
      return;
    }

    this.isProcessingSubject.next(true);
    const clientTimeSpent = (Date.now() - this.stateStartTime) / 1000;

    let matchedOutcome: OutcomeBackendDict | null = null;
    let answerGroupIndex = -1;
    let ruleSpecIndex = -1;

    // Evaluate answer groups in sequential order
    const answerGroups = currentState.interaction.answer_groups || [];
    for (let i = 0; i < answerGroups.length; i++) {
      const group = answerGroups[i];
      for (let j = 0; j < (group.rule_specs || []).length; j++) {
        const rule = group.rule_specs[j];
        if (this.evaluateRule(currentState.interaction.id, rule, answer)) {
          matchedOutcome = group.outcome;
          answerGroupIndex = i;
          ruleSpecIndex = j;
          break;
        }
      }
      if (matchedOutcome) {
        break;
      }
    }

    // Fall back to default outcome
    if (!matchedOutcome) {
      matchedOutcome = currentState.interaction.default_outcome;
    }

    if (!matchedOutcome) {
      this.isProcessingSubject.next(false);
      return;
    }

    const isCorrect = !!matchedOutcome.labelled_as_correct || matchedOutcome.dest !== currentStateName;
    const feedbackHtml = matchedOutcome.feedback?.html || (isCorrect ? 'Correct! Moving forward...' : 'Not quite. Please try again.');

    this.feedbackSubject.next({
      html: feedbackHtml,
      isCorrect: isCorrect
    });

    // Send answer telemetry asynchronously
    this.explorationApiService.submitAnswerTelemetry(this.explorationId, {
      answer: answer,
      params: {},
      session_id: this.sessionId,
      old_state_name: currentStateName,
      client_time_spent_in_secs: clientTimeSpent,
      answer_group_index: answerGroupIndex,
      rule_spec_index: ruleSpecIndex,
      version: this.version,
      classification_categorization: isCorrect ? 'explicit' : 'default'
    }).subscribe({ error: () => {} });

    // Update transcript card with answer and feedback
    const transcript = [...this.transcriptSubject.getValue()];
    if (transcript.length > 0) {
      const lastIndex = transcript.length - 1;
      transcript[lastIndex] = {
        ...transcript[lastIndex],
        learnerAnswer: answer,
        feedbackHtml: feedbackHtml,
        isCorrect: isCorrect
      };
      this.transcriptSubject.next(transcript);
    }

    // State transition or completion
    const nextStateName = matchedOutcome.dest;
    setTimeout(() => {
      this.isProcessingSubject.next(false);

      if (nextStateName && nextStateName !== currentStateName) {
        // Check if terminal state (EndExploration interaction)
        const nextState = this.exploration?.states[nextStateName];
        if (nextState?.interaction?.id === 'EndExploration') {
          this.isCompletedSubject.next(true);
          this.progressPercentageSubject.next(100);
          this.explorationApiService.recordExplorationComplete(this.explorationId, {
            session_id: this.sessionId,
            version: this.version,
            client_time_spent_in_secs: (Date.now() - this.stateStartTime) / 1000
          }).subscribe({ error: () => {} });
        }
        this.transitionToState(nextStateName);
      }
    }, 1200);
  }

  /**
   * Client-side rule evaluator for instant feedback without server roundtrips.
   */
  private evaluateRule(interactionId: string, rule: any, answer: any): boolean {
    if (!rule || !rule.rule_type) {
      return false;
    }

    const type = rule.rule_type.toLowerCase();
    const inputs = rule.inputs || {};

    switch (interactionId) {
      case 'MultipleChoiceInput':
        if (type.includes('equals')) {
          return answer === inputs.x;
        }
        break;

      case 'TextInput':
        const cleanAnswer = String(answer || '').trim().toLowerCase();
        const cleanTarget = String(inputs.x || '').trim().toLowerCase();
        if (type.includes('equals')) {
          return cleanAnswer === cleanTarget;
        }
        if (type.includes('contains')) {
          return cleanAnswer.includes(cleanTarget);
        }
        if (type.includes('startswith')) {
          return cleanAnswer.startsWith(cleanTarget);
        }
        break;

      case 'NumericInput':
        const numAnswer = Number(answer);
        const targetNum = Number(inputs.x);
        if (type.includes('equals')) {
          return numAnswer === targetNum;
        }
        if (type.includes('islessthan') || type.includes('lessthan')) {
          return numAnswer < targetNum;
        }
        if (type.includes('isgreaterthan') || type.includes('greaterthan')) {
          return numAnswer > targetNum;
        }
        if (type.includes('between')) {
          return numAnswer >= Number(inputs.a) && numAnswer <= Number(inputs.b);
        }
        break;

      case 'Continue':
        return true;

      case 'ItemSelectionInput':
        if (type.includes('equals')) {
          const expected = Array.isArray(inputs.x) ? inputs.x : [inputs.x];
          const actual = Array.isArray(answer) ? answer : [answer];
          return expected.length === actual.length && expected.every(item => actual.includes(item));
        }
        break;
    }

    return false;
  }
}
