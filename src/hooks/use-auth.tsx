import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];
type AppRole = Database["public"]["Enums"]["app_role"];

type SignUpFields = {
  email: string;
  password: string;
  fullName: string;
  studentNumber: string;
  school: string;
  programmeCode: string;
  year: number;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  roles: AppRole[];
  loading: boolean;
  isAdmin: boolean;
  signUp: (fields: SignUpFields) => Promise<{ error: string | null; needsEmailConfirmation: boolean }>;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (userId: string) => {
    const [{ data }, { data: roleRows }] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    setProfile(data ?? null);
    setRoles((roleRows ?? []).map((row) => row.role));
  };

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }: { data: { session: any } }) => {
      if (!active) return;
      setSession(data.session);
      if (data.session?.user) loadProfile(data.session.user.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event: string, newSession: any) => {

      setSession(newSession);
      if (newSession?.user) {
        loadProfile(newSession.user.id);
      } else {
        setProfile(null);
        setRoles([]);
      }
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const signUp = async (fields: SignUpFields) => {
    const emailRedirectTo = typeof window !== "undefined" ? window.location.origin : undefined;
    const { data, error } = await supabase.auth.signUp({
      email: fields.email,
      password: fields.password,
      options: {
        emailRedirectTo,
        data: {
          full_name: fields.fullName,
          student_number: fields.studentNumber,
          school: fields.school,
          programme_code: fields.programmeCode,
          year: String(fields.year),
        },
      },
    });
    if (error) return { error: error.message, needsEmailConfirmation: false };
    // If Supabase's project settings require email confirmation, signUp
    // succeeds but returns NO session — the account exists but isn't signed
    // in yet. Callers must check this before navigating anywhere that
    // assumes a signed-in session (e.g. /dashboard).
    return { error: null, needsEmailConfirmation: !data.session };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (session?.user) await loadProfile(session.user.id);
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        roles,
        loading,
        isAdmin: roles.includes("admin"),
        signUp,
        signIn,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
    }
