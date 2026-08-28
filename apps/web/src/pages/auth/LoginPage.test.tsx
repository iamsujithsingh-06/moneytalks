import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ApiError } from "../../lib/api/index.js";
import { LoginPage } from "./LoginPage.js";

const login = vi.fn();
const navigate = vi.fn();

vi.mock("../../state/auth-context.js", () => ({
  useAuth: () => ({ user: null, status: "ready", login }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

describe("LoginPage", () => {
  beforeEach(() => {
    login.mockReset();
    navigate.mockReset();
  });

  it("submits credentials and navigates to the dashboard", async () => {
    login.mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^Email/), "you@example.com");
    await user.type(screen.getByLabelText(/^Password/), "secret");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith({
        email: "you@example.com",
        password: "secret",
      });
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/dashboard", { replace: true });
    });
  });

  it("shows inline errors when the login task rejects", async () => {
    login.mockRejectedValue(
      new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password"),
    );
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <LoginPage />
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/^Email/), "you@example.com");
    await user.type(screen.getByLabelText(/^Password/), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(screen.getByText("Invalid email or password")).toBeInTheDocument();
    });
  });
});
