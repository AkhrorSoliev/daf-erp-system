import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { MediaBubble } from "./media-bubble";
import type { MessageView } from "./chat-types";

const msg = (over: Partial<MessageView>): MessageView => ({
  id: "m1",
  senderId: 1,
  mine: false,
  kind: "VOICE",
  text: null,
  file: { mime: "audio/webm", sizeBytes: 10, durationSec: 7, purged: false },
  createdAt: "2026-10-25T10:00:00Z",
  ...over,
});

const render = (m: MessageView) =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(MediaBubble, { message: m }),
    ),
  );

describe("MediaBubble", () => {
  it("purged file is a muted line", () => {
    const html = render(
      msg({ file: { mime: "x", sizeBytes: null, durationSec: null, purged: true } }),
    );
    expect(html).toContain("Fayl o&#x27;chirilgan");
    expect(html).not.toContain("<audio");
  });
  it("voice shows the stored length and a play button, no link yet", () => {
    const html = render(msg({}));
    expect(html).toContain("0:07");
    expect(html).toContain("<audio");
    expect(html).toContain("Eshitish");
  });
  it("image waits for its link with a skeleton, not a broken img", () => {
    const html = render(msg({ kind: "IMAGE" }));
    expect(html).not.toContain("<img");
  });
});
