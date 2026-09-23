export const metadata = { title: "Sign in · Cold Email Economics" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  return (
    <main className="login">
      <form className="card" action="/api/login" method="post">
        <h1>Cold email economics</h1>
        <p className="help">ASK BOSCO · enter the dashboard password</p>
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="field">
          Password
          <input type="password" name="password" autoFocus required autoComplete="current-password" />
        </label>
        {error && <p className="err-msg">That password isn’t right.</p>}
        <div className="actions">
          <button className="primary" type="submit">
            Sign in
          </button>
        </div>
      </form>
    </main>
  );
}
