"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Bot = {
  id: string;
  name: string;
  tg_username: string | null;
  token_hint: string;
  is_active: boolean;
};

type Flow = {
  id: string;
  trigger_text: string;
  response_text: string;
  match_mode: "equals" | "contains";
  enabled: boolean;
  position: number;
};

type BotResponse = {
  ok: boolean;
  bot?: Bot;
  flows?: Flow[];
  error?: string;
};

export default function BotClient({ botId }: { botId: string }) {
  const [bot, setBot] = useState<Bot | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [triggerText, setTriggerText] = useState("");
  const [responseText, setResponseText] = useState("");
  const [matchMode, setMatchMode] = useState<"equals" | "contains">("equals");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/telegram/webhook/${botId}`;
  }, [botId]);

  async function loadBot() {
    setLoading(true);

    try {
      const response = await fetch(`/api/bots/${botId}`, { cache: "no-store" });
      const data = (await response.json()) as BotResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Не удалось загрузить бота.");
        return;
      }

      setBot(data.bot || null);
      setFlows(data.flows || []);
    } catch {
      setMessage("Не удалось подключиться к серверу.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBot();
  }, [botId]);

  async function createFlow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage("");

    try {
      const response = await fetch(`/api/bots/${botId}/flows`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trigger_text: triggerText,
          response_text: responseText,
          match_mode: matchMode
        })
      });

      const data = (await response.json()) as BotResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Не удалось создать цепочку.");
        return;
      }

      setTriggerText("");
      setResponseText("");
      setMatchMode("equals");
      setMessage("Цепочка создана.");
      await loadBot();
    } catch {
      setMessage("Не удалось подключиться к серверу.");
    } finally {
      setSaving(false);
    }
  }

  async function updateFlow(flow: Flow, patch: Partial<Flow>) {
    const response = await fetch(`/api/bots/${botId}/flows/${flow.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch)
    });

    const data = (await response.json()) as BotResponse;

    if (!response.ok || !data.ok) {
      setMessage(data.error || "Не удалось обновить цепочку.");
      return;
    }

    await loadBot();
  }

  async function deleteFlow(flow: Flow) {
    const response = await fetch(`/api/bots/${botId}/flows/${flow.id}`, {
      method: "DELETE"
    });

    const data = (await response.json()) as BotResponse;

    if (!response.ok || !data.ok) {
      setMessage(data.error || "Не удалось удалить цепочку.");
      return;
    }

    await loadBot();
  }

  async function toggleBotActive() {
    if (!bot) return;

    const response = await fetch(`/api/bots/${botId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: !bot.is_active })
    });

    const data = (await response.json()) as BotResponse;

    if (!response.ok || !data.ok) {
      setMessage(data.error || "Не удалось изменить статус бота.");
      return;
    }

    await loadBot();
  }

  async function deleteBot() {
    const ok = window.confirm("Удалить этого бота и все его цепочки?");

    if (!ok) return;

    const response = await fetch(`/api/bots/${botId}`, {
      method: "DELETE"
    });

    const data = (await response.json()) as BotResponse;

    if (!response.ok || !data.ok) {
      setMessage(data.error || "Не удалось удалить бота.");
      return;
    }

    window.location.href = "/dashboard";
  }

  if (loading) {
    return <div className="panel">Загрузка...</div>;
  }

  if (!bot) {
    return (
      <div className="panel">
        <h2>Бот не найден</h2>
        <p className="muted">Проверь, что бот существует в твоем аккаунте.</p>
      </div>
    );
  }

  return (
    <section className="grid">
      <aside className="panel">
        <span className={bot.is_active ? "badge" : "badge off"}>
          {bot.is_active ? "active" : "paused"}
        </span>

        <h2 style={{ marginTop: 14 }}>{bot.name}</h2>

        <p className="muted">
          Telegram: @{bot.tg_username || "unknown"}
          <br />
          Token: {bot.token_hint}
        </p>

        <div className="message">
          Webhook URL:
          <div className="code-line" style={{ marginTop: 8 }}>{webhookUrl}</div>
          Секретный параметр webhook хранится на сервере и не показывается в интерфейсе.
        </div>

        <div className="inline-actions" style={{ marginTop: 14 }}>
          <button className="button secondary" onClick={toggleBotActive}>
            {bot.is_active ? "Поставить на паузу" : "Включить"}
          </button>

          <button className="button danger" onClick={deleteBot}>
            Удалить
          </button>
        </div>

        {message ? <div className="message" style={{ marginTop: 14 }}>{message}</div> : null}
      </aside>

      <div className="panel">
        <h2>Цепочки</h2>
        <p className="muted">
          MVP-логика: входящее сообщение сравнивается с триггером, затем бот отправляет ответ.
        </p>

        <form className="form" onSubmit={createFlow} style={{ marginBottom: 22 }}>
          <div className="field">
            <label htmlFor="match-mode">Тип совпадения</label>
            <select
              id="match-mode"
              value={matchMode}
              onChange={(event) => setMatchMode(event.target.value as "equals" | "contains")}
            >
              <option value="equals">Сообщение полностью равно триггеру</option>
              <option value="contains">Сообщение содержит триггер</option>
            </select>
          </div>

          <div className="field">
            <label htmlFor="trigger">Триггер</label>
            <input
              id="trigger"
              value={triggerText}
              placeholder="привет"
              onChange={(event) => setTriggerText(event.target.value)}
              required
            />
          </div>

          <div className="field">
            <label htmlFor="response">Ответ бота</label>
            <textarea
              id="response"
              value={responseText}
              placeholder="Привет! Чем могу помочь?"
              onChange={(event) => setResponseText(event.target.value)}
              required
            />
          </div>

          <button className="button" disabled={saving}>
            {saving ? "Сохраняю..." : "Создать цепочку"}
          </button>
        </form>

        {flows.length === 0 ? (
          <div className="message">Цепочек пока нет. Создай первую выше.</div>
        ) : null}

        <div className="flow-list">
          {flows.map((flow) => (
            <article className="flow-card" key={flow.id}>
              <header>
                <div>
                  <span className={flow.enabled ? "badge" : "badge off"}>
                    {flow.enabled ? "enabled" : "disabled"}
                  </span>
                  <h3 style={{ marginTop: 12 }}>
                    {flow.match_mode === "equals" ? "Равно" : "Содержит"}: {flow.trigger_text}
                  </h3>
                </div>

                <div className="inline-actions">
                  <button
                    className="button secondary"
                    type="button"
                    onClick={() => updateFlow(flow, { enabled: !flow.enabled })}
                  >
                    {flow.enabled ? "Выключить" : "Включить"}
                  </button>

                  <button
                    className="button danger"
                    type="button"
                    onClick={() => deleteFlow(flow)}
                  >
                    Удалить
                  </button>
                </div>
              </header>

              <div className="flow-text">
                <span className="muted">Ответ:</span>
                <div className="code-line">{flow.response_text}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
