import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CapturePanel } from "./CapturePanel.js";

const requestNative = vi.fn<() => Promise<unknown>>();
const refresh = vi.fn<() => Promise<unknown>>();

const nativeMock: {
  id: string;
  kind: "native";
  label: string;
  available: boolean;
  reason: string | null;
} = { id: "native", kind: "native", label: "Native", available: true, reason: null };
const stateMock: { permissions: Record<string, string> } = { permissions: {} };
const provideNative = { value: true };

vi.mock("../../state/capture-context.js", () => ({
  useSmsCapture: () => ({
    native: provideNative.value ? nativeMock : null,
    state: stateMock,
    requestNativePermission: requestNative,
    refreshPermissions: refresh,
  }),
}));

describe("CapturePanel", () => {
  beforeEach(() => {
    requestNative.mockReset();
    refresh.mockReset();
    provideNative.value = true;
    nativeMock.available = true;
    nativeMock.reason = null;
    stateMock.permissions = {};
  });

  it("is empty when no native source is configured", () => {
    provideNative.value = false;
    const { container } = render(<CapturePanel />);
    expect(container.firstChild).toBeNull();
  });

  it("shows an informational banner in a browser (native unavailable)", () => {
    nativeMock.available = false;
    nativeMock.reason = "No native layer.";
    render(<CapturePanel />);
    expect(screen.getByText(/automatic capture needs the app/i)).toBeInTheDocument();
    expect(screen.getByText(/browser pwa cannot read your messages/i)).toBeInTheDocument();
  });

  it("shows auto-capture is on when permission is granted", () => {
    stateMock.permissions = { native: "granted" };
    render(<CapturePanel />);
    expect(screen.getByText(/auto-capture is on/i)).toBeInTheDocument();
  });

  it("offers an allow button when permission is pending and requests it on click", async () => {
    stateMock.permissions = { native: "prompt" };
    requestNative.mockResolvedValue({ state: "granted" });
    refresh.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<CapturePanel />);

    await user.click(screen.getByRole("button", { name: /allow access/i }));
    expect(requestNative).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalled();
  });

  it("notes manual fallback when permission is denied", () => {
    stateMock.permissions = { native: "denied" };
    render(<CapturePanel />);
    expect(screen.getByText(/access was denied/i)).toBeInTheDocument();
    expect(screen.getByText(/paste messages manually/i)).toBeInTheDocument();
  });
});
