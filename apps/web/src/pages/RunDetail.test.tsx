import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { RunDetail } from "./RunDetail";

// Test names and failure output come from uploaded reports, so they're untrusted. They must
// render as text, never as markup (stored XSS).
it("renders uploaded failure output as text", async () => {
  const payload = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "11111111-1111-1111-1111-111111111111",
          project: "p",
          branch: "main",
          commit_sha: null,
          suite_name: "s",
          started_at: "2026-09-29T10:00:00Z",
          duration_ms: 10,
          total: 1,
          passed: 0,
          failed: 1,
          errored: 0,
          skipped: 0,
          cases: [{ suite: "s", classname: "c", name: payload, status: "failed", duration_ms: 1, failure_message: payload }],
        }),
      ),
    ),
  );
  const { container } = render(
    <MemoryRouter initialEntries={["/runs/11111111-1111-1111-1111-111111111111"]}>
      <Routes>
        <Route path="/runs/:id" element={<RunDetail />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findAllByText(payload)).toHaveLength(2);
  expect(container.querySelector("img, script")).toBeNull();
});
