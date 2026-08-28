import { useAuth } from "../../state/auth-context.js";
import { useAsyncTask } from "../../lib/use-api.js";
import { PageHeader } from "../../components/ui/page.js";
import { Card, CardHeader } from "../../components/ui/Card.js";
import { Button } from "../../components/ui/Button.js";
import { LogoutIcon } from "../../components/ui/icons.js";
import { CategoriesManager } from "./CategoriesManager.js";
import { PaymentMethodsManager } from "./PaymentMethodsManager.js";

export function SettingsPage() {
  const { user, logout, logoutAll } = useAuth();
  const single = useAsyncTask(() => logout());
  const all = useAsyncTask(() => logoutAll());

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Manage your account, categories and payment methods."
      />

      <Card>
        <CardHeader title="Account" subtitle="Sign in details and session control." />
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3 rounded-lg bg-raised p-3">
            <span className="text-text-muted">Email</span>
            <span className="font-medium text-text-primary">{user?.email ?? "—"}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" loading={single.loading} onClick={() => void single.run()}>
              <LogoutIcon size={16} /> Sign out of this device
            </Button>
            <Button variant="ghost" loading={all.loading} onClick={() => void all.run()}>
              Sign out everywhere
            </Button>
          </div>
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="Categories" subtitle="Organise your income, expense and transfer lines." />
        </div>
        <div className="px-4 pb-5 sm:px-5">
          <CategoriesManager />
        </div>
      </Card>

      <Card padded={false}>
        <div className="p-4 sm:p-5">
          <CardHeader title="Payment methods" subtitle="UPI, cards, banks and wallets you use." />
        </div>
        <div className="px-4 pb-5 sm:px-5">
          <PaymentMethodsManager />
        </div>
      </Card>
    </div>
  );
}
