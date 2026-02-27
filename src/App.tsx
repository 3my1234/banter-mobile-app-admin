import { FormEvent, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "https://sportbanter.online/api";
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

type AppTab = "overview" | "users" | "pca";

const NAV_ITEMS: Array<{ id: AppTab; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "users", label: "Users" },
  { id: "pca", label: "PCA Manager" },
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
  const [categories, setCategories] = useState<PcaCategory[]>([]);

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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const loggedIn = Boolean(token);

  const pageTitle = useMemo(() => {
    if (tab === "overview") return "Admin Overview";
    if (tab === "users") return "User Management";
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
    setCategories([]);
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
      const res = await request(`/admin/users/${userId}`, token);
      setSelectedUser(res.user || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load user detail");
    }
  }

  function applyCategoryTemplate(type: string) {
    const template = CATEGORY_CRITERIA_TEMPLATES[type] || [];
    setCategoryForm((prev) => ({
      ...prev,
      categoryType: type,
      criteria: JSON.stringify(template, null, 2),
    }));
  }

  function applyNomineeStatsTemplate(templateKey: string) {
    const template = NOMINEE_STATS_TEMPLATES[templateKey];
    if (!template) return;
    setNomineeForm((prev) => ({
      ...prev,
      stats: JSON.stringify(template, null, 2),
    }));
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
          <button onClick={() => void loadAll()} disabled={busy}>
            {busy ? "Refreshing..." : "Refresh"}
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
                            <td>{user.email || "-"}</td>
                            <td>{user.displayName || user.username || "-"}</td>
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
                        <p>{selectedUser.email || "-"}</p>
                      </div>
                      <div>
                        <label>Display Name</label>
                        <p>{selectedUser.displayName || "-"}</p>
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
                        <p>{selectedUser.solanaAddress || "-"}</p>
                      </div>
                      <div>
                        <label>Movement</label>
                        <p>{selectedUser.movementAddress || "-"}</p>
                      </div>
                    </div>
                    <details>
                      <summary>Raw JSON</summary>
                      <pre>{JSON.stringify(selectedUser, null, 2)}</pre>
                    </details>
                  </>
                )}
              </div>
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
                <textarea
                  value={categoryForm.criteria}
                  onChange={(e) => setCategoryForm({ ...categoryForm, criteria: e.target.value })}
                  placeholder='Criteria JSON e.g. ["goals","assists","duels_won"]'
                />
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
                <input
                  value={nomineeForm.videoUrl}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, videoUrl: e.target.value })}
                  placeholder="Video URL"
                />
                <textarea
                  value={nomineeForm.stats}
                  onChange={(e) => setNomineeForm({ ...nomineeForm, stats: e.target.value })}
                  placeholder='Stats JSON e.g. {"goals":14,"assists":7,"duels_won":42}'
                />
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
                              <div>
                                <strong>{nominee.name}</strong>
                                <p>
                                  {[nominee.team, nominee.position, nominee.country]
                                    .filter(Boolean)
                                    .join(" - ") || "No metadata"}
                                </p>
                                <small>Votes: {nominee.voteCount}</small>
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
            <textarea
              value={editingCategory.criteria}
              onChange={(e) => setEditingCategory({ ...editingCategory, criteria: e.target.value })}
              placeholder="Criteria JSON"
            />
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
            <input
              value={editingNominee.videoUrl}
              onChange={(e) => setEditingNominee({ ...editingNominee, videoUrl: e.target.value })}
              placeholder="Video URL"
            />
            <textarea
              value={editingNominee.stats}
              onChange={(e) => setEditingNominee({ ...editingNominee, stats: e.target.value })}
              placeholder="Stats JSON"
            />
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
    </div>
  );
}

