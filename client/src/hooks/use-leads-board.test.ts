import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLeadsBoard, type LeadCard } from "./use-leads-board";

const { get } = vi.hoisted(() => ({
  get: vi.fn<(url: string) => Promise<unknown>>(),
}));
vi.mock("@/lib/api", () => ({ default: { get } }));
vi.mock("react-hot-toast", () => ({ default: { error: vi.fn() } }));

const card = (id: string, ownerDueAt: string | null = null): LeadCard => ({
  id,
  firstName: id,
  lastName: "",
  phone: "",
  statusEnum: "NEW",
  order: 0,
  createdAt: "2026-10-01T00:00:00Z",
  source: null,
  calledAt: null,
  commentCount: 0,
  owner: null,
  ownerDueAt,
});

const URL = "/leads/sections/s1/leads";
const state = () => useLeadsBoard.getState();

beforeEach(() => {
  useLeadsBoard.setState(useLeadsBoard.getInitialState(), true);
  get.mockReset();
});

describe("fetchSectionLeads", () => {
  it("loads a section once and skips it afterwards", async () => {
    get.mockResolvedValue({ data: [card("a")] });
    await state().fetchSectionLeads("s1");
    await state().fetchSectionLeads("s1");
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(URL);
  });

  it("force re-reads a section that is already loaded", async () => {
    get.mockResolvedValueOnce({ data: [card("a", null)] });
    await state().fetchSectionLeads("s1");
    get.mockResolvedValueOnce({ data: [card("a", "2026-10-20T10:00:00Z")] });
    await state().fetchSectionLeads("s1", true);
    expect(get).toHaveBeenCalledTimes(2);
    expect(state().leadsBySection.s1[0].ownerDueAt).toBe("2026-10-20T10:00:00Z");
  });

  it("force does not start a second request while one is in flight", async () => {
    let resolve!: (v: unknown) => void;
    get.mockReturnValueOnce(new Promise((res) => (resolve = res)));
    const first = state().fetchSectionLeads("s1");
    await state().fetchSectionLeads("s1", true);
    expect(get).toHaveBeenCalledTimes(1);
    resolve({ data: [card("a")] });
    await first;
    expect(state().loadedSections.has("s1")).toBe(true);
  });
});
