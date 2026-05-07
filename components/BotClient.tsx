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
type StepType =
  | "message"
  | "photo"
  | "video"
  | "document"
  | "audio"
  | "voice"
  | "animation"
  | "delay"
  | "condition"
  | "random"
  | "jump"
  | "question";
type ButtonType = "url" | "flow" | "reply";
type ConditionMode = "equals" | "contains" | "starts_with" | "any";

type FlowButton = {
  text: string;
  type: ButtonType;
  url?: string;
  flowId?: string;
  payload?: string;
  row?: number;
};

type FlowStep = {
  id: string;
  type: StepType;
  text: string;
  media_url: string;
  delay_seconds: number;
  buttons: FlowButton[];
  position: number;
  condition_mode: ConditionMode;
  condition_value: string;
  true_flow_id: string;
  false_flow_id: string;
  target_flow_id: string;
  save_as: string;
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

type BlockDef = {
  type: StepType;
  label: string;
  icon: string;
  group: "content" | "logic";
  description: string;
};

const MATCH_LABELS: Record<MatchMode, string> = {
  equals: "Равно",
  contains: "Содержит",
  starts_with: "Начинается",
  command: "Команда",
  any: "Любое сообщение"
};

const CONDITION_LABELS: Record<ConditionMode, string> = {
  equals: "Равно",
  contains: "Содержит",
  starts_with: "Начинается",
  any: "Всегда"
};

const STEP_LABELS: Record<StepType, string> = {
  message: "Сообщение",
  photo: "Фото",
  video: "Видео",
  document: "Файл",
  audio: "Аудио",
  voice: "Голосовое",
  animation: "GIF",
  delay: "Задержка",
  condition: "Условие",
  random: "Случайный выбор",
  jump: "Переход",
  question: "Вопрос"
};

const BLOCKS: BlockDef[] = [
  { type: "message", label: "Сообщение", icon: "💬", group: "content", description: "Текст + inline-кнопки" },
  { type: "photo", label: "Фото", icon: "🖼", group: "content", description: "Фото по ссылке/file_id" },
  { type: "video", label: "Видео", icon: "🎬", group: "content", description: "Видео + подпись" },
  { type: "document", label: "Файл", icon: "📎", group: "content", description: "PDF/документ" },
  { type: "audio", label: "Аудио", icon: "🎧", group: "content", description: "Музыка/аудио" },
  { type: "voice", label: "Голосовое", icon: "🎙", group: "content", description: "OGG/voice file_id" },
  { type: "animation", label: "GIF", icon: "✨", group: "content", description: "Анимация Telegram" },
  { type: "delay", label: "Задержка", icon: "⏱", group: "logic", description: "Пауза между блоками" },
  { type: "condition", label: "Условие", icon: "⚑", group: "logic", description: "Если/иначе → цепочка" },
  { type: "random", label: "Случайный выбор", icon: "🔀", group: "logic", description: "Один из вариантов" },
  { type: "jump", label: "Переход", icon: "➡", group: "logic", description: "Запустить цепочку" },
  { type: "question", label: "Вопрос", icon: "❔", group: "logic", description: "Ждать ответ и продолжить" }
];

const MEDIA_TYPES: StepType[] = ["photo", "video", "document", "audio", "voice", "animation"];
const BUTTON_STEP_TYPES: StepType[] = ["message", "photo", "video", "document", "audio", "voice", "animation", "random", "question"];

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return Math.random().toString(36).slice(2);
}

function emptyStep(type: StepType): FlowStep {
  const base: FlowStep = {
    id: makeId(),
    type,
    text: "",
    media_url: "",
    delay_seconds: type === "delay" ? 3 : 0,
    buttons: [],
    position: 0,
    condition_mode: "contains",
    condition_value: "",
    true_flow_id: "",
    false_flow_id: "",
    target_flow_id: "",
    save_as: "answer"
  };

  if (type === "message") base.text = "Новое сообщение";
  if (type === "question") base.text = "Напишите ответ:";
  if (type === "random") base.text = "Первый вариант\nВторой вариант\nТретий вариант";
  if (type === "condition") base.condition_value = "да";
  if (type === "photo") base.text = "Подпись к фото";
  if (type === "video") base.text = "Подпись к видео";

  return base;
}

function emptyDraft(): DraftFlow {
  return {
    name: "Стартовая цепочка",
    trigger_text: "/start",
    match_mode: "command",
    enabled: true,
    steps: [emptyStep("message")]
  };
}

function normalizeStep(step: Partial<FlowStep>, index: number): FlowStep {
  return {
    id: step.id || makeId(),
    type: step.type || "message",
    text: step.text || "",
    media_url: step.media_url || "",
    delay_seconds: Number(step.delay_seconds || 0),
    buttons: Array.isArray(step.buttons) ? step.buttons : [],
    position: index,
    condition_mode: step.condition_mode || "contains",
    condition_value: step.condition_value || "",
    true_flow_id: step.true_flow_id || "",
    false_flow_id: step.false_flow_id || "",
    target_flow_id: step.target_flow_id || "",
    save_as: step.save_as || "answer"
  };
}

function cloneFlow(flow: Flow): DraftFlow {
  return {
    id: flow.id,
    name: flow.name || "Цепочка",
    trigger_text: flow.trigger_text || "",
    match_mode: flow.match_mode,
    enabled: flow.enabled,
    steps: (flow.steps || []).map(normalizeStep)
  };
}

function getStepSubtitle(step: FlowStep): string {
  if (step.type === "delay") return `${step.delay_seconds || 1} сек.`;
  if (step.type === "condition") return `${CONDITION_LABELS[step.condition_mode]}: ${step.condition_value || "условие"}`;
  if (step.type === "jump") return "Переход к другой цепочке";
  if (step.type === "question") return step.target_flow_id ? "Ждет ответ и продолжает" : "Просто задает вопрос";
  if (step.type === "random") return `${step.text.split("\n").filter(Boolean).length} вариантов`;
  if (MEDIA_TYPES.includes(step.type)) return step.media_url ? step.media_url : "Медиа не выбрано";
  return step.text || "Пустой текст";
}

function getTriggerPreview(flow: DraftFlow): string {
  if (flow.match_mode === "any") return "любой вход";
  if (flow.match_mode === "command") return flow.trigger_text.startsWith("/") ? flow.trigger_text : `/${flow.trigger_text}`;
  return flow.trigger_text || "без триггера";
}

function stepIcon(type: StepType): string {
  return BLOCKS.find((block) => block.type === type)?.icon || "•";
}

export default function BotClient({ botId }: { botId: string }) {
  const [bot, setBot] = useState<Bot | null>(null);
  const [flows, setFlows] = useState<Flow[]>([]);
  const [draft, setDraft] = useState<DraftFlow>(emptyDraft);
  const [selectedFlowId, setSelectedFlowId] = useState<string>("new");
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const selectedStep = selectedStepIndex === null ? null : draft.steps[selectedStepIndex] || null;

  const webhookUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/api/telegram/webhook/${botId}`;
  }, [botId]);

  const flowOptions = useMemo(() => flows.map((flow) => ({ id: flow.id, name: flow.name || "Цепочка" })), [flows]);

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
        setSelectedStepIndex(null);
      } else if (preferredFlowId === "new" || nextFlows.length === 0) {
        setSelectedFlowId("new");
        setDraft(emptyDraft());
        setSelectedStepIndex(null);
      } else {
        setSelectedFlowId(nextFlows[0].id);
        setDraft(cloneFlow(nextFlows[0]));
        setSelectedStepIndex(null);
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
    setSelectedStepIndex(null);
    setMessage("");
  }

  function selectNewFlow() {
    setSelectedFlowId("new");
    setDraft(emptyDraft());
    setSelectedStepIndex(null);
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

  function addStep(type: StepType, afterIndex?: number) {
    const next = emptyStep(type);
    setDraft((current) => {
      const insertIndex = typeof afterIndex === "number" ? afterIndex + 1 : current.steps.length;
      const steps = [...current.steps];
      steps.splice(insertIndex, 0, next);
      setSelectedStepIndex(insertIndex);
      return { ...current, steps };
    });
  }

  function duplicateStep(index: number) {
    const original = draft.steps[index];
    if (!original) return;

    const copy = { ...original, id: makeId(), text: original.text };
    setDraft((current) => {
      const steps = [...current.steps];
      steps.splice(index + 1, 0, copy);
      return { ...current, steps };
    });
    setSelectedStepIndex(index + 1);
  }

  function removeStep(index: number) {
    setDraft((current) => {
      if (current.steps.length <= 1) return current;
      return { ...current, steps: current.steps.filter((_, itemIndex) => itemIndex !== index) };
    });
    setSelectedStepIndex((current) => {
      if (current === null) return null;
      return Math.max(0, Math.min(current - 1, draft.steps.length - 2));
    });
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
    if (selectedStepIndex === null || !selectedStep) return;
    updateStep(selectedStepIndex, {
      buttons: [
        ...(selectedStep.buttons || []),
        { text: "Кнопка", type: "flow", flowId: flowOptions[0]?.id || "", row: selectedStep.buttons.length }
      ]
    });
  }

  function updateButton(buttonIndex: number, patch: Partial<FlowButton>) {
    if (selectedStepIndex === null || !selectedStep) return;
    updateStep(selectedStepIndex, {
      buttons: selectedStep.buttons.map((button, index) => (
        index === buttonIndex ? { ...button, ...patch } : button
      ))
    });
  }

  function removeButton(buttonIndex: number) {
    if (selectedStepIndex === null || !selectedStep) return;
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

    setMessage("Webhook обновлен. Telegram теперь использует новую механику v3.");
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
    <section className="pro-builder">
      <div className="builder-topbar-pro">
        <div className="topbar-left">
          <a className="back-link" href="/dashboard">← Боты</a>
          <div>
            <p className="eyebrow">VorVix_bot Flow Builder v3</p>
            <h1>{bot.name}</h1>
          </div>
          <span className={bot.is_active ? "status-pill active" : "status-pill paused"}>
            {bot.is_active ? "Активен" : "Пауза"}
          </span>
        </div>

        <div className="topbar-actions">
          <button className="button secondary" type="button" onClick={refreshWebhook}>Webhook</button>
          <button className="button secondary" type="button" onClick={toggleBotActive}>{bot.is_active ? "Поставить на паузу" : "Включить"}</button>
          <button className="button" type="button" disabled={saving} onClick={() => void saveFlow()}>
            {saving ? "Сохраняю..." : "Сохранить цепочку"}
          </button>
        </div>
      </div>

      {message ? (
        <div className={message.includes("Не") || message.includes("ошиб") ? "message error" : "message success"}>{message}</div>
      ) : null}

      <div className="builder-grid-pro">
        <aside className="flow-sidebar-pro">
          <div className="side-card bot-mini-card">
            <div className="bot-avatar">TG</div>
            <div>
              <strong>@{bot.tg_username || "unknown"}</strong>
              <span>token {bot.token_hint}</span>
            </div>
          </div>

          <div className="side-card webhook-card">
            <span>Webhook URL</span>
            <code>{webhookUrl}</code>
          </div>

          <div className="side-section-head">
            <h3>Цепочки</h3>
            <button className="mini-button" type="button" onClick={selectNewFlow}>+ новая</button>
          </div>

          <div className="flow-list-pro">
            {flows.length === 0 ? <div className="empty-small">Пока нет цепочек.</div> : null}
            {flows.map((flow) => (
              <button
                type="button"
                className={`flow-row-pro ${selectedFlowId === flow.id ? "active" : ""}`}
                onClick={() => selectFlow(flow)}
                key={flow.id}
              >
                <span className={flow.enabled ? "dot" : "dot off"} />
                <span className="flow-row-text">
                  <strong>{flow.name || "Цепочка"}</strong>
                  <small>{MATCH_LABELS[flow.match_mode]} · {flow.trigger_text || "любой вход"}</small>
                </span>
                <span className="flow-count">{flow.steps?.length || 0}</span>
              </button>
            ))}
          </div>

          <button className="button danger wide" type="button" onClick={deleteBot}>Удалить бота</button>
        </aside>

        <main className="canvas-workspace-pro">
          <form className="flow-title-card" onSubmit={saveFlow}>
            <div>
              <p className="eyebrow">Настройка входа</p>
              <h2>{selectedFlowId === "new" ? "Новая цепочка" : draft.name}</h2>
              <p className="muted">Кликни на старт или любой блок, справа откроются настройки.</p>
            </div>
            <div className="flow-title-actions">
              <button className="mini-button" type="button" onClick={() => setSelectedStepIndex(null)}>Настроить старт</button>
              {selectedFlowId !== "new" ? (
                <button className="mini-button danger-lite" type="button" onClick={() => deleteFlow()}>Удалить цепочку</button>
              ) : null}
            </div>
          </form>

          <div className="canvas-toolbar-pro">
            <div>
              <strong>Рабочая область</strong>
              <span>{draft.steps.length} блоков · вход: {MATCH_LABELS[draft.match_mode]} {getTriggerPreview(draft)}</span>
            </div>
            <div className="zoom-buttons">
              <button type="button">−</button>
              <button type="button">100%</button>
              <button type="button">+</button>
            </div>
          </div>

          <div className="flow-canvas-pro">
            <article
              className={`flow-card-pro start ${selectedStepIndex === null ? "selected" : ""}`}
              onClick={() => setSelectedStepIndex(null)}
            >
              <div className="node-head-pro">
                <span className="node-icon">▶</span>
                <span>Старт</span>
              </div>
              <h3>{MATCH_LABELS[draft.match_mode]}</h3>
              <p>{getTriggerPreview(draft)}</p>
              <small>Отсюда начинается цепочка</small>
            </article>

            {draft.steps.map((step, index) => (
              <div className="canvas-step-wrap" key={step.id}>
                <div className="connector-pro" />
                <article
                  className={`flow-card-pro ${selectedStepIndex === index ? "selected" : ""}`}
                  onClick={() => setSelectedStepIndex(index)}
                >
                  <div className="node-head-pro">
                    <span className="node-icon">{stepIcon(step.type)}</span>
                    <span>{STEP_LABELS[step.type]}</span>
                    <em>#{index + 1}</em>
                  </div>
                  <h3>{STEP_LABELS[step.type]}</h3>
                  <p>{getStepSubtitle(step)}</p>
                  {step.buttons.length > 0 ? <small>{step.buttons.length} inline-кнопок</small> : <small>Кнопок нет</small>}
                  <div className="node-tools">
                    <button type="button" onClick={(event) => { event.stopPropagation(); moveStep(index, -1); }} disabled={index === 0}>↑</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); moveStep(index, 1); }} disabled={index === draft.steps.length - 1}>↓</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); duplicateStep(index); }}>⧉</button>
                    <button type="button" onClick={(event) => { event.stopPropagation(); removeStep(index); }} disabled={draft.steps.length <= 1}>×</button>
                  </div>
                </article>
                <button className="add-between" type="button" onClick={() => addStep("message", index)}>+</button>
              </div>
            ))}
          </div>
        </main>

        <aside className="inspector-pro">
          <div className="inspector-card">
            <div className="inspector-head">
              <div>
                <p className="eyebrow">Библиотека блоков</p>
                <h3>Добавить блок</h3>
              </div>
            </div>

            <div className="block-library">
              <span className="library-title">Контент</span>
              {BLOCKS.filter((block) => block.group === "content").map((block) => (
                <button type="button" className="block-lib-item" onClick={() => addStep(block.type)} key={block.type}>
                  <span>{block.icon}</span>
                  <strong>{block.label}</strong>
                  <small>{block.description}</small>
                </button>
              ))}

              <span className="library-title">Логика</span>
              {BLOCKS.filter((block) => block.group === "logic").map((block) => (
                <button type="button" className="block-lib-item" onClick={() => addStep(block.type)} key={block.type}>
                  <span>{block.icon}</span>
                  <strong>{block.label}</strong>
                  <small>{block.description}</small>
                </button>
              ))}
            </div>
          </div>

          <div className="inspector-card">
            {selectedStep ? (
              <StepInspector
                step={selectedStep}
                index={selectedStepIndex || 0}
                flows={flowOptions}
                onChange={(patch) => selectedStepIndex !== null ? updateStep(selectedStepIndex, patch) : undefined}
                onAddButton={addButton}
                onUpdateButton={updateButton}
                onRemoveButton={removeButton}
                onDuplicate={() => selectedStepIndex !== null ? duplicateStep(selectedStepIndex) : undefined}
                onRemove={() => selectedStepIndex !== null ? removeStep(selectedStepIndex) : undefined}
              />
            ) : (
              <FlowInspector
                draft={draft}
                selectedFlowId={selectedFlowId}
                onChange={updateDraft}
                onDelete={() => deleteFlow()}
                onToggleExisting={updateFlowEnabled}
                existing={flows.find((flow) => flow.id === selectedFlowId)}
              />
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}

function FlowInspector({
  draft,
  selectedFlowId,
  existing,
  onChange,
  onDelete,
  onToggleExisting
}: {
  draft: DraftFlow;
  selectedFlowId: string;
  existing?: Flow;
  onChange: (patch: Partial<DraftFlow>) => void;
  onDelete: () => void;
  onToggleExisting: (flow: Flow, enabled: boolean) => void;
}) {
  return (
    <div className="inspector-form">
      <div className="inspector-head">
        <div>
          <p className="eyebrow">Старт цепочки</p>
          <h3>Вход и триггер</h3>
        </div>
      </div>

      <label className="field-pro">
        <span>Название</span>
        <input value={draft.name} onChange={(event) => onChange({ name: event.target.value })} />
      </label>

      <label className="field-pro">
        <span>Тип входа</span>
        <select value={draft.match_mode} onChange={(event) => onChange({ match_mode: event.target.value as MatchMode })}>
          <option value="command">Команда Telegram /start</option>
          <option value="equals">Сообщение полностью равно</option>
          <option value="contains">Сообщение содержит</option>
          <option value="starts_with">Сообщение начинается</option>
          <option value="any">Любое сообщение</option>
        </select>
      </label>

      <label className="field-pro">
        <span>{draft.match_mode === "command" ? "Команда" : "Триггер"}</span>
        <input
          value={draft.trigger_text}
          placeholder={draft.match_mode === "command" ? "/start" : "привет"}
          disabled={draft.match_mode === "any"}
          onChange={(event) => onChange({ trigger_text: event.target.value })}
        />
      </label>

      <label className="toggle-pro">
        <input type="checkbox" checked={draft.enabled} onChange={(event) => onChange({ enabled: event.target.checked })} />
        <span>Цепочка включена</span>
      </label>

      {existing ? (
        <div className="inspector-actions">
          <button className="mini-button" type="button" onClick={() => onToggleExisting(existing, !existing.enabled)}>
            {existing.enabled ? "Выключить" : "Включить"}
          </button>
          {selectedFlowId !== "new" ? <button className="mini-button danger-lite" type="button" onClick={onDelete}>Удалить</button> : null}
        </div>
      ) : null}

      <div className="hint-box">
        <strong>Подсказка</strong>
        <span>Для главной цепочки обычно ставь: тип “Команда Telegram”, триггер “/start”.</span>
      </div>
    </div>
  );
}

function StepInspector({
  step,
  index,
  flows,
  onChange,
  onAddButton,
  onUpdateButton,
  onRemoveButton,
  onDuplicate,
  onRemove
}: {
  step: FlowStep;
  index: number;
  flows: Array<{ id: string; name: string }>;
  onChange: (patch: Partial<FlowStep>) => void;
  onAddButton: () => void;
  onUpdateButton: (index: number, patch: Partial<FlowButton>) => void;
  onRemoveButton: (index: number) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const canUseButtons = BUTTON_STEP_TYPES.includes(step.type);

  return (
    <div className="inspector-form">
      <div className="inspector-head">
        <div>
          <p className="eyebrow">Блок #{index + 1}</p>
          <h3>{STEP_LABELS[step.type]}</h3>
        </div>
        <div className="node-action-pair">
          <button className="tiny-icon" type="button" onClick={onDuplicate}>⧉</button>
          <button className="tiny-icon danger" type="button" onClick={onRemove}>×</button>
        </div>
      </div>

      <label className="field-pro">
        <span>Тип блока</span>
        <select value={step.type} onChange={(event) => onChange({ type: event.target.value as StepType })}>
          {BLOCKS.map((block) => <option value={block.type} key={block.type}>{block.label}</option>)}
        </select>
      </label>

      {step.type === "message" ? (
        <TextArea label="Текст сообщения" value={step.text} onChange={(value) => onChange({ text: value })} placeholder="Привет! Чем помочь?" />
      ) : null}

      {MEDIA_TYPES.includes(step.type) ? (
        <>
          <label className="field-pro">
            <span>Ссылка или Telegram file_id</span>
            <input value={step.media_url} onChange={(event) => onChange({ media_url: event.target.value })} placeholder="https://... или file_id" />
          </label>
          <TextArea label="Подпись" value={step.text} onChange={(value) => onChange({ text: value })} placeholder="Подпись под медиа" />
        </>
      ) : null}

      {step.type === "delay" ? (
        <label className="field-pro">
          <span>Задержка в секундах</span>
          <input type="number" min={1} max={900} value={step.delay_seconds} onChange={(event) => onChange({ delay_seconds: Number(event.target.value) })} />
          <small>На Vercel безопасно использовать короткие паузы до 20 сек.</small>
        </label>
      ) : null}

      {step.type === "random" ? (
        <TextArea label="Варианты, каждый с новой строки" value={step.text} onChange={(value) => onChange({ text: value })} placeholder="Вариант 1\nВариант 2" />
      ) : null}

      {step.type === "condition" ? (
        <>
          <label className="field-pro">
            <span>Проверка последнего сообщения</span>
            <select value={step.condition_mode} onChange={(event) => onChange({ condition_mode: event.target.value as ConditionMode })}>
              <option value="contains">Содержит</option>
              <option value="equals">Равно</option>
              <option value="starts_with">Начинается</option>
              <option value="any">Всегда true</option>
            </select>
          </label>
          <label className="field-pro">
            <span>Значение условия</span>
            <input value={step.condition_value} disabled={step.condition_mode === "any"} onChange={(event) => onChange({ condition_value: event.target.value })} placeholder="да" />
          </label>
          <FlowSelect label="Если ДА → цепочка" value={step.true_flow_id} flows={flows} onChange={(value) => onChange({ true_flow_id: value })} />
          <FlowSelect label="Если НЕТ → цепочка" value={step.false_flow_id} flows={flows} onChange={(value) => onChange({ false_flow_id: value })} />
        </>
      ) : null}

      {step.type === "jump" ? (
        <FlowSelect label="Запустить цепочку" value={step.target_flow_id} flows={flows} onChange={(value) => onChange({ target_flow_id: value })} />
      ) : null}

      {step.type === "question" ? (
        <>
          <TextArea label="Вопрос пользователю" value={step.text} onChange={(value) => onChange({ text: value })} placeholder="Как вас зовут?" />
          <label className="field-pro">
            <span>Сохранить ответ в переменную</span>
            <input value={step.save_as} onChange={(event) => onChange({ save_as: event.target.value })} placeholder="name" />
          </label>
          <FlowSelect label="После ответа → цепочка" value={step.target_flow_id} flows={flows} onChange={(value) => onChange({ target_flow_id: value })} />
        </>
      ) : null}

      {canUseButtons ? (
        <div className="buttons-editor">
          <div className="buttons-head">
            <h4>Inline-кнопки</h4>
            <button className="mini-button" type="button" onClick={onAddButton}>+ кнопка</button>
          </div>

          {step.buttons.length === 0 ? <div className="empty-small">Кнопок пока нет.</div> : null}

          {step.buttons.map((button, buttonIndex) => (
            <div className="button-config" key={`${button.text}-${buttonIndex}`}>
              <div className="button-config-head">
                <strong>Кнопка {buttonIndex + 1}</strong>
                <button className="tiny-icon danger" type="button" onClick={() => onRemoveButton(buttonIndex)}>×</button>
              </div>
              <label className="field-pro compact">
                <span>Текст</span>
                <input value={button.text} onChange={(event) => onUpdateButton(buttonIndex, { text: event.target.value })} />
              </label>
              <label className="field-pro compact">
                <span>Действие</span>
                <select value={button.type} onChange={(event) => onUpdateButton(buttonIndex, { type: event.target.value as ButtonType })}>
                  <option value="flow">Запустить цепочку</option>
                  <option value="url">Открыть ссылку</option>
                  <option value="reply">Ответить текстом</option>
                </select>
              </label>
              {button.type === "url" ? (
                <label className="field-pro compact">
                  <span>URL</span>
                  <input value={button.url || ""} onChange={(event) => onUpdateButton(buttonIndex, { url: event.target.value })} placeholder="https://..." />
                </label>
              ) : null}
              {button.type === "flow" ? (
                <FlowSelect compact label="Цепочка" value={button.flowId || ""} flows={flows} onChange={(value) => onUpdateButton(buttonIndex, { flowId: value })} />
              ) : null}
              {button.type === "reply" ? (
                <TextArea compact label="Текст ответа" value={button.payload || ""} onChange={(value) => onUpdateButton(buttonIndex, { payload: value })} placeholder="Отправляю информацию..." />
              ) : null}
              <label className="field-pro compact">
                <span>Ряд кнопки</span>
                <input type="number" min={0} max={12} value={button.row ?? buttonIndex} onChange={(event) => onUpdateButton(buttonIndex, { row: Number(event.target.value) })} />
              </label>
            </div>
          ))}
        </div>
      ) : null}

      <div className="hint-box">
        <strong>Переменные</strong>
        <span>В тексте можно писать: {'{first_name}'}, {'{username}'}, {'{last_message}'} или переменную из блока “Вопрос”, например {'{name}'}.</span>
      </div>
    </div>
  );
}

function TextArea({
  label,
  value,
  placeholder,
  compact,
  onChange
}: {
  label: string;
  value: string;
  placeholder?: string;
  compact?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`field-pro ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} rows={compact ? 3 : 6} />
    </label>
  );
}

function FlowSelect({
  label,
  value,
  flows,
  compact,
  onChange
}: {
  label: string;
  value: string;
  flows: Array<{ id: string; name: string }>;
  compact?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className={`field-pro ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Не выбрано</option>
        {flows.map((flow) => <option value={flow.id} key={flow.id}>{flow.name}</option>)}
      </select>
    </label>
  );
}
