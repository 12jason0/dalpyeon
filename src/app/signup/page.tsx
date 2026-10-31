import { redirect } from "next/navigation";
import { kakaoEnabled } from "@/lib/services/kakao";
import { currentUser } from "@/lib/session";
import { AuthForm } from "../_components/AuthForm";
import { Brand } from "../_components/Brand";
import { KakaoButton } from "../_components/KakaoButton";

export default async function Page() {
  if (await currentUser()) redirect("/");
  return (
    <>
      <Brand />
      {kakaoEnabled() && <KakaoButton />}
      <AuthForm mode="signup" />
    </>
  );
}
