import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  leadConvertedLabel,
  useLeadsBoard,
  type LeadBoardColumn,
  type LeadCard,
} from "./use-leads-board";

const { get, patch } = vi.hoisted(() => ({
  get: vi.fn<(url: string) => Promise<unknown>>(),
  patch: vi.fn<(url: string, body?: unknown) => Promise<unknown>>(),
}));
vi.mock("@/lib/api", () => ({ default: { get, patch } }));
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
  patch.mockReset();
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

const column = (
  id: string,
  sectionIds: string[],
  branchId = 1,
): LeadBoardColumn => ({
  id,
  name: id,
  order: 0,
  isSystem: false,
  systemKey: null,
  branchId,
  branch: { id: branchId, name: `B${branchId}` },
  sections: sectionIds.map((s) => ({ id: s, name: s, order: 0, leadCount: 0 })),
});

describe("fetchSectionLeads failure", () => {
  it("marks the section failed and clears the mark on success", async () => {
    get.mockRejectedValueOnce(new Error("net"));
    await state().fetchSectionLeads("s1");
    expect(state().failedSections.has("s1")).toBe(true);
    expect(state().loadedSections.has("s1")).toBe(false);
    get.mockResolvedValueOnce({ data: [card("a")] });
    await state().fetchSectionLeads("s1");
    expect(state().failedSections.has("s1")).toBe(false);
  });
});

describe("persistLeadMove", () => {
  it("keeps the move and re-reads the target when only the reorder fails", async () => {
    useLeadsBoard.setState({
      leadsBySection: { s1: [card("a")], s2: [] },
      loadedSections: new Set(["s1", "s2"]),
    });
    state().captureDragSnapshot();
    state().moveLeadLocal({ leadId: "a", fromSectionId: "s1", toSectionId: "s2", toIndex: 0 });
    patch
      .mockResolvedValueOnce({ data: card("a") }) // move
      .mockRejectedValueOnce(new Error("reorder"));
    get.mockResolvedValueOnce({ data: [card("a")] });
    const rev = state().revision;
    await state().persistLeadMove({
      leadId: "a",
      toSectionId: "s2",
      toLeadIds: ["a"],
    });
    await vi.waitFor(() => expect(get).toHaveBeenCalledWith("/leads/sections/s2/leads"));
    expect(state().dragSnapshot).toBeNull();
    expect(state().leadsBySection.s2.map((l) => l.id)).toEqual(["a"]);
    expect(state().leadsBySection.s1).toEqual([]);
    expect(state().revision).toBe(rev + 1);
  });

  it("rolls back when the move itself fails", async () => {
    useLeadsBoard.setState({ leadsBySection: { s1: [card("a")], s2: [] } });
    state().captureDragSnapshot();
    state().moveLeadLocal({ leadId: "a", fromSectionId: "s1", toSectionId: "s2", toIndex: 0 });
    patch.mockRejectedValueOnce(new Error("move"));
    const rev = state().revision;
    await state().persistLeadMove({ leadId: "a", toSectionId: "s2", toLeadIds: ["a"] });
    expect(state().leadsBySection.s1.map((l) => l.id)).toEqual(["a"]);
    expect(state().revision).toBe(rev);
  });
});

describe("persistSectionMove", () => {
  it("re-reads the board instead of rolling back when only the reorder fails", async () => {
    useLeadsBoard.setState({ board: [column("c1", []), column("c2", ["x"])] });
    state().captureDragSnapshot();
    patch.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("reorder"));
    get.mockResolvedValueOnce({ data: [column("c1", []), column("c2", ["x"])] });
    await state().persistSectionMove({ sectionId: "x", toColumnId: "c2", toSectionIds: ["x"] });
    expect(get).toHaveBeenCalledWith("/leads/board");
    expect(state().dragSnapshot).toBeNull();
    expect(state().loadingBoard).toBe(false);
  });
});

describe("moveLead (dialog)", () => {
  it("adds the server card to a loaded target when the source was never loaded", async () => {
    useLeadsBoard.setState({
      board: [column("c1", ["s1", "s2"])],
      leadsBySection: { s2: [] },
    });
    patch.mockResolvedValueOnce({ data: card("a") });
    await state().moveLead("a", "s1", "s2");
    expect(state().leadsBySection.s2.map((l) => l.id)).toEqual(["a"]);
  });
});

describe("applySectionRemove", () => {
  it("bumps revision", () => {
    useLeadsBoard.setState({ board: [column("c1", ["s1"])] });
    const rev = state().revision;
    state().applySectionRemove("c1", "s1");
    expect(state().board[0].sections).toEqual([]);
    expect(state().revision).toBe(rev + 1);
  });
});

describe("moveColumn", () => {
  it("does nothing on a board that spans several branches", async () => {
    const board = [column("c1", [], 1), column("c2", [], 2)];
    useLeadsBoard.setState({ board });
    await state().moveColumn("c1", "right");
    expect(patch).not.toHaveBeenCalled();
    expect(state().board).toBe(board);
  });
});

describe("leadConvertedLabel", () => {
  const up = (source: string) => source.toUpperCase();

  it("keeps the Uzbek text without a translator", () => {
    expect(leadConvertedLabel("CONVERTED", null)).toBe("O'quvchiga aylangan");
    expect(leadConvertedLabel("CONVERTED", "LINKED_TO_EXISTING")).toBe("Mavjud o'quvchiga biriktirilgan");
    expect(leadConvertedLabel("LOST", null)).toBe("Yo'qotilgan");
  });

  it("translates the converted texts and leaves other statuses to their own label", () => {
    expect(leadConvertedLabel("CONVERTED", null, up)).toBe("O'QUVCHIGA AYLANGAN");
    expect(leadConvertedLabel("CONVERTED", "LINKED_TO_EXISTING", up)).toBe("MAVJUD O'QUVCHIGA BIRIKTIRILGAN");
    expect(leadConvertedLabel("LOST", null, up)).toBe("Yo'qotilgan");
  });
});
