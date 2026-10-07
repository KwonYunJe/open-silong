import type { Metadata } from "next";
import { SetupClient } from "./SetupClient";
import { SetupGate } from "./SetupGate";

export const metadata: Metadata = {
  title: "Setup — Silong",
  description: "최초 실행 설정: 이 워크스페이스의 관리자 계정을 만듭니다.",
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center p-6">
        <div className="space-y-2 pb-6">
          <h1 className="text-2xl font-semibold tracking-tight">워크스페이스 설정</h1>
          <p className="text-sm text-muted-foreground">
            새 Silong 인스턴스입니다. 아래 단계를 완료하면
            워크스페이스를 사용할 수 있습니다.
          </p>
        </div>
        <SetupGate>
          <SetupClient />
        </SetupGate>
      </div>
    </main>
  );
}
