/**
 * @fileoverview Current User Service.
 * Manages reactive authentication state and identity from /userinfohandler.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { catchError, map, tap } from 'rxjs/operators';
import { UserInfo, UserInfoBackendDict } from '../../domain/models/user.model';

@Injectable({
  providedIn: 'root'
})
export class CurrentUserService {
  private currentUserSubject = new BehaviorSubject<UserInfo>(UserInfo.createDefault());
  public currentUser$: Observable<UserInfo> = this.currentUserSubject.asObservable();

  private USER_INFO_URL = '/userinfohandler';

  constructor(private http: HttpClient) {}

  /**
   * Fetches latest user information from the Webapp2 backend.
   */
  loadUserInfo(): Observable<UserInfo> {
    return this.http.get<UserInfoBackendDict>(this.USER_INFO_URL).pipe(
      map(dict => {
        if (dict && dict.user_is_logged_in) {
          return UserInfo.createFromBackendDict(dict);
        }
        return UserInfo.createDefault();
      }),
      tap(userInfo => {
        this.currentUserSubject.next(userInfo);
      }),
      catchError(err => {
        console.warn('Failed to load user info, falling back to guest mode:', err);
        const guestUser = UserInfo.createDefault();
        this.currentUserSubject.next(guestUser);
        return of(guestUser);
      })
    );
  }

  getCurrentUserSnapshot(): UserInfo {
    return this.currentUserSubject.getValue();
  }

  getLoginUrl(currentUrl: string = '/'): Observable<string> {
    return this.http
      .get<{ login_url: string }>('/url_handler', { params: { current_url: currentUrl } })
      .pipe(map(res => res.login_url));
  }
}
