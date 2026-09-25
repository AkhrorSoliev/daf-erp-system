import { afterEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ default: { post } }));

// Invented payloads in the signed format `employee_<branch>_roles_<ids>_t_<issued>_sig_<hmac>`.
const FIRST_PAYLOAD = "employee_7_roles_4_t_sy2k1c_sig_q3Xv9LmN0pRs";
const SECOND_PAYLOAD = "employee_7_roles_4_t_sy2k9w_sig_Hb7tYc2WdK4e";

const minted = (payload: string) => ({ data: { payload }, status: 201 });

/**
 * `NEXT_PUBLIC_TELEGRAM_BOT` is read once, when `telegram-link` is first
 * imported, so each test loads a fresh copy with the env it needs.
 */
async function loadWithBot(bot: string) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_TELEGRAM_BOT", bot);
  return import("./use-teacher-registration-link");
}

afterEach(() => {
  vi.unstubAllEnvs();
  post.mockReset();
});

describe("mintTeacherRegistrationLink", () => {
  it("asks the server to sign a Teacher link for the branch and returns it as a bot link", async () => {
    post.mockResolvedValueOnce(minted(FIRST_PAYLOAD));
    const { mintTeacherRegistrationLink } = await loadWithBot("daf_test_bot");

    await expect(mintTeacherRegistrationLink(7)).resolves.toBe(
      `https://t.me/daf_test_bot?start=${FIRST_PAYLOAD}`,
    );
    expect(post).toHaveBeenCalledWith("/telegram/employee-link", {
      branchId: 7,
      roleIds: [4],
    });
  });

  it("asks the server again on every call instead of caching a link", async () => {
    // A link dies three days after it is minted (ADR-0029), so a cached one
    // would reach a copy made from a tab opened last week.
    post
      .mockResolvedValueOnce(minted(FIRST_PAYLOAD))
      .mockResolvedValueOnce(minted(SECOND_PAYLOAD));
    const { mintTeacherRegistrationLink } = await loadWithBot("daf_test_bot");

    await mintTeacherRegistrationLink(7);
    await expect(mintTeacherRegistrationLink(7)).resolves.toBe(
      `https://t.me/daf_test_bot?start=${SECOND_PAYLOAD}`,
    );
    expect(post).toHaveBeenCalledTimes(2);
  });

  it("resolves null rather than throwing when the server refuses", async () => {
    post.mockRejectedValueOnce({
      response: {
        status: 403,
        data: { message: "Siz faqat o'z filialingiz uchun havola yarata olasiz" },
      },
    });
    const { mintTeacherRegistrationLink } = await loadWithBot("daf_test_bot");

    await expect(mintTeacherRegistrationLink(7)).resolves.toBeNull();
  });

  it("resolves null, never a t.me/undefined link, when the bot is not configured", async () => {
    post.mockResolvedValueOnce(minted(FIRST_PAYLOAD));
    const { mintTeacherRegistrationLink } = await loadWithBot("");

    await expect(mintTeacherRegistrationLink(7)).resolves.toBeNull();
  });
});
