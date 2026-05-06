import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { getSession } from "@/lib/auth";

export default async function HomePage() {
  const session = await getSession();

  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="hero">
      <section className="hero-card">
        <div className="brand-panel">
          <div className="logo">
            <span className="logo-mark">VX</span>
            VorVix_bot
          </div>

          <h1 style={{ marginTop: 28 }}>Панель для Telegram-ботов</h1>

          <p className="lead">
            Подключай токен бота, создавай простые логические цепочки и управляй
            ответами прямо из веб-панели. Минимальный фундамент в стиле BotHelp,
            но сделанный под твой собственный хостинг.
          </p>

          <div className="kbd-row">
            <span className="kbd">if message == trigger</span>
            <span className="kbd">send response</span>
            <span className="kbd">webhook ready</span>
            <span className="kbd">Vercel + Postgres</span>
          </div>
        </div>

        <AuthForm />
      </section>
    </main>
  );
}
