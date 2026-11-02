/**
 * @fileoverview Classroom Backend API Service.
 * Consumes Python 3 Webapp2 /classroomdatahandler/<name> endpoints.
 */

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { map, shareReplay, retry, catchError } from 'rxjs/operators';
import { ClassroomBackendDict, ClassroomData } from '../models/classroom.model';

@Injectable({
  providedIn: 'root'
})
export class ClassroomBackendApiService {
  private cache = new Map<string, Observable<ClassroomData>>();

  constructor(private http: HttpClient) {}

  /**
   * Fetches classroom data for a given URL fragment (e.g. 'math').
   */
  getClassroomData(name: string): Observable<ClassroomData> {
    if (!this.cache.has(name)) {
      const request$ = this.http.get<ClassroomBackendDict>(`/classroomdatahandler/${encodeURIComponent(name)}`).pipe(
        retry({ count: 2, delay: 1000 }),
        map(dict => ClassroomData.fromBackendDict(dict)),
        catchError(err => {
          console.warn(`Failed to fetch classroom data for "${name}", returning fallback:`, err);
          return of(ClassroomData.fromBackendDict({
            classroom_name: name,
            topics: [
              { name: 'Fractions & Ratios', topic_id: 'fractions', chapters_count: 5 },
              { name: 'Multiplication & Geometry', topic_id: 'mult_geom', chapters_count: 8 }
            ]
          }));
        }),
        shareReplay({ bufferSize: 1, refCount: true })
      );
      this.cache.set(name, request$);
    }
    return this.cache.get(name)!;
  }

  /**
   * Clears in-memory cache for classroom data.
   */
  clearCache(): void {
    this.cache.clear();
  }
}
