# VorVix_bot v2

Панель для Telegram-ботов на Next.js + Vercel + PostgreSQL/Neon.

## Что есть в v2

- вход и регистрация по логину/паролю;
- подключение Telegram-бота по токену;
- visual flow builder в стиле BotHelp;
- цепочки с триггерами:
  - равно сообщению;
  - содержит текст;
  - начинается с текста;
  - Telegram-команда;
  - любое сообщение;
- блоки цепочки:
  - текстовое сообщение;
  - фото по URL или Telegram file_id;
  - видео по URL или Telegram file_id;
  - задержка;
- inline-кнопки:
  - кнопка-ссылка;
  - кнопка-переход на другую цепочку;
- включение/выключение бота и цепочек;
- обновление webhook из панели.

## Обновление уже установленного проекта

1. Замени файлы в GitHub на файлы из этой папки.
2. В Vercel сделай Redeploy.
3. Открой setup:

```text
https://ТВОЙ-ДОМЕН.vercel.app/api/setup?secret=ТВОЙ_SETUP_SECRET
```

Должно вернуть:

```json
{"ok":true,"version":"vorvix_bot_v2"}
```

4. Открой бота в панели и нажми кнопку `Webhook`, чтобы Telegram начал присылать callback_query от inline-кнопок.

## Environment Variables

```env
POSTGRES_URL="postgresql://...-pooler.../neondb?sslmode=require"
APP_SECRET="длинная_секретная_строка"
APP_URL="https://твой-домен.vercel.app"
SETUP_SECRET="секрет_для_setup"
ALLOW_PUBLIC_REGISTRATION="false"
```

## Важно про задержки

Задержки работают прямо внутри webhook. Для Vercel надежный MVP-лимит — до 20 секунд. Для длинных автоворонок на минуты/часы нужна очередь задач или отдельный воркер.
