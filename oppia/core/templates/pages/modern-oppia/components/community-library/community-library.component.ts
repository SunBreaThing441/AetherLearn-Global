import { ClassroomBackendApiService } from '../../domain/services/classroom-backend-api.service';
import { ClassroomTopicSummary } from '../../domain/models/classroom.model';

export interface LibraryExplorationItem {
  id: string;
  title: string;
  category: string;
  objective: string;
  language_code: string;
  tags: string[];
}

@Component({
  selector: 'app-community-library',
  templateUrl: './community-library.component.html',
  styleUrls: ['./community-library.component.css']
})
export class CommunityLibraryComponent implements OnInit {
  @Output() selectExploration = new EventEmitter<string>();

  searchQuery: string = '';
  selectedCategory: string = 'All';
  categories: string[] = ['All', 'Science', 'Mathematics', 'General', 'Language', 'Computer Science'];

  explorations: LibraryExplorationItem[] = [];
  filteredExplorations: LibraryExplorationItem[] = [];
  curriculumTopics: ClassroomTopicSummary[] = [];
  isLoadingCurriculum: boolean = true;

  constructor(
    private http: HttpClient,
    private classroomApi: ClassroomBackendApiService
  ) {}

  ngOnInit(): void {
    // 1. Fetch live curriculum tracks from /classroomdatahandler/math
    this.classroomApi.getClassroomData('math').subscribe({
      next: data => {
        this.curriculumTopics = data.topics;
        this.isLoadingCurriculum = false;
      },
      error: () => {
        this.isLoadingCurriculum = false;
      }
    });

    // 2. Fetch explorations list from learner dashboard
    this.http.get<any>('/learnerdashboarddatahandler').subscribe({
      next: data => {
        const list = [
          ...(data.completed_explorations_list || []),
          ...(data.incomplete_explorations_list || [])
        ];
        if (list.length > 0) {
          this.explorations = list.map((item: any) => ({
            id: item.id,
            title: item.title,
            category: item.category || 'General',
            objective: item.objective || 'Explore interactive lesson concepts',
            language_code: item.language_code || 'en',
            tags: item.tags || ['Interactive', 'UNESCO OER']
          }));
        } else {
          this.loadDefaultExplorations();
        }
        this.filterExplorations();
      },
      error: () => {
        this.loadDefaultExplorations();
        this.filterExplorations();
      }
    });
  }

  loadDefaultExplorations(): void {
    this.explorations = [
      {
        id: 'welcome',
        title: 'Welcome to AetherLearn Global!',
        category: 'General',
        objective: 'Discover what makes AetherLearn Global lessons interactive, personalized, and engaging.',
        language_code: 'en',
        tags: ['Orientation', 'Introductory', 'Interactive']
      },
      {
        id: 'solar_system',
        title: 'The Solar System & Planets',
        category: 'Science',
        objective: 'Journey across the planets, orbits, and celestial bodies of our solar neighborhood.',
        language_code: 'en',
        tags: ['Astronomy', 'Planets', 'Science']
      },
      {
        id: 'fractions',
        title: 'Mastering Fractions & Ratios',
        category: 'Mathematics',
        objective: 'Understand fractions through visual pizzas, ratios, and real-world proportions.',
        language_code: 'en',
        tags: ['Math', 'Fractions', 'Elementary']
      },
      {
        id: 'continents',
        title: 'World Continents & Oceans',
        category: 'General',
        objective: 'Explore the 7 continents and 5 oceans with interactive map challenges.',
        language_code: 'en',
        tags: ['Geography', 'Global', 'UNESCO']
      }
    ];
  }

  filterExplorations(): void {
    const q = this.searchQuery.toLowerCase().trim();
    this.filteredExplorations = this.explorations.filter(exp => {
      const matchCategory = this.selectedCategory === 'All' || exp.category.toLowerCase() === this.selectedCategory.toLowerCase();
      const matchQuery = !q || exp.title.toLowerCase().includes(q) || exp.objective.toLowerCase().includes(q);
      return matchCategory && matchQuery;
    });
  }

  onSelectCategory(cat: string): void {
    this.selectedCategory = cat;
    this.filterExplorations();
  }

  onPlay(id: string): void {
    this.selectExploration.emit(id);
  }
}
