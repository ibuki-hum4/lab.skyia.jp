// 手元の開発用に、ニセの HoshID を http://127.0.0.1:9999 で立てる。
//   bun run dev:oidc
// .env の HOSHID_ISSUER を http://127.0.0.1:9999、HOSHID_CLIENT_ID と HOSHID_CLIENT_SECRET を下の値にする(.env.example)。
// ログインのボタンを押すと、ユーザーを選ぶ画面が出る。
import { startFakeOidc } from "../test/fake-oidc";

const fake = await startFakeOidc({ clientId: "lab-dev", clientSecret: "lab-dev-secret", port: 9999, interactive: true });
console.log(`ニセの HoshID: ${fake.issuer}(client_id: lab-dev / client_secret: lab-dev-secret)`);
