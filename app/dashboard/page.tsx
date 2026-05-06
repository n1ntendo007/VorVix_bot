import { redirect } from "next/navigation";
import DashboardClient from "@/components/DashboardClient";
import Header from "@/components/Header";
import { getSession } from "@/lib/auth";

export default async function DashboardPage() {
  const session = await getSession();

  if (!session) {
    redirect("/");
  }

  return (
    <main className="page">
      <Header username={session.username} />
      <DashboardClient />
    </main>
  );
}
