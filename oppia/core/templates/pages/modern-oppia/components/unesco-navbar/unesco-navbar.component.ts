import { Component, EventEmitter, Input, Output, OnInit } from '@angular/core';
import { CurrentUserService } from '../../core/services/current-user.service';
import { UserInfo } from '../../domain/models/user.model';
import { Observable } from 'rxjs';

@Component({
  selector: 'app-unesco-navbar',
  templateUrl: './unesco-navbar.component.html',
  styleUrls: ['./unesco-navbar.component.css']
})
export class UnescoNavbarComponent implements OnInit {
  @Input() activeTab: string = 'library';
  @Output() tabChange = new EventEmitter<string>();

  currentUser$: Observable<UserInfo>;
  isHighContrast: boolean = false;

  constructor(private currentUserService: CurrentUserService) {
    this.currentUser$ = this.currentUserService.currentUser$;
  }

  ngOnInit(): void {
    this.currentUserService.loadUserInfo().subscribe();
  }

  selectTab(tab: string): void {
    this.activeTab = tab;
    this.tabChange.emit(tab);
  }

  toggleHighContrast(): void {
    this.isHighContrast = !this.isHighContrast;
    if (this.isHighContrast) {
      document.body.classList.add('high-contrast-mode');
    } else {
      document.body.classList.remove('high-contrast-mode');
    }
  }
}
