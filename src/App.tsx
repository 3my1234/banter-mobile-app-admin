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
  _count: {
    posts: number;
    comments: number;
    payments: number;
    notifications: number;
  };
};

type PcaCategory = {
  id: string;
  sport: "SOCCER" | "BASKETBALL";
  season: string;
  categoryType: string;
  title: string;
  subtitle?: string;
  nominees: Array<{ id: string; name: string; voteCount: number }>;
};

async function request(path: string, token?: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || data?.error || "Request failed");
  return data;
}

export default function App() {
  const [token, setToken] = useState<string>(() => localStorage.getItem(TOKEN_KEY) || "");
  const [tab, setTab] = useState<"overview" | "users" | "pca">("overview");

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
    criteria: "{}",
  });

  const [nomineeForm, setNomineeForm] = useState({
    categoryId: "",
    name: "",
    team: "",
    country: "",
    position: "",
    stats: "{}",
  });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");

  const loggedIn = Boolean(token);

  const categoryOptions = useMemo(
    () =>
      categories.map((category) => ({
        id: category.id,
        label: `${category.sport} • ${category.season} • ${category.title}`,
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
        setError((prev) =>
          prev ? `${prev}; Users failed` : usersRes.reason?.message || "Users failed"
        );
      }

      if (categoryRes.status === "fulfilled") {
        setCategories(categoryRes.value.categories || []);
        if (categoryRes.value.warning) {
          setWarning(categoryRes.value.warning);
        }
      } else {
        setError((prev) =>
          prev ? `${prev}; PCA failed` : categoryRes.reason?.message || "PCA failed"
        );
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
    setCategories([]);
  }

  async function searchUsers() {
    try {
      setBusy(true);
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
      const res = await request(`/admin/users/${userId}`, token);
      setSelectedUser(res.user || null);
    } catch (err: any) {
      setError(err?.message || "Failed to load user detail");
    }
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
      setCategoryForm((prev) => ({ ...prev, title: "", subtitle: "", roundLabel: "", description: "" }));
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
      setNomineeForm((prev) => ({ ...prev, name: "", team: "", country: "", position: "", stats: "{}" }));
      await loadAll();
    } catch (err: any) {
      setError(err?.message || "Failed to add nominee");
    } finally {
      setBusy(false);
    }
  }

  if (!loggedIn) {
    return (
      <div className="login-wrap">
        <form className="card login-card" onSubmit={onLogin}>
          <h1>Banter Admin</h1>
          <p>Sign in to manage users, payments, and PCA.</p>
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
    <div className="app">
      <header className="topbar">
        <strong>Banter Admin</strong>
        <div className="top-actions">
          <button onClick={() => void loadAll()} disabled={busy}>
            Refresh
          </button>
          <button onClick={logout}>Logout</button>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}>
          Overview
        </button>
        <button className={tab === "users" ? "active" : ""} onClick={() => setTab("users")}>
          Users
        </button>
        <button className={tab === "pca" ? "active" : ""} onClick={() => setTab("pca")}>
          PCA
        </button>
      </nav>

      {error ? <p className="error page-error">{error}</p> : null}
      {warning ? <p className="warning page-error">{warning}</p> : null}

      {tab === "overview" && (
        <section className="grid">
          {overview &&
            Object.entries(overview).map(([key, value]) => (
              <article className="card metric" key={key}>
                <span>{key}</span>
                <strong>{String(value)}</strong>
              </article>
            ))}
        </section>
      )}

      {tab === "users" && (
        <section className="users-view">
          <div className="row">
            <input
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              placeholder="Search email / username / display name"
            />
            <button onClick={() => void searchUsers()}>Search</button>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Display Name</th>
                  <th>Username</th>
                  <th>Vote Balance</th>
                  <th>Posts</th>
                  <th>Payments</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>{user.email || "-"}</td>
                    <td>{user.displayName || "-"}</td>
                    <td>{user.username || "-"}</td>
                    <td>{user.voteBalance}</td>
                    <td>{user._count?.posts ?? 0}</td>
                    <td>{user._count?.payments ?? 0}</td>
                    <td>
                      <button onClick={() => void openUser(user.id)}>View</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "pca" && (
        <section className="pca-view">
          <div className="grid two">
            <form className="card" onSubmit={createCategory}>
              <h3>Create PCA category</h3>
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
                onChange={(e) => setCategoryForm({ ...categoryForm, categoryType: e.target.value })}
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
                placeholder="Title"
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
                placeholder="Round/Week label"
              />
              <textarea
                value={categoryForm.description}
                onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                placeholder="Description"
              />
              <textarea
                value={categoryForm.criteria}
                onChange={(e) => setCategoryForm({ ...categoryForm, criteria: e.target.value })}
                placeholder='Criteria JSON e.g. ["goals","assists"]'
              />
              <button type="submit" disabled={busy}>
                Create category
              </button>
            </form>

            <form className="card" onSubmit={createNominee}>
              <h3>Add nominee</h3>
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
                placeholder="Position"
              />
              <textarea
                value={nomineeForm.stats}
                onChange={(e) => setNomineeForm({ ...nomineeForm, stats: e.target.value })}
                placeholder='Stats JSON e.g. {"goals":14,"assists":7}'
              />
              <button type="submit" disabled={busy}>
                Add nominee
              </button>
            </form>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sport</th>
                  <th>Season</th>
                  <th>Category</th>
                  <th>Type</th>
                  <th>Nominees</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((category) => (
                  <tr key={category.id}>
                    <td>{category.sport}</td>
                    <td>{category.season}</td>
                    <td>{category.title}</td>
                    <td>{category.categoryType}</td>
                    <td>
                      {category.nominees.length === 0
                        ? "-"
                        : category.nominees
                            .map((nominee) => `${nominee.name} (${nominee.voteCount})`)
                            .join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {selectedUser ? (
        <div className="modal-backdrop" onClick={() => setSelectedUser(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()}>
            <h3>User details</h3>
            <pre>{JSON.stringify(selectedUser, null, 2)}</pre>
            <button onClick={() => setSelectedUser(null)}>Close</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
