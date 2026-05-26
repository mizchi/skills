import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.BASE_URL || "http://127.0.0.1:4000";

export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<200"],
  },
};

export default function () {
  const healthz = http.get(`${baseUrl}/healthz`);
  check(healthz, {
    "healthz returns 200": (response) => response.status === 200,
  });

  const root = http.get(`${baseUrl}/`);
  check(root, {
    "root returns 200 or 404": (response) =>
      response.status === 200 || response.status === 404,
  });

  sleep(1);
}
