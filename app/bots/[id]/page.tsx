import { redirect } from "next/navigation";
import BotClient from "@/components/BotClient";
import Header from "@/components/Header";
import { getSession } from "@/lib/auth";

export default async function BotPage({ params }: { params: { id: string } }) {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  return (
    <main className="page">
      <Header username={session.username} />
      <BotClient botId={params.id} />
    </main>
  );
}
