"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Bot = {
  id: string;
  name: string;
  tg_username: string | null;
  token_hint: string;
  is_active: boolean;
};

type MatchMode = "equals" | "contains" | "starts_with" | "command" | "any";
type StepType = "message" | "photo" | "video" | "delay";
type ButtonType = "url" | "flow";

type FlowButton = {
  text: string;
  type: ButtonType;
  url?: string;
  flowId?: string;
};

type FlowStep = {
  id: string;
  type: StepType;
  text: string;
  media_url: string;
  delay_seconds: number;
  buttons: FlowButton[];
  position: number;
};

type Flow = {
  id: string;
  name: string;
  trigger_text: string;
  response_text: string;
  match_mode: MatchMode;
  enabled: boolean;
  position: number;
  steps: FlowStep[];
};

type DraftFlow = Omit<Flow, "id" | "position" | "response_text"> & {
  id?: string;
};

type BotResponse = {
  ok: boolean;
  bot?: Bot;
  flows?: Flow[];
  id?: string;
  error?: string;
};

const MATCH_LABELS: Record<MatchMode, string> = {
  equals: "Равно сообщению",
  contains: "Содержит текст",
  starts_with: "Начинается с текста",
  command: "Команда /start",
  any: "Любое сообщение"
};

const STEP_LABELS: Record<StepType, string> = {
  message: "Сообщение",
  photo: "Фото",
  video: "Видео",
  delay: "Задержка"
};

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function emptyStep(type: StepType): FlowStep {
  return {
    id: makeId(),
    type,
    text: type === "message" ? "Новое сообщение" : "",
    media_url: "",
    delay_seconds: type === "delay" ? 3 : 0,
    buttons: [],
    position: 0
  };
}

function emptyDraft(): DraftFlow {
  return {
    name: "Новая цепочка",
    trigger_text: "привет",
    match_mode: "equals",
    enabled: true,
    steps: [emptyStep("message")]
  };
}

function cloneFlow(flow: Flow): DraftFlow {
  return {
    id: flow.id,
    name: flow.name || "Цепочка",
    trigger_text: flow.trigger_text || "",
    match_mode: flow.match_mode,
    enabled: flow.enabled,
    steps: (flow.steps || []).map((step, index) => ({
      ...step,
      id: step.id || makeId(),
      buttons: Array.isArray(step.buttons) ? step.buttons : [],
      position: index
    }))
  };
}

function getStepSubtitle(step: FlowStep): string {
  if (step.type === "delay") return `${step.delay_seconds || 1} сек.`;
  if (step.type === "photo") return step.media_url ? "Фото + подпись" : "Фото не выбрано";
  if (step.type === "video") return step.media_url ? "Видео + подпись" : "Видео не выбрано";
  return step.text || "Пустой текст";
}

function getTriggerPreview(flow: DraftFlow): string {
  if (flow.match_mode === "any") return "любой вход";
  if (flow.match_mode === "command") return flow.trigger_text.startsWith("/") ? flow.trigger_text : `/${flow.trigger_text}`;
  return flow.trigger_text || "без триггера";
}

export default function BotClient({ botId }: { botId: string }) {
  const [bot, setBot] = useState<Bot | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [draft, setDraft] = useState<DraftFlow>(emptyDraft);
  const [selectedFlowId, setSelectedFlowId] = useState<string>("new");
  const [selectedStepIndex, setSelectedStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedStep = draft.steps[selectedStepIndex];

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/telegram/webhook/${botId}`;
  }, [botId]);

  async function loadBot(preferredFlowId = selectedFlowId) {
    setLoading(true);

    try {
      const response = await fetch(`/api/bots/${botId}`, { cache: "no-store" });
      const data = (await response.json()) as BotResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Не удалось загрузить бота.");
        return;
      }

      const nextFlows = data.flows || [];
      setBot(data.bot || null);
      setFlows(nextFlows);

      const flow = preferredFlowId !== "new"
        ? nextFlows.find((item) => item.id === preferredFlowId)
        : null;

      if (flow) {
        setSelectedFlowId(flow.id);
        setDraft(cloneFlow(flow));
        setSelectedStepIndex(0);
      } else if (preferredFlowId === "new" || nextFlows.length === 0) {
        setSelectedFlowId("new");
        setDraft(emptyDraft());
        setSelectedStepIndex(0);
      } else {
        setSelectedFlowId(nextFlows[0].id);
        setDraft(cloneFlow(nextFlows[0]));
        setSelectedStepIndex(0);
      }
    } catch {
      setMessage("Не удалось подключиться к серверу.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadBot("new");
  }, [botId]);

  function selectFlow(flow: Flow) {
    setSelectedFlowId(flow.id);
    setDraft(cloneFlow(flow));
    setSelectedStepIndex(0);
    setMessage("");
  }

  function selectNewFlow() {
    setSelectedFlowId("new");
    setDraft(emptyDraft());
    setSelectedStepIndex(0);
    setMessage("");
  }

  function updateDraft(patch: Partial<DraftFlow>) {
    setDraft((current) => ({ ...current, ...patch }));
  }

  function updateStep(index: number, patch: Partial<FlowStep>) {
    setDraft((current) => ({
      ...current,
      steps: current.steps.map((step, itemIndex) => (
        itemIndex === index ? { ...step, ...patch } : step
      ))
    }));
  }

  function addStep(type: StepType) {
    const next = emptyStep(type);
    setDraft((current) => ({ ...current, steps: [...current.steps, next] }));
    setSelectedStepIndex(draft.steps.length);
  }

  function removeStep(index: number) {
    setDraft((current) => {
      if (current.steps.length <= 1) return current;
      return { ...current, steps: current.steps.filter((_, itemIndex) => itemIndex !== index) };
    });
    setSelectedStepIndex((current) => Math.max(0, current - 1));
  }

  function moveStep(index: number, direction: -1 | 1) {
    setDraft((current) => {
      const targetIndex = index + direction;
      if (targetIndex < 0 || targetIndex >= current.steps.length) return current;

      const steps = [...current.steps];
      const [item] = steps.splice(index, 1);
      steps.splice(targetIndex, 0, item);
      return { ...current, steps };
    });
    setSelectedStepIndex(index + direction);
  }

  function addButton() {
    if (!selectedStep) return;
    updateStep(selectedStepIndex, {
      buttons: [
        ...(selectedStep.buttons || []),
        { text: "Кнопка", type: "url", url: "https://t.me/" }
      ]
    });
  }

  function updateButton(buttonIndex: number, patch: Partial<FlowButton>) {
    if (!selectedStep) return;
    updateStep(selectedStepIndex, {
      buttons: selectedStep.buttons.map((button, index) => (
        index === buttonIndex ? { ...button, ...patch } : button
      ))
    });
  }

  function removeButton(buttonIndex: number) {
    if (!selectedStep) return;
    updateStep(selectedStepIndex, {
      buttons: selectedStep.buttons.filter((_, index) => index !== buttonIndex)
    });
  }

  async function saveFlow(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    setSaving(true);
    setMessage("");

    const payload = {
      ...draft,
      trigger_text: draft.match_mode === "any" ? draft.trigger_text : draft.trigger_text.trim(),
      steps: draft.steps.map((step, index) => ({ ...step, position: index }))
    };

    try {
      const isNew = selectedFlowId === "new";
      const response = await fetch(
        isNew ? `/api/bots/${botId}/flows` : `/api/bots/${botId}/flows/${selectedFlowId}`,
        {
          method: isNew ? "POST" : "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }
      );

      const data = (await response.json()) as BotResponse;

      if (!response.ok || !data.ok) {
        setMessage(data.error || "Не удалось сохранить цепочку.");
        return;
      }

      const nextId = isNew ? data.id : selectedFlowId;
      setMessage(isNew ? "Цепочка создана." : "Цепочка сохранена.");
      await loadBot(nextId || "new");
    } catch {
      setMessage("Не удалось подключиться к серверу.");
    } finally {
      setSaving(false);
    }
  }

  async function updateFlowEnabled(flow: Flow, enabled: boolean) {
    const response = await fetch(`/api/bots/${botId}/flows/${flow.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled })
    });

    const data = (await response.json()) as BotResponse;

    if (!response.ok || !data.ok) {
      setMessage(data.error || "Не удалось обновить цепочку.");
      return;
    }

    await loadBot(flow.id);
  }

  async function deleteFlow(flowId = selectedFlowId) {
    if (flowId === "new") return;
    const ok = window.confirm("Удалить эту цепочку?");
    if (!ok) return;

    const response = await fetch(`/api/bots/${botId}/flows/${flowId}`, { method: "DELETE" });
    const data = (await response.json()) as BotResponse;

    if (!response.ok || !data.ok) {
      setMessage(data.error || "Не удалось удалить цепочку.");
      return;
    }

    setMessage("Цепочка удалена.");
    await loadBot("new");
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

    await loadBot(selectedFlowId);
  }


  async function refreshWebhook() {
    setMessage("");

    const response = await fetch(`/api/bots/${botId}/webhook`, { method: "POST" });
    const data = (await response.json()) as BotResponse;

    if (!response.ok || !data.ok) {
      setMessage(data.error || "Не удалось обновить webhook.");
      return;
    }

    setMessage("Webhook обновлен. Кнопки-переходы теперь будут работать.");
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
    <section className="builder-shell">
      <aside className="panel bot-sidebar">
        <div className="bot-head">
          <span className={bot.is_active ? "badge" : "badge off"}>
            {bot.is_active ? "active" : "paused"}
          </span>
          <h2>{bot.name}</h2>
          <p className="muted">
            @{bot.tg_username || "unknown"}<br />
            token {bot.token_hint}
          </p>
        </div>

        <div className="sidebar-actions">
          <button className="button secondary" onClick={toggleBotActive}>
            {bot.is_active ? "Пауза" : "Включить"}
          </button>
          <button className="button secondary" onClick={refreshWebhook}>
            Webhook
          </button>
          <button className="button danger" onClick={deleteBot}>
            Удалить
          </button>
        </div>

        <div className="message compact">
          <strong>Webhook</strong>
          <div className="code-line">{webhookUrl}</div>
        </div>

        <div className="flow-menu-head">
          <h3>Цепочки</h3>
          <button className="mini-button" type="button" onClick={selectNewFlow}>+ новая</button>
        </div>

        <div className="flow-menu">
          {flows.length === 0 ? <div className="message compact">Пока нет цепочек.</div> : null}
          {flows.map((flow) => (
            <button
              type="button"
              className={`flow-menu-item ${selectedFlowId === flow.id ? "active" : ""}`}
              onClick={() => selectFlow(flow)}
              key={flow.id}
            >
              <span className={flow.enabled ? "dot" : "dot off"} />
              <span>
                <strong>{flow.name || "Цепочка"}</strong>
                <small>{MATCH_LABELS[flow.match_mode]} · {flow.trigger_text || "любой вход"}</small>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <div className="builder-main">
        <form className="panel builder-top" onSubmit={saveFlow}>
          <div className="builder-title-row">
            <div>
              <p className="eyebrow">Visual Flow Builder</p>
              <h2>{selectedFlowId === "new" ? "Новая цепочка" : draft.name}</h2>
              <p className="muted">Старт → блоки → кнопки → переходы между цепочками.</p>
            </div>

            <div className="inline-actions">
              {selectedFlowId !== "new" ? (
                <button className="button danger" type="button" onClick={() => deleteFlow()}>
                  Удалить
                </button>
              ) : null}
              <button className="button" disabled={saving}>
                {saving ? "Сохраняю..." : "Сохранить"}
              </button>
            </div>
          </div>

          <div className="flow-settings-grid">
            <div className="field">
              <label>Название цепочки</label>
              <input value={draft.name} onChange={(event) => updateDraft({ name: event.target.value })} />
            </div>

            <div className="field">
              <label>Тип входа</label>
              <select
                value={draft.match_mode}
                onChange={(event) => updateDraft({ match_mode: event.target.value as MatchMode })}
              >
                <option value="equals">Сообщение равно триггеру</option>
                <option value="contains">Сообщение содержит текст</option>
                <option value="starts_with">Сообщение начинается с текста</option>
                <option value="command">Команда Telegram</option>
                <option value="any">Любое сообщение</option>
              </select>
            </div>

            <div className="field">
              <label>{draft.match_mode === "command" ? "Команда" : "Триггер"}</label>
              <input
                value={draft.trigger_text}
                placeholder={draft.match_mode === "command" ? "/start" : "привет"}
                disabled={draft.match_mode === "any"}
                onChange={(event) => updateDraft({ trigger_text: event.target.value })}
              />
            </div>

            <label className="switch-line">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => updateDraft({ enabled: event.target.checked })}
              />
              Цепочка включена
            </label>
          </div>
        </form>

        {message ? (
          <div className={message.includes("Не") ? "message error" : "message success"}>{message}</div>
        ) : null}

        <div className="builder-layout">
          <div className="panel canvas-panel">
            <div className="canvas-toolbar">
              <div>
                <p className="eyebrow">Canvas</p>
                <h3>Схема цепочки</h3>
              </div>
              <div className="block-palette">
                <button className="mini-button" type="button" onClick={() => addStep("message")}>+ Сообщение</button>
                <button className="mini-button" type="button" onClick={() => addStep("photo")}>+ Фото</button>
                <button className="mini-button" type="button" onClick={() => addStep("video")}>+ Видео</button>
                <button className="mini-button" type="button" onClick={() => addStep("delay")}>+ Задержка</button>
              </div>
            </div>

            <div className="flow-canvas">
              <article className="flow-node start-node">
                <span className="node-type">Старт</span>
                <strong>{MATCH_LABELS[draft.match_mode]}</strong>
                <small>{getTriggerPreview(draft)}</small>
              </article>

              {draft.steps.map((step, index) => (
                <div className="node-wrap" key={step.id}>
                  <div className="node-line" />
                  <article
                    className={`flow-node ${selectedStepIndex === index ? "selected" : ""}`}
                    onClick={() => setSelectedStepIndex(index)}
                  >
                    <span className="node-number">#{index + 1}</span>
                    <span className="node-type">{STEP_LABELS[step.type]}</span>
                    <strong>{step.type === "delay" ? "Пауза" : STEP_LABELS[step.type]}</strong>
                    <small>{getStepSubtitle(step)}</small>
                    {step.buttons.length > 0 ? <em>{step.buttons.length} кноп.</em> : null}
                  </article>
                </div>
              ))}
            </div>
          </div>

          <aside className="panel inspector">
            <p className="eyebrow">Inspector</p>
            <h3>Настройка блока</h3>

            {!selectedStep ? (
              <div className="message">Выбери блок на схеме.</div>
            ) : (
              <div className="form">
                <div className="field">
                  <label>Тип блока</label>
                  <select
                    value={selectedStep.type}
                    onChange={(event) => updateStep(selectedStepIndex, { type: event.target.value as StepType })}
                  >
                    <option value="message">Сообщение</option>
                    <option value="photo">Фото</option>
                    <option value="video">Видео</option>
                    <option value="delay">Задержка</option>
                  </select>
                </div>

                {selectedStep.type === "delay" ? (
                  <div className="field">
                    <label>Сколько ждать, секунд</label>
                    <input
                      type="number"
                      min="1"
                      max="900"
                      value={selectedStep.delay_seconds}
                      onChange={(event) => updateStep(selectedStepIndex, { delay_seconds: Number(event.target.value) })}
                    />
                    <p className="muted small-note">На Vercel длинные задержки могут обрываться. Надежный лимит MVP: до 20 секунд.</p>
                  </div>
                ) : null}

                {selectedStep.type === "photo" || selectedStep.type === "video" ? (
                  <div className="field">
                    <label>{selectedStep.type === "photo" ? "Фото" : "Видео"}: URL или Telegram file_id</label>
                    <input
                      value={selectedStep.media_url}
                      placeholder="https://site.com/file.jpg или file_id"
                      onChange={(event) => updateStep(selectedStepIndex, { media_url: event.target.value })}
                    />
                  </div>
                ) : null}

                {selectedStep.type !== "delay" ? (
                  <div className="field">
                    <label>{selectedStep.type === "message" ? "Текст сообщения" : "Подпись"}</label>
                    <textarea
                      value={selectedStep.text}
                      placeholder="Текст, который отправит бот"
                      onChange={(event) => updateStep(selectedStepIndex, { text: event.target.value })}
                    />
                  </div>
                ) : null}

                {selectedStep.type !== "delay" ? (
                  <div className="button-editor">
                    <div className="button-editor-head">
                      <strong>Inline-кнопки</strong>
                      <button className="mini-button" type="button" onClick={addButton}>+ кнопка</button>
                    </div>

                    {selectedStep.buttons.length === 0 ? (
                      <div className="message compact">Кнопок нет. Можно добавить URL или переход на другую цепочку.</div>
                    ) : null}

                    {selectedStep.buttons.map((button, index) => (
                      <div className="button-row" key={`${button.text}-${index}`}>
                        <input
                          value={button.text}
                          placeholder="Текст кнопки"
                          onChange={(event) => updateButton(index, { text: event.target.value })}
                        />
                        <select
                          value={button.type}
                          onChange={(event) => updateButton(index, { type: event.target.value as ButtonType })}
                        >
                          <option value="url">Ссылка</option>
                          <option value="flow">Запустить цепочку</option>
                        </select>
                        {button.type === "flow" ? (
                          <select
                            value={button.flowId || ""}
                            onChange={(event) => updateButton(index, { flowId: event.target.value })}
                          >
                            <option value="">Выбери цепочку</option>
                            {flows.map((flow) => (
                              <option value={flow.id} key={flow.id}>{flow.name}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={button.url || ""}
                            placeholder="https://..."
                            onChange={(event) => updateButton(index, { url: event.target.value })}
                          />
                        )}
                        <button className="icon-button danger" type="button" onClick={() => removeButton(index)}>×</button>
                      </div>
                    ))}
                  </div>
                ) : null}

                <div className="inline-actions inspector-actions">
                  <button
                    className="button secondary"
                    type="button"
                    disabled={selectedStepIndex === 0}
                    onClick={() => moveStep(selectedStepIndex, -1)}
                  >
                    Выше
                  </button>
                  <button
                    className="button secondary"
                    type="button"
                    disabled={selectedStepIndex === draft.steps.length - 1}
                    onClick={() => moveStep(selectedStepIndex, 1)}
                  >
                    Ниже
                  </button>
                  <button
                    className="button danger"
                    type="button"
                    disabled={draft.steps.length <= 1}
                    onClick={() => removeStep(selectedStepIndex)}
                  >
                    Удалить блок
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>

        {flows.length > 0 ? (
          <div className="panel flow-table-panel">
            <h3>Все цепочки</h3>
            <div className="flow-table">
              {flows.map((flow) => (
                <div className="flow-table-row" key={flow.id}>
                  <div>
                    <strong>{flow.name}</strong>
                    <small>{MATCH_LABELS[flow.match_mode]} · {flow.trigger_text || "любой вход"} · {flow.steps.length} блок.</small>
                  </div>
                  <div className="inline-actions">
                    <button className="mini-button" type="button" onClick={() => selectFlow(flow)}>Открыть</button>
                    <button className="mini-button" type="button" onClick={() => updateFlowEnabled(flow, !flow.enabled)}>
                      {flow.enabled ? "Выключить" : "Включить"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
