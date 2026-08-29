import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { RegisterPage } from "./RegisterPage.js";

const register = vi.fn();
const navigate = vi.fn();

vi.mock("../../state/auth-context.js", () => ({
  useAuth: () => ({ user: null, status: "ready", register }),
}));

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => navigate,
  };
});

async function fillAndSubmit(
  user: ReturnType<typeof userEvent.setup>,
  password: string,
  confirm = password,
) {
  await user.type(screen.getByLabelText(/^Name/), "Ada Lovelace");
  await user.type(screen.getByLabelText(/^Email/), "you@example.com");
  await user.type(screen.getByLabelText(/Password/), password);
  if (confirm !== password) {
    await user.clear(screen.getByLabelText(/^Confirm/));
  }
  await user.type(screen.getByLabelText(/^Confirm/), confirm);
  return user.click(screen.getByRole("button", { name: /create account/i }));
}

describe("RegisterPage password validation", () => {
  beforeEach(() => {
    register.mockReset();
    navigate.mockReset();
  });

  it("blocks a too-short password (< 12 chars) and never submits", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await fillAndSubmit(user, "Short1Aa");

    expect(await screen.findByText(/at least 12 characters/)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("blocks a 12+ char password missing a digit/uppercase", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await fillAndSubmit(user, "lowercaseonlyletters");

    expect(await screen.findByText(/a number/)).toBeInTheDocument();
    expect(await screen.findByText(/an uppercase letter/)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("blocks a mismatched confirmation", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await fillAndSubmit(user, "CorrectHorseBattery1", "CorrectHorseBattery2");

    expect(await screen.findByText(/Passwords do not match/)).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("submits when the password satisfies the shared schema", async () => {
    register.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    );
    await fillAndSubmit(user, "CorrectHorseBattery1");

    await waitFor(() => {
      expect(register).toHaveBeenCalledWith({
        email: "you@example.com",
        password: "CorrectHorseBattery1",
        name: "Ada Lovelace",
      });
    });
    await waitFor(() => {
      expect(navigate).toHaveBeenCalledWith("/login", {
        replace: true,
        state: { registered: true },
      });
    });
  });
});
