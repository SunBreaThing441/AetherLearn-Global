/**
 * @fileoverview Modern Oppia Angular 11 Module.
 * Assembles all reactive domain state services, UNESCO components, and the HTTP interceptor pipeline.
 */

import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { HttpClientModule, HTTP_INTERCEPTORS } from '@angular/common/http';

// Components
import { ModernOppiaComponent } from './modern-oppia.component';
import { UnescoNavbarComponent } from './components/unesco-navbar/unesco-navbar.component';
import { ExplorationPlayerComponent } from './components/exploration-player/exploration-player.component';
import { LearnerDashboardComponent } from './components/learner-dashboard/learner-dashboard.component';
import { CreatorStudioComponent } from './components/creator-studio/creator-studio.component';
import { CommunityLibraryComponent } from './components/community-library/community-library.component';
import { ContributorDashboardComponent } from './components/contributor-dashboard/contributor-dashboard.component';

// Interceptors & Services
import { OppiaHttpInterceptor } from './core/interceptors/oppia-http.interceptor';
import { CsrfTokenService } from './core/services/csrf-token.service';
import { CurrentUserService } from './core/services/current-user.service';
import { ExplorationBackendApiService } from './domain/services/exploration-backend-api.service';
import { LearnerDashboardBackendApiService } from './domain/services/learner-dashboard-backend-api.service';
import { CreatorDashboardBackendApiService } from './domain/services/creator-dashboard-backend-api.service';
import { ClassroomBackendApiService } from './domain/services/classroom-backend-api.service';
import { ExplorationPlayerStateService } from './state/exploration-player-state.service';
import { LearnerDashboardStateService } from './state/learner-dashboard-state.service';
import { CreatorStudioStateService } from './state/creator-studio-state.service';

@NgModule({
  declarations: [
    ModernOppiaComponent,
    UnescoNavbarComponent,
    ExplorationPlayerComponent,
    LearnerDashboardComponent,
    CreatorStudioComponent,
    CommunityLibraryComponent,
    ContributorDashboardComponent
  ],
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    HttpClientModule
  ],
  providers: [
    CsrfTokenService,
    CurrentUserService,
    ExplorationBackendApiService,
    LearnerDashboardBackendApiService,
    CreatorDashboardBackendApiService,
    ClassroomBackendApiService,
    ExplorationPlayerStateService,
    LearnerDashboardStateService,
    CreatorStudioStateService,
    {
      provide: HTTP_INTERCEPTORS,
      useClass: OppiaHttpInterceptor,
      multi: true
    }
  ],
  exports: [
    ModernOppiaComponent,
    UnescoNavbarComponent,
    ExplorationPlayerComponent,
    LearnerDashboardComponent,
    CreatorStudioComponent,
    CommunityLibraryComponent,
    ContributorDashboardComponent
  ],
  bootstrap: [ModernOppiaComponent]
})
export class ModernOppiaModule {}
