/**
 * @fileoverview Creator Dashboard data models matching Oppia Webapp2 /creatordashboardhandler/data.
 */

export interface CreatorDashboardStatsBackendDict {
  average_ratings?: number | null;
  num_ratings?: number;
  total_plays?: number;
  total_open_feedback?: number;
}

export interface CreatorExplorationSummaryBackendDict {
  id: string;
  title: string;
  category: string;
  objective: string;
  language_code: string;
  status: string;
  community_owned: boolean;
  version: number;
  num_views?: number;
  num_completions?: number;
  last_updated_msec?: number;
}

export interface CreatorDashboardDataBackendDict {
  dashboard_stats: CreatorDashboardStatsBackendDict;
  last_week_stats?: CreatorDashboardStatsBackendDict | null;
  explorations_list: CreatorExplorationSummaryBackendDict[];
  collections_list?: any[];
  subscribers_list?: any[];
}
