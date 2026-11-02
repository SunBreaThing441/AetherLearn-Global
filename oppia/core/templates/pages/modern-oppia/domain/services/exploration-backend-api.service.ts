/**
 * @fileoverview Read-only Exploration Backend API Service.
 * Consumes Webapp2 WSGI /explorehandler endpoints strictly matching backend contracts.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  FetchExplorationBackendResponse,
  AnswerSubmissionPayload,
  StateHitPayload,
  CheckpointReachedPayload
} from '../models/exploration.model';

@Injectable({
  providedIn: 'root'
})
export class ExplorationBackendApiService {
  constructor(private http: HttpClient) {}

  /**
   * Initializes and retrieves the exploration data model.
   * Matches core/controllers/reader.py:ExplorationHandler.
   */
  fetchExploration(
    explorationId: string,
    version?: number,
    pid?: string
  ): Observable<FetchExplorationBackendResponse> {
    let params = new HttpParams();
    if (version !== undefined && version !== null) {
      params = params.set('v', version.toString());
    }
    if (pid) {
      params = params.set('pid', pid);
    }
    return this.http.get<FetchExplorationBackendResponse>(
      `/explorehandler/init/${encodeURIComponent(explorationId)}`,
      { params }
    );
  }

  /**
   * Dispatches answer submission telemetry to Webapp2 backend.
   * Matches core/controllers/reader.py:AnswerSubmittedEventHandler.
   */
  submitAnswerTelemetry(
    explorationId: string,
    payload: AnswerSubmissionPayload
  ): Observable<any> {
    return this.http.post<any>(
      `/explorehandler/answer_submitted_event/${encodeURIComponent(explorationId)}`,
      payload
    );
  }

  /**
   * Dispatches state hit event telemetry.
   * Matches core/controllers/reader.py:StateHitEventHandler.
   */
  recordStateHit(
    explorationId: string,
    payload: StateHitPayload
  ): Observable<any> {
    return this.http.post<any>(
      `/explorehandler/state_hit_event/${encodeURIComponent(explorationId)}`,
      payload
    );
  }

  /**
   * Dispatches state complete telemetry.
   * Matches core/controllers/reader.py:StateCompleteEventHandler.
   */
  recordStateComplete(
    explorationId: string,
    payload: Record<string, any>
  ): Observable<any> {
    return this.http.post<any>(
      `/explorehandler/state_complete_event/${encodeURIComponent(explorationId)}`,
      payload
    );
  }

  /**
   * Persists learner checkpoint progress to Datastore.
   * Matches core/controllers/reader.py:CheckpointReachedEventHandler.
   */
  recordCheckpoint(
    explorationId: string,
    payload: CheckpointReachedPayload
  ): Observable<any> {
    return this.http.post<any>(
      `/explorehandler/checkpoint_reached/${encodeURIComponent(explorationId)}`,
      payload
    );
  }

  /**
   * Dispatches exploration start telemetry.
   * Matches core/controllers/reader.py:ExplorationStartEventHandler.
   */
  recordExplorationStart(
    explorationId: string,
    payload: Record<string, any>
  ): Observable<any> {
    return this.http.post<any>(
      `/explorehandler/exploration_start_event/${encodeURIComponent(explorationId)}`,
      payload
    );
  }

  /**
   * Dispatches exploration completion telemetry.
   * Matches core/controllers/reader.py:ExplorationCompleteEventHandler.
   */
  recordExplorationComplete(
    explorationId: string,
    payload: Record<string, any>
  ): Observable<any> {
    return this.http.post<any>(
      `/explorehandler/exploration_complete_event/${encodeURIComponent(explorationId)}`,
      payload
    );
  }
}
