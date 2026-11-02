// 브라우저 두 개로 기록자·파트너 흐름 확인: 서버를 3100 포트로 켠 뒤 `node scripts/e2e-flow.cjs` (playwright 필요)

const { chromium } = require("playwright");
const BASE = "http://localhost:3100";
const shots = require("node:os").tmpdir();
(async () => {
  const browser = await chromium.launch();
  const opts = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: "ko-KR", timezoneId: "Asia/Seoul" };
  const me = await (await browser.newContext(opts)).newPage();
  const you = await (await browser.newContext(opts)).newPage();
  const errors = [];
  for (const p of [me, you]) p.on("pageerror", (e) => errors.push(e.message));
  const step = async (name, fn) => { try { await fn(); console.log("ok  ", name); } catch (e) { console.log("FAIL", name, e.message.split("\n")[0]); throw e; } };

  await step("기록자 가입", async () => {
    await me.goto(BASE + "/signup");
    await me.screenshot({ path: `${shots}/01-signup.png`, fullPage: true });
    await me.fill('input[name=nickname]', "지민");
    await me.fill('input[name=email]', "jimin@example.com");
    await me.fill('input[name=password]', "password-1");
    for (const name of ["ageConfirmed", "healthConsent", "transferConsent"]) await me.check(`input[name=${name}]`);
    await me.click('button[type=submit]');
    await me.waitForURL(BASE + "/");
    await me.getByText("기록이 쌓이면 달이 차올라요").waitFor();
    await me.screenshot({ path: `${shots}/02-home-empty.png`, fullPage: true });
  });

  await step("지난 기록 4번 입력", async () => {
    await me.goto(BASE + "/report");
    await me.click('summary:has-text("직접 입력·전체 기록")');
    const list = [["2026-07-15", "2026-07-19"], ["2026-08-12", "2026-08-16"], ["2026-09-09", "2026-09-13"], ["2026-10-07", "2026-10-11"]];
    for (let i = 0; i < list.length; i++) {
      await me.fill('input[name=startDate]', list[i][0]);
      await me.fill('input[name=endDate]', list[i][1]);
      await me.click('button:has-text("기록하기")');
      await me.getByText(`지난 기록 ${i + 1}번`).waitFor();
      await me.waitForFunction(() => document.querySelector("input[name=startDate]").value === "");
    }
    // 겹치는 날짜는 거부
    await me.fill('input[name=startDate]', "2026-10-09");
    await me.fill('input[name=endDate]', "");
    await me.click('button:has-text("기록하기")');
    await me.getByText("다른 생리 기록과 날짜가 겹쳐요").waitFor();
    await me.goto(BASE + "/report");
    await me.screenshot({ path: `${shots}/03-report.png`, fullPage: true });
  });

  await step("홈에 예측 표시", async () => {
    await me.goto(BASE + "/");
    await me.getByText("다음 생리까지").waitFor();
    await me.screenshot({ path: `${shots}/04-home-prediction.png`, fullPage: true });
  });

  let code;
  await step("연결 코드 만들기", async () => {
    await me.goto(BASE + "/connect");
    await me.click('button:has-text("연결 코드 만들기")');
    const el = me.locator("p.font-mono");
    await el.waitFor();
    code = (await el.textContent()).trim();
    await me.screenshot({ path: `${shots}/05-invite.png`, fullPage: true });
  });

  await step("파트너 가입 + 코드 입력", async () => {
    await you.goto(BASE + "/signup");
    await you.fill('input[name=nickname]', "도윤");
    await you.fill('input[name=email]', "doyun@example.com");
    await you.fill('input[name=password]', "password-2");
    for (const name of ["ageConfirmed", "healthConsent", "transferConsent"]) await you.check(`input[name=${name}]`);
    await you.click('button[type=submit]');
    await you.waitForURL(BASE + "/");
    await you.getByText("기록이 쌓이면 달이 차올라요").waitFor();
    await you.goto(BASE + "/connect");
    await you.fill('input[name=code]', code.toLowerCase());
    await you.click('button:has-text("다음")');
    await you.click('button:has-text("연결하기")');
    await you.getByText("지민님과 연결돼 있어요").waitFor();
  });

  await step("바로 연결 → 기록자에게 보이고 공유는 기본 꺼짐", async () => {
    await me.goto(BASE + "/");
    await me.getByText("도윤님과 연결됨").waitFor();
    await me.goto(BASE + "/connect");
    await me.getByText("도윤님과 연결됨").waitFor();
    await you.goto(BASE + "/");
  });

  await step("연결 화면: 파트너에게 보이는 것", async () => {
    await you.goto(BASE + "/connect");
    await you.getByText("가임기·배란일 (추정)").waitFor();
    await me.goto(BASE + "/connect");
    await me.screenshot({ path: `${shots}/06-sharing.png`, fullPage: true });
  });

  await step("배려 요청 보내기", async () => {
    await me.goto(BASE + "/");
    await me.click('summary:has-text("오늘 필요한 배려")');
    await me.locator("label", { hasText: "따뜻한 거 같이 먹고 싶어" }).click();
    await me.locator("label", { hasText: "해결책보다 공감해 줘" }).click();
    await me.fill('input[name=message]', "오늘 배가 좀 아파");
    await me.click('button:has-text("남기기")');
    await me.locator('button:has-text("바꾸기")').waitFor();
  });

  await step("파트너 화면: 허용된 것만 + 답장", async () => {
    await you.goto(BASE + "/");
    await you.getByText("다음 생리까지").waitFor();
    await you.getByText("따뜻한 거 같이 먹고 싶어").waitFor();
    const body = await you.textContent("body");
    if (body.includes("최근 기록")) throw new Error("기록 공유를 안 켰는데 최근 기록이 보임");
    await you.click('button:has-text("도와줄게요")');
    await you.locator('button.bg-accent:has-text("도와줄게요")').waitFor();
    await you.screenshot({ path: `${shots}/07-partner-home.png`, fullPage: true });
  });

  await step("기록자에게 답장 표시", async () => {
    await me.goto(BASE + "/");
    await me.getByText("도윤 · 도와줄게요").waitFor();
    await me.screenshot({ path: `${shots}/08-home-response.png`, fullPage: true });
  });

  await step("오늘 시작 → 며칠째 표시 → 파트너 쪽은 기록 공유 꺼져 있어 안 보임", async () => {
    await me.click('button:has-text("오늘 시작했어요")');
    await me.getByText("생리 1일째").waitFor();
    await me.screenshot({ path: `${shots}/09-home-period.png`, fullPage: true });
    await you.goto(BASE + "/");
    await you.getByText("생리 1일째").waitFor();
  });

  await step("일시정지 → 파트너는 아무것도 안 보임", async () => {
    await me.goto(BASE + "/connect");
    await me.getByRole("switch", { name: "잠시 멈추기" }).click();
    await me.locator('[role=switch][aria-label="잠시 멈추기"][aria-checked=true]').waitFor();
    await me.waitForTimeout(500);
    await you.goto(BASE + "/");
    await you.getByText("잠시 쉬는 중").waitFor();
    const body = await you.textContent("body");
    if (body.includes("따뜻한 거")) throw new Error("일시정지인데 배려 요청이 보임");
  });

  await step("연결 끊기 → 파트너가 기록자 화면으로 돌아옴", async () => {
    await you.goto(BASE + "/me/settings");
    await you.click('li > button:has-text("연결 끊기")');
    await you.click('dialog[open] button:text-is("끊기")');
    await you.locator('li > button:has-text("연결 끊기")').waitFor({ state: "detached" });
    await you.goto(BASE + "/");
    await you.getByText("기록이 쌓이면 달이 차올라요").waitFor();
  });

  await step("로그아웃 → 로그인", async () => {
    await me.goto(BASE + "/me/settings");
    await me.click('li > div > button:has-text("로그아웃")');
    await me.click('dialog[open] button:has-text("로그아웃")');
    await me.getByText("처음이에요").waitFor();
    if (!me.url().endsWith("/login")) throw new Error("로그인 화면으로 안 감: " + me.url());
    await me.screenshot({ path: `${shots}/10-login.png`, fullPage: true });
    await me.fill('input[name=email]', "jimin@example.com");
    await me.fill('input[name=password]', "wrong-password");
    await me.click('button[type=submit]');
    await me.getByText("이메일 또는 비밀번호를 확인해 주세요").waitFor();
    if ((await me.inputValue("input[name=email]")) !== "jimin@example.com") throw new Error("오류 후 이메일이 지워짐");
    await me.fill('input[name=password]', "password-1");
    await me.click('button[type=submit]');
    await me.getByText("생리 1일째").waitFor();
  });

  console.log("page errors:", errors.length ? errors : "none");
  await browser.close();
})().catch((e) => { process.exitCode = 1; });
