import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { Password } from "@convex-dev/auth/providers/Password";
import { toHex } from "./_shared/encoding";

function allowedEmails(): Set<string> {
  const raw = process.env.AUTH_ALLOWED_EMAILS ?? "";

  return new Set(
    raw
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        if (!process.env.JWT_PRIVATE_KEY) {
          throw new ConvexError(
            "로그인 키가 백엔드에 설정되어 있지 않습니다.",
          );
        }

        const email =
          typeof params.email === "string"
            ? params.email.trim().toLowerCase()
            : "";

        if (!email) {
          throw new ConvexError("이메일을 입력해 주세요.");
        }

        const allowed = allowedEmails();

        // Fail closed:
        // AUTH_ALLOWED_EMAILS가 비어 있어도 아무 계정이나 허용하지 않는다.
        if (!allowed.has(email)) {
          throw new ConvexError(
            "이 서비스에 허용되지 않은 계정입니다.",
          );
        }

        const flow =
          typeof params.flow === "string"
            ? params.flow
            : "";

        // 초기 계정 생성이 끝난 뒤 AUTH_SIGNUP_ENABLED=0으로 변경한다.
        if (
          flow === "signUp" &&
          process.env.AUTH_SIGNUP_ENABLED !== "1"
        ) {
          throw new ConvexError(
            "회원가입이 비활성화되어 있습니다.",
          );
        }

        const name =
          typeof params.name === "string"
            ? params.name.trim()
            : "";

        return {
          email,
          ...(name ? { name } : {}),
        };
      },

      crypto: {
        async hashSecret(password: string) {
          const salt =
            crypto.getRandomValues(new Uint8Array(16));

          const encoder = new TextEncoder();

          const keyMaterial =
            await crypto.subtle.importKey(
              "raw",
              encoder.encode(password),
              "PBKDF2",
              false,
              ["deriveBits"],
            );

          const hashBuffer =
            await crypto.subtle.deriveBits(
              {
                name: "PBKDF2",
                salt,
                iterations: 10000,
                hash: "SHA-256",
              },
              keyMaterial,
              256,
            );

          const hashHex =
            toHex(new Uint8Array(hashBuffer));

          const saltHex =
            toHex(salt);

          return `pbkdf2_${saltHex}_${hashHex}`;
        },

        async verifySecret(
          password: string,
          hash: string,
        ) {
          if (hash.startsWith("pt_")) {
            return hash === `pt_${password}`;
          }

          const parts = hash.split("_");

          if (
            parts[0] !== "pbkdf2" ||
            parts.length !== 3
          ) {
            return false;
          }

          const matches =
            parts[1].match(/.{2}/g);

          if (!matches) {
            return false;
          }

          const salt = new Uint8Array(
            matches.map((byte) =>
              parseInt(byte, 16),
            ),
          );

          const encoder = new TextEncoder();

          const keyMaterial =
            await crypto.subtle.importKey(
              "raw",
              encoder.encode(password),
              "PBKDF2",
              false,
              ["deriveBits"],
            );

          const hashBuffer =
            await crypto.subtle.deriveBits(
              {
                name: "PBKDF2",
                salt,
                iterations: 10000,
                hash: "SHA-256",
              },
              keyMaterial,
              256,
            );

          const hashHex =
            toHex(new Uint8Array(hashBuffer));

          return hashHex === parts[2];
        },
      },
    }),
  ],
});
