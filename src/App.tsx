import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://sportbanter.online/api";
const API_ORIGIN = API_BASE.replace(/\/api\/?$/, "");
const MEDIA_BASE = (import.meta.env.VITE_MEDIA_BASE_URL || "https://media.sportbanter.online").replace(/\/+$/, "");
const ROLLEY_BASE = (import.meta.env.VITE_ROLLEY_SERVICE_URL || "https://sportbanter.online/rolley").replace(/\/+$/, "");
const ROLLEY_ADMIN_KEY_DEFAULT = import.meta.env.VITE_ROLLEY_ADMIN_KEY || "";
const MOVEMENT_EXPLORER_BASE =
  (import.meta.env.VITE_MOVEMENT_EXPLORER_BASE || "https://explorer.movementnetwork.xyz").replace(/\/+$/, "");
const MOVEMENT_EXPLORER_NETWORK = import.meta.env.VITE_MOVEMENT_EXPLORER_NETWORK || "testnet";
const TOKEN_KEY = "banter_admin_token";

type AdminOverview = {
  users: number;
  posts: number;
  comments: number;
  payments: number;
  completedRevenueUsd: number;
  pcaCategories: number;
  pcaVotes: number;
};

type UserRow = {
  id: string;
  email?: string;
  displayName?: string;
  username?: string;
  voteBalance: number;
  rolBalanceRaw: string;
  movementAddress?: string | null;
  solanaAddress?: string | null;
  _count: {
    posts: number;
    comments: number;
    payments: number;
    notifications: number;
  };
};

type PcaNominee = {
  id: string;
  name: string;
  team?: string | null;
  country?: string | null;
  position?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  stats?: Record<string, string | number> | null;
  voteCount: number;
};

type PcaCategory = {
  id: string;
  sport: "SOCCER" | "BASKETBALL";
  season: string;
  categoryType: string;
  title: string;
  subtitle?: string | null;
  roundLabel?: string | null;
  description?: string | null;
  criteria?: unknown;
  nominees: PcaNominee[];
  _count?: {
    votes: number;
  };
};

type AppTab = "overview" | "users" | "pca" | "rolley";
type RolleyOutcome = "PENDING" | "WIN" | "LOSS" | "VOID";

type RolleyAdminPick = {
  id: string;
  date: string;
  sport: "SOCCER" | "BASKETBALL";
  league: string;
  home_team: string;
  away_team: string;
  market: string;
  selection: string;
  confidence: number;
  implied_odds?: number;
  is_primary?: boolean;
  movement_pick_id?: number | null;
  movement_tx_hash?: string | null;
  movement_sync_status?: string | null;
  settlement_outcome?: RolleyOutcome;
  settlement_notes?: string | null;
  settled_by?: string | null;
  settled_at?: string | null;
  settlement_movement_tx_hash?: string | null;
  created_at: string;
};

const NAV_ITEMS: Array<{ id: AppTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "pca", label: "PCA Manager" },
  { id: "rolley", label: "Rolley Settle" },
];

const CATEGORY_CRITERIA_TEMPLATES: Record<string, string[]> = {
  GOAL_OF_WEEK: ["goal_quality", "difficulty", "match_impact", "technique"],
  PLAYER_OF_MONTH: ["goals", "assists", "duels_won", "consistency"],
  TOURNAMENT_AWARD: ["tournament_impact", "key_moments", "consistency", "leadership"],
  BALLON_DOR_PEOPLES_CHOICE: [
    "individual_performance",
    "team_success",
    "consistency",
    "fair_play",
    "big_match_impact",
  ],
  CUSTOM: [],
};

const NOMINEE_STATS_TEMPLATES: Record<string, Record<string, number>> = {
  STRIKER: { goals: 0, assists: 0, shots_on_target: 0, chance_conversion_pct: 0 },
  MIDFIELDER: { assists: 0, key_passes: 0, progressive_passes: 0, duels_won: 0 },
  DEFENDER: { tackles_won: 0, interceptions: 0, clearances: 0, duels_won: 0 },
  KEEPER: { saves: 0, clean_sheets: 0, save_percentage: 0, goals_prevented: 0 },
  BASKETBALL_GUARD: { points: 0, assists: 0, steals: 0, fg_percentage: 0 },
  BASKETBALL_FORWARD: { points: 0, rebounds: 0, assists: 0, fg_percentage: 0 },
  BASKETBALL_CENTER: { points: 0, rebounds: 0, blocks: 0, fg_percentage: 0 },
};

async function request(path: string, token?: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => "");
  if (!res.ok) {
    const message =
      typeof body === "string"
        ? body || `Request failed (${res.status})`
        : body?.message || body?.error || `Request failed (${res.status})`;
    throw new Error(message);
  }
  return typeof body === "string" ? {} : body;
}

async function requestRolley(
  path: string,
  adminKey: string,
  options: RequestInit = {}
) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (adminKey.trim()) headers.set("X-Admin-Key", adminKey.trim());
  const res = await fetch(`${ROLLEY_BASE}${path}`, { ...options, headers });
  const contentType = res.headers.get("content-type") || "";
  const body = contentType.includes("application/json")
    ? await res.json().catch(() => ({}))
    : await res.text().catch(() => "");
  if (!res.ok) {
    const message =
      typeof body === "string"
        ? body || `Rolley request failed (${res.status})`
        : body?.detail || body?.message || body?.error || `Rolley request failed (${res.status})`;
    throw new Error(message);
  }
  return typeof body === "string" ? {} : body;
}

function formatRol(raw: string | number | bigint | undefined) {
  const value = Number(raw || 0);
  if (!Number.isFinite(value)) return "0";
  return (value / 1e8).toLocaleString(undefined, { maximumFractionDigits: 8 });
}

function jsonText(value: unknown) {
  if (!value) return "{}";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "{}";
  }
}

function parseCriteriaList(value: unknown): string[] {
  if (!value) return [];
  if (Array.isArray(value)) {
    return Array.from(new Set(value.map((item) => String(item || "").trim()).filter(Boolean)));
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return Array.from(new Set(parsed.map((item) => String(item || "").trim()).filter(Boolean)));
      }
    } catch {
      return [];
    }
  }
  return [];
}

function criteriaToJson(criteria: string[]) {
  return JSON.stringify(Array.from(new Set(criteria.map((item) => item.trim()).filter(Boolean))), null, 2);
}

function parseStatsObject(value: unknown): Record<string, string | number> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).reduce<Record<string, string | number>>(
      (acc, [key, raw]) => {
        if (!key.trim()) return acc;
        if (typeof raw === "number") {
          acc[key] = raw;
          return acc;
        }
        if (typeof raw === "string") {
          const trimmed = raw.trim();
          if (trimmed === "") return acc;
          const asNumber = Number(trimmed);
          acc[key] = Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed) ? asNumber : trimmed;
          return acc;
        }
        if (raw != null) {
          acc[key] = String(raw);
        }
        return acc;
      },
      {}
    );
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parseStatsObject(parsed);
    } catch {
      return {};
    }
  }
  return {};
}

function statsToJson(stats: Record<string, string | number>) {
  return JSON.stringify(stats, null, 2);
}

function shortHash(value?: string | null) {
  if (!value) return "-";
  if (typeof value !== "string") {
    try {
      return JSON.stringify(value);
    } catch {
      return "-";
    }
  }
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function displayText(value: unknown, fallback = "-") {
  if (value == null) return fallback;
  if (typeof value === "string") return value.trim() ? value : fallback;
  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return String(value);
  }
  try {
    const text = JSON.stringify(value);
    return text && text !== "{}" ? text : fallback;
  } catch {
    return fallback;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const raw = typeof value === "string" ? value : displayText(value);
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleString();
}

function movementTxUrl(hash?: string | null) {
  if (!hash) return "";
  return `${MOVEMENT_EXPLORER_BASE}/txn/${hash}?network=${MOVEMENT_EXPLORER_NETWORK}`;
}

function addDaysToDateToken(dateToken: string, days: number) {
  const [y, m, d] = dateToken.split("-").map((part) => Number(part));
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function notificationMessage(notification: any) {
  const direct =
    (typeof notification?.message === "string" && notification.message.trim()) ||
    (typeof notification?.body === "string" && notification.body.trim());
  if (direct) return direct;
  if (notification?.type === "DAILY_ROL") return "Daily ROL reward credited.";
  if (notification?.type === "WALLET_RECEIVE") return "Wallet received funds.";
  if (notification?.type === "WALLET_TRANSFER") return "Wallet transfer sent.";
  if (notification?.type === "VOTE_PURCHASE") return "Vote purchase completed.";
  return displayText(notification?.title, "Notification update");
}

function formatStatKey(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function resolveNomineeMediaUrl(url?: string | null) {
  if (!url) return "";
  const raw = url.trim();
  if (!raw) return "";
  if (raw.includes("/api/public/images/view/")) {
    const key = raw.split("/api/public/images/view/")[1]?.replace(/^\/+/, "");
    return key ? `${MEDIA_BASE}/${key}` : raw;
  }
  if (raw.includes("/api/images/view/")) {
    const key = raw.split("/api/images/view/")[1]?.replace(/^\/+/, "");
    return key ? `${MEDIA_BASE}/${key}` : raw;
  }
  if (raw.startsWith("admin-uploads/") || raw.startsWith("user-uploads/")) {
    return `${MEDIA_BASE}/${raw.replace(/^\/+/, "")}`;
  }
  if (raw.startsWith("/api/")) {
    return `${API_ORIGIN}${raw}`;
  }
  if (/^https?:\/\/.+\.s3[.-].*amazonaws\.com\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      const key = parsed.pathname.replace(/^\/+/, "");
      return key ? `${MEDIA_BASE}/${key}` : raw;
    } catch {
      return raw;
    }
  }
  return raw;
}

export default function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || "");
  const [tab, setTab] = useState<AppTab>("overview");

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<any | null>(null);
  const [selectedNotification, setSelectedNotification] = useState<any | null>(null);
  const [categories, setCategories] = useState<PcaCategory[]>([]);
  const [rolleyAdminKey, setRolleyAdminKey] = useState(ROLLEY_ADMIN_KEY_DEFAULT);
  const [rolleyDate, setRolleyDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rolleyHistoryDate, setRolleyHistoryDate] = useState(() => addDaysToDateToken(new Date().toISOString().slice(0, 10), -1));
  const [rolleySport, setRolleySport] = useState<"SOCCER" | "BASKETBALL">("SOCCER");
  const [rolleyPicks, setRolleyPicks] = useState<RolleyAdminPick[]>([]);
  const [rolleyHistory, setRolleyHistory] = useState<RolleyAdminPick[]>([]);
  const [rolleyLoading, setRolleyLoading] = useState(false);

  const [categoryForm, setCategoryForm] = useState({
    sport: "SOCCER",
    season: "2025/2026",
    categoryType: "GOAL_OF_WEEK",
    title: "",
    subtitle: "",
    roundLabel: "",
    description: "",
    criteria: JSON.stringify(CATEGORY_CRITERIA_TEMPLATES.GOAL_OF_WEEK, null, 2),
  });

  const [nomineeForm, setNomineeForm] = useState({
    categoryId: "",
    name: "",
    team: "",
    country: "",
    position: "",
    imageUrl: "",
    videoUrl: "",
    stats: "{}",
  });

  const [editingCategory, setEditingCategory] = useState<null | {
    id: string;
    sport: string;
    season: string;
    categoryType: string;
    title: string;
    subtitle: string;
    roundLabel: string;
    description: string;
    criteria: string;
  }>(null);

  const [editingNominee, setEditingNominee] = useState<null | {
    id: string;
    name: string;
    team: string;
    country: string;
    position: string;
    imageUrl: string;
    videoUrl: string;
    stats: string;
  }>(null);
  const [newCriterion, setNewCriterion] = useState("");
  const [editingCriterion, setEditingCriterion] = useState("");
  const [newNomineeStatKey, setNewNomineeStatKey] = useState("");
  const [newNomineeStatValue, setNewNomineeStatValue] = useState("");
  const [newEditingStatKey, setNewEditingStatKey] = useState("");
  const [newEditingStatValue, setNewEditingStatValue] = useState("");

  const [busy, setBusy] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const loggedIn = Boolean(token);
  const categoryCriteria = useMemo(() => parseCriteriaList(categoryForm.criteria), [categoryForm.criteria]);
  const editingCategoryCriteria = useMemo(
    () => parseCriteriaList(editingCategory?.criteria || "[]"),
    [editingCategory?.criteria]
  );
  const nomineeStats = useMemo(() => parseStatsObject(nomineeForm.stats), [nomineeForm.stats]);
  const editingNomineeStats = useMemo(
    () => parseStatsObject(editingNominee?.stats || "{}"),
    [editingNominee?.stats]
  );

  const pageTitle = useMemo(() => {
    if (tab === "overview") return "Admin Overview";
    if (tab === "users") return "User Management";
    if (tab === "rolley") return "Rolley Settlement";
    return "PCA Management";
  }, [tab]);

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        label: `${category.sport} - ${category.season} - ${category.title}`,
      })),
    [categories]
  );

  useEffect(() => {
    if (!loggedIn) return;
    void loadAll();
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn || tab !== "rolley") return;
    void loadRolleyPicks();
  }, [loggedIn, tab, rolleyDate, rolleyHistoryDate, rolleySport]);

  async function loadAll() {
    try {
      setBusy(true);
      setError("");
      setWarning("");
      const [overviewRes, usersRes, categoryRes] = await Promise.allSettled([
        request("/admin/overview", token),
        request("/admin/users?limit=50", token),
        request("/admin/pca/categories", token),
      ]);

      if (overviewRes.status === "fulfilled") {
        setOverview(overviewRes.value.overview || null);
      } else {
        setError((prev) =>
          prev ? `${prev}; Overview failed` : overviewRes.reason?.message || "Overview failed"
        );
      }

      if (usersRes.status === "fulfilled") {
        setUsers(usersRes.value.users || []);
      } else {
        setError((prev) => (prev ? `${prev}; Users failed` : usersRes.reason?.message || "Users failed"));
      }

      if (categoryRes.status === "fulfilled") {
        setCategories(categoryRes.value.categories || []);
        if (categoryRes.value.warning) {
          setWarning(categoryRes.value.warning);
        }
      } else {
        setError((prev) => (prev ? `${prev}; PCA failed` : categoryRes.reason?.message || "PCA failed"));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to load admin data");
    } finally {
      setBusy(false);
    }
  }

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    try {
      setLoginError("");
      const res = await request("/admin/auth/login", undefined, {
        method: "POST",
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      localStorage.setItem(TOKEN_KEY, res.token);
      setToken(res.token);
    } catch (err: any) {
      setLoginError(err?.message || "Login failed");
    }
  }

  function logout() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setOverview(null);
    setUsers([]);
    setSelectedUser(null);
    setSelectedNotification(null);
    setCategories([]);
    setNewCriterion("");
    setEditingCriterion("");
    setNewNomineeStatKey("");
    setNewNomineeStatValue("");
    setNewEditingStatKey("");
    setNewEditingStatValue("");
    setRolleyPicks([]);
    setRolleyAdminKey(ROLLEY_ADMIN_KEY_DEFAULT);
  }

  async function searchUsers() {
    try {
      setBusy(true);
      setError("");
      const res = await request(`/admin/users?limit=50&search=${encodeURIComponent(userSearch)}`, token);
      setUsers(res.users || []);
    } catch (err: any) {
      setError(err?.message || "Failed to search users");
    } finally {
      setBusy(false);
    }
  }

  async function openUser(userId: string) {
    try {
      setError("");
      setSelectedNotification(null);
      const res = await request(`/admin/users/${userId}`, token);
      setSelectedUser(res.user || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load user detail");
    }
  }

  async function loadRolleyPicks() {
    try {
      setRolleyLoading(true);
      setError("");
      const queueQuery = new URLSearchParams({
        pick_date: rolleyDate,
        sport: rolleySport,
      });
      const historyQuery = new URLSearchParams({
        sport: rolleySport,
        pick_date: rolleyHistoryDate,
        limit: "100",
      });
      const [queueRes, historyRes] = await Promise.all([
        requestRolley(`/api/v1/admin/picks?${queueQuery.toString()}`, rolleyAdminKey),
        requestRolley(`/api/v1/admin/picks/history?${historyQuery.toString()}`, rolleyAdminKey),
      ]);
      setRolleyPicks(Array.isArray(queueRes?.picks) ? queueRes.picks : []);
      setRolleyHistory(Array.isArray(historyRes?.picks) ? historyRes.picks : []);
    } catch (err: any) {
      setError(err?.message || "Failed to load Rolley picks");
      setRolleyPicks([]);
      setRolleyHistory([]);
    } finally {
      setRolleyLoading(false);
    }
  }

  async function rebuildRolleyPicks() {
    try {
      setRolleyLoading(true);
      setError("");
      const query = new URLSearchParams({
        pick_date: rolleyDate,
        sport: rolleySport,
      });
      await requestRolley(`/api/v1/admin/picks/rebuild?${query.toString()}`, rolleyAdminKey, {
        method: "POST",
      });
      if (rolleyHistoryDate === rolleyDate) {
        setRolleyHistoryDate(addDaysToDateToken(rolleyDate, -1));
      }
      await loadRolleyPicks();
    } catch (err: any) {
      setError(err?.message || "Failed to rebuild Rolley picks");
    } finally {
      setRolleyLoading(false);
    }
  }

  async function settleRolleyPick(pickId: string, outcome: RolleyOutcome) {
    try {
      setRolleyLoading(true);
      setError("");
      await requestRolley(`/api/v1/admin/picks/${pickId}/settle`, rolleyAdminKey, {
        method: "POST",
        body: JSON.stringify({
          outcome,
          settled_by: loginEmail || "admin",
        }),
      });
      await loadRolleyPicks();
    } catch (err: any) {
      setError(err?.message || "Failed to settle pick");
    } finally {
      setRolleyLoading(false);
    }
  }

  async function handleRefresh() {
    if (tab === "rolley") {
      await loadRolleyPicks();
      return;
    }
    await loadAll();
  }

  function applyCategoryTemplate(type: string) {
    const template = CATEGORY_CRITERIA_TEMPLATES[type] || [];
    setCategoryForm((prev) => ({
      ...prev,
      categoryType: type,
      criteria: criteriaToJson(template),
    }));
  }

  function applyNomineeStatsTemplate(templateKey: string) {
    const template = NOMINEE_STATS_TEMPLATES[templateKey];
    if (!template) return;
    setNomineeForm((prev) => ({
      ...prev,
      stats: statsToJson(template),
    }));
  }

  function updateNomineeStatValue(key: string, value: string) {
    const next = { ...nomineeStats } as Record<string, string | number>;
    const trimmed = value.trim();
    if (trimmed === "") {
      next[key] = "";
    } else {
      const asNumber = Number(trimmed);
      next[key] = Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed) ? asNumber : trimmed;
    }
    setNomineeForm((prev) => ({ ...prev, stats: statsToJson(next) }));
  }

  function removeNomineeStat(key: string) {
    const next = { ...nomineeStats };
    delete next[key];
    setNomineeForm((prev) => ({ ...prev, stats: statsToJson(next) }));
  }

  function addNomineeStat() {
    const key = newNomineeStatKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) return;
    const next = { ...nomineeStats } as Record<string, string | number>;
    const trimmedValue = newNomineeStatValue.trim();
    if (!trimmedValue) {
      next[key] = 0;
    } else {
      const asNumber = Number(trimmedValue);
      next[key] = Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmedValue) ? asNumber : trimmedValue;
    }
    setNomineeForm((prev) => ({ ...prev, stats: statsToJson(next) }));
    setNewNomineeStatKey("");
    setNewNomineeStatValue("");
  }

  function updateEditingNomineeStatValue(key: string, value: string) {
    if (!editingNominee) return;
    const next = { ...editingNomineeStats } as Record<string, string | number>;
    const trimmed = value.trim();
    if (trimmed === "") {
      next[key] = "";
    } else {
      const asNumber = Number(trimmed);
      next[key] = Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmed) ? asNumber : trimmed;
    }
    setEditingNominee({ ...editingNominee, stats: statsToJson(next) });
  }

  function removeEditingNomineeStat(key: string) {
    if (!editingNominee) return;
    const next = { ...editingNomineeStats };
    delete next[key];
    setEditingNominee({ ...editingNominee, stats: statsToJson(next) });
  }

  function addEditingNomineeStat() {
    if (!editingNominee) return;
    const key = newEditingStatKey.trim().toLowerCase().replace(/\s+/g, "_");
    if (!key) return;
    const next = { ...editingNomineeStats } as Record<string, string | number>;
    const trimmedValue = newEditingStatValue.trim();
    if (!trimmedValue) {
      next[key] = 0;
    } else {
      const asNumber = Number(trimmedValue);
      next[key] = Number.isFinite(asNumber) && /^-?\d+(\.\d+)?$/.test(trimmedValue) ? asNumber : trimmedValue;
    }
    setEditingNominee({ ...editingNominee, stats: statsToJson(next) });
    setNewEditingStatKey("");
    setNewEditingStatValue("");
  }

  function addCategoryCriterion() {
    const metric = newCriterion.trim();
    if (!metric) return;
    setCategoryForm((prev) => ({
      ...prev,
      criteria: criteriaToJson([...parseCriteriaList(prev.criteria), metric]),
    }));
    setNewCriterion("");
  }

  function removeCategoryCriterion(metric: string) {
    setCategoryForm((prev) => ({
      ...prev,
      criteria: criteriaToJson(parseCriteriaList(prev.criteria).filter((item) => item !== metric)),
    }));
  }

  function addEditingCategoryCriterion() {
    if (!editingCategory) return;
    const metric = editingCriterion.trim();
    if (!metric) return;
    setEditingCategory({
      ...editingCategory,
      criteria: criteriaToJson([...parseCriteriaList(editingCategory.criteria), metric]),
    });
    setEditingCriterion("");
  }

  function removeEditingCategoryCriterion(metric: string) {
    if (!editingCategory) return;
    setEditingCategory({
      ...editingCategory,
      criteria: criteriaToJson(parseCriteriaList(editingCategory.criteria).filter((item) => item !== metric)),
    });
  }

  async function createCategory(e: FormEvent) {
    e.preventDefault();
    try {
      setBusy(true);
      setError("");
      await request("/admin/pca/categories", token, {
        method: "POST",
        body: JSON.stringify(categoryForm),
      });
      setCategoryForm((prev) => ({
        ...prev,
        title: "",
        subtitle: "",
        roundLabel: "",
        description: "",
      }));
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to create category");
    } finally {
      setBusy(false);
    }
  }

  async function createNominee(e: FormEvent) {
    e.preventDefault();
    if (!nomineeForm.categoryId) return;
    try {
      setBusy(true);
      setError("");
      await request(`/admin/pca/categories/${nomineeForm.categoryId}/nominees`, token, {
        method: "POST",
        body: JSON.stringify(nomineeForm),
      });
      setNomineeForm((prev) => ({
        ...prev,
        name: "",
        team: "",
        country: "",
        position: "",
        imageUrl: "",
        videoUrl: "",
        stats: "{}",
      }));
      setNewNomineeStatKey("");
      setNewNomineeStatValue("");
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to add nominee");
    } finally {
      setBusy(false);
    }
  }

  function beginEditCategory(category: PcaCategory) {
    setEditingCategory({
      id: category.id,
      sport: category.sport,
      season: category.season,
      categoryType: category.categoryType,
      title: category.title,
      subtitle: category.subtitle || "",
      roundLabel: category.roundLabel || "",
      description: category.description || "",
      criteria: jsonText(category.criteria),
    });
    setEditingCriterion("");
  }

  async function saveCategoryEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingCategory) return;
    try {
      setBusy(true);
      setError("");
      const { id, ...payload } = editingCategory;
      await request(`/admin/pca/categories/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setEditingCategory(null);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to update category");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCategory(id: string) {
    if (!window.confirm("Delete this category and all nominees/votes inside it?")) return;
    try {
      setBusy(true);
      setError("");
      await request(`/admin/pca/categories/${id}`, token, {
        method: "DELETE",
      });
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to delete category");
    } finally {
      setBusy(false);
    }
  }

  function beginEditNominee(nominee: PcaNominee) {
    setEditingNominee({
      id: nominee.id,
      name: nominee.name,
      team: nominee.team || "",
      country: nominee.country || "",
      position: nominee.position || "",
      imageUrl: nominee.imageUrl || "",
      videoUrl: nominee.videoUrl || "",
      stats: jsonText(nominee.stats),
    });
    setNewEditingStatKey("");
    setNewEditingStatValue("");
  }

  async function saveNomineeEdit(e: FormEvent) {
    e.preventDefault();
    if (!editingNominee) return;
    try {
      setBusy(true);
      setError("");
      const { id, ...payload } = editingNominee;
      await request(`/admin/pca/nominees/${id}`, token, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setEditingNominee(null);
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to update nominee");
    } finally {
      setBusy(false);
    }
  }

  async function deleteNominee(id: string) {
    if (!window.confirm("Delete this nominee?")) return;
    try {
      setBusy(true);
      setError("");
      await request(`/admin/pca/nominees/${id}`, token, {
        method: "DELETE",
      });
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to delete nominee");
    } finally {
      setBusy(false);
    }
  }

  async function uploadFileToS3(uploadUrl: string, file: File) {
    const response = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    if (!response.ok) {
      const details = await response.text().catch(() => "");
      throw new Error(`Upload failed (${response.status}) ${details}`.trim());
    }
  }

  async function handleNomineeFileSelected(
    event: ChangeEvent<HTMLInputElement>,
    mode: "create" | "edit",
    target: "image" | "video"
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const fieldKey = `${mode}-${target}`;
    const urlField = target === "image" ? "imageUrl" : "videoUrl";

    try {
      setUploadingField(fieldKey);
      setError("");
      const presign = await request("/admin/uploads/presign", token, {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          kind: target,
        }),
      });
      await uploadFileToS3(presign.uploadUrl, file);

      if (mode === "edit") {
        setEditingNominee((prev) => (prev ? { ...prev, [urlField]: presign.viewUrl } : prev));
      } else {
        setNomineeForm((prev) => ({ ...prev, [urlField]: presign.viewUrl }));
      }
    } catch (err: any) {
      setError(err?.message || "Failed to upload file");
    } finally {
      setUploadingField(null);
    }
  }

  if (!loggedIn) {
    return (
      <div className="login-wrap">
        <form className="card login-card" onSubmit={onLogin}>
          <h1>Banter Admin</h1>
          <p>Login to manage users, wallets, transactions and PCA awards.</p>
          <input
            type="email"
            placeholder="Admin email"
            value={loginEmail}
            onChange={(e) => setLoginEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            required
          />
          {loginError ? <p className="error">{loginError}</p> : null}
          <button type="submit">Login</button>
        </form>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-dot" />
          <div>
            <strong>Banter Admin</strong>
            <p>Control Panel</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`nav-btn ${tab === item.id ? "active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <small>{API_BASE}</small>
          <button className="ghost danger" onClick={logout}>
            Logout
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <div>
            <h2>{pageTitle}</h2>
            <p>Monitor app activity and configure award campaigns.</p>
          </div>
          <button onClick={() => void handleRefresh()} disabled={busy || rolleyLoading}>
            {busy || rolleyLoading ? "Refreshing..." : "Refresh"}
          </button>
        </header>

        {error ? <p className="error page-error">{error}</p> : null}
        {warning ? <p className="warning page-error">{warning}</p> : null}

        {tab === "overview" && (
          <>
            <section className="metrics">
              <article className="card metric">
                <span>Total Users</span>
                <strong>{overview?.users ?? 0}</strong>
              </article>
              <article className="card metric">
                <span>Total Posts</span>
                <strong>{overview?.posts ?? 0}</strong>
              </article>
              <article className="card metric">
                <span>Total Payments</span>
                <strong>{overview?.payments ?? 0}</strong>
              </article>
              <article className="card metric">
                <span>Revenue (USD)</span>
                <strong>{(overview?.completedRevenueUsd ?? 0).toLocaleString()}</strong>
              </article>
              <article className="card metric">
                <span>PCA Categories</span>
                <strong>{overview?.pcaCategories ?? 0}</strong>
              </article>
              <article className="card metric">
                <span>PCA Votes</span>
                <strong>{overview?.pcaVotes ?? 0}</strong>
              </article>
            </section>

            <section className="card">
              <h3>Operational Notes</h3>
              <ul className="notes">
                <li>Ensure backend migrations are applied before opening PCA manager.</li>
                <li>Use the Users tab to inspect balances, wallet addresses and user activity.</li>
                <li>Use PCA manager to publish weekly and seasonal award categories.</li>
              </ul>
            </section>
          </>
        )}

        {tab === "users" && (
          <>
            <section className="toolbar">
              <input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search by email, username, display name"
              />
              <button onClick={() => void searchUsers()}>Search</button>
            </section>

            <section className="split">
              <div className="card table-card">
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Display Name</th>
                        <th>Votes</th>
                        <th>ROL</th>
                        <th>Posts</th>
                        <th>Payments</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="muted">
                            No users found.
                          </td>
                        </tr>
                      ) : (
                        users.map((user) => (
                          <tr key={user.id}>
                            <td>{displayText(user.email)}</td>
                            <td>{displayText(user.displayName || user.username)}</td>
                            <td>{user.voteBalance}</td>
                            <td>{formatRol(user.rolBalanceRaw)}</td>
                            <td>{user._count?.posts ?? 0}</td>
                            <td>{user._count?.payments ?? 0}</td>
                            <td>
                              <button className="ghost" onClick={() => void openUser(user.id)}>
                                View
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="card detail-card">
                <h3>User Detail</h3>
                {!selectedUser ? (
                  <p className="muted">Select a user to view full details.</p>
                ) : (
                  <>
                    <div className="kv-grid">
                      <div>
                        <label>Email</label>
                        <p>{displayText(selectedUser.email)}</p>
                      </div>
                      <div>
                        <label>Display Name</label>
                        <p>{displayText(selectedUser.displayName)}</p>
                      </div>
                      <div>
                        <label>Vote Balance</label>
                        <p>{selectedUser.voteBalance}</p>
                      </div>
                      <div>
                        <label>ROL Balance</label>
                        <p>{formatRol(selectedUser.rolBalanceRaw)}</p>
                      </div>
                      <div>
                        <label>Solana</label>
                        <p>{displayText(selectedUser.solanaAddress)}</p>
                      </div>
                      <div>
                        <label>Movement</label>
                        <p>{displayText(selectedUser.movementAddress)}</p>
                      </div>
                    </div>

                    <div className="detail-section">
                      <h4>Wallets</h4>
                      {!selectedUser.wallets?.length ? (
                        <p className="muted">No wallet records.</p>
                      ) : (
                        <div className="wallet-list">
                          {selectedUser.wallets.map((wallet: any) => (
                            <article className="wallet-card" key={wallet.id}>
                              <strong>{displayText(wallet.blockchain)}</strong>
                              <p>{displayText(wallet.address)}</p>
                              <div className="mini-stats">
                                {(wallet.walletBalances || []).map((balance: any) => (
                                  <span key={balance.id}>
                                    {displayText(balance.tokenSymbol)}: {displayText(balance.balance, "0")}
                                  </span>
                                ))}
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="detail-section">
                      <h4>Recent Payments</h4>
                      {!selectedUser.payments?.length ? (
                        <p className="muted">No payments yet.</p>
                      ) : (
                        <div className="table-wrap compact">
                          <table>
                            <thead>
                              <tr>
                                <th>Time</th>
                                <th>Type</th>
                                <th>Amount</th>
                                <th>Status</th>
                                <th>Tx</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedUser.payments.map((payment: any) => (
                                <tr key={payment.id}>
                                  <td>{formatDateTime(payment.createdAt)}</td>
                                  <td>{displayText(payment.paymentType)}</td>
                                  <td>
                                    {displayText(payment.amount)} {displayText(payment.currency, "")}
                                  </td>
                                  <td>{displayText(payment.status)}</td>
                                  <td>{shortHash(payment.txHash)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    <div className="detail-section">
                      <h4>Recent Notifications</h4>
                      {!selectedUser.notifications?.length ? (
                        <p className="muted">No notifications yet.</p>
                      ) : (
                        <ul className="list-rows">
                          {selectedUser.notifications.map((notification: any) => (
                            <li key={notification.id}>
                              <button
                                type="button"
                                className="row-btn"
                                onClick={() => setSelectedNotification(notification)}
                              >
                                <strong>{displayText(notification.type)}</strong>
                                <span>{notificationMessage(notification)}</span>
                                <small>{formatDateTime(notification.createdAt)}</small>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </>
                )}
              </div>
            </section>
          </>
        )}

        {tab === "rolley" && (
          <>
            <section className="card">
              <h3>Daily Pick Settlement</h3>
              <div className="toolbar" style={{ gridTemplateColumns: "220px 160px 220px 1fr auto auto" }}>
                <input type="date" value={rolleyDate} onChange={(e) => setRolleyDate(e.target.value)} />
                <select value={rolleySport} onChange={(e) => setRolleySport(e.target.value as "SOCCER" | "BASKETBALL")}>
                  <option value="SOCCER">SOCCER</option>
                  <option value="BASKETBALL">BASKETBALL</option>
                </select>
                <input
                  type="date"
                  value={rolleyHistoryDate}
                  onChange={(e) => setRolleyHistoryDate(e.target.value)}
                  title="History date"
                />
                <input
                  value={rolleyAdminKey}
                  onChange={(e) => setRolleyAdminKey(e.target.value)}
                  placeholder="Rolley admin key (X-Admin-Key)"
                />
                <button className="ghost" onClick={() => void loadRolleyPicks()} disabled={rolleyLoading}>
                  {rolleyLoading ? "Loading..." : "Load Picks"}
                </button>
                <button className="ghost danger" onClick={() => void rebuildRolleyPicks()} disabled={rolleyLoading}>
                  {rolleyLoading ? "Working..." : "Rebuild Day"}
                </button>
              </div>
              <p className="muted" style={{ marginTop: 8 }}>
                Service: {ROLLEY_BASE}
              </p>
            </section>

            <section className="card table-card">
              <h3>Settlement Queue</h3>
              {!rolleyPicks.length ? (
                <p className="muted">No picks found for selected day/sport.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Match</th>
                        <th>Market</th>
                        <th>Conf</th>
                        <th>Odds</th>
                        <th>Primary</th>
                        <th>Status</th>
                        <th>By</th>
                        <th>Settled At</th>
                        <th>Chain</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rolleyPicks.map((pick) => (
                        <tr key={pick.id}>
                          <td>
                            <strong>
                              {pick.home_team} vs {pick.away_team}
                            </strong>
                            <div className="muted">{pick.league}</div>
                          </td>
                          <td>
                            {pick.market}: {pick.selection}
                          </td>
                          <td>{(pick.confidence * 100).toFixed(2)}%</td>
                          <td>{pick.implied_odds ? `x${pick.implied_odds.toFixed(3)}` : "-"}</td>
                          <td>{pick.is_primary ? "Yes" : "No"}</td>
                          <td>{pick.settlement_outcome || "PENDING"}</td>
                          <td>{displayText(pick.settled_by)}</td>
                          <td>{formatDateTime(pick.settled_at)}</td>
                          <td>
                            <div className="mini-stats">
                              <span>ID: {displayText(pick.movement_pick_id)}</span>
                              {pick.movement_tx_hash ? (
                                <a href={movementTxUrl(pick.movement_tx_hash)} target="_blank" rel="noreferrer" className="link-btn">
                                  Create Tx
                                </a>
                              ) : null}
                              {pick.settlement_movement_tx_hash ? (
                                <a
                                  href={movementTxUrl(pick.settlement_movement_tx_hash)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="link-btn"
                                >
                                  Settle Tx
                                </a>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="template-row">
                              <button
                                className="ghost"
                                onClick={() => void settleRolleyPick(pick.id, "WIN")}
                                disabled={rolleyLoading}
                              >
                                Mark WIN
                              </button>
                              <button
                                className="ghost danger"
                                onClick={() => void settleRolleyPick(pick.id, "LOSS")}
                                disabled={rolleyLoading}
                              >
                                Mark LOSS
                              </button>
                              <button
                                className="ghost"
                                onClick={() => void settleRolleyPick(pick.id, "VOID")}
                                disabled={rolleyLoading}
                              >
                                Mark VOID
                              </button>
                              <button
                                className="ghost"
                                onClick={() => void settleRolleyPick(pick.id, "PENDING")}
                                disabled={rolleyLoading}
                              >
                                Reset
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section className="card table-card">
              <h3>Pick History</h3>
              {!rolleyHistory.length ? (
                <p className="muted">No picks found for the selected history date.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Match</th>
                        <th>Market</th>
                        <th>Conf</th>
                        <th>Status</th>
                        <th>By</th>
                        <th>Settled At</th>
                        <th>Chain</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rolleyHistory.map((pick) => (
                        <tr key={pick.id}>
                          <td>{pick.date}</td>
                          <td>
                            <strong>
                              {pick.home_team} vs {pick.away_team}
                            </strong>
                            <div className="muted">{pick.league}</div>
                          </td>
                          <td>
                            {pick.market}: {pick.selection}
                          </td>
                          <td>{(pick.confidence * 100).toFixed(2)}%</td>
                          <td>{pick.settlement_outcome || "PENDING"}</td>
                          <td>{displayText(pick.settled_by)}</td>
                          <td>{formatDateTime(pick.settled_at)}</td>
                          <td>
                            <div className="mini-stats">
                              <span>ID: {displayText(pick.movement_pick_id)}</span>
                              {pick.movement_tx_hash ? (
                                <a href={movementTxUrl(pick.movement_tx_hash)} target="_blank" rel="noreferrer" className="link-btn">
                                  Create Tx
                                </a>
                              ) : null}
                              {pick.settlement_movement_tx_hash ? (
                                <a
                                  href={movementTxUrl(pick.settlement_movement_tx_hash)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="link-btn"
                                >
                                  Settle Tx
                                </a>
                              ) : null}
                            </div>
                          </td>
                          <td>
                            <div className="template-row">
                              <button
                                className="ghost"
                                onClick={() => void settleRolleyPick(pick.id, "WIN")}
                                disabled={rolleyLoading}
                              >
                                Mark WIN
                              </button>
                              <button
                                className="ghost danger"
                                onClick={() => void settleRolleyPick(pick.id, "LOSS")}
                                disabled={rolleyLoading}
                              >
                                Mark LOSS
                              </button>
                              <button
                                className="ghost"
                                onClick={() => void settleRolleyPick(pick.id, "VOID")}
                                disabled={rolleyLoading}
                              >
                                Mark VOID
                              </button>
                              <button
                                className="ghost"
                                onClick={() => void settleRolleyPick(pick.id, "PENDING")}
                                disabled={rolleyLoading}
                              >
                                Reset
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}

        {tab === "pca" && (
          <>
            <section className="split">
              <form className="card form-card" onSubmit={createCategory}>
                <h3>Create PCA Category</h3>
                <select
                  value={categoryForm.sport}
                  onChange={(e) => setCategoryForm({ ...categoryForm, sport: e.target.value })}
                >
                  <option value="SOCCER">SOCCER</option>
                  <option value="BASKETBALL">BASKETBALL</option>
                </select>
                <input
                  value={categoryForm.season}
                  onChange={(e) => setCategoryForm({ ...categoryForm, season: e.target.value })}
                  placeholder="Season (e.g. 2025/2026)"
                  required
                />
                <select
                  value={categoryForm.categoryType}
                  onChange={(e) => applyCategoryTemplate(e.target.value)}
                >
                  <option value="GOAL_OF_WEEK">GOAL_OF_WEEK</option>
                  <option value="PLAYER_OF_MONTH">PLAYER_OF_MONTH</option>
                  <option value="TOURNAMENT_AWARD">TOURNAMENT_AWARD</option>
                  <option value="BALLON_DOR_PEOPLES_CHOICE">BALLON_DOR_PEOPLES_CHOICE</option>
                  <option value="CUSTOM">CUSTOM</option>
                </select>
                <input
                  value={categoryForm.title}
                  onChange={(e) => setCategoryForm({ ...categoryForm, title: e.target.value })}
                  placeholder="Category title"
                  required
                />
                <input
                  value={categoryForm.subtitle}
                  onChange={(e) => setCategoryForm({ ...categoryForm, subtitle: e.target.value })}
                  placeholder="Subtitle"
                />
                <input
                  value={categoryForm.roundLabel}
                  onChange={(e) => setCategoryForm({ ...categoryForm, roundLabel: e.target.value })}
                  placeholder="Round label (Week 1, Month 2...)"
                />
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  placeholder="Description"
                />
                <div className="criteria-builder">
                  <label>Criteria</label>
                  <div className="criteria-pills">
                    {categoryCriteria.length === 0 ? (
                      <span className="muted">No criteria selected</span>
                    ) : (
                      categoryCriteria.map((metric) => (
                        <button
                          type="button"
                          key={metric}
                          className="pill"
                          onClick={() => removeCategoryCriterion(metric)}
                          title="Remove criterion"
                        >
                          {metric} x
                        </button>
                      ))
                    )}
                  </div>
                  <div className="criteria-input">
                    <input
                      value={newCriterion}
                      onChange={(e) => setNewCriterion(e.target.value)}
                      placeholder="Add criterion (e.g. xg_contribution)"
                    />
                    <button type="button" className="ghost" onClick={addCategoryCriterion}>
                      Add
                    </button>
                  </div>
                  <details className="advanced-block">
                    <summary>Advanced: edit criteria JSON</summary>
                    <textarea
                      value={categoryForm.criteria}
                      onChange={(e) => setCategoryForm({ ...categoryForm, criteria: e.target.value })}
                      placeholder='Criteria JSON e.g. ["goals","assists","duels_won"]'
                    />
                  </details>
                </div>
                <button type="submit" disabled={busy}>
                  Create Category
                </button>
              </form>

              <form className="card form-card" onSubmit={createNominee}>
                <h3>Add Nominee</h3>
                <select
                  value={nomineeForm.categoryId}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, categoryId: e.target.value })}
                  required
                >
                  <option value="">Select category</option>
                  {categoryOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <input
                  value={nomineeForm.name}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, name: e.target.value })}
                  placeholder="Player name"
                  required
                />
                <input
                  value={nomineeForm.team}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, team: e.target.value })}
                  placeholder="Team"
                />
                <input
                  value={nomineeForm.country}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, country: e.target.value })}
                  placeholder="Country"
                />
                <input
                  value={nomineeForm.position}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, position: e.target.value })}
                  placeholder="Position / Role"
                />
                <div className="template-row">
                  <button type="button" className="ghost" onClick={() => applyNomineeStatsTemplate("STRIKER")}>
                    Striker
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => applyNomineeStatsTemplate("MIDFIELDER")}
                  >
                    Midfielder
                  </button>
                  <button type="button" className="ghost" onClick={() => applyNomineeStatsTemplate("DEFENDER")}>
                    Defender
                  </button>
                  <button type="button" className="ghost" onClick={() => applyNomineeStatsTemplate("KEEPER")}>
                    Keeper
                  </button>
                </div>
                <input
                  value={nomineeForm.imageUrl}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, imageUrl: e.target.value })}
                  placeholder="Image URL"
                />
                <label className="ghost upload-btn">
                  Upload image
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => void handleNomineeFileSelected(e, "create", "image")}
                  />
                </label>
                {uploadingField === "create-image" ? <small className="muted">Uploading image...</small> : null}
                <input
                  value={nomineeForm.videoUrl}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, videoUrl: e.target.value })}
                  placeholder="Video URL"
                />
                <label className="ghost upload-btn">
                  Upload video
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => void handleNomineeFileSelected(e, "create", "video")}
                  />
                </label>
                {uploadingField === "create-video" ? <small className="muted">Uploading video...</small> : null}
                <div className="stats-editor">
                  <label>Nominee Stats</label>
                  {Object.keys(nomineeStats).length === 0 ? (
                    <p className="muted">No stats set yet. Add at least one stat.</p>
                  ) : (
                    Object.entries(nomineeStats).map(([key, value]) => (
                      <div className="stat-row" key={key}>
                        <span>{key.replace(/_/g, " ")}</span>
                        <input
                          value={String(value ?? "")}
                          onChange={(e) => updateNomineeStatValue(key, e.target.value)}
                          placeholder="Value"
                        />
                        <button type="button" className="ghost danger" onClick={() => removeNomineeStat(key)}>
                          Remove
                        </button>
                      </div>
                    ))
                  )}
                  <div className="stat-add-row">
                    <input
                      value={newNomineeStatKey}
                      onChange={(e) => setNewNomineeStatKey(e.target.value)}
                      placeholder="stat key (e.g. goals)"
                    />
                    <input
                      value={newNomineeStatValue}
                      onChange={(e) => setNewNomineeStatValue(e.target.value)}
                      placeholder="value"
                    />
                    <button type="button" className="ghost" onClick={addNomineeStat}>
                      Add stat
                    </button>
                  </div>
                </div>
                <details className="advanced-block">
                  <summary>Advanced: nominee stats JSON</summary>
                  <textarea
                    value={nomineeForm.stats}
                    onChange={(e) => setNomineeForm({ ...nomineeForm, stats: e.target.value })}
                    placeholder='Stats JSON e.g. {"goals":14,"assists":7,"duels_won":42}'
                  />
                </details>
                <button type="submit" disabled={busy}>
                  Add Nominee
                </button>
              </form>
            </section>

            <section className="card">
              <h3>Current PCA Categories</h3>
              <div className="category-grid">
                {categories.map((category) => {
                  const topNominee =
                    category.nominees.length > 0
                      ? [...category.nominees].sort((a, b) => b.voteCount - a.voteCount)[0]
                      : null;
                  return (
                    <article className="category-card" key={category.id}>
                      <div className="category-head">
                        <div>
                          <strong>{category.title}</strong>
                          <p>
                            {category.sport} - {category.season} - {category.categoryType}
                          </p>
                        </div>
                        <div className="template-row">
                          <button className="ghost" onClick={() => beginEditCategory(category)}>
                            Edit
                          </button>
                          <button className="ghost danger" onClick={() => void deleteCategory(category.id)}>
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="mini-stats">
                        <span>Nominees: {category.nominees.length}</span>
                        <span>Total votes: {category._count?.votes ?? 0}</span>
                        <span>Leader: {topNominee ? `${topNominee.name} (${topNominee.voteCount})` : "-"}</span>
                      </div>

                      <div className="nominee-list">
                        {category.nominees.length === 0 ? (
                          <p className="muted">No nominees yet.</p>
                        ) : (
                          category.nominees.map((nominee) => (
                            <div className="nominee-row" key={nominee.id}>
                              <div className="nominee-main">
                                <strong>{nominee.name}</strong>
                                <p>
                                  {[nominee.team, nominee.position, nominee.country]
                                    .filter(Boolean)
                                    .join(" - ") || "No metadata"}
                                </p>
                                <small>Votes: {nominee.voteCount}</small>
                                {nominee.stats && Object.keys(nominee.stats).length > 0 ? (
                                  <p>
                                    {Object.entries(nominee.stats)
                                      .map(([key, value]) => `${formatStatKey(key)}: ${value}`)
                                      .join(" | ")}
                                  </p>
                                ) : null}
                                {nominee.imageUrl || nominee.videoUrl ? (
                                  <div className="nominee-preview-grid">
                                    {nominee.imageUrl ? (
                                      <a
                                        href={resolveNomineeMediaUrl(nominee.imageUrl)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="nominee-preview-link"
                                      >
                                        <img
                                          src={resolveNomineeMediaUrl(nominee.imageUrl)}
                                          alt={`${nominee.name} image`}
                                          className="nominee-preview-image"
                                          loading="lazy"
                                        />
                                      </a>
                                    ) : null}
                                    {nominee.videoUrl ? (
                                      <div className="nominee-preview-video-wrap">
                                        <video
                                          src={resolveNomineeMediaUrl(nominee.videoUrl)}
                                          className="nominee-preview-video"
                                          controls
                                          preload="metadata"
                                        />
                                      </div>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <div className="template-row">
                                {nominee.imageUrl ? (
                                  <a href={nominee.imageUrl} target="_blank" rel="noreferrer" className="link-btn">
                                    Image
                                  </a>
                                ) : null}
                                {nominee.videoUrl ? (
                                  <a href={nominee.videoUrl} target="_blank" rel="noreferrer" className="link-btn">
                                    Video
                                  </a>
                                ) : null}
                                <button className="ghost" onClick={() => beginEditNominee(nominee)}>
                                  Edit
                                </button>
                                <button className="ghost danger" onClick={() => void deleteNominee(nominee.id)}>
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </main>

      {editingCategory ? (
        <div className="modal-backdrop" onClick={() => setEditingCategory(null)}>
          <form className="card modal-form" onClick={(e) => e.stopPropagation()} onSubmit={saveCategoryEdit}>
            <h3>Edit Category</h3>
            <select
              value={editingCategory.sport}
              onChange={(e) => setEditingCategory({ ...editingCategory, sport: e.target.value })}
            >
              <option value="SOCCER">SOCCER</option>
              <option value="BASKETBALL">BASKETBALL</option>
            </select>
            <input
              value={editingCategory.season}
              onChange={(e) => setEditingCategory({ ...editingCategory, season: e.target.value })}
              placeholder="Season"
              required
            />
            <select
              value={editingCategory.categoryType}
              onChange={(e) => setEditingCategory({ ...editingCategory, categoryType: e.target.value })}
            >
              <option value="GOAL_OF_WEEK">GOAL_OF_WEEK</option>
              <option value="PLAYER_OF_MONTH">PLAYER_OF_MONTH</option>
              <option value="TOURNAMENT_AWARD">TOURNAMENT_AWARD</option>
              <option value="BALLON_DOR_PEOPLES_CHOICE">BALLON_DOR_PEOPLES_CHOICE</option>
              <option value="CUSTOM">CUSTOM</option>
            </select>
            <input
              value={editingCategory.title}
              onChange={(e) => setEditingCategory({ ...editingCategory, title: e.target.value })}
              placeholder="Title"
              required
            />
            <input
              value={editingCategory.subtitle}
              onChange={(e) => setEditingCategory({ ...editingCategory, subtitle: e.target.value })}
              placeholder="Subtitle"
            />
            <input
              value={editingCategory.roundLabel}
              onChange={(e) => setEditingCategory({ ...editingCategory, roundLabel: e.target.value })}
              placeholder="Round label"
            />
            <textarea
              value={editingCategory.description}
              onChange={(e) => setEditingCategory({ ...editingCategory, description: e.target.value })}
              placeholder="Description"
            />
            <div className="criteria-builder">
              <label>Criteria</label>
              <div className="criteria-pills">
                {editingCategoryCriteria.length === 0 ? (
                  <span className="muted">No criteria selected</span>
                ) : (
                  editingCategoryCriteria.map((metric) => (
                    <button
                      type="button"
                      key={metric}
                      className="pill"
                      onClick={() => removeEditingCategoryCriterion(metric)}
                      title="Remove criterion"
                    >
                      {metric} x
                    </button>
                  ))
                )}
              </div>
              <div className="criteria-input">
                <input
                  value={editingCriterion}
                  onChange={(e) => setEditingCriterion(e.target.value)}
                  placeholder="Add criterion"
                />
                <button type="button" className="ghost" onClick={addEditingCategoryCriterion}>
                  Add
                </button>
              </div>
              <details className="advanced-block">
                <summary>Advanced: edit criteria JSON</summary>
                <textarea
                  value={editingCategory.criteria}
                  onChange={(e) => setEditingCategory({ ...editingCategory, criteria: e.target.value })}
                  placeholder="Criteria JSON"
                />
              </details>
            </div>
            <div className="template-row">
              <button type="submit" disabled={busy}>
                Save
              </button>
              <button type="button" className="ghost" onClick={() => setEditingCategory(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {editingNominee ? (
        <div className="modal-backdrop" onClick={() => setEditingNominee(null)}>
          <form className="card modal-form" onClick={(e) => e.stopPropagation()} onSubmit={saveNomineeEdit}>
            <h3>Edit Nominee</h3>
            <input
              value={editingNominee.name}
              onChange={(e) => setEditingNominee({ ...editingNominee, name: e.target.value })}
              placeholder="Name"
              required
            />
            <input
              value={editingNominee.team}
              onChange={(e) => setEditingNominee({ ...editingNominee, team: e.target.value })}
              placeholder="Team"
            />
            <input
              value={editingNominee.country}
              onChange={(e) => setEditingNominee({ ...editingNominee, country: e.target.value })}
              placeholder="Country"
            />
            <input
              value={editingNominee.position}
              onChange={(e) => setEditingNominee({ ...editingNominee, position: e.target.value })}
              placeholder="Position"
            />
            <input
              value={editingNominee.imageUrl}
              onChange={(e) => setEditingNominee({ ...editingNominee, imageUrl: e.target.value })}
              placeholder="Image URL"
            />
            <label className="ghost upload-btn">
              Upload image
              <input
                type="file"
                accept="image/*"
                onChange={(e) => void handleNomineeFileSelected(e, "edit", "image")}
              />
            </label>
            {uploadingField === "edit-image" ? <small className="muted">Uploading image...</small> : null}
            <input
              value={editingNominee.videoUrl}
              onChange={(e) => setEditingNominee({ ...editingNominee, videoUrl: e.target.value })}
              placeholder="Video URL"
            />
            <label className="ghost upload-btn">
              Upload video
              <input
                type="file"
                accept="video/*"
                onChange={(e) => void handleNomineeFileSelected(e, "edit", "video")}
              />
            </label>
            {uploadingField === "edit-video" ? <small className="muted">Uploading video...</small> : null}
            <div className="stats-editor">
              <label>Nominee Stats</label>
              {Object.keys(editingNomineeStats).length === 0 ? (
                <p className="muted">No stats set yet. Add at least one stat.</p>
              ) : (
                Object.entries(editingNomineeStats).map(([key, value]) => (
                  <div className="stat-row" key={key}>
                    <span>{key.replace(/_/g, " ")}</span>
                    <input
                      value={String(value ?? "")}
                      onChange={(e) => updateEditingNomineeStatValue(key, e.target.value)}
                      placeholder="Value"
                    />
                    <button type="button" className="ghost danger" onClick={() => removeEditingNomineeStat(key)}>
                      Remove
                    </button>
                  </div>
                ))
              )}
              <div className="stat-add-row">
                <input
                  value={newEditingStatKey}
                  onChange={(e) => setNewEditingStatKey(e.target.value)}
                  placeholder="stat key (e.g. goals)"
                />
                <input
                  value={newEditingStatValue}
                  onChange={(e) => setNewEditingStatValue(e.target.value)}
                  placeholder="value"
                />
                <button type="button" className="ghost" onClick={addEditingNomineeStat}>
                  Add stat
                </button>
              </div>
            </div>
            <details className="advanced-block">
              <summary>Advanced: nominee stats JSON</summary>
              <textarea
                value={editingNominee.stats}
                onChange={(e) => setEditingNominee({ ...editingNominee, stats: e.target.value })}
                placeholder="Stats JSON"
              />
            </details>
            <div className="template-row">
              <button type="submit" disabled={busy}>
                Save
              </button>
              <button type="button" className="ghost" onClick={() => setEditingNominee(null)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {selectedNotification ? (
        <div className="modal-backdrop" onClick={() => setSelectedNotification(null)}>
          <div className="card modal-form" onClick={(e) => e.stopPropagation()}>
            <h3>{selectedNotification.title || selectedNotification.type}</h3>
            <p className="muted">{selectedNotification.type}</p>
            <p>{notificationMessage(selectedNotification)}</p>
            <div className="mini-stats">
              <span>Created: {formatDateTime(selectedNotification.createdAt)}</span>
              <span>Read: {selectedNotification.readAt ? formatDateTime(selectedNotification.readAt) : "Unread"}</span>
            </div>
            {selectedNotification.data ? (
              <details className="advanced-block" open>
                <summary>Details</summary>
                <pre>{JSON.stringify(selectedNotification.data, null, 2)}</pre>
              </details>
            ) : null}
            <div className="template-row">
              <button type="button" className="ghost" onClick={() => setSelectedNotification(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

