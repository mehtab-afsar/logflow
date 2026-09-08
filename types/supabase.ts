export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      access_tokens: {
        Row: {
          consignment_id: string
          created_at: string
          created_by: string | null
          expires_at: string
          id: string
          kind: string
          org_id: string
          revoked_at: string | null
          token: string
        }
        Insert: {
          consignment_id: string
          created_at?: string
          created_by?: string | null
          expires_at: string
          id?: string
          kind?: string
          org_id: string
          revoked_at?: string | null
          token?: string
        }
        Update: {
          consignment_id?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string
          id?: string
          kind?: string
          org_id?: string
          revoked_at?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "access_tokens_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignment_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "access_tokens_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      bill_lines: {
        Row: {
          amount: number
          bill_id: string
          consignment_id: string
          id: string
        }
        Insert: {
          amount: number
          bill_id: string
          consignment_id: string
          id?: string
        }
        Update: {
          amount?: number
          bill_id?: string
          consignment_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bill_lines_bill_id_fkey"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "freight_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignment_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bill_lines_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          city: string | null
          created_at: string
          id: string
          inv_prefix: string
          is_active: boolean
          lr_prefix: string
          name: string
          org_id: string
          state_code: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          inv_prefix?: string
          is_active?: boolean
          lr_prefix?: string
          name: string
          org_id: string
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          inv_prefix?: string
          is_active?: boolean
          lr_prefix?: string
          name?: string
          org_id?: string
          state_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      consignment_events: {
        Row: {
          actor_type: string
          actor_user_id: string | null
          consignment_id: string
          created_at: string
          event_time: string
          from_status: string | null
          id: string
          kind: string
          location_name: string | null
          milestone: string | null
          org_id: string
          payload: Json
          remarks: string | null
          to_status: string | null
        }
        Insert: {
          actor_type: string
          actor_user_id?: string | null
          consignment_id: string
          created_at?: string
          event_time?: string
          from_status?: string | null
          id?: string
          kind?: string
          location_name?: string | null
          milestone?: string | null
          org_id: string
          payload?: Json
          remarks?: string | null
          to_status?: string | null
        }
        Update: {
          actor_type?: string
          actor_user_id?: string | null
          consignment_id?: string
          created_at?: string
          event_time?: string
          from_status?: string | null
          id?: string
          kind?: string
          location_name?: string | null
          milestone?: string | null
          org_id?: string
          payload?: Json
          remarks?: string | null
          to_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consignment_events_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_events_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignment_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_events_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      consignment_pods: {
        Row: {
          client_id: string
          consignment_id: string
          id: string
          org_id: string
          page_no: number
          storage_path: string
          uploaded_at: string
          uploaded_by_type: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          client_id: string
          consignment_id: string
          id?: string
          org_id: string
          page_no?: number
          storage_path: string
          uploaded_at?: string
          uploaded_by_type?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          client_id?: string
          consignment_id?: string
          id?: string
          org_id?: string
          page_no?: number
          storage_path?: string
          uploaded_at?: string
          uploaded_by_type?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consignment_pods_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignment_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_pods_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_pods_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignment_pods_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consignment_transitions: {
        Row: {
          from_status: string
          to_status: string
        }
        Insert: {
          from_status: string
          to_status: string
        }
        Update: {
          from_status?: string
          to_status?: string
        }
        Relationships: []
      }
      consignments: {
        Row: {
          actual_weight_kg: number | null
          advance_received: number
          bill_id: string | null
          branch_id: string
          cancel_reason: string | null
          cancelled_at: string | null
          cargo_description: string
          cgst_amount: number
          charged_weight_kg: number | null
          consignee_party_id: string | null
          consignee_snapshot: Json
          consignor_party_id: string | null
          consignor_snapshot: Json
          created_at: string
          created_by: string | null
          customer_invoice_date: string | null
          customer_invoice_no: string | null
          declared_value: number
          delivered_at: string | null
          delivery_instructions: string | null
          destination_city: string
          destination_state: string
          detention: number
          dispatched_at: string | null
          distance_km: number | null
          doc_version: number
          driver_id: string | null
          eta_text: string | null
          ewb_no: string | null
          ewb_valid_until: string | null
          exempt_goods: boolean
          freight: number
          freight_basis: string
          freight_rate: number | null
          freight_terms: string
          hsn_code: string | null
          id: string
          igst_amount: number
          in_transit_at: string | null
          invoice_total: number
          invoiced_at: string | null
          loading: number
          lr_date: string
          lr_no: string
          org_id: string
          origin_city: string
          origin_state: string
          other_charges: number
          packages_count: number
          packages_unit: string
          pod_verified_at: string | null
          pod_verified_by: string | null
          remarks: string | null
          settled_at: string | null
          sgst_amount: number
          status: string
          tax_mode: string
          tax_rate_pct: number
          tax_snapshot: Json
          taxable_value: number | null
          tracking_token: string
          unloading: number
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          actual_weight_kg?: number | null
          advance_received?: number
          bill_id?: string | null
          branch_id: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cargo_description: string
          cgst_amount?: number
          charged_weight_kg?: number | null
          consignee_party_id?: string | null
          consignee_snapshot: Json
          consignor_party_id?: string | null
          consignor_snapshot: Json
          created_at?: string
          created_by?: string | null
          customer_invoice_date?: string | null
          customer_invoice_no?: string | null
          declared_value?: number
          delivered_at?: string | null
          delivery_instructions?: string | null
          destination_city: string
          destination_state: string
          detention?: number
          dispatched_at?: string | null
          distance_km?: number | null
          doc_version?: number
          driver_id?: string | null
          eta_text?: string | null
          ewb_no?: string | null
          ewb_valid_until?: string | null
          exempt_goods?: boolean
          freight?: number
          freight_basis?: string
          freight_rate?: number | null
          freight_terms?: string
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          in_transit_at?: string | null
          invoice_total?: number
          invoiced_at?: string | null
          loading?: number
          lr_date?: string
          lr_no?: string
          org_id: string
          origin_city: string
          origin_state: string
          other_charges?: number
          packages_count?: number
          packages_unit?: string
          pod_verified_at?: string | null
          pod_verified_by?: string | null
          remarks?: string | null
          settled_at?: string | null
          sgst_amount?: number
          status?: string
          tax_mode: string
          tax_rate_pct?: number
          tax_snapshot?: Json
          taxable_value?: number | null
          tracking_token?: string
          unloading?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          actual_weight_kg?: number | null
          advance_received?: number
          bill_id?: string | null
          branch_id?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cargo_description?: string
          cgst_amount?: number
          charged_weight_kg?: number | null
          consignee_party_id?: string | null
          consignee_snapshot?: Json
          consignor_party_id?: string | null
          consignor_snapshot?: Json
          created_at?: string
          created_by?: string | null
          customer_invoice_date?: string | null
          customer_invoice_no?: string | null
          declared_value?: number
          delivered_at?: string | null
          delivery_instructions?: string | null
          destination_city?: string
          destination_state?: string
          detention?: number
          dispatched_at?: string | null
          distance_km?: number | null
          doc_version?: number
          driver_id?: string | null
          eta_text?: string | null
          ewb_no?: string | null
          ewb_valid_until?: string | null
          exempt_goods?: boolean
          freight?: number
          freight_basis?: string
          freight_rate?: number | null
          freight_terms?: string
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          in_transit_at?: string | null
          invoice_total?: number
          invoiced_at?: string | null
          loading?: number
          lr_date?: string
          lr_no?: string
          org_id?: string
          origin_city?: string
          origin_state?: string
          other_charges?: number
          packages_count?: number
          packages_unit?: string
          pod_verified_at?: string | null
          pod_verified_by?: string | null
          remarks?: string | null
          settled_at?: string | null
          sgst_amount?: number
          status?: string
          tax_mode?: string
          tax_rate_pct?: number
          tax_snapshot?: Json
          taxable_value?: number | null
          tracking_token?: string
          unloading?: number
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consignments_bill_fk"
            columns: ["bill_id"]
            isOneToOne: false
            referencedRelation: "freight_bills"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_consignee_party_id_fkey"
            columns: ["consignee_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_consignor_party_id_fkey"
            columns: ["consignor_party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_pod_verified_by_fkey"
            columns: ["pod_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consignments_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_sequences: {
        Row: {
          branch_id: string
          doc_type: string
          fy: string
          last_value: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          doc_type: string
          fy: string
          last_value?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          doc_type?: string
          fy?: string
          last_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_sequences_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      drivers: {
        Row: {
          created_at: string
          deleted_at: string | null
          dl_expiry: string | null
          dl_number: string | null
          full_name: string
          id: string
          language: string
          org_id: string
          phone: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          dl_expiry?: string | null
          dl_number?: string | null
          full_name: string
          id?: string
          language?: string
          org_id: string
          phone: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          dl_expiry?: string | null
          dl_number?: string | null
          full_name?: string
          id?: string
          language?: string
          org_id?: string
          phone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "drivers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      freight_bills: {
        Row: {
          bill_date: string
          bill_no: string
          branch_id: string
          cgst_amount: number
          created_at: string
          created_by: string | null
          id: string
          igst_amount: number
          notes: string | null
          org_id: string
          party_id: string
          party_snapshot: Json
          pdf_path: string | null
          sgst_amount: number
          tax_mode: string
          tax_rate_pct: number
          tax_snapshot: Json
          taxable_value: number
          total_amount: number
          updated_at: string
        }
        Insert: {
          bill_date?: string
          bill_no: string
          branch_id: string
          cgst_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          igst_amount?: number
          notes?: string | null
          org_id: string
          party_id: string
          party_snapshot?: Json
          pdf_path?: string | null
          sgst_amount?: number
          tax_mode: string
          tax_rate_pct?: number
          tax_snapshot?: Json
          taxable_value?: number
          total_amount?: number
          updated_at?: string
        }
        Update: {
          bill_date?: string
          bill_no?: string
          branch_id?: string
          cgst_amount?: number
          created_at?: string
          created_by?: string | null
          id?: string
          igst_amount?: number
          notes?: string | null
          org_id?: string
          party_id?: string
          party_snapshot?: Json
          pdf_path?: string | null
          sgst_amount?: number
          tax_mode?: string
          tax_rate_pct?: number
          tax_snapshot?: Json
          taxable_value?: number
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "freight_bills_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_bills_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_bills_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "freight_bills_party_id_fkey"
            columns: ["party_id"]
            isOneToOne: false
            referencedRelation: "parties"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          role: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          role: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      organisations: {
        Row: {
          address: string | null
          bank_details: Json
          created_at: string
          gstin: string | null
          id: string
          legal_name: string
          logo_path: string | null
          pan: string | null
          risk_clause: string
          state_code: string
          tax_mode: string
          transin: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          bank_details?: Json
          created_at?: string
          gstin?: string | null
          id?: string
          legal_name: string
          logo_path?: string | null
          pan?: string | null
          risk_clause?: string
          state_code: string
          tax_mode?: string
          transin?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          bank_details?: Json
          created_at?: string
          gstin?: string | null
          id?: string
          legal_name?: string
          logo_path?: string | null
          pan?: string | null
          risk_clause?: string
          state_code?: string
          tax_mode?: string
          transin?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      parties: {
        Row: {
          addresses: Json
          created_at: string
          deleted_at: string | null
          email: string | null
          gstin: string | null
          id: string
          name: string
          notes: string | null
          org_id: string
          party_role: string
          phone: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          addresses?: Json
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name: string
          notes?: string | null
          org_id: string
          party_role?: string
          phone?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          addresses?: Json
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gstin?: string | null
          id?: string
          name?: string
          notes?: string | null
          org_id?: string
          party_role?: string
          phone?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "parties_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          org_id: string
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          org_id: string
          role?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          org_id?: string
          role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_expenses: {
        Row: {
          amount: number
          client_id: string
          consignment_id: string
          created_at: string
          entered_by: string | null
          entered_by_type: string
          id: string
          kind: string
          litres: number | null
          note: string | null
          org_id: string
          paid_by: string
          receipt_path: string | null
          spent_at: string
        }
        Insert: {
          amount: number
          client_id?: string
          consignment_id: string
          created_at?: string
          entered_by?: string | null
          entered_by_type?: string
          id?: string
          kind: string
          litres?: number | null
          note?: string | null
          org_id: string
          paid_by?: string
          receipt_path?: string | null
          spent_at?: string
        }
        Update: {
          amount?: number
          client_id?: string
          consignment_id?: string
          created_at?: string
          entered_by?: string | null
          entered_by_type?: string
          id?: string
          kind?: string
          litres?: number | null
          note?: string | null
          org_id?: string
          paid_by?: string
          receipt_path?: string | null
          spent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_expenses_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignment_exceptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_consignment_id_fkey"
            columns: ["consignment_id"]
            isOneToOne: false
            referencedRelation: "consignments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_entered_by_fkey"
            columns: ["entered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_expenses_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          capacity_tons: number | null
          created_at: string
          deleted_at: string | null
          fitness_expiry: string | null
          id: string
          insurance_expiry: string | null
          org_id: string
          ownership: string
          permit_expiry: string | null
          puc_expiry: string | null
          rc_expiry: string | null
          reg_number: string
          updated_at: string
          vehicle_type: string
        }
        Insert: {
          capacity_tons?: number | null
          created_at?: string
          deleted_at?: string | null
          fitness_expiry?: string | null
          id?: string
          insurance_expiry?: string | null
          org_id: string
          ownership?: string
          permit_expiry?: string | null
          puc_expiry?: string | null
          rc_expiry?: string | null
          reg_number: string
          updated_at?: string
          vehicle_type: string
        }
        Update: {
          capacity_tons?: number | null
          created_at?: string
          deleted_at?: string | null
          fitness_expiry?: string | null
          id?: string
          insurance_expiry?: string | null
          org_id?: string
          ownership?: string
          permit_expiry?: string | null
          puc_expiry?: string | null
          rc_expiry?: string | null
          reg_number?: string
          updated_at?: string
          vehicle_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      consignment_exceptions: {
        Row: {
          destination_city: string | null
          ewb_expiring: boolean | null
          ewb_valid_until: string | null
          id: string | null
          is_stale: boolean | null
          last_event_at: string | null
          lr_no: string | null
          org_id: string | null
          origin_city: string | null
          pod_unverified_overdue: boolean | null
          status: string | null
        }
        Relationships: [
          {
            foreignKeyName: "consignments_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organisations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      _apply_transition: {
        Args: {
          p_actor_type: string
          p_actor_user_id: string
          p_consignment_id: string
          p_event_time: string
          p_payload: Json
          p_to_status: string
        }
        Returns: Json
      }
      accept_org_invite: {
        Args: never
        Returns: {
          org_id: string
          role: string
        }[]
      }
      branch_has_issued_documents: {
        Args: { p_branch_id: string }
        Returns: boolean
      }
      create_bill: {
        Args: {
          p_bill_date: string
          p_branch_id: string
          p_consignment_ids: string[]
          p_notes?: string
          p_party_id: string
          p_tax: Json
        }
        Returns: Json
      }
      create_organisation: {
        Args: {
          p_address: string
          p_branch_city: string
          p_branch_name: string
          p_gstin: string
          p_inv_prefix: string
          p_inv_starting_number?: number
          p_legal_name: string
          p_lr_prefix: string
          p_lr_starting_number?: number
          p_pan: string
          p_risk_clause: string
          p_state_code: string
          p_tax_mode: string
          p_transin: string
        }
        Returns: {
          branch_id: string
          org_id: string
        }[]
      }
      current_org_id: { Args: never; Returns: string }
      current_role_name: { Args: never; Returns: string }
      driver_add_expense: {
        Args: {
          p_amount: number
          p_client_id?: string
          p_kind: string
          p_litres?: number
          p_receipt_path?: string
          p_token: string
        }
        Returns: Json
      }
      driver_milestone: {
        Args: {
          p_at?: string
          p_kind: string
          p_note?: string
          p_token: string
        }
        Returns: Json
      }
      driver_register_pod: {
        Args: {
          p_client_id: string
          p_page_no?: number
          p_path: string
          p_token: string
        }
        Returns: Json
      }
      driver_trip: { Args: { p_token: string }; Returns: Json }
      fy_code: { Args: { p_date: string }; Returns: string }
      get_trip_link: { Args: { p_consignment_id: string }; Returns: string }
      has_role: { Args: { p_roles: string[] }; Returns: boolean }
      next_doc_number: {
        Args: { p_branch_id: string; p_date: string; p_doc_type: string }
        Returns: string
      }
      resolve_trip_token: {
        Args: { p_token: string }
        Returns: {
          consignment_id: string
          org_id: string
        }[]
      }
      seed_document_sequence: {
        Args: {
          p_branch_id: string
          p_doc_type: string
          p_fy: string
          p_starting_number: number
        }
        Returns: undefined
      }
      track_consignment: { Args: { p_token: string }; Returns: Json }
      transition_consignment: {
        Args: {
          p_consignment_id: string
          p_event_time?: string
          p_payload?: Json
          p_to_status: string
        }
        Returns: Json
      }
      trip_settlement: { Args: { p_consignment_id: string }; Returns: Json }
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const

