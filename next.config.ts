import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    // 페이지 이동을 빠르게: 하단 메뉴가 탭을 미리 받아 두고(prefetch), 한 번 받은 화면은 30초 동안 다시 쓴다.
    // 30초는 Next가 허용하는 가장 짧은 값이라, 상대가 바꾼 내용도 길어야 30초 안에 새로 보인다.
    // 내가 저장·답장하면 서버 액션의 revalidatePath가 이 캐시를 비우므로 내 변경은 바로 보인다.
    staleTimes: { dynamic: 30, static: 30 },
  },
};

export default nextConfig;
