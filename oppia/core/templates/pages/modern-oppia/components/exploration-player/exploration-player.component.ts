import { Component, Input, OnInit, OnDestroy } from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import { ExplorationPlayerStateService, TranscriptCard } from '../../state/exploration-player-state.service';
import { ExplorationBackendApiService } from '../../domain/services/exploration-backend-api.service';
import { StateBackendDict, HintBackendDict, SolutionBackendDict } from '../../domain/models/exploration.model';

@Component({
  selector: 'app-exploration-player',
  templateUrl: './exploration-player.component.html',
  styleUrls: ['./exploration-player.component.css']
})
export class ExplorationPlayerComponent implements OnInit, OnDestroy {
  @Input() explorationId: string = 'welcome';

  explorationTitle$: Observable<string>;
  currentState$: Observable<StateBackendDict | null>;
  currentStateName$: Observable<string>;
  transcript$: Observable<TranscriptCard[]>;
  feedback$: Observable<{ html: string; isCorrect: boolean } | null>;
  hints$: Observable<HintBackendDict[]>;
  solution$: Observable<SolutionBackendDict | null>;
  progressPercentage$: Observable<number>;
  isProcessing$: Observable<boolean>;
  isCompleted$: Observable<boolean>;

  // Form input model bindings
  selectedMultipleChoiceOption: number | null = null;
  textInputAnswer: string = '';
  numericInputAnswer: number | null = null;
  selectedItemKeys: string[] = [];

  // Interactive View States
  showHints: boolean = false;
  activeHintIndex: number = 0;
  isAudioPlaying: boolean = false;
  checkpointReached: boolean = false;

  private subs = new Subscription();

  constructor(
    public playerState: ExplorationPlayerStateService,
    private explorationApi: ExplorationBackendApiService
  ) {
    this.explorationTitle$ = this.playerState.explorationTitle$;
    this.currentState$ = this.playerState.currentState$;
    this.currentStateName$ = this.playerState.currentStateName$;
    this.transcript$ = this.playerState.transcript$;
    this.feedback$ = this.playerState.feedback$;
    this.hints$ = this.playerState.hints$;
    this.solution$ = this.playerState.solution$;
    this.progressPercentage$ = this.playerState.progressPercentage$;
    this.isProcessing$ = this.playerState.isProcessing$;
    this.isCompleted$ = this.playerState.isCompleted$;
  }

  ngOnInit(): void {
    this.loadLesson(this.explorationId);

    // Track checkpoint changes
    this.subs.add(
      this.currentState$.subscribe(state => {
        this.checkpointReached = !!state?.card_is_checkpoint;
      })
    );
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  }

  loadLesson(id: string): void {
    this.explorationId = id;
    this.resetInputFields();

    this.explorationApi.fetchExploration(id).subscribe({
      next: response => {
        this.playerState.initExploration(response);
      },
      error: err => {
        console.error('Failed to load exploration:', err);
      }
    });
  }

  resetInputFields(): void {
    this.selectedMultipleChoiceOption = null;
    this.textInputAnswer = '';
    this.numericInputAnswer = null;
    this.selectedItemKeys = [];
  }

  submitAnswer(answer: any): void {
    if (answer === null || answer === undefined || answer === '') {
      return;
    }
    this.playerState.submitAnswer(answer);
    this.resetInputFields();
  }

  submitContinue(): void {
    this.playerState.submitAnswer('continue');
  }

  toggleItemSelection(item: string): void {
    const idx = this.selectedItemKeys.indexOf(item);
    if (idx > -1) {
      this.selectedItemKeys.splice(idx, 1);
    } else {
      this.selectedItemKeys.push(item);
    }
  }

  toggleHints(): void {
    this.showHints = !this.showHints;
  }

  toggleAudio(state: StateBackendDict | null): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !state?.content?.html) {
      return;
    }

    if (this.isAudioPlaying) {
      window.speechSynthesis.cancel();
      this.isAudioPlaying = false;
    } else {
      const plainText = state.content.html.replace(/<[^>]*>/g, ' ');
      const utterance = new SpeechSynthesisUtterance(plainText);
      utterance.rate = 0.95;
      utterance.pitch = 1.05;
      utterance.onend = () => {
        this.isAudioPlaying = false;
      };
      this.isAudioPlaying = true;
      window.speechSynthesis.speak(utterance);
    }
  }
}
