/**
 * @fileoverview Exploration data models matching Oppia Webapp2 /explorehandler contracts.
 */

export interface SubtitledHtmlBackendDict {
  content_id: string | null;
  html: string;
}

export interface RuleSpecBackendDict {
  rule_type: string;
  inputs: Record<string, any>;
}

export interface OutcomeBackendDict {
  dest: string;
  dest_if_really_stuck?: string | null;
  feedback: SubtitledHtmlBackendDict;
  labelled_as_correct: boolean;
  param_changes: any[];
  refresher_exploration_id?: string | null;
  missing_prerequisite_skill_id?: string | null;
}

export interface AnswerGroupBackendDict {
  outcome: OutcomeBackendDict;
  rule_specs: RuleSpecBackendDict[];
  training_data: any[];
  tagged_skill_misconception_id?: string | null;
}

export interface HintBackendDict {
  hint_content: SubtitledHtmlBackendDict;
}

export interface SolutionBackendDict {
  answer_is_exclusive: boolean;
  correct_answer: any;
  explanation: SubtitledHtmlBackendDict;
}

export interface InteractionBackendDict {
  id: string;
  customization_args: Record<string, any>;
  answer_groups: AnswerGroupBackendDict[];
  default_outcome: OutcomeBackendDict | null;
  confirmed_unclassified_answers: any[];
  hints: HintBackendDict[];
  solution: SolutionBackendDict | null;
}

export interface StateBackendDict {
  content: SubtitledHtmlBackendDict;
  interaction: InteractionBackendDict;
  param_changes: any[];
  recorded_voiceovers?: Record<string, any>;
  written_translations?: Record<string, any>;
  solicit_answer_details?: boolean;
  card_is_checkpoint?: boolean;
}

export interface ReadOnlyExplorationBackendDict {
  init_state_name: string;
  param_changes: any[];
  param_specs: Record<string, any>;
  states: Record<string, StateBackendDict>;
  title: string;
  language_code: string;
  objective: string;
  next_content_id_index: number;
}

export interface ExplorationMetadataBackendDict {
  id: string;
  title: string;
  category: string;
  objective: string;
  language_code: string;
  tags: string[];
  status: string;
  community_owned: boolean;
  ratings?: Record<string, number>;
  version: number;
}

export interface FetchExplorationBackendResponse {
  can_edit: boolean;
  exploration: ReadOnlyExplorationBackendDict;
  exploration_metadata: ExplorationMetadataBackendDict;
  exploration_id: string;
  is_logged_in: boolean;
  session_id: string;
  version: number;
  preferred_audio_language_code?: string;
  preferred_language_codes?: string[];
  auto_tts_enabled?: boolean;
  record_playthrough_probability?: number;
  draft_change_list_id?: number;
  has_viewed_lesson_info_modal_once?: boolean;
  furthest_reached_checkpoint_exp_version?: number | null;
  furthest_reached_checkpoint_state_name?: string | null;
  most_recently_reached_checkpoint_exp_version?: number | null;
  most_recently_reached_checkpoint_state_name?: string | null;
  displayable_language_codes?: string[];
}

export interface AnswerSubmissionPayload {
  answer: any;
  params: Record<string, any>;
  session_id: string;
  old_state_name: string;
  client_time_spent_in_secs: number;
  answer_group_index: number;
  rule_spec_index: number;
  version: number;
  classification_categorization: string;
}

export interface StateHitPayload {
  new_state_name: string;
  session_id: string;
  client_time_spent_in_secs: number;
  exploration_version: number;
}

export interface CheckpointReachedPayload {
  checkpoint_state_name: string;
  exp_version: number;
  session_id: string;
  number_of_checkpoints_attained?: number;
}
