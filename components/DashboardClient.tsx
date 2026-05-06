"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

type Bot = {
  id: string;
  name: string;
  tg_username: string | null;
  token_hint: string;
  is_active: boolean;
  created_at: string;
};

type BotsResponse = {
  ok: boolean;
  bots?: Bot[];
  error?: string;
};

export default function DashboardClient() {
  const [bots, setBots] = useState<Bot[]>([]);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadBots() {
    setLoading(true);

    try {
      const response = await fetch("/api/bots", { cache: "no-store" });
      const data = (await response.json()) as BotsResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Не удалось загрузить ботов.");
        return;
      }

      setBots(data.bots || []);
    } catch {
      setMessage("Не удалось подключиться к серверу.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBots();
  }, []);

  async function addBot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch("/api/bots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, token })
      });

      const data = (await response.json()) as BotsResponse & { warning?: string };

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Не удалось добавить бота.");
        return;
      }

      setName("");
      setToken("");
      setMessage(data.warning || "Бот добавлен. Webhook установлен, если APP_URL указан верно.");
      await loadBots();
    } catch {
      setMessage("Не удалось подключиться к серверу.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="grid">
      <aside className="panel">
        <h2>Добавить бота</h2>
        <p className="muted">
          Вставь токен из BotFather. Токен будет храниться на сервере в зашифрованном виде.
        </p>

        <form className="form" onSubmit={addBot}>
          <div className="field">
            <label htmlFor="bot-name">Название</label>
            <input
              id="bot-name"
              value={name}
              placeholder="Мой первый бот"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="bot-token">Telegram bot token</label>
            <input
              id="bot-token"
              value={token}
              placeholder="123456789:AA..."
              onChange={(event) => setToken(event.target.value)}
              required
            />
          </div>

          <button className="button" disabled={saving}>
            {saving ? "Проверяю..." : "Подключить"}
          </button>
        </form>

        {message ? (
          <div className={message.includes("Не") ? "message error" : "message success"} style={{ marginTop: 14 }}>
            {message}
          </div>
        ) : null}
      </aside>

      <div className="panel">
        <h2>Мои боты</h2>
        <p className="muted">Выбери бота и создай цепочки ответов.</p>

        {loading ? <div className="message">Загрузка...</div> : null}

        {!loading && bots.length === 0 ? (
          <div className="message">
            Ботов пока нет. Добавь первый токен слева.
          </div>
        ) : null}

        <div className="bot-grid">
          {bots.map((bot) => (
            <Link href={`/bots/${bot.id}`} className="card bot-card" key={bot.id}>
              <span className={bot.is_active ? "badge" : "badge off"}>
                {bot.is_active ? "active" : "paused"}
              </span>

              <div>
                <h3>{bot.name}</h3>
                <p className="muted">
                  @{bot.tg_username || "unknown"} · token {bot.token_hint}
                </p>
              </div>

              <footer>
                <span className="muted">Открыть цепочки</span>
                <span className="logo-mark">→</span>
              </footer>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
