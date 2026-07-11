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
  signUp: (fields: SignUpFields) => Promise<{ error: string | null }>;
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

  // Quick, no-email-step sign-up: student number + password, in under a
  // minute. This only ever returns an error string — there is no
  // "needsEmailConfirmation" branch for callers to handle, by design.
  //
  // The actual email-confirmation requirement lives on the Supabase Auth
  // project itself (Lovable Cloud → Backend → Authentication → Email →
  // "Confirm email" toggle), not in this code. If that toggle is still on,
  // supabase.auth.signUp() below won't return a session — in that one case
  // we try an immediate sign-in as a fallback, and if THAT also fails
  // (because the account is genuinely unconfirmed) we surface a clear,
  // actionable message instead of pretending everything's fine.
  const signUp = async (fields: SignUpFields) => {
    const { data, error } = await supabase.auth.signUp({
      email: fields.email,
      password: fields.password,
      options: {
        data: {
          full_name: fields.fullName,
          student_number: fields.studentNumber,
          school: fields.school,
          programme_code: fields.programmeCode,
          year: String(fields.year),
        },
      },
    });
    if (error) return { error: error.message };
    if (data.session) return { error: null };

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: fields.email,
      password: fields.password,
    });
    if (signInError) {
      return {
        error:
          "Your account was created, but this project still has \"Confirm email\" switched on in Supabase Auth settings, so sign-in is blocked until that's turned off. Go to Lovable Cloud → Backend → Authentication → Email, disable \"Confirm email\", then sign in again.",
      };
    }
    return { error: null };
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
