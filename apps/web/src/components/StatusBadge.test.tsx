import { render, screen } from "@testing-library/react";
import { StatusBadge } from "./StatusBadge";

it("labels status with text, not colour alone", () => {
  render(<StatusBadge status="failed" />);
  expect(screen.getByText("failed")).toHaveClass("badge-failed");
});
