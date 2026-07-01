export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      availability_slots: {
        Row: {
          created_at: string;
          day_of_week: number;
          ends_at: string;
          id: string;
          profile_id: string;
          starts_at: string;
        };
        Insert: {
          created_at?: string;
          day_of_week: number;
          ends_at: string;
          id?: string;
          profile_id: string;
          starts_at: string;
        };
        Update: {
          created_at?: string;
          day_of_week?: number;
          ends_at?: string;
          id?: string;
          profile_id?: string;
          starts_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'availability_slots_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      blocks: {
        Row: {
          blocked_id: string;
          blocker_id: string;
          created_at: string;
          reason: string | null;
        };
        Insert: {
          blocked_id: string;
          blocker_id: string;
          created_at?: string;
          reason?: string | null;
        };
        Update: {
          blocked_id?: string;
          blocker_id?: string;
          created_at?: string;
          reason?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'blocks_blocked_id_fkey';
            columns: ['blocked_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'blocks_blocker_id_fkey';
            columns: ['blocker_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversation_members: {
        Row: {
          conversation_id: string;
          created_at: string;
          last_read_at: string | null;
          profile_id: string;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          last_read_at?: string | null;
          profile_id: string;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          last_read_at?: string | null;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'conversation_members_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'conversation_members_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      conversations: {
        Row: {
          created_at: string;
          id: string;
          last_message_at: string | null;
          match_id: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          match_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          last_message_at?: string | null;
          match_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'conversations_match_id_fkey';
            columns: ['match_id'];
            isOneToOne: true;
            referencedRelation: 'matches';
            referencedColumns: ['id'];
          },
        ];
      };
      game_profiles: {
        Row: {
          created_at: string;
          handle: string;
          profile_id: string;
          rank_id: string | null;
          server_region: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          handle: string;
          profile_id: string;
          rank_id?: string | null;
          server_region?: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          handle?: string;
          profile_id?: string;
          rank_id?: string | null;
          server_region?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'game_profiles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'game_profiles_rank_id_fkey';
            columns: ['rank_id'];
            isOneToOne: false;
            referencedRelation: 'ranks';
            referencedColumns: ['id'];
          },
        ];
      };
      heroes: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          role_id: string | null;
          slug: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          role_id?: string | null;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          role_id?: string | null;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'heroes_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
        ];
      };
      match_preferences: {
        Row: {
          languages: string[];
          max_rank_id: string | null;
          min_rank_id: string | null;
          profile_id: string;
          regions: string[];
          updated_at: string;
        };
        Insert: {
          languages?: string[];
          max_rank_id?: string | null;
          min_rank_id?: string | null;
          profile_id: string;
          regions?: string[];
          updated_at?: string;
        };
        Update: {
          languages?: string[];
          max_rank_id?: string | null;
          min_rank_id?: string | null;
          profile_id?: string;
          regions?: string[];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'match_preferences_max_rank_id_fkey';
            columns: ['max_rank_id'];
            isOneToOne: false;
            referencedRelation: 'ranks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_preferences_min_rank_id_fkey';
            columns: ['min_rank_id'];
            isOneToOne: false;
            referencedRelation: 'ranks';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'match_preferences_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      matches: {
        Row: {
          created_at: string;
          id: string;
          profile_high_id: string;
          profile_low_id: string;
          unmatched_at: string | null;
        };
        Insert: {
          created_at?: string;
          id?: string;
          profile_high_id: string;
          profile_low_id: string;
          unmatched_at?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          profile_high_id?: string;
          profile_low_id?: string;
          unmatched_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'matches_profile_high_id_fkey';
            columns: ['profile_high_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'matches_profile_low_id_fkey';
            columns: ['profile_low_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      media_assets: {
        Row: {
          byte_size: number;
          checksum: string | null;
          created_at: string;
          deleted_at: string | null;
          height: number | null;
          id: string;
          mime_type: string;
          moderation_status: Database['public']['Enums']['media_moderation_status'];
          object_key: string;
          original_filename: string | null;
          owner_id: string;
          purpose: Database['public']['Enums']['media_purpose'];
          status: Database['public']['Enums']['media_status'];
          updated_at: string;
          visibility: Database['public']['Enums']['media_visibility'];
          width: number | null;
        };
        Insert: {
          byte_size: number;
          checksum?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          height?: number | null;
          id?: string;
          mime_type: string;
          moderation_status?: Database['public']['Enums']['media_moderation_status'];
          object_key: string;
          original_filename?: string | null;
          owner_id: string;
          purpose: Database['public']['Enums']['media_purpose'];
          status?: Database['public']['Enums']['media_status'];
          updated_at?: string;
          visibility: Database['public']['Enums']['media_visibility'];
          width?: number | null;
        };
        Update: {
          byte_size?: number;
          checksum?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          height?: number | null;
          id?: string;
          mime_type?: string;
          moderation_status?: Database['public']['Enums']['media_moderation_status'];
          object_key?: string;
          original_filename?: string | null;
          owner_id?: string;
          purpose?: Database['public']['Enums']['media_purpose'];
          status?: Database['public']['Enums']['media_status'];
          updated_at?: string;
          visibility?: Database['public']['Enums']['media_visibility'];
          width?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: 'media_assets_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      messages: {
        Row: {
          body: string;
          conversation_id: string;
          created_at: string;
          deleted_at: string | null;
          id: string;
          sender_id: string;
        };
        Insert: {
          body: string;
          conversation_id: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          sender_id: string;
        };
        Update: {
          body?: string;
          conversation_id?: string;
          created_at?: string;
          deleted_at?: string | null;
          id?: string;
          sender_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'messages_conversation_id_fkey';
            columns: ['conversation_id'];
            isOneToOne: false;
            referencedRelation: 'conversations';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'messages_sender_id_fkey';
            columns: ['sender_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_heroes: {
        Row: {
          created_at: string;
          hero_id: string;
          profile_id: string;
        };
        Insert: {
          created_at?: string;
          hero_id: string;
          profile_id: string;
        };
        Update: {
          created_at?: string;
          hero_id?: string;
          profile_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_heroes_hero_id_fkey';
            columns: ['hero_id'];
            isOneToOne: false;
            referencedRelation: 'heroes';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_heroes_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      profile_roles: {
        Row: {
          created_at: string;
          profile_id: string;
          role_id: string;
        };
        Insert: {
          created_at?: string;
          profile_id: string;
          role_id: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          role_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profile_roles_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'profile_roles_role_id_fkey';
            columns: ['role_id'];
            isOneToOne: false;
            referencedRelation: 'roles';
            referencedColumns: ['id'];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_media_id: string | null;
          bio: string | null;
          created_at: string;
          deleted_at: string | null;
          display_name: string;
          id: string;
          is_discoverable: boolean;
          locale: string;
          timezone: string;
          updated_at: string;
        };
        Insert: {
          avatar_media_id?: string | null;
          bio?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name: string;
          id: string;
          is_discoverable?: boolean;
          locale?: string;
          timezone?: string;
          updated_at?: string;
        };
        Update: {
          avatar_media_id?: string | null;
          bio?: string | null;
          created_at?: string;
          deleted_at?: string | null;
          display_name?: string;
          id?: string;
          is_discoverable?: boolean;
          locale?: string;
          timezone?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'profiles_avatar_media_id_fkey';
            columns: ['avatar_media_id'];
            isOneToOne: false;
            referencedRelation: 'media_assets';
            referencedColumns: ['id'];
          },
        ];
      };
      ranks: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
          sort_order: number;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
          sort_order?: number;
        };
        Relationships: [];
      };
      reports: {
        Row: {
          created_at: string;
          details: string | null;
          id: string;
          reason: string;
          reported_id: string | null;
          reporter_id: string;
        };
        Insert: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason: string;
          reported_id?: string | null;
          reporter_id: string;
        };
        Update: {
          created_at?: string;
          details?: string | null;
          id?: string;
          reason?: string;
          reported_id?: string | null;
          reporter_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'reports_reported_id_fkey';
            columns: ['reported_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'reports_reporter_id_fkey';
            columns: ['reporter_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      roles: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          slug: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          slug?: string;
        };
        Relationships: [];
      };
      swipes: {
        Row: {
          actor_id: string;
          created_at: string;
          direction: Database['public']['Enums']['swipe_direction'];
          id: string;
          target_id: string;
        };
        Insert: {
          actor_id: string;
          created_at?: string;
          direction: Database['public']['Enums']['swipe_direction'];
          id?: string;
          target_id: string;
        };
        Update: {
          actor_id?: string;
          created_at?: string;
          direction?: Database['public']['Enums']['swipe_direction'];
          id?: string;
          target_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'swipes_actor_id_fkey';
            columns: ['actor_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'swipes_target_id_fkey';
            columns: ['target_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      team_members: {
        Row: {
          created_at: string;
          profile_id: string;
          role: string;
          team_id: string;
        };
        Insert: {
          created_at?: string;
          profile_id: string;
          role?: string;
          team_id: string;
        };
        Update: {
          created_at?: string;
          profile_id?: string;
          role?: string;
          team_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'team_members_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'team_members_team_id_fkey';
            columns: ['team_id'];
            isOneToOne: false;
            referencedRelation: 'teams';
            referencedColumns: ['id'];
          },
        ];
      };
      teams: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'teams_owner_id_fkey';
            columns: ['owner_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      record_swipe: {
        Args: {
          direction: Database['public']['Enums']['swipe_direction'];
          target_profile_id: string;
        };
        Returns: {
          conversation_id: string;
          match_id: string;
          matched: boolean;
        }[];
      };
    };
    Enums: {
      media_moderation_status:
        'pending' | 'approved' | 'rejected' | 'review_required';
      media_purpose:
        | 'game_profile'
        | 'personal_avatar'
        | 'chat_attachment'
        | 'report_evidence';
      media_status:
        | 'pending'
        | 'uploaded'
        | 'ready'
        | 'rejected'
        | 'delete_pending'
        | 'deleted';
      media_visibility:
        'public' | 'matched_users' | 'conversation_members' | 'moderators_only';
      swipe_direction: 'pass' | 'like';
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  'public'
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] &
        DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] &
        DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema['Tables'] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema['Enums'] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      media_moderation_status: [
        'pending',
        'approved',
        'rejected',
        'review_required',
      ],
      media_purpose: [
        'game_profile',
        'personal_avatar',
        'chat_attachment',
        'report_evidence',
      ],
      media_status: [
        'pending',
        'uploaded',
        'ready',
        'rejected',
        'delete_pending',
        'deleted',
      ],
      media_visibility: [
        'public',
        'matched_users',
        'conversation_members',
        'moderators_only',
      ],
      swipe_direction: ['pass', 'like'],
    },
  },
} as const;
