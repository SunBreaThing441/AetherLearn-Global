import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';

export interface TranslationOpportunity {
  id: string;
  title: string;
  language: string;
  progress: string;
}

export interface VoiceoverOpportunity {
  id: string;
  title: string;
  language: string;
  progress: string;
}

@Component({
  selector: 'app-contributor-dashboard',
  templateUrl: './contributor-dashboard.component.html',
  styleUrls: ['./contributor-dashboard.component.css']
})
export class ContributorDashboardComponent implements OnInit {
  activeTab: string = 'translation';

  translationOpportunities$ = new BehaviorSubject<TranslationOpportunity[]>([]);
  voiceoverOpportunities$ = new BehaviorSubject<VoiceoverOpportunity[]>([]);
  isLoading$ = new BehaviorSubject<boolean>(false);

  // Contributor Impact Stats
  totalWordsTranslated: number = 14250;
  totalAudioMinutes: number = 42;
  approvedReviewsCount: number = 18;

  constructor(private http: HttpClient) {}

  ngOnInit(): void {
    this.loadOpportunities();
  }

  loadOpportunities(): void {
    this.isLoading$.next(true);
    this.http.get<any>('/contributordashboarddatahandler').subscribe({
      next: data => {
        this.translationOpportunities$.next(data.translation_opportunities || [
          { id: 'welcome', title: 'Welcome to AetherLearn Global', language: 'Hindi', progress: '75%' },
          { id: 'solar_system', title: 'The Solar System', language: 'Spanish', progress: '50%' },
          { id: 'fractions', title: 'Mastering Fractions', language: 'Arabic', progress: '30%' },
          { id: 'continents', title: 'Continents & Oceans', language: 'French', progress: '90%' }
        ]);

        this.voiceoverOpportunities$.next(data.voiceover_opportunities || [
          { id: 'solar_system', title: 'The Solar System', language: 'English', progress: '85%' },
          { id: 'fractions', title: 'Mastering Fractions', language: 'Hindi', progress: '40%' }
        ]);

        this.isLoading$.next(false);
      },
      error: () => {
        // Fallback demo data
        this.translationOpportunities$.next([
          { id: 'welcome', title: 'Welcome to AetherLearn Global', language: 'Hindi', progress: '75%' },
          { id: 'solar_system', title: 'The Solar System', language: 'Spanish', progress: '50%' },
          { id: 'fractions', title: 'Mastering Fractions', language: 'Arabic', progress: '30%' },
          { id: 'continents', title: 'Continents & Oceans', language: 'French', progress: '90%' }
        ]);
        this.voiceoverOpportunities$.next([
          { id: 'solar_system', title: 'The Solar System', language: 'English', progress: '85%' },
          { id: 'fractions', title: 'Mastering Fractions', language: 'Hindi', progress: '40%' }
        ]);
        this.isLoading$.next(false);
      }
    });
  }

  switchTab(tab: string): void {
    this.activeTab = tab;
  }
}
