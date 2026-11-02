/**
 * @fileoverview Learner Dashboard Backend API Service.
 * Consumes Webapp2 WSGI /learnerdashboarddatahandler strictly matching backend contracts.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { LearnerDashboardDataBackendDict } from '../models/learner-dashboard.model';

@Injectable({
  providedIn: 'root'
})
export class LearnerDashboardBackendApiService {
  private LEARNER_DASHBOARD_URL = '/learnerdashboarddatahandler';

  constructor(private http: HttpClient) {}

  /**
   * Fetches user's active, completed, and bookmarked explorations.
   */
  fetchDashboardData(): Observable<LearnerDashboardDataBackendDict> {
    return this.http.get<LearnerDashboardDataBackendDict>(this.LEARNER_DASHBOARD_URL);
  }
}
