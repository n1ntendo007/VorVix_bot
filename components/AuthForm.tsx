"use client";

import { FormEvent, useState } from "react";

type Mode = "login" | "register";

export default function AuthForm() {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password })
      });

      const data = (await response.json()) as { ok?: boolean; error?: string };

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Ошибка авторизации.");
        return;
      }

      window.location.href = "/dashboard";
    } catch {
      setMessage("Не удалось подключиться к серверу.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="card auth-card">
      <h2>{mode === "login" ? "Вход" : "Регистрация"}</h2>
      <p className="muted">
        Первый зарегистрированный пользователь станет владельцем панели.
      </p>

      <form className="form" onSubmit={submit}>
        <div className="field">
          <label htmlFor="username">Логин</label>
          <input
            id="username"
            autoComplete="username"
            value={username}
            minLength={3}
            maxLength={32}
            placeholder="admin"
            onChange={(event) => setUsername(event.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            minLength={4}
            placeholder="••••••••"
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </div>

        {message ? <div className="message error">{message}</div> : null}

        <button className="button" disabled={loading}>
          {loading ? "Проверка..." : mode === "login" ? "Войти" : "Создать аккаунт"}
        </button>

        <button
          className="button secondary"
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setMessage("");
          }}
        >
          {mode === "login" ? "Нужна регистрация" : "Уже есть аккаунт"}
        </button>
      </form>
    </div>
  );
}
