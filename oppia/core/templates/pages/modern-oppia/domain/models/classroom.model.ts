/**
 * @fileoverview Domain models matching Oppia Webapp2 /classroomdatahandler/<name>.
 */

export interface ClassroomTopicSummaryBackendDict {
  id: string;
  name: string;
  url_fragment: string;
  language_code: string;
  description: string;
  version: number;
  canonical_story_count: number;
  additional_story_count: number;
  uncategorized_skill_count: number;
  subtopic_count: number;
  total_skill_count: number;
  total_published_node_count: number;
  thumbnail_filename?: string;
  thumbnail_bg_color?: string;
  published_story_exploration_mapping?: Record<string, string[]>;
  is_published?: boolean;
}

export interface ClassroomBackendDict {
  name?: string;
  classroom_name?: string;
  url_fragment?: string;
  classroom_id?: string;
  topic_summary_dicts?: ClassroomTopicSummaryBackendDict[];
  topics?: Array<{
    name: string;
    topic_id: string;
    chapters_count: number;
  }>;
  topic_list_intro?: string;
  course_details?: string;
  teaser_text?: string;
  is_published?: boolean;
  public_classrooms_count?: number;
}

export class ClassroomTopicSummary {
  constructor(
    public id: string,
    public name: string,
    public urlFragment: string,
    public description: string,
    public canonicalStoryCount: number,
    public totalSkillCount: number,
    public thumbnailBgColor: string = '#00FFC6'
  ) {}

  static fromBackendDict(dict: ClassroomTopicSummaryBackendDict): ClassroomTopicSummary {
    return new ClassroomTopicSummary(
      dict.id,
      dict.name,
      dict.url_fragment,
      dict.description || 'Core curriculum topic module.',
      dict.canonical_story_count || 1,
      dict.total_skill_count || 4,
      dict.thumbnail_bg_color || '#00FFC6'
    );
  }
}

export class ClassroomData {
  constructor(
    public name: string,
    public urlFragment: string,
    public topicListIntro: string,
    public courseDetails: string,
    public topics: ClassroomTopicSummary[]
  ) {}

  static fromBackendDict(dict: ClassroomBackendDict): ClassroomData {
    const topics: ClassroomTopicSummary[] = [];
    if (dict.topic_summary_dicts) {
      topics.push(...dict.topic_summary_dicts.map(t => ClassroomTopicSummary.fromBackendDict(t)));
    } else if (dict.topics) {
      topics.push(...dict.topics.map(t => new ClassroomTopicSummary(
        t.topic_id,
        t.name,
        t.name.toLowerCase().replace(/\s+/g, '-'),
        `Complete ${t.chapters_count} chapter pathway.`,
        t.chapters_count,
        t.chapters_count * 2
      )));
    }
    return new ClassroomData(
      dict.name || dict.classroom_name || 'Curriculum',
      dict.url_fragment || 'curriculum',
      dict.topic_list_intro || 'Explore our verified pedagogical tracks.',
      dict.course_details || 'Comprehensive curriculum aligned with UNESCO SDG 4.',
      topics
    );
  }
}
