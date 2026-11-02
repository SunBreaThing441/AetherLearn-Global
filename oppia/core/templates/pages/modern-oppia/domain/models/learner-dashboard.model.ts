/**
 * @fileoverview Learner Dashboard data models matching Oppia Webapp2 /learnerdashboarddatahandler.
 */

export interface LearnerExplorationSummaryBackendDict {
  id: string;
  title: string;
  category: string;
  objective: string;
  language_code: string;
  thumbnail_icon_url?: string;
  thumbnail_bg_color?: string;
  last_updated_msec?: number;
  ratings?: Record<string, number>;
  status?: string;
  community_owned?: boolean;
  progress_percentage?: number;
}

export interface LearnerDashboardDataBackendDict {
  completed_explorations_list: LearnerExplorationSummaryBackendDict[];
  incomplete_explorations_list: LearnerExplorationSummaryBackendDict[];
  exploration_playlist: LearnerExplorationSummaryBackendDict[];
  subscription_list?: any[];
  number_of_unread_threads?: number;
}
