/**
 * @fileoverview Reusable CSRF Token Service for Oppia Webapp2 WSGI Backend.
 * Handles token fetching from /csrfhandler and strips XSSI prefixes.
 */

import { Injectable } from '@angular/core';
import { HttpClient, HttpBackend } from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, shareReplay } from 'rxjs/operators';

export interface CsrfTokenResponse {
  token: string;
}

@Injectable({
  providedIn: 'root'
})
export class CsrfTokenService {
  private token$: Observable<string> | null = null;
  private rawHttp: HttpClient;

  constructor(httpBackend: HttpBackend) {
    // Bypass interceptors for CSRF token acquisition to avoid circular dependencies
    this.rawHttp = new HttpClient(httpBackend);
  }

  /**
   * Retrieves a valid CSRF token, caching the active request.
   */
  getToken(): Observable<string> {
    if (!this.token$) {
      this.token$ = this.rawHttp.get('/csrfhandler', { responseType: 'text' }).pipe(
        map((responseText: string) => {
          let cleanText = responseText;
          // Oppia feconf.XSSI_PREFIX is )]}',\n (5 characters)
          if (cleanText.startsWith(")]}',\n")) {
            cleanText = cleanText.substring(5);
          } else if (cleanText.startsWith(")]}'")) {
            cleanText = cleanText.replace(/^\)\]\}',?\n?/, '');
          }
          const parsed = JSON.parse(cleanText) as CsrfTokenResponse;
          return parsed.token;
        }),
        catchError(err => {
          this.token$ = null; // Clear on error so subsequent attempts can retry
          return throwError(err);
        }),
        shareReplay(1)
      );
    }
    return this.token$;
  }

  /**
   * Promise-based helper for interceptors.
   */
  async getTokenAsync(): Promise<string> {
    return this.getToken().toPromise();
  }

  /**
   * Resets the token cache (e.g. after a 403 CSRF rejection).
   */
  refreshToken(): Observable<string> {
    this.token$ = null;
    return this.getToken();
  }
}
