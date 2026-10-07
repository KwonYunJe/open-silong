import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthForm } from "./AuthForm";
import { AuthClient } from "./AuthClient";
import { DemoGuestEntry } from "./DemoGuestEntry";
import { SetupPointer } from "./SetupPointer";

export const metadata: Metadata = {
  title: "로그인",
  description: "Silong 워크스페이스에 로그인",
  robots: { index: false, follow: false },
};

export default function AuthPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-4 p-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          홈으로 돌아가기
        </Link>
        <div className="space-y-6 rounded-xl border p-8 shadow-sm">
          <DemoGuestEntry />
          <Suspense fallback={<AuthForm />}>
            <AuthClient>
              <AuthForm />
            </AuthClient>
          </Suspense>
        </div>
        <SetupPointer />
      </div>
    </div>
  );
}
