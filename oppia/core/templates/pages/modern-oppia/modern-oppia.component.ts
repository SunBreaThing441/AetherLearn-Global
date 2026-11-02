import { Component, ViewChild } from '@angular/core';
import { ExplorationPlayerComponent } from './components/exploration-player/exploration-player.component';

@Component({
  selector: 'app-modern-oppia-root',
  templateUrl: './modern-oppia.component.html',
  styleUrls: ['./modern-oppia.component.css']
})
export class ModernOppiaComponent {
  @ViewChild(ExplorationPlayerComponent) playerComponent?: ExplorationPlayerComponent;

  activeTab: string = 'library';
  activeExplorationId: string = 'welcome';

  onTabChange(tab: string): void {
    this.activeTab = tab;
  }

  onPlayExploration(id: string): void {
    this.activeExplorationId = id;
    this.activeTab = 'player';
    if (this.playerComponent) {
      this.playerComponent.loadLesson(id);
    }
  }
}
