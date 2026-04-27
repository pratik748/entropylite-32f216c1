export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      cadence_entries: {
        Row: {
          concept: string
          created_at: string
          discipline: string
          failure_modes: Json
          generation_meta: Json
          id: string
          image_url: string | null
          inside_annotation: string
          inside_caption: string
          mathematical_core: Json
          providers_used: Json
          publish_date: string
          read_minutes: number
          slug: string
          tagline: string
          why_it_matters: string
        }
        Insert: {
          concept: string
          created_at?: string
          discipline: string
          failure_modes?: Json
          generation_meta?: Json
          id?: string
          image_url?: string | null
          inside_annotation: string
          inside_caption: string
          mathematical_core?: Json
          providers_used?: Json
          publish_date: string
          read_minutes?: number
          slug: string
          tagline: string
          why_it_matters: string
        }
        Update: {
          concept?: string
          created_at?: string
          discipline?: string
          failure_modes?: Json
          generation_meta?: Json
          id?: string
          image_url?: string | null
          inside_annotation?: string
          inside_caption?: string
          mathematical_core?: Json
          providers_used?: Json
          publish_date?: string
          read_minutes?: number
          slug?: string
          tagline?: string
          why_it_matters?: string
        }
        Relationships: []
      }
      cadence_topics_used: {
        Row: {
          entry_id: string | null
          topic: string
          used_at: string
        }
        Insert: {
          entry_id?: string | null
          topic: string
          used_at?: string
        }
        Update: {
          entry_id?: string | null
          topic?: string
          used_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cadence_topics_used_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "cadence_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      clank_activation_events: {
        Row: {
          activated_at: string
          activation_probability: number
          clank_score_at_activation: number
          constraint_id: string
          id: string
          notes: string | null
          observed_price_impact: number | null
          observed_vol_change: number | null
          observed_volume_impact: number | null
          outcome_accuracy: number | null
          user_id: string
        }
        Insert: {
          activated_at?: string
          activation_probability?: number
          clank_score_at_activation?: number
          constraint_id: string
          id?: string
          notes?: string | null
          observed_price_impact?: number | null
          observed_vol_change?: number | null
          observed_volume_impact?: number | null
          outcome_accuracy?: number | null
          user_id: string
        }
        Update: {
          activated_at?: string
          activation_probability?: number
          clank_score_at_activation?: number
          constraint_id?: string
          id?: string
          notes?: string | null
          observed_price_impact?: number | null
          observed_vol_change?: number | null
          observed_volume_impact?: number | null
          outcome_accuracy?: number | null
          user_id?: string
        }
        Relationships: []
      }
      clank_confidence_overrides: {
        Row: {
          adjusted_confidence: number
          constraint_id: string
          id: string
          last_updated: string
          sample_count: number
          user_id: string
        }
        Insert: {
          adjusted_confidence?: number
          constraint_id: string
          id?: string
          last_updated?: string
          sample_count?: number
          user_id: string
        }
        Update: {
          adjusted_confidence?: number
          constraint_id?: string
          id?: string
          last_updated?: string
          sample_count?: number
          user_id?: string
        }
        Relationships: []
      }
      lodger_trades: {
        Row: {
          actual_hold_min: number
          created_at: string
          divergence_pct: number
          drawdown_elasticity: number
          entry_px: number
          entry_ts: number
          exec_latency_ms: number
          exit_px: number
          exit_ts: number
          expected_hold_min: number
          expected_pct: number
          id: string
          lesson: string | null
          liquidity_score: number
          pattern_id: string | null
          pnl_abs: number
          pnl_pct: number
          qty: number
          realized_sharpe: number
          reflex_score: number
          regime: string
          side: string
          slippage_bps: number
          tags: Json
          ticker: string
          user_id: string
          vol_at_entry: number
        }
        Insert: {
          actual_hold_min?: number
          created_at?: string
          divergence_pct?: number
          drawdown_elasticity?: number
          entry_px?: number
          entry_ts: number
          exec_latency_ms?: number
          exit_px?: number
          exit_ts: number
          expected_hold_min?: number
          expected_pct?: number
          id?: string
          lesson?: string | null
          liquidity_score?: number
          pattern_id?: string | null
          pnl_abs?: number
          pnl_pct?: number
          qty?: number
          realized_sharpe?: number
          reflex_score?: number
          regime?: string
          side?: string
          slippage_bps?: number
          tags?: Json
          ticker: string
          user_id: string
          vol_at_entry?: number
        }
        Update: {
          actual_hold_min?: number
          created_at?: string
          divergence_pct?: number
          drawdown_elasticity?: number
          entry_px?: number
          entry_ts?: number
          exec_latency_ms?: number
          exit_px?: number
          exit_ts?: number
          expected_hold_min?: number
          expected_pct?: number
          id?: string
          lesson?: string | null
          liquidity_score?: number
          pattern_id?: string | null
          pnl_abs?: number
          pnl_pct?: number
          qty?: number
          realized_sharpe?: number
          reflex_score?: number
          regime?: string
          side?: string
          slippage_bps?: number
          tags?: Json
          ticker?: string
          user_id?: string
          vol_at_entry?: number
        }
        Relationships: []
      }
      odgs_gradient_state: {
        Row: {
          allocation_scales: Json
          asset_biases: Json
          feature_weights: Json
          generation: number
          updated_at: string
          user_id: string
        }
        Insert: {
          allocation_scales?: Json
          asset_biases?: Json
          feature_weights?: Json
          generation?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          allocation_scales?: Json
          asset_biases?: Json
          feature_weights?: Json
          generation?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      odgs_trade_ledger: {
        Row: {
          asset: string
          asset_class: string
          created_at: string
          duration_hours: number
          feature_momentum: number
          feature_regime: string
          feature_sentiment: number
          feature_vol: number
          id: string
          pnl_pct: number
          return_abs: number
          source: string
          trade_timestamp: number
          user_id: string
        }
        Insert: {
          asset: string
          asset_class?: string
          created_at?: string
          duration_hours?: number
          feature_momentum?: number
          feature_regime?: string
          feature_sentiment?: number
          feature_vol?: number
          id?: string
          pnl_pct?: number
          return_abs?: number
          source?: string
          trade_timestamp: number
          user_id: string
        }
        Update: {
          asset?: string
          asset_class?: string
          created_at?: string
          duration_hours?: number
          feature_momentum?: number
          feature_regime?: string
          feature_sentiment?: number
          feature_vol?: number
          id?: string
          pnl_pct?: number
          return_abs?: number
          source?: string
          trade_timestamp?: number
          user_id?: string
        }
        Relationships: []
      }
      statarb_outcomes: {
        Row: {
          actual_outcome: string
          closed_at: string
          created_at: string
          expected_half_life: number
          id: string
          pair: string
          pnl_bps: number
          regime_at_entry: string
          s_final: number
          user_id: string
        }
        Insert: {
          actual_outcome: string
          closed_at?: string
          created_at?: string
          expected_half_life?: number
          id?: string
          pair: string
          pnl_bps?: number
          regime_at_entry: string
          s_final?: number
          user_id: string
        }
        Update: {
          actual_outcome?: string
          closed_at?: string
          created_at?: string
          expected_half_life?: number
          id?: string
          pair?: string
          pnl_bps?: number
          regime_at_entry?: string
          s_final?: number
          user_id?: string
        }
        Relationships: []
      }
      twrd_claims: {
        Row: {
          alpha: number
          beta: number
          created_at: string
          decay_rate: number
          domain: string
          evidence: Json
          id: string
          object: string
          relation: string
          subject: string
          superseded_by: string | null
          truth_score: number
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          alpha?: number
          beta?: number
          created_at?: string
          decay_rate?: number
          domain: string
          evidence?: Json
          id?: string
          object: string
          relation: string
          subject: string
          superseded_by?: string | null
          truth_score: number
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          alpha?: number
          beta?: number
          created_at?: string
          decay_rate?: number
          domain?: string
          evidence?: Json
          id?: string
          object?: string
          relation?: string
          subject?: string
          superseded_by?: string | null
          truth_score?: number
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "twrd_claims_superseded_by_fkey"
            columns: ["superseded_by"]
            isOneToOne: false
            referencedRelation: "twrd_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      twrd_contradictions: {
        Row: {
          claim_a: string
          claim_b: string
          detected_at: string
        }
        Insert: {
          claim_a: string
          claim_b: string
          detected_at?: string
        }
        Update: {
          claim_a?: string
          claim_b?: string
          detected_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "twrd_contradictions_claim_a_fkey"
            columns: ["claim_a"]
            isOneToOne: false
            referencedRelation: "twrd_claims"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "twrd_contradictions_claim_b_fkey"
            columns: ["claim_b"]
            isOneToOne: false
            referencedRelation: "twrd_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      twrd_feedback: {
        Row: {
          claim_id: string | null
          id: string
          observed_at: string
          outcome: number
          user_id: string | null
        }
        Insert: {
          claim_id?: string | null
          id?: string
          observed_at?: string
          outcome: number
          user_id?: string | null
        }
        Update: {
          claim_id?: string | null
          id?: string
          observed_at?: string
          outcome?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "twrd_feedback_claim_id_fkey"
            columns: ["claim_id"]
            isOneToOne: false
            referencedRelation: "twrd_claims"
            referencedColumns: ["id"]
          },
        ]
      }
      twrd_sources: {
        Row: {
          alpha: number
          beta: number
          domain: string
          id: string
          updated_at: string
        }
        Insert: {
          alpha?: number
          beta?: number
          domain: string
          id: string
          updated_at?: string
        }
        Update: {
          alpha?: number
          beta?: number
          domain?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      twrd_weights: {
        Row: {
          b: number
          id: number
          updated_at: string
          w1: number
          w2: number
          w3: number
          w4: number
          w5: number
        }
        Insert: {
          b?: number
          id?: number
          updated_at?: string
          w1?: number
          w2?: number
          w3?: number
          w4?: number
          w5?: number
        }
        Update: {
          b?: number
          id?: number
          updated_at?: string
          w1?: number
          w2?: number
          w3?: number
          w4?: number
          w5?: number
        }
        Relationships: []
      }
      user_analysis_history: {
        Row: {
          buy_price: number
          confidence: number
          created_at: string
          current_price: number
          id: string
          suggestion: string
          ticker: string
          timestamp: number
          user_id: string
        }
        Insert: {
          buy_price: number
          confidence: number
          created_at?: string
          current_price: number
          id?: string
          suggestion: string
          ticker: string
          timestamp: number
          user_id: string
        }
        Update: {
          buy_price?: number
          confidence?: number
          created_at?: string
          current_price?: number
          id?: string
          suggestion?: string
          ticker?: string
          timestamp?: number
          user_id?: string
        }
        Relationships: []
      }
      user_portfolios: {
        Row: {
          analysis: Json | null
          buy_price: number
          created_at: string
          id: string
          quantity: number
          ticker: string
          updated_at: string
          user_id: string
        }
        Insert: {
          analysis?: Json | null
          buy_price: number
          created_at?: string
          id?: string
          quantity: number
          ticker: string
          updated_at?: string
          user_id: string
        }
        Update: {
          analysis?: Json | null
          buy_price?: number
          created_at?: string
          id?: string
          quantity?: number
          ticker?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
