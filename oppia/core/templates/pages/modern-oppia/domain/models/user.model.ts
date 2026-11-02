/**
 * @fileoverview User Data Models and DTOs matching Oppia Webapp2 /userinfohandler.
 */

export interface UserPreferencesDict {
  preferred_language_codes?: string[];
  preferred_site_language_code?: string;
  preferred_audio_language_code?: string;
  display_dashboard_in_words?: boolean;
}

export interface UserInfoBackendDict {
  is_curriculum_admin?: boolean;
  is_moderator?: boolean;
  is_super_admin?: boolean;
  is_topic_manager?: boolean;
  can_manage_own_account?: boolean;
  user_is_logged_in: boolean;
  username?: string | null;
  email?: string | null;
  roles?: string[];
  preferences?: UserPreferencesDict;
  profile_picture_data_url?: string;
}

export class UserInfo {
  constructor(
    public isLoggedIn: boolean,
    public username: string | null = null,
    public email: string | null = null,
    public roles: string[] = [],
    public isSuperAdmin: boolean = false,
    public isModerator: boolean = false,
    public isCurriculumAdmin: boolean = false,
    public profilePictureDataUrl: string | null = null
  ) {}

  static createDefault(): UserInfo {
    return new UserInfo(false);
  }

  static createFromBackendDict(dict: UserInfoBackendDict): UserInfo {
    return new UserInfo(
      dict.user_is_logged_in,
      dict.username || null,
      dict.email || null,
      dict.roles || ['LEARNER'],
      !!dict.is_super_admin,
      !!dict.is_moderator,
      !!dict.is_curriculum_admin,
      dict.profile_picture_data_url || null
    );
  }
}
