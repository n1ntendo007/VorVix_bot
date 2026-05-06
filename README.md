# VorVix_bot

VorVix_bot is a Next.js + Vercel project for controlling Telegram bots with simple logic chains.

## What is included

- Login and registration by username and password.
- First-user lock: by default only the first account can register.
- Telegram bot token connection.
- Automatic Telegram webhook setup when `APP_URL` is configured.
- Basic chains: if incoming text equals or contains a trigger, send a response.
- Dark programmer-style interface.
- Vercel-ready API routes.

## Setup

### 1. Create a database

Use Vercel Postgres, Neon, Supabase Postgres, or another hosted PostgreSQL database.

### 2. Add environment variables in Vercel

Open your Vercel project:

`Settings -> Environment Variables`

Add:

```env
POSTGRES_URL="postgres://USER:PASSWORD@HOST:PORT/DATABASE?sslmode=require"
APP_SECRET="a_long_random_string"
APP_URL="https://your-domain.vercel.app"
SETUP_SECRET="a_random_setup_secret"
ALLOW_PUBLIC_REGISTRATION="false"
```

Do not use `NEXT_PUBLIC_` for bot tokens or secrets.

### 3. Deploy

Push this project to GitHub and connect it to Vercel.

### 4. Create tables

After deploy, open:

```text
https://your-domain.vercel.app/api/setup?secret=YOUR_SETUP_SECRET
```

You should see:

```json
{"ok":true}
```

### 5. Register your admin account

Open the site, register the first account, then log in.

### 6. Add a Telegram bot

Create a bot in Telegram through BotFather, copy its token, then paste it in the dashboard.

If `APP_URL` is correct, the webhook will be set automatically.

## Local development

```bash
cp .env.example .env.local
npm install
npm run dev
```

Then open:

```text
http://localhost:3000
```

For local Telegram webhooks, use a public tunnel such as ngrok and set `APP_URL` to the tunnel URL.

## Important notes

- This MVP stores bot tokens encrypted with `APP_SECRET`.
- It is built for personal/small usage.
- Vercel file storage is not used for app data; all persistent data is in PostgreSQL.
- If you delete a bot in VorVix_bot, its Telegram webhook is also removed when possible.
