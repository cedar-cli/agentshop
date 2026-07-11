import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SellerBackend } from "./SellerBackend";

describe("SellerBackend", () => {
  it("does not reveal Seller C's outcome before matching or authorization", () => {
    const html = renderToStaticMarkup(
      <SellerBackend
        events={[]}
        sellerNames={{ "seller-c": "Seller C" }}
      />,
    );

    expect(html).toContain("Listening for qualified intents");
    expect(html).not.toContain("New high-value intent detected");
    expect(html).not.toContain("Intent Rank: WON");
    expect(html).not.toContain("Agent Order Created");
  });
});
