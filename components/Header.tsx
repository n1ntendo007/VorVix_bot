"use client";

type HeaderProps = {
  username: string;
};

export default function Header({ username }: HeaderProps) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/";
  }

  return (
    <header className="topbar">
      <a className="logo" href="/dashboard">
        <span className="logo-mark">VX</span>
        VorVix_bot
      </a>

      <div className="topbar-actions">
        <span className="muted">Вошел как @{username}</span>
        <button className="button secondary" onClick={logout}>
          Выйти
        </button>
      </div>
    </header>
  );
}
