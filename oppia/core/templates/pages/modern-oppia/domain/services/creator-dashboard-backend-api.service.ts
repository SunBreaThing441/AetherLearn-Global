/**
 * @fileoverview Creator Dashboard and Studio Backend API Service.
 * Consumes Webapp2 WSGI /creatordashboardhandler and /createhandler endpoints.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { CreatorDashboardDataBackendDict } from '../models/creator-dashboard.model';

@Injectable({
  providedIn: 'root'
})
export class CreatorDashboardBackendApiService {
  constructor(private http: HttpClient) {}

  /**
   * Fetches author dashboard metrics, plays, and authored exploration summaries.
   */
  fetchDashboardData(): Observable<CreatorDashboardDataBackendDict> {
    return this.http.get<CreatorDashboardDataBackendDict>('/creatordashboardhandler/data');
  }

  /**
   * Fetches editable exploration tree for the creator editor studio.
   */
  fetchEditableExploration(explorationId: string, applyDraft: boolean = true): Observable<any> {
    const params = new HttpParams().set('apply_draft', JSON.stringify(applyDraft));
    return this.http.get<any>(`/createhandler/data/${encodeURIComponent(explorationId)}`, { params });
  }

  /**
   * Commits draft changes to the exploration state tree.
   */
  saveExploration(
    explorationId: string,
    changeList: any[],
    commitMessage: string,
    version: number
  ): Observable<any> {
    const payload = {
      change_list: changeList,
      commit_message: commitMessage,
      version: version
    };
    return this.http.put<any>(`/createhandler/data/${encodeURIComponent(explorationId)}`, payload);
  }
}
