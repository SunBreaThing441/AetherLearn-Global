/**
 * @fileoverview AetherLearn Global HTTP Interceptor.
 * Transparently bridges Angular 11 HttpClient with Python 3 Webapp2 WSGI requirements:
 * 1. Strips XSSI protection prefix )]}',\n from JSON responses.
 * 2. Wraps POST/PUT payload in FormData with 'payload', 'csrf_token', and 'source'.
 * 3. Handles automatic token re-acquisition upon CSRF expiration.
 */

import { Injectable } from '@angular/core';
import {
  HttpEvent,
  HttpHandler,
  HttpInterceptor,
  HttpRequest,
  HttpResponse,
  HttpErrorResponse
} from '@angular/common/http';
import { Observable, from, throwError } from 'rxjs';
import { catchError, map, switchMap } from 'rxjs/operators';
import { CsrfTokenService } from '../services/csrf-token.service';

@Injectable()
export class AetherHttpInterceptor implements HttpInterceptor {
  constructor(private csrfTokenService: CsrfTokenService) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // 1. Bypass interceptor for CSRF token acquisition itself
    if (req.url.includes('/csrfhandler')) {
      return next.handle(req);
    }

    // 2. State-modifying requests (POST, PUT) require FormData packaging with 'payload' and 'csrf_token'
    if (req.method === 'POST' || req.method === 'PUT') {
      return from(this.csrfTokenService.getTokenAsync()).pipe(
        switchMap((token: string) => {
          let formData: FormData;

          if (req.body instanceof FormData) {
            formData = req.body;
          } else {
            formData = new FormData();
            formData.append('payload', JSON.stringify(req.body ?? {}));
          }

          if (!formData.has('csrf_token')) {
            formData.append('csrf_token', token);
          }
          if (!formData.has('source')) {
            formData.append('source', typeof window !== 'undefined' ? window.location.href : '/');
          }

          const clonedReq = req.clone({
            body: formData,
            setHeaders: {
              'X-CSRF-Token': token
            },
            withCredentials: true
          });

          return next.handle(clonedReq);
        }),
        catchError(error => this.handleHttpError(error, req, next))
      );
    }

    // 3. For GET, DELETE, and other methods, execute normally with credentials and strip XSSI prefix from responses
    const authReq = req.clone({ withCredentials: true });
    return next.handle(authReq).pipe(
      map(event => this.stripXssiPrefix(event)),
      catchError(error => this.handleHttpError(error, req, next))
    );
  }

  /**
   * Strips feconf.XSSI_PREFIX ()]}',\n) from text responses if present.
   */
  private stripXssiPrefix(event: HttpEvent<any>): HttpEvent<any> {
    if (event instanceof HttpResponse) {
      if (typeof event.body === 'string') {
        let text = event.body;
        if (text.startsWith(")]}',\n")) {
          text = text.substring(5);
          try {
            return event.clone({ body: JSON.parse(text) });
          } catch {
            return event.clone({ body: text });
          }
        }
      }
    }
    return event;
  }

  /**
   * Handles HTTP error responses, retrying with a fresh token on 403 CSRF failures.
   */
  private handleHttpError(
    error: any,
    req: HttpRequest<any>,
    next: HttpHandler
  ): Observable<HttpEvent<any>> {
    if (error instanceof HttpErrorResponse && error.status === 403) {
      // Refresh CSRF token and attempt retry once
      return this.csrfTokenService.refreshToken().pipe(
        switchMap(newToken => {
          let formData = new FormData();
          formData.append('payload', JSON.stringify(req.body ?? {}));
          formData.append('csrf_token', newToken);
          formData.append('source', typeof window !== 'undefined' ? window.location.href : '/');
          return next.handle(req.clone({ body: formData }));
        }),
        catchError(retryError => throwError(retryError))
      );
    }
    return throwError(error);
  }
}

export const OppiaHttpInterceptor = AetherHttpInterceptor;
