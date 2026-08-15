import { redirect } from "next/navigation";
import { Settings } from "lucide-react";
import { getMyProfile } from "@/lib/auth";
import { AccountSettings } from "@/components/AccountSettings";
import { PageHeader } from "@/components/PageHeader";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const profile = await getMyProfile();
  if (!profile) redirect("/");

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-6">
        <PageHeader
          icon={Settings}
          title="Configuración"
          description="Contraseña, correo de recuperación, avisos y tu cuenta."
        />
      </div>

      <AccountSettings
        username={profile.username}
        recoveryEmail={profile.recoveryEmail}
        emailNotifications={profile.emailNotifications}
        hasPassword={profile.hasPassword}
      />
    </div>
  );
}
